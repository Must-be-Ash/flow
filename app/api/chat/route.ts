import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { join } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const FLOW_ROOT = process.cwd();

type ChatMessage = {
  id: string;
  message: string;
  workflowId: string;
  selectedNodeId?: string | null;
  selectedNodeLabel?: string | null;
  selectedNodeType?: string | null;
  timestamp: string;
  status: "pending" | "processing" | "done" | "error";
  response?: string;
  kind?: "chat" | "test_endpoint" | "create_skill";
  testEndpoint?: {
    url: string;
    method: string;
    prompt: string;
    price?: string;
    protocols?: string[];
  };
  testResult?: unknown;
};

// In-memory store — resets on server restart, fine for dev
const store = new Map<string, ChatMessage>();
const controllers = new Map<string, AbortController>();

const MCP_SERVERS = {
  flow: {
    command: "npx",
    args: ["tsx", join(FLOW_ROOT, "mcp-server.ts")],
    env: { FLOW_URL: "http://localhost:3000" },
  },
  agentcash: {
    command: "npx",
    args: ["-y", "agentcash@latest"],
  },
};

function buildPrompt(msg: ChatMessage): string {
  if (msg.kind === "test_endpoint" && msg.testEndpoint) {
    const ep = msg.testEndpoint;
    return [
      "Test this x402 endpoint:",
      `URL: ${ep.url}`,
      `Method: ${ep.method}`,
      ep.price ? `Price: ${ep.price}` : "",
      ep.protocols?.length ? `Protocols: ${ep.protocols.join(", ")}` : "",
      ep.prompt ? `Context: ${ep.prompt}` : "",
      "",
      "Use mcp__agentcash__check_endpoint_schema to probe the schema first, then mcp__agentcash__fetch to call it with an appropriate body. Return a brief summary of the result.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (msg.kind === "create_skill") {
    return `Create a complete skill package from the workflow with ID: ${msg.workflowId}.\n\nUse mcp__flow__get_workflow to read the workflow, then follow the full skill creation process described in CLAUDE.md — study the reference examples in examples/, use the skill-creator skill, and produce the complete package with SKILL.md, references/, assets/, and data/ as needed.`;
  }

  // Default: canvas editing only
  const parts: string[] = [];
  parts.push(
    "You are a workflow canvas editor. Your ONLY job is to add, remove, or edit nodes on the canvas.",
    "STRICT RULES:",
    "- Only use mcp__flow__* tools. Do NOT call mcp__agentcash__*, Skill, Bash, or any other tool.",
    "- Do NOT execute skills, run research, call APIs, or produce real data.",
    "- Do NOT use get_pending_chat or respond_to_chat — those are not for you.",
    "- Build the workflow BLUEPRINT only. Nodes describe what the skill will do, not do it.",
    "",
  );
  if (msg.workflowId) parts.push(`Workflow ID: ${msg.workflowId}`);
  if (msg.selectedNodeLabel) {
    parts.push(`Selected node: "${msg.selectedNodeLabel}" (type: ${msg.selectedNodeType || "unknown"})`);
  }
  parts.push(
    `\nUser request: ${msg.message}`,
    "\nCall mcp__flow__get_workflow to read the current canvas, then use mcp__flow__update_workflow / mcp__flow__add_node / mcp__flow__remove_node to make the changes. Reply with a brief summary of what nodes you added or changed.",
  );
  return parts.join("\n");
}

const TOOL_LABELS: Record<string, string> = {
  mcp__flow__get_workflow: "Reading workflow...",
  mcp__flow__update_workflow: "Updating workflow...",
  mcp__flow__add_node: "Adding node...",
  mcp__flow__remove_node: "Removing node...",
  mcp__flow__list_workflows: "Listing workflows...",
  mcp__flow__export_skill_bundle: "Exporting bundle...",
  mcp__agentcash__check_endpoint_schema: "Probing endpoint schema...",
  mcp__agentcash__fetch: "Calling API...",
  mcp__agentcash__get_balance: "Checking balance...",
  mcp__agentcash__search: "Searching services...",
  Read: "Reading file...",
  Write: "Writing file...",
  Edit: "Editing file...",
  Bash: "Running command...",
  Glob: "Searching files...",
  Grep: "Searching code...",
};

function progressLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Using ${toolName.replace(/^mcp__\w+__/, "")}...`;
}

async function runAgent(msg: ChatMessage): Promise<void> {
  const tag = `[${msg.id.slice(0, 8)}][${msg.kind ?? "chat"}]`;
  console.log(`${tag} Starting agent for: ${msg.message.slice(0, 80)}`);
  store.set(msg.id, { ...msg, status: "processing" });
  const controller = new AbortController();
  controllers.set(msg.id, controller);

  // Chat only gets flow tools — no agentcash, no skills, no bash
  const mcpServers = msg.kind === "chat"
    ? { flow: MCP_SERVERS.flow }
    : MCP_SERVERS;

  try {
    let result = "";
    for await (const event of query({
      prompt: buildPrompt(msg),
      options: {
        cwd: FLOW_ROOT,
        mcpServers,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController: controller,
      },
    })) {
      if (event.type === "assistant") {
        // Stream live progress into the response field so the UI stays alive
        const content = (event as { message: { content: { type: string; name?: string; text?: string }[] } }).message.content;
        for (const block of content) {
          if (block.type === "tool_use" && block.name) {
            const label = progressLabel(block.name);
            console.log(`${tag} ${block.name}`);
            store.set(msg.id, { ...store.get(msg.id)!, response: label });
            break;
          } else if (block.type === "text" && block.text?.trim()) {
            const preview = block.text.trim().slice(0, 120);
            store.set(msg.id, { ...store.get(msg.id)!, response: preview });
            break;
          }
        }
      } else if (event.type === "result") {
        result =
          "result" in event
            ? (event.result as string)
            : ((event as { errors?: string[] }).errors?.[0] ?? "Error during execution");
        console.log(`${tag} Done — ${result.slice(0, 100)}`);
      }
    }
    store.set(msg.id, { ...store.get(msg.id)!, status: "done", response: result || "Done" });
  } catch (err) {
    const cancelled = controller.signal.aborted;
    const errMsg = cancelled ? "Cancelled" : err instanceof Error ? err.message : "Unknown error";
    console.error(`${tag} ${cancelled ? "Cancelled" : `Error: ${errMsg}`}`);
    store.set(msg.id, { ...store.get(msg.id)!, status: "error", response: errMsg });
  } finally {
    controllers.delete(msg.id);
  }
}

export async function GET() {
  const all = Array.from(store.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  return NextResponse.json(all.slice(-10));
}

export async function POST(request: Request) {
  try {
    const { message, workflowId, selectedNodeId, selectedNodeLabel, selectedNodeType, kind, testEndpoint } =
      await request.json();

    if (kind === "create_skill") {
      const msg: ChatMessage = {
        id: randomUUID(),
        kind: "create_skill",
        message: "Create skill package from this workflow draft",
        workflowId: workflowId || "",
        selectedNodeId: null,
        selectedNodeLabel: null,
        selectedNodeType: null,
        timestamp: new Date().toISOString(),
        status: "pending",
      };
      store.set(msg.id, msg);
      void runAgent(msg);
      return NextResponse.json(msg);
    }

    if (kind === "test_endpoint" && testEndpoint) {
      const msg: ChatMessage = {
        id: randomUUID(),
        kind: "test_endpoint",
        message: `Test endpoint: ${testEndpoint.url}`,
        workflowId: workflowId || "",
        selectedNodeId: selectedNodeId || null,
        selectedNodeLabel: selectedNodeLabel || null,
        selectedNodeType: selectedNodeType || null,
        testEndpoint,
        timestamp: new Date().toISOString(),
        status: "pending",
      };
      store.set(msg.id, msg);
      void runAgent(msg);
      return NextResponse.json(msg);
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const msg: ChatMessage = {
      id: randomUUID(),
      kind: "chat",
      message: message.trim(),
      workflowId: workflowId || "",
      selectedNodeId: selectedNodeId || null,
      selectedNodeLabel: selectedNodeLabel || null,
      selectedNodeType: selectedNodeType || null,
      timestamp: new Date().toISOString(),
      status: "pending",
    };
    store.set(msg.id, msg);
    void runAgent(msg);
    return NextResponse.json(msg);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  // Cancel a specific job
  if (id) {
    const controller = controllers.get(id);
    if (controller) controller.abort();
    store.set(id, { ...store.get(id)!, status: "error", response: "Cancelled" });
    return NextResponse.json({ cancelled: id });
  }

  // Clean up all done/error messages
  let cleaned = 0;
  for (const [msgId, msg] of store) {
    if (msg.status === "done" || msg.status === "error") {
      store.delete(msgId);
      cleaned++;
    }
  }
  return NextResponse.json({ cleaned, remaining: store.size });
}
