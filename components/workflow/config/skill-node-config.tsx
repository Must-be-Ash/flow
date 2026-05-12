"use client";

/**
 * Config panel for the new skill node types.
 * Renders form fields appropriate to each node type.
 */

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  CheckCircle2,
  ChevronLeft,
  FileText,
  GitBranch,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { nanoid } from "nanoid";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  nodesAtom,
  currentWorkflowIdAtom,
  nodeTestStatesAtom,
  selectedNodeAtom,
  updateNodeDataAtom,
  type NodeTestState,
  type WorkflowNode,
  type WorkflowNodeData,
} from "@/lib/workflow-store";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      value={value}
    />
  );
}

// ─── Per-type editors ────────────────────────────────────────────────

function PurposeEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;

  const set = (fields: Partial<WorkflowNodeData>) =>
    update({ id: node.id, data: fields });

  return (
    <div className="space-y-4">
      <Field label="Skill Name" hint="What is this skill called?">
        <Input
          className="h-9"
          onChange={(e) => set({ name: e.target.value, label: e.target.value })}
          placeholder="e.g. Mail, Recruit, Movie Maker"
          value={d.name || ""}
        />
      </Field>
      <Field label="Description" hint="What does this skill do?">
        <TextArea
          onChange={(v) => set({ description: v })}
          placeholder="e.g. Send physical postcards and letters to friends with AI-generated artwork"
          value={d.description || ""}
        />
      </Field>
      <Field label="Use Cases" hint="When should an agent use this skill?">
        <TextArea
          onChange={(v) => set({ useCases: v })}
          placeholder="e.g. Use when the user asks to send mail, post a letter, send a postcard..."
          value={d.useCases || ""}
        />
      </Field>
      <Field label="What this is NOT for" hint="Optional — explicit boundaries">
        <TextArea
          onChange={(v) => set({ notFor: v })}
          placeholder="e.g. Not for sending emails or digital messages"
          rows={2}
          value={d.notFor || ""}
        />
      </Field>
    </div>
  );
}

type ServicePickerResult = { summary: string; origin: string; path: string; method: string; price?: string };

function ServicePicker({ onPick }: { onPick: (r: ServicePickerResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ServicePickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/discover/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input
          autoComplete="one-time-code"
          className="flex-1 h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
          name="svc-picker"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(query)}
          placeholder="e.g. video generation, email, search"
          value={query}
        />
        <button
          className="h-8 px-2 rounded-md border bg-green-600 text-white text-[10px] font-medium hover:bg-green-700 disabled:opacity-50"
          disabled={!query.trim() || loading}
          onClick={() => search(query)}
          type="button"
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : "Search"}
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1 nowheel">
        {results.map((r, i) => (
          <button
            key={`${r.origin}${r.path}-${i}`}
            className="w-full rounded border border-border/50 px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
            onClick={() => onPick(r)}
            type="button"
          >
            <p className="text-[10px] font-medium leading-snug line-clamp-2">{r.summary}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] text-muted-foreground truncate">{r.origin?.replace("https://","")}</span>
              {r.price && (
                <span className="rounded-full bg-green-500/10 px-1 py-0.5 text-[8px] font-medium text-green-600 dark:text-green-400">
                  ${r.price}
                </span>
              )}
            </div>
          </button>
        ))}
        {searched && !loading && results.length === 0 && (
          <p className="text-center text-[10px] text-muted-foreground py-3">No results — try different keywords</p>
        )}
      </div>
    </div>
  );
}

/** Extract endpoint info from both new (data.endpoint) and legacy (data.spec) formats */
function getEndpointInfo(d: WorkflowNodeData) {
  if (d.endpoint) return d.endpoint;
  // Legacy format: data.spec = { kind, origin, path, method, price: { amount }, inputSchema }
  const spec = d.spec as Record<string, unknown> | undefined;
  if (!spec) return null;
  const price = spec.price as Record<string, unknown> | undefined;
  return {
    origin: String(spec.origin || ""),
    path: String(spec.path || ""),
    method: String(spec.method || "POST"),
    price: String(price?.amount || spec.price || "0"),
    inputSchema: spec.inputSchema as Record<string, unknown> | undefined,
    outputSchema: spec.outputSchema as Record<string, unknown> | undefined,
    authMode: String(spec.authMode || "x402"),
    instructions: spec.instructions as string | undefined,
    summary: spec.summary as string | undefined,
  };
}

function ServiceEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;
  const ep = getEndpointInfo(d);
  const [changingService, setChangingService] = useState(false);

  const set = (fields: Partial<WorkflowNodeData>) =>
    update({ id: node.id, data: fields });

  const handlePickNewService = useCallback(async (result: { summary: string; origin: string; path: string; method: string; price?: string }) => {
    // Swap the endpoint but keep label, description, notes
    set({
      endpoint: {
        origin: result.origin,
        path: result.path,
        method: result.method,
        price: result.price || "0",
        summary: result.summary,
      },
    });
    setChangingService(false);

    // Auto-introspect the new endpoint
    try {
      const url = `${result.origin}${result.path}`;
      const res = await fetch(`/api/discover/check?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const check = await res.json();
        set({
          endpoint: {
            origin: result.origin,
            path: result.path,
            method: result.method,
            price: check.price || result.price || "0",
            summary: result.summary,
            inputSchema: check.inputSchema || undefined,
            outputSchema: check.outputSchema || undefined,
            authMode: check.authType || undefined,
            instructions: check.instructions || undefined,
          },
        });
      }
    } catch { /* non-fatal */ }
  }, [set]);

  if (!ep) {
    return (
      <div className="space-y-3">
        <ServicePicker onPick={handlePickNewService} />
      </div>
    );
  }

  const originHost = ep.origin?.replace("https://", "").replace("http://", "") || "";

  return (
    <div className="space-y-4">
      {/* Service summary card with inline change */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium">{d.description || d.label || ep.summary || "Service"}</p>
          <button
            className="shrink-0 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            onClick={() => setChangingService((v) => !v)}
            type="button"
          >
            {changingService ? "Cancel" : "Change"}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
            ${ep.price} USDC
          </span>
          <span className="text-[10px] text-muted-foreground">
            {originHost}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
            {ep.method} {ep.path}
          </span>
        </div>
      </div>

      {/* Inline service picker — shown when "Change" is clicked */}
      {changingService && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground">Search for a replacement — your notes and description stay.</p>
          <ServicePicker onPick={handlePickNewService} />
        </div>
      )}

      <Field label="Your notes" hint="How this service is used in your skill — this goes into the exported instructions">
        <TextArea
          onChange={(v) => set({ notes: v })}
          placeholder="e.g. Use 4x6 aspect ratio for postcards. Always show the generated image to the user before proceeding."
          rows={3}
          value={d.notes || ""}
        />
      </Field>

      {/* What this endpoint needs */}
      {ep.inputSchema && Object.keys(ep.inputSchema).length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-medium">What this endpoint needs</p>
          {renderSchemaFields(ep.inputSchema)}
        </div>
      )}

      {/* What you get back */}
      {ep.outputSchema && Object.keys(ep.outputSchema).length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-medium">What you get back</p>
          {renderSchemaFields(ep.outputSchema)}
        </div>
      )}

      {/* Provider instructions */}
      {ep.instructions && (
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Provider documentation
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-[10px] max-h-48 whitespace-pre-wrap">
            {ep.instructions.slice(0, 1500)}{ep.instructions.length > 1500 ? "\n\n..." : ""}
          </pre>
        </details>
      )}

      {/* Try it */}
      <ServiceTryIt endpoint={ep} nodeId={node.id} />
    </div>
  );
}

function ServiceTryIt({ endpoint, nodeId }: { endpoint: ReturnType<typeof getEndpointInfo>; nodeId: string }) {
  const [probeResult, setProbeResult] = useState<Record<string, unknown> | null>(null);
  const [tryInput, setTryInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const workflowId = useAtomValue(currentWorkflowIdAtom);
  const selectedNodeId = useAtomValue(selectedNodeAtom);

  // Persistent test state — survives panel open/close
  const [testStates, setTestStates] = useAtom(nodeTestStatesAtom);
  const testState = testStates[nodeId] || { status: "idle" };

  const setTestState = useCallback((patch: Partial<NodeTestState>) => {
    setTestStates((prev) => ({ ...prev, [nodeId]: { ...prev[nodeId], ...patch } }));
  }, [nodeId, setTestStates]);

  if (!endpoint) return null;
  const fullUrl = endpoint.origin + endpoint.path;
  const isWorking = testState.status === "queued" || testState.status === "working";

  const handleProbe = useCallback(async () => {
    setProbeResult(null);
    try {
      const res = await fetch(`/api/discover/check?url=${encodeURIComponent(fullUrl)}`);
      setProbeResult(await res.json());
    } catch { /* ignore */ }
  }, [fullUrl]);

  const handleTry = useCallback(async () => {
    if (!tryInput.trim() || isWorking) return;
    setTestState({ status: "queued", stage: "Sending to Claude...", result: undefined, error: undefined, startedAt: new Date().toISOString() });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "test_endpoint",
          workflowId: workflowId || "",
          selectedNodeId,
          testEndpoint: { url: fullUrl, method: endpoint.method, prompt: tryInput.trim(), price: endpoint.price },
        }),
      });
      if (!res.ok) throw new Error("Failed to queue");
      const msg = await res.json();
      setTestState({ status: "working", stage: "Claude is checking schema & wallet...", chatJobId: msg.id });

      // Poll the chat bridge for result
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const poll = await fetch("/api/chat").then((r) => r.json()).catch(() => []);
        const job = (poll as Array<{ id: string; status: string; response?: string; testResult?: unknown }>)
          .find((m) => m.id === msg.id);
        if (!job) { setTestState({ status: "error", stage: undefined, error: "Job disappeared from queue." }); return; }
        if (job.status === "done") {
          setTestState({ status: "done", stage: undefined, result: job.testResult || { response: job.response } });
          setShowModal(true);
          return;
        }
        if (job.status === "error") {
          setTestState({ status: "error", stage: undefined, error: job.response || "Test failed" });
          return;
        }
        const elapsed = (i + 1) * 5;
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        setTestState({ stage: `Claude is working... (${mins > 0 ? `${mins}m ` : ""}${secs}s)` });
      }
      setTestState({ status: "error", stage: undefined, error: "Timed out. Is the /loop running in Claude Code?" });
    } catch (e) {
      setTestState({ status: "error", stage: undefined, error: e instanceof Error ? e.message : "Failed" });
    }
  }, [fullUrl, endpoint.method, endpoint.price, tryInput, workflowId, selectedNodeId, isWorking, setTestState]);

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Try this endpoint</p>
            {testState.status === "done" && (
              <button className="text-[10px] text-green-600 hover:underline" onClick={() => setShowModal(true)} type="button">
                View result ↗
              </button>
            )}
          </div>

          {/* Probe */}
          <button className="w-full rounded-md border px-3 py-2 text-xs text-left hover:bg-muted/50 transition-colors flex items-center gap-2 disabled:opacity-50"
            onClick={handleProbe} type="button">
            <Zap className="size-3 text-green-500" />
            <span>Check pricing & schema</span>
            <span className="ml-auto text-[9px] text-muted-foreground">free</span>
          </button>

          {probeResult && (
            <div className="rounded-md bg-muted/30 p-2 space-y-1 text-[10px]">
              {probeResult.price != null && <div><span className="text-muted-foreground">Price: </span><span className="font-medium">${String(probeResult.price)}</span></div>}
              {probeResult.authMode != null && <div><span className="text-muted-foreground">Auth: </span>{String(probeResult.authMode)}</div>}
              {probeResult.summary != null && <div className="text-muted-foreground line-clamp-2">{String(probeResult.summary)}</div>}
            </div>
          )}

          {/* Input + send */}
          <div className="space-y-1.5">
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              disabled={isWorking}
              onChange={(e) => setTryInput(e.target.value)}
              placeholder="Type your prompt..."
              rows={2}
              value={tryInput}
            />
            <button
              className="w-full rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={isWorking || !tryInput.trim()}
              onClick={handleTry}
              type="button"
            >
              {isWorking ? <><Loader2 className="size-3 animate-spin" />{testState.stage || "Working..."}</> : <><Zap className="size-3" />Ask Claude to test this</>}
            </button>
          </div>

          {/* Progress steps when working */}
          {isWorking && (
            <div className="space-y-1.5">
              <ProgressStep done label="Job queued" />
              <ProgressStep active={testState.stage?.includes("schema")} done={!testState.stage?.includes("schema") && testState.status === "working"} label="Checking schema & pricing" />
              <ProgressStep active={testState.stage?.includes("Paying") || testState.stage?.includes("wallet")} done={testState.stage?.includes("working") || testState.stage?.includes("Generating") || testState.stage?.includes("min")} label="Making payment" />
              <ProgressStep active={testState.stage?.includes("Generating") || testState.stage?.includes("min") || testState.stage?.includes("working")} label="Generating result" />
            </div>
          )}

          {/* Error */}
          {testState.status === "error" && testState.error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
              {testState.error}
            </div>
          )}

          {/* Done — thumbnail preview */}
          {testState.status === "done" && testState.result != null && (
            <button
              className="w-full rounded-lg border overflow-hidden hover:opacity-90 transition-opacity text-left"
              onClick={() => setShowModal(true)}
              type="button"
            >
              <TestResultPreview data={testState.result} />
            </button>
          )}
        </div>
      </div>

      {/* Result modal */}
      <TestResultModal
        data={testState.result}
        onClose={() => setShowModal(false)}
        open={showModal}
      />
    </>
  );
}

function ProgressStep({ label, done = false, active = false }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      {done ? (
        <div className="size-3.5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
          <svg className="size-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} /></svg>
        </div>
      ) : active ? (
        <Loader2 className="size-3.5 animate-spin text-green-500 shrink-0" />
      ) : (
        <div className="size-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
      )}
      <span className={done ? "text-muted-foreground line-through" : active ? "text-foreground font-medium" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function TestResultPreview({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return <div className="p-3 text-xs text-muted-foreground">View result</div>;
  const obj = data as Record<string, unknown>;
  const imgUrl = String(obj.imageUrl || obj.url || obj.image_url || "");
  if (imgUrl.startsWith("http")) {
    return (
      <div className="relative">
        <img alt="Result" className="w-full max-h-48 object-cover" src={imgUrl} />
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-2 py-1">Tap to view full size</div>
      </div>
    );
  }
  return <div className="p-3 text-[10px] text-muted-foreground font-mono truncate">{JSON.stringify(data).slice(0, 100)}...</div>;
}

function TestResultModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: unknown }) {
  if (!open) return null;
  const obj = (data && typeof data === "object") ? data as Record<string, unknown> : {};
  const imgUrl = String(obj.imageUrl || obj.url || obj.image_url || "");
  const videoUrl = String(obj.videoUrl || obj.video_url || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-3xl w-full mx-4 rounded-xl bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-medium text-sm">Test result</p>
          <button className="text-muted-foreground hover:text-foreground text-lg leading-none" onClick={onClose} type="button">✕</button>
        </div>
        <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">
          {imgUrl.startsWith("http") && (
            <img alt="Generated" className="w-full rounded-lg" src={imgUrl} />
          )}
          {videoUrl.startsWith("http") && (
            <video className="w-full rounded-lg" controls src={videoUrl} />
          )}
          {!imgUrl && !videoUrl && (
            <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
          {imgUrl.startsWith("http") && (
            <a className="text-xs text-green-600 hover:underline block" href={imgUrl} rel="noopener noreferrer" target="_blank">
              Open full size ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Render JSON Schema properties as a human-readable list */
function renderSchemaFields(schema: Record<string, unknown>) {
  const properties = (schema.properties || schema) as Record<string, Record<string, unknown>>;
  const required = (schema.required || []) as string[];
  const entries = Object.entries(properties).filter(([key]) => key !== "type" && key !== "required" && key !== "properties");

  if (entries.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Schema available — see probe results for details</p>;
  }

  return (
    <div className="space-y-1">
      {entries.map(([key, prop]) => (
        <div key={key} className="flex items-start gap-2 text-[10px]">
          <code className="font-mono text-foreground shrink-0">{key}</code>
          {required.includes(key) && <span className="text-red-500 shrink-0">*</span>}
          <span className="text-muted-foreground truncate">
            {String(prop?.description || prop?.type || "")}
          </span>
        </div>
      ))}
    </div>
  );
}

function InstructionEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;

  const set = (fields: Partial<WorkflowNodeData>) =>
    update({ id: node.id, data: fields });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Tell the agent what to do at this step — it will follow this autonomously.
      </p>

      <Field label="Label">
        <Input
          className="h-9"
          onChange={(e) => set({ label: e.target.value })}
          placeholder="e.g. Save addresses, Filter results"
          value={d.label || ""}
        />
      </Field>
      <Field label="Instruction" hint="Write in plain English — this becomes a step in the exported skill">
        <TextArea
          onChange={(v) => set({ instruction: v })}
          placeholder={"Write what should happen at this step. Examples:\n\n• If the user has already saved the recipient's address, just ask them to confirm it instead of entering it again\n\n• Always show the generated image before sending. If they don't like it, offer to regenerate\n\n• Convert the scraped content to a clean summary, keeping only the key points"}
          rows={6}
          value={d.instruction || ""}
        />
      </Field>
    </div>
  );
}

// ─── Specialized editors for legacy primitive types ──────────────────

function IfEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;
  const set = (fields: Partial<WorkflowNodeData>) => update({ id: node.id, data: fields });

  return (
    <div className="space-y-4">
      <Field label="If..." hint="Describe the condition in plain English">
        <TextArea
          onChange={(v) => set({ instruction: v, label: v.split("\n")[0]?.slice(0, 40) || "If" })}
          placeholder={"e.g. If the user has already saved this recipient's address, just confirm it instead of asking them to enter it again"}
          rows={4}
          value={d.instruction || ""}
        />
      </Field>
      <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-md p-2">
        Connect the <strong>right handle</strong> to the "then" path and the <strong>bottom handle</strong> to the "otherwise" path.
      </p>
    </div>
  );
}

function TransformEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;
  const set = (fields: Partial<WorkflowNodeData>) => update({ id: node.id, data: fields });

  const quickPicks = [
    "HTML → Markdown",
    "PDF → Text",
    "JSON → CSV",
    "Extract key points from text",
    "Summarize long content",
    "Format as a table",
  ];

  return (
    <div className="space-y-4">
      <Field label="Convert / Transform" hint="What format or shape should the data become?">
        <TextArea
          onChange={(v) => set({ instruction: v, label: v.split("\n")[0]?.slice(0, 40) || "Transform" })}
          placeholder={"e.g. Convert the scraped HTML content into clean markdown, keeping only headings and paragraphs"}
          rows={3}
          value={d.instruction || ""}
        />
      </Field>
      <div>
        <p className="text-[10px] text-muted-foreground mb-1.5">Quick picks:</p>
        <div className="flex flex-wrap gap-1">
          {quickPicks.map((pick) => (
            <button
              key={pick}
              className="rounded-full border px-2.5 py-1 text-[10px] hover:bg-muted/50 transition-colors"
              onClick={() => set({ instruction: pick, label: pick })}
              type="button"
            >
              {pick}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DelayEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;
  const set = (fields: Partial<WorkflowNodeData>) => update({ id: node.id, data: fields });

  const quickDelays = ["5 seconds", "15 seconds", "30 seconds", "1 minute", "5 minutes"];

  return (
    <div className="space-y-4">
      <Field label="Wait for..." hint="How long to wait, or what to wait for">
        <Input
          className="h-9"
          onChange={(e) => set({ instruction: e.target.value, label: `Wait: ${e.target.value}` })}
          placeholder="e.g. the image to finish generating"
          value={d.instruction || ""}
        />
      </Field>
      <div>
        <p className="text-[10px] text-muted-foreground mb-1.5">Quick picks:</p>
        <div className="flex flex-wrap gap-1">
          {quickDelays.map((delay) => (
            <button
              key={delay}
              className="rounded-full border px-2.5 py-1 text-[10px] hover:bg-muted/50 transition-colors"
              onClick={() => set({ instruction: delay, label: `Wait: ${delay}` })}
              type="button"
            >
              {delay}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HttpEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;
  const set = (fields: Partial<WorkflowNodeData>) => update({ id: node.id, data: fields });

  const quickPicks = [
    { label: "Search the web", value: "Search the web for" },
    { label: "Scrape a webpage", value: "Scrape the content from" },
    { label: "Download a file", value: "Download the file from" },
    { label: "Check a URL", value: "Check if the URL is reachable:" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] text-muted-foreground mb-1.5">What do you need?</p>
        <div className="grid grid-cols-2 gap-1">
          {quickPicks.map((pick) => (
            <button
              key={pick.label}
              className="rounded-lg border px-3 py-2 text-xs text-left hover:bg-muted/50 transition-colors"
              onClick={() => set({ instruction: pick.value, label: pick.label })}
              type="button"
            >
              {pick.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Details" hint="Describe what to fetch or scrape">
        <TextArea
          onChange={(v) => set({ instruction: v, label: v.split("\n")[0]?.slice(0, 40) || "Web request" })}
          placeholder="e.g. Scrape the content from the given URL and extract the main article text"
          rows={3}
          value={d.instruction || ""}
        />
      </Field>
    </div>
  );
}

function LoopEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;
  const set = (fields: Partial<WorkflowNodeData>) => update({ id: node.id, data: fields });

  return (
    <div className="space-y-4">
      <Field label="For each..." hint="What items to repeat the next steps for?">
        <Input
          className="h-9"
          onChange={(e) => set({ instruction: `For each ${e.target.value}`, label: `For each ${e.target.value}` })}
          placeholder="e.g. candidate in the search results"
          value={d.instruction?.replace(/^For each\s*/i, "") || ""}
        />
      </Field>
      <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-md p-2">
        Connect the nodes that should repeat for each item after this block.
      </p>
    </div>
  );
}

/** Routes legacy node subtypes to their specialized editor */
function LegacyNodeEditor({ node }: { node: WorkflowNode }) {
  const subtype = node.data.subtype || (node.data.config?.subtype as string) || "";

  switch (subtype) {
    case "if":
      return <IfEditor node={node} />;
    case "transform":
      return <TransformEditor node={node} />;
    case "delay":
      return <DelayEditor node={node} />;
    case "http":
      return <HttpEditor node={node} />;
    case "loop":
      return <LoopEditor node={node} />;
    default:
      // Generic instruction for anything else
      return <InstructionEditor node={node} />;
  }
}

function DecisionEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;
  const options = d.options || [];

  const set = (fields: Partial<WorkflowNodeData>) =>
    update({ id: node.id, data: fields });

  const addOption = () => {
    set({
      options: [...options, { id: nanoid(6), label: "", description: "" }],
    });
  };

  const removeOption = (id: string) => {
    set({ options: options.filter((o) => o.id !== id) });
  };

  const updateOption = (id: string, fields: Partial<{ label: string; description: string }>) => {
    set({
      options: options.map((o) => (o.id === id ? { ...o, ...fields } : o)),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        A branching point — the agent picks a path based on the situation.
      </p>

      <Field label="Label">
        <Input
          className="h-9"
          onChange={(e) => set({ label: e.target.value })}
          placeholder="e.g. Mail type?, Role type?"
          value={d.label || ""}
        />
      </Field>
      <Field label="Question" hint="The decision to make — in plain English">
        <TextArea
          onChange={(v) => set({ question: v })}
          placeholder="e.g. What type of mail does the user want to send?"
          rows={2}
          value={d.question || ""}
        />
      </Field>
      <div className="space-y-2">
        <Label className="text-xs font-medium">Options</Label>
        {options.map((opt) => (
          <div key={opt.id} className="flex gap-1.5">
            <Input
              className="h-8 flex-1 text-xs"
              onChange={(e) => updateOption(opt.id, { label: e.target.value })}
              placeholder="Option label (e.g. Letter, Postcard)"
              value={opt.label}
            />
            <Button
              className="h-8 w-8 shrink-0"
              onClick={() => removeOption(opt.id)}
              size="icon"
              variant="ghost"
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
        <Button
          className="h-8 w-full text-xs"
          onClick={addOption}
          variant="outline"
        >
          <Plus className="size-3 mr-1" /> Add option
        </Button>
      </div>
    </div>
  );
}

function InputEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;

  const set = (fields: Partial<WorkflowNodeData>) =>
    update({ id: node.id, data: fields });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Pauses and asks the user for something — an address, a topic, a file.
      </p>

      <Field label="What to ask for">
        <Input
          className="h-9"
          onChange={(e) => set({ label: e.target.value })}
          placeholder="e.g. Recipient address, Topic, Image to use"
          value={d.label || ""}
        />
      </Field>
      <Field label="How to ask" hint="The question the agent will ask the user">
        <TextArea
          onChange={(v) => set({ prompt: v })}
          placeholder="e.g. Who do you want to send this to? Please provide their full name and mailing address."
          value={d.prompt || ""}
        />
      </Field>
      <Field label="Smart defaults" hint="Help the agent skip this question when possible">
        <TextArea
          onChange={(v) => set({ hints: v })}
          placeholder="e.g. If the user has sent to this person before, use the saved address and just ask them to confirm"
          rows={2}
          value={d.hints || ""}
        />
      </Field>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">Required</Label>
          <p className="text-xs text-muted-foreground">Must the user answer before continuing?</p>
        </div>
        <Switch
          checked={d.required ?? true}
          onCheckedChange={(v) => set({ required: v })}
        />
      </div>
      <Field label="Remember for next time" hint="Save the answer so the user doesn't have to enter it again">
        <Input
          className="h-8 text-xs font-mono"
          onChange={(e) => set({ saveAs: e.target.value })}
          placeholder="e.g. data/recipient_<name>.md"
          value={d.saveAs || ""}
        />
      </Field>
    </div>
  );
}

function OutputEditor({ node }: { node: WorkflowNode }) {
  const update = useSetAtom(updateNodeDataAtom);
  const d = node.data;

  const set = (fields: Partial<WorkflowNodeData>) =>
    update({ id: node.id, data: fields });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        What the skill delivers — a report, confirmation, file, or message shown to the user.
      </p>

      <Field label="Label">
        <Input
          className="h-9"
          onChange={(e) => set({ label: e.target.value })}
          placeholder="e.g. Candidate report, Tracking info"
          value={d.label || ""}
        />
      </Field>
      <Field label="Format" hint="What form the output takes">
        <Input
          className="h-9"
          onChange={(e) => set({ format: e.target.value })}
          placeholder="e.g. Markdown report, Confirmation message, JSON data"
          value={d.format || ""}
        />
      </Field>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">Require confirmation</Label>
          <p className="text-xs text-muted-foreground">Ask user to confirm before finalizing</p>
        </div>
        <Switch
          checked={d.confirm ?? false}
          onCheckedChange={(v) => set({ confirm: v })}
        />
      </div>
      <Field label="Output template" hint="Optional — defines the structure of the output">
        <TextArea
          onChange={(v) => set({ template: v })}
          placeholder={"# Report — {{TITLE}}\n\n## Summary\n{{SUMMARY}}\n\n## Results\n{{RESULTS}}"}
          rows={6}
          value={d.template || ""}
        />
      </Field>
    </div>
  );
}

// ─── Main config component ───────────────────────────────────────────

const NODE_TYPE_INFO: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  purpose: { icon: Sparkles, color: "text-blue-500", label: "Purpose" },
  service: { icon: Zap, color: "text-green-500", label: "Service" },
  instruction: { icon: FileText, color: "text-gray-500", label: "Instruction" },
  decision: { icon: GitBranch, color: "text-amber-500", label: "Decision" },
  input: { icon: MessageSquare, color: "text-purple-500", label: "Input" },
  output: { icon: CheckCircle2, color: "text-teal-500", label: "Output" },
  // Legacy types — map to equivalent new types
  logic: { icon: FileText, color: "text-gray-500", label: "Instruction" },
  data: { icon: FileText, color: "text-gray-500", label: "Instruction" },
  x402: { icon: Zap, color: "text-green-500", label: "Service" },
  action: { icon: FileText, color: "text-gray-500", label: "Instruction" },
  trigger: { icon: Sparkles, color: "text-blue-500", label: "Purpose" },
};

export function SkillNodeConfig() {
  const [selectedNodeId] = useAtom(selectedNodeAtom);
  const nodes = useAtomValue(nodesAtom);
  const update = useSetAtom(updateNodeDataAtom);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Sparkles className="size-8 text-muted-foreground/30" />
        <div>
          <p className="font-medium text-sm">No node selected</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click a node on the canvas to edit it, or use the <strong>+</strong> button to add one.
          </p>
        </div>
      </div>
    );
  }

  const subtype = selectedNode.data.subtype || (selectedNode.data.config?.subtype as string) || "";

  // Subtype-specific labels for legacy nodes
  const SUBTYPE_LABELS: Record<string, string> = {
    if: "Condition",
    transform: "Convert",
    delay: "Wait",
    http: "Web",
    loop: "Repeat",
  };

  const typeInfo = NODE_TYPE_INFO[selectedNode.data.type];
  const displayLabel = SUBTYPE_LABELS[subtype] || typeInfo?.label;

  const handleChangeType = () => {
    update({
      id: selectedNode.id,
      data: {
        type: "action" as const,
        label: "",
        description: "",
        instruction: undefined,
        question: undefined,
        options: undefined,
        prompt: undefined,
        hints: undefined,
        required: undefined,
        saveAs: undefined,
        format: undefined,
        template: undefined,
        confirm: undefined,
        endpoint: undefined,
        notes: undefined,
        spec: undefined,
        config: {},
        subtype: undefined,
      },
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {typeInfo && (
        <div className="flex items-center border-b px-2 py-2 shrink-0">
          {selectedNode.data.type !== "purpose" && (
            <button
              className="flex items-center gap-0.5 rounded px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
              onClick={handleChangeType}
              title="Change type"
              type="button"
            >
              <ChevronLeft className="size-3.5" />
            </button>
          )}
          <div className="flex items-center gap-2 px-1">
            <typeInfo.icon className={cn("size-4", typeInfo.color)} />
            <span className={cn("text-xs font-medium uppercase tracking-wider", typeInfo.color)}>
              {displayLabel}
            </span>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedNode.data.type === "purpose" && <PurposeEditor node={selectedNode} />}
        {selectedNode.data.type === "service" && <ServiceEditor node={selectedNode} />}
        {selectedNode.data.type === "instruction" && <InstructionEditor node={selectedNode} />}
        {selectedNode.data.type === "decision" && <DecisionEditor node={selectedNode} />}
        {selectedNode.data.type === "input" && <InputEditor node={selectedNode} />}
        {selectedNode.data.type === "output" && <OutputEditor node={selectedNode} />}

        {/* Legacy types — route to specialized editors based on subtype */}
        {(selectedNode.data.type === "logic" || selectedNode.data.type === "action" || selectedNode.data.type === "data" || selectedNode.data.type === "trigger") && (
          <LegacyNodeEditor node={selectedNode} />
        )}

        {selectedNode.data.type === "x402" && <ServiceEditor node={selectedNode} />}

        {/* Fallback */}
        {!typeInfo && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            This node type does not have a config editor yet.
          </div>
        )}
      </div>

    </div>
  );
}
