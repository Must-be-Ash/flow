#!/usr/bin/env npx tsx
/**
 * Flow MCP Server
 *
 * Exposes Flow's workflow CRUD + export as MCP tools so any AI client
 * (Claude Code, Cursor, etc.) can interact with the canvas directly.
 *
 * Run: npx tsx mcp-server.ts
 * Or register in Claude Code (run from your local Flow checkout):
 *   claude mcp add flow -- npx tsx "$(pwd)/mcp-server.ts"
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.FLOW_URL || "http://localhost:3000";

// ─── Helpers ─────────────────────────────────────────────────────────

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: "flow",
  version: "0.1.0",
});

// ─── Tools ───────────────────────────────────────────────────────────

server.tool(
  "list_workflows",
  "List all skill drafts in Flow",
  {},
  async () => {
    const workflows = await api("/api/workflows");
    const summary = workflows.map((w: any) => ({
      id: w.id,
      name: w.name,
      nodes: w.nodes?.length || 0,
      edges: w.edges?.length || 0,
      updatedAt: w.updatedAt,
    }));
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  }
);

server.tool(
  "get_workflow",
  "Get the full details of a skill draft — all nodes, edges, and metadata",
  { id: z.string().describe("Workflow ID") },
  async ({ id }) => {
    const workflow = await api(`/api/workflows/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(workflow, null, 2) }] };
  }
);

server.tool(
  "create_workflow",
  "Create a new skill draft with nodes and edges",
  {
    name: z.string().describe("Skill name"),
    description: z.string().optional().describe("What the skill does"),
    nodes: z.array(z.any()).describe("Array of node objects with id, type, position, data"),
    edges: z.array(z.any()).optional().describe("Array of edge objects with id, source, target"),
  },
  async ({ name, description, nodes, edges }) => {
    const workflow = await api("/api/workflows", {
      method: "POST",
      body: JSON.stringify({ name, description, nodes, edges: edges || [] }),
    });
    return {
      content: [{
        type: "text",
        text: `Created workflow "${workflow.name}" with ${workflow.nodes.length} nodes.\nURL: ${BASE_URL}/workflows/${workflow.id}\nID: ${workflow.id}`,
      }],
    };
  }
);

server.tool(
  "update_workflow",
  "Update a skill draft — replace nodes, edges, name, or description. Provide the full nodes/edges arrays (not patches).",
  {
    id: z.string().describe("Workflow ID"),
    name: z.string().optional().describe("New name"),
    description: z.string().optional().describe("New description"),
    nodes: z.array(z.any()).optional().describe("Full replacement array of nodes"),
    edges: z.array(z.any()).optional().describe("Full replacement array of edges"),
  },
  async ({ id, name, description, nodes, edges }) => {
    const body: Record<string, unknown> = {};
    if (name) body.name = name;
    if (description) body.description = description;
    if (nodes) body.nodes = nodes;
    if (edges) body.edges = edges;

    const workflow = await api(`/api/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return {
      content: [{
        type: "text",
        text: `Updated "${workflow.name}" — ${workflow.nodes.length} nodes, ${workflow.edges.length} edges.\nURL: ${BASE_URL}/workflows/${workflow.id}`,
      }],
    };
  }
);

server.tool(
  "add_node",
  "Add a single node to an existing workflow without replacing other nodes",
  {
    workflowId: z.string().describe("Workflow ID"),
    node: z.object({
      id: z.string().describe("Unique node ID"),
      type: z.enum(["purpose", "service", "instruction", "decision", "input", "output"]).describe("Node type"),
      position: z.object({ x: z.number(), y: z.number() }).describe("Canvas position"),
      data: z.record(z.string(), z.any()).describe("Node data — label, description, instruction, endpoint, etc."),
    }).describe("The node to add"),
    connectFrom: z.string().optional().describe("If provided, creates an edge from this node ID to the new node"),
  },
  async ({ workflowId, node, connectFrom }) => {
    const workflow = await api(`/api/workflows/${workflowId}`);
    const nodes = [...workflow.nodes, node];
    const edges = [...workflow.edges];
    if (connectFrom) {
      edges.push({
        id: `e-${connectFrom}-${node.id}`,
        source: connectFrom,
        target: node.id,
        sourceHandle: "right",
        targetHandle: "left",
      });
    }
    const updated = await api(`/api/workflows/${workflowId}`, {
      method: "PATCH",
      body: JSON.stringify({ nodes, edges }),
    });
    return {
      content: [{
        type: "text",
        text: `Added "${node.data.label || node.type}" node. Workflow now has ${updated.nodes.length} nodes.`,
      }],
    };
  }
);

server.tool(
  "remove_node",
  "Remove a node (and its connected edges) from a workflow",
  {
    workflowId: z.string().describe("Workflow ID"),
    nodeId: z.string().describe("ID of the node to remove"),
  },
  async ({ workflowId, nodeId }) => {
    const workflow = await api(`/api/workflows/${workflowId}`);
    const nodes = workflow.nodes.filter((n: any) => n.id !== nodeId);
    const edges = workflow.edges.filter((e: any) => e.source !== nodeId && e.target !== nodeId);
    const updated = await api(`/api/workflows/${workflowId}`, {
      method: "PATCH",
      body: JSON.stringify({ nodes, edges }),
    });
    return {
      content: [{
        type: "text",
        text: `Removed node. Workflow now has ${updated.nodes.length} nodes, ${updated.edges.length} edges.`,
      }],
    };
  }
);

server.tool(
  "export_skill_bundle",
  "Export a workflow as a skill bundle ZIP file. Returns the download URL.",
  {
    id: z.string().describe("Workflow ID to export"),
  },
  async ({ id }) => {
    // Trigger export — the actual ZIP is downloaded by the user via browser
    const workflow = await api(`/api/workflows/${id}`);
    const slug = workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
    return {
      content: [{
        type: "text",
        text: `Skill bundle ready for "${workflow.name}".\n\nDownload: ${BASE_URL}/api/workflows/${id}/export (POST)\n\nOr use curl:\n  curl -X POST ${BASE_URL}/api/workflows/${id}/export -o ${slug}-skill.zip`,
      }],
    };
  }
);

server.tool(
  "search_services",
  "Search AgentCash for x402 paid API services",
  {
    query: z.string().describe("What you're looking for (e.g. 'image generation', 'web search', 'send email')"),
  },
  async ({ query }) => {
    const results = await api(`/api/discover/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  "delete_workflow",
  "Delete a skill draft",
  { id: z.string().describe("Workflow ID to delete") },
  async ({ id }) => {
    await api(`/api/workflows/${id}`, { method: "DELETE" });
    return { content: [{ type: "text", text: `Deleted workflow ${id}` }] };
  }
);

server.tool(
  "get_pending_chat",
  "Check for pending chat messages from the Flow UI. Returns messages the user typed in the app's chat bar. Call this in a loop to watch for new requests.",
  {},
  async () => {
    const messages = await api("/api/chat");
    const pending = (messages as any[]).filter((m: any) => m.status === "pending");
    if (pending.length === 0) {
      return { content: [{ type: "text", text: "No pending messages." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(pending, null, 2) }] };
  }
);

server.tool(
  "respond_to_chat",
  "Respond to a chat message from the Flow UI. Marks the message as done with your response, which the user sees as a notification. For test_endpoint jobs, include testResult with the actual data (image URL, JSON, etc.) so the UI can render it.",
  {
    messageId: z.string().describe("The message ID to respond to"),
    response: z.string().describe("Your response text to show the user"),
    status: z.enum(["done", "error"]).optional().describe("Set to 'error' if the request failed"),
    testResult: z.any().optional().describe("For test_endpoint jobs: the actual result data (image URL, video URL, JSON response). The UI will render images/videos automatically."),
  },
  async ({ messageId, response, status, testResult }) => {
    const messages = await api("/api/chat") as any[];
    const updated = messages.map((m: any) =>
      m.id === messageId ? { ...m, status: status || "done", response, ...(testResult !== undefined ? { testResult } : {}) } : m
    );
    const { writeFile } = await import("fs/promises");
    const { join } = await import("path");
    const chatFile = join(process.cwd(), ".flow", "chat.jsonl");
    await writeFile(
      chatFile,
      updated.map((m: any) => JSON.stringify(m)).join("\n") + "\n",
      "utf-8"
    );
    return { content: [{ type: "text", text: `Responded to message ${messageId}` }] };
  }
);

server.tool(
  "cleanup_chat",
  "Clean up completed chat messages to keep the file small. Call this at the start of each loop tick.",
  {},
  async () => {
    const result = await api("/api/chat", { method: "DELETE" });
    return { content: [{ type: "text", text: `Cleaned ${(result as any).cleaned} messages, ${(result as any).remaining} active.` }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
