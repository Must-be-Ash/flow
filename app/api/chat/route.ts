import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const CHAT_FILE = join(process.cwd(), ".flow", "chat.jsonl");
const FLOW_DIR = join(process.cwd(), ".flow");

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
  // For endpoint test requests
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

async function ensureDir() {
  if (!existsSync(FLOW_DIR)) await mkdir(FLOW_DIR, { recursive: true });
}

async function readMessages(): Promise<ChatMessage[]> {
  await ensureDir();
  try {
    const raw = await readFile(CHAT_FILE, "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function writeMessages(messages: ChatMessage[]) {
  await ensureDir();
  await writeFile(
    CHAT_FILE,
    messages.map((m) => JSON.stringify(m)).join("\n") + (messages.length ? "\n" : ""),
    "utf-8"
  );
}

/**
 * GET /api/chat — read current messages (for polling status)
 * Returns only the last 10 messages to keep responses small.
 */
export async function GET() {
  const messages = await readMessages();
  // Return last 10 only
  return NextResponse.json(messages.slice(-10));
}

/**
 * POST /api/chat — send a message or queue an endpoint test
 * Body: { message?, workflowId, kind?, testEndpoint? }
 */
export async function POST(request: Request) {
  try {
    const { message, workflowId, selectedNodeId, selectedNodeLabel, selectedNodeType, kind, testEndpoint } = await request.json();

    // Skill creation job
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
      const messages = await readMessages();
      messages.push(msg);
      await writeMessages(messages);
      return NextResponse.json(msg);
    }

    // Endpoint test jobs don't need a message
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
      const messages = await readMessages();
      messages.push(msg);
      await writeMessages(messages);
      return NextResponse.json(msg);
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const msg: ChatMessage = {
      id: randomUUID(),
      kind: "chat",
      selectedNodeId: selectedNodeId || null,
      selectedNodeLabel: selectedNodeLabel || null,
      selectedNodeType: selectedNodeType || null,
      message: message.trim(),
      workflowId: workflowId || "",
      timestamp: new Date().toISOString(),
      status: "pending",
    };

    const messages = await readMessages();
    messages.push(msg);
    await writeMessages(messages);

    return NextResponse.json(msg);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat — clean up done/error messages (called by the loop)
 */
export async function DELETE() {
  const messages = await readMessages();
  const active = messages.filter((m) => m.status === "pending" || m.status === "processing");
  await writeMessages(active);
  return NextResponse.json({ cleaned: messages.length - active.length, remaining: active.length });
}
