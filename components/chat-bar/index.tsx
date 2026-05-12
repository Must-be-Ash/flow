"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { Loader2, Send, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { currentWorkflowIdAtom, nodesAtom, selectedNodeAtom, workflowRefreshCountAtom } from "@/lib/workflow-store";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  message: string;
  workflowId: string;
  timestamp: string;
  status: "pending" | "processing" | "done" | "error";
  response?: string;
};

function StatusIcon({ status }: { status: ChatMessage["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="size-3 text-amber-500" />;
    case "processing":
      return <Loader2 className="size-3 animate-spin text-blue-500" />;
    case "done":
      return <CheckCircle2 className="size-3 text-green-500" />;
    case "error":
      return <AlertCircle className="size-3 text-red-500" />;
  }
}

function StatusLabel({ status }: { status: ChatMessage["status"] }) {
  switch (status) {
    case "pending":
      return <span className="text-amber-500">Queued</span>;
    case "processing":
      return <span className="text-blue-500">Claude is working...</span>;
    case "done":
      return <span className="text-green-500">Done</span>;
    case "error":
      return <span className="text-red-500">Error</span>;
  }
}

export function ChatBar() {
  const workflowId = useAtomValue(currentWorkflowIdAtom);
  const selectedNodeId = useAtomValue(selectedNodeAtom);
  const nodes = useAtomValue(nodesAtom);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const setRefreshCount = useSetAtom(workflowRefreshCountAtom);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for status updates when there are active messages
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const msgs: ChatMessage[] = await res.json();

        // Check if any message just completed — trigger a canvas refresh
        setMessages((prev) => {
          const newlyDone = msgs.filter((m) =>
            m.status === "done" &&
            prev.find((p) => p.id === m.id && p.status !== "done")
          );
          if (newlyDone.length > 0) {
            // Defer to avoid calling setState on WorkflowEditor during ChatBar's render
            setTimeout(() => setRefreshCount((c) => c + 1), 0);
          }
          return msgs;
        });

        // Stop polling if all messages are done/error
        const hasActive = msgs.some((m) => m.status === "pending" || m.status === "processing");
        if (!hasActive && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // ignore
    }
  }, [setRefreshCount]);

  // Start polling when we have active messages
  useEffect(() => {
    const hasActive = messages.some((m) => m.status === "pending" || m.status === "processing");
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(pollStatus, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [messages, pollStatus]);

  // Initial load
  useEffect(() => {
    pollStatus();
  }, [pollStatus]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input.trim(),
          workflowId: workflowId || "",
          selectedNodeId: selectedNode?.id || null,
          selectedNodeLabel: selectedNode?.data?.label || selectedNode?.data?.name || null,
          selectedNodeType: selectedNode?.data?.type || null,
        }),
      });
      if (res.ok) {
        const msg: ChatMessage = await res.json();
        setMessages((prev) => [...prev, msg]);
        setInput("");
        // Start polling
        if (!pollRef.current) {
          pollRef.current = setInterval(pollStatus, 2000);
        }
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  // Only show messages for the current workflow (or no workflow)
  const relevantMessages = messages.filter(
    (m) => !m.workflowId || !workflowId || m.workflowId === workflowId
  );

  // Only show recent active or just-completed messages (last 3)
  const visibleMessages = relevantMessages.slice(-3);

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4">
      {/* Status cards */}
      {visibleMessages.length > 0 && (
        <div className="mb-2 space-y-1">
          {visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "rounded-lg border bg-card/95 backdrop-blur-sm px-3 py-2 text-xs shadow-lg transition-all",
                msg.status === "done" && "opacity-70",
              )}
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={msg.status} />
                <span className="truncate flex-1 text-muted-foreground">{msg.message}</span>
                <StatusLabel status={msg.status} />
              </div>
              {msg.response && (
                <p className="mt-1 text-[11px] text-foreground pl-5 line-clamp-2">
                  {msg.response}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 rounded-xl border bg-card/95 backdrop-blur-sm shadow-lg px-3 py-2">
        <div className="flex flex-1 flex-col gap-1 min-w-0">
          {/* Selected node chip */}
          {selectedNode && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground">Focused:</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium truncate max-w-[180px]">
                {selectedNode.data.label || selectedNode.data.name || selectedNode.data.type}
              </span>
            </div>
          )}
          <input
            ref={inputRef}
            autoComplete="one-time-code"
            className="bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground w-full"
            disabled={sending}
            name="flow-chat-input"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={selectedNode ? `Ask about "${selectedNode.data.label || selectedNode.data.type}"...` : "Ask Claude to edit this workflow..."}
            value={input}
          />
        </div>
        <button
          className="rounded-lg bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          disabled={!input.trim() || sending}
          onClick={handleSend}
          type="button"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
