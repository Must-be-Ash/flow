"use client";

import type { NodeProps } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  Code2,
  EyeOff,
  FileText,
  GitBranch,
  Globe,
  Loader2,
  MessageSquare,
  Repeat,
  Search,
  Variable,
  XCircle,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Node,
  NodeDescription,
  NodeTitle,
} from "@/components/ai-elements/node";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  selectedNodeAtom,
  updateNodeDataAtom,
  type WorkflowNodeData,
} from "@/lib/workflow-store";

const SUBTYPE_ICONS: Record<string, typeof Zap> = {
  if: GitBranch,
  switch: GitBranch,
  loop: Repeat,
  delay: Clock,
  merge: ArrowRight,
  http: Globe,
  transform: Code2,
  "set-variable": Variable,
};

const SUBTYPE_LABELS: Record<string, string> = {
  if: "If / Condition",
  switch: "Switch",
  loop: "Loop",
  delay: "Delay",
  merge: "Merge",
  http: "HTTP Request",
  transform: "Transform",
  "set-variable": "Set Variable",
};

type SearchResult = {
  name: string;
  summary: string;
  origin: string;
  originName: string;
  path: string;
  method: string;
  price?: string;
  authMode?: string;
  score?: number;
};

// New skill node types — created as proper top-level nodes
const SKILL_BLOCKS: Array<{ nodeType: string; label: string; icon: typeof Zap; color: string }> = [
  { nodeType: "instruction", label: "Instruction", icon: FileText, color: "text-gray-400" },
  { nodeType: "decision", label: "Decision", icon: GitBranch, color: "text-amber-400" },
  { nodeType: "input", label: "User Input", icon: MessageSquare, color: "text-purple-400" },
  { nodeType: "output", label: "Output", icon: CheckCircle, color: "text-teal-400" },
];

// Legacy primitives — kept as useful building blocks
const PRIMITIVES: Array<{ subtype: string; type: "logic" | "data"; label: string; icon: typeof Zap }> = [
  { subtype: "if", type: "logic", label: "If", icon: GitBranch },
  { subtype: "loop", type: "logic", label: "Loop", icon: Repeat },
  { subtype: "delay", type: "logic", label: "Delay", icon: Clock },
  { subtype: "http", type: "data", label: "HTTP", icon: Globe },
  { subtype: "transform", type: "data", label: "Transform", icon: Code2 },
];

function isBase64ImageOutput(output: unknown): output is { base64: string } {
  return (
    typeof output === "object" &&
    output !== null &&
    "base64" in output &&
    typeof (output as { base64: unknown }).base64 === "string" &&
    (output as { base64: string }).base64.length > 100
  );
}

function GeneratedImageThumbnail({ base64 }: { base64: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <button
        className="relative size-12 cursor-zoom-in overflow-hidden rounded-lg transition-transform hover:scale-105"
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
        type="button"
      >
        <Image
          alt="Generated image"
          className="object-cover"
          fill
          sizes="48px"
          src={`data:image/png;base64,${base64}`}
          unoptimized
        />
      </button>
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="max-w-3xl p-2" showCloseButton={false}>
          <DialogTitle className="sr-only">Generated Image</DialogTitle>
          <div className="relative aspect-square w-full overflow-hidden rounded-lg">
            <Image
              alt="Generated image"
              className="object-contain"
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              src={`data:image/png;base64,${base64}`}
              unoptimized
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const StatusBadge = ({
  status,
}: {
  status?: "idle" | "running" | "success" | "error";
}) => {
  if (!status || status === "idle" || status === "running") return null;
  return (
    <div
      className={cn(
        "absolute top-2 right-2 rounded-full p-1",
        status === "success" && "bg-green-500/50",
        status === "error" && "bg-red-500/50"
      )}
    >
      {status === "success" && <Check className="size-3.5 text-white" strokeWidth={2.5} />}
      {status === "error" && <XCircle className="size-3.5 text-white" strokeWidth={2.5} />}
    </div>
  );
};

type ActionNodeProps = NodeProps & {
  data?: WorkflowNodeData;
  id: string;
};

// Inline search box rendered on empty action nodes.
function EmptyNodeSearch({ nodeId }: { nodeId: string }) {
  const updateNodeData = useSetAtom(updateNodeDataAtom);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const executeSearch = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/discover/search?q=${encodeURIComponent(value)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePickResult = (result: SearchResult) => {
    updateNodeData({
      id: nodeId,
      data: {
        type: "x402" as const,
        label: result.summary.length > 40 ? result.summary.slice(0, 37) + "..." : result.summary,
        description: result.summary,
        spec: {
          kind: "x402",
          origin: result.origin,
          path: result.path,
          method: result.method,
          price: { amount: result.price || "0", asset: "USDC", chain: "base" },
          inputSchema: {},
          source: { discoveredAt: new Date().toISOString(), via: "search" },
        },
        config: {},
      },
    });
  };

  const handlePickPrimitive = (subtype: string, type: "logic" | "data", label: string) => {
    updateNodeData({
      id: nodeId,
      data: { type, label, config: { subtype } },
    });
  };

  const handlePickSkillBlock = (nodeType: string, label: string) => {
    updateNodeData({
      id: nodeId,
      data: {
        type: nodeType as "instruction" | "decision" | "input" | "output",
        label,
      },
    });
  };

  return (
    <div className="flex w-full flex-col nodrag" onClick={(e) => e.stopPropagation()}>
      {/* Service search section */}
      <div className="p-3 space-y-2 rounded-t-md bg-gradient-to-br from-[#b0b0b0] via-[#888888] to-[#707070] dark:from-[#686868] dark:via-[#444444] dark:to-[#2e2e2e]">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
            Add a service
          </span>
          <span className="text-[9px] text-white/70">— pays per call</span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              autoComplete="one-time-code"
              autoFocus
              className="w-full h-8 pl-8 pr-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              data-1p-ignore
              data-lpignore="true"
              name="srch-x402-act"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  executeSearch(query);
                }
              }}
              placeholder="e.g. image generation, send email"
              value={query}
            />
          </div>
          <button
            className="w-full h-8 rounded-md text-xs font-semibold disabled:cursor-default transition-all"
            style={!query.trim() || loading ? {
              background: 'radial-gradient(ellipse at 50% 0%, #2a2a2a 0%, #0a0a0a 65%, #000000 100%)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderTopColor: 'rgba(255,255,255,0.05)',
              borderLeftColor: 'rgba(255,255,255,0.05)',
              borderRightColor: 'rgba(255,255,255,0.05)',
              borderBottomColor: 'rgba(0,0,0,0.6)',
              boxShadow: 'none',
              color: 'rgba(255,255,255,0.3)',
            } : {
              background: 'radial-gradient(ellipse at 50% 0%, #4a4a4a 0%, #111111 65%, #000000 100%)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderTopColor: 'rgba(255,255,255,0.12)',
              borderLeftColor: 'rgba(255,255,255,0.12)',
              borderRightColor: 'rgba(255,255,255,0.12)',
              borderBottomColor: 'rgba(0,0,0,0.6)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 6px rgba(0,0,0,0.5)',
              color: 'white',
            }}
            disabled={!query.trim() || loading}
            onClick={() => executeSearch(query)}
            type="button"
          >
            {loading ? <Loader2 className="size-3 animate-spin" /> : "Search"}
          </button>
        </div>

        <div className="max-h-56 overflow-y-auto -mx-1 px-1 nowheel">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-[10px] text-muted-foreground">Searching services...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-1">
              {results.map((result, i) => (
                <button
                  key={`${result.origin}${result.path}-${i}`}
                  className="w-full rounded-lg border border-border/50 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => handlePickResult(result)}
                  type="button"
                >
                  <p className="text-[11px] font-medium leading-snug line-clamp-2">
                    {result.summary}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] text-muted-foreground truncate">
                      {result.originName}
                    </span>
                    {result.price && (
                      <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[8px] font-medium text-green-600 dark:text-green-400 shrink-0">
                        ${result.price}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : searched ? (
            <p className="py-4 text-center text-[10px] text-muted-foreground">
              No services found. Try different keywords.
            </p>
          ) : null}
        </div>
      </div>

      {/* Block picker section — only shown before a search */}
      {!searched && results.length === 0 && (
        <div className="border-t border-border/50 px-3 py-2.5">
          <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Or add a block</p>
          <div className="grid grid-cols-3 gap-1">
            {SKILL_BLOCKS.map((b) => (
              <button
                key={b.nodeType}
                className="flex flex-col items-center gap-0.5 rounded border border-border/50 p-1.5 hover:bg-muted/50 transition-colors"
                onClick={() => handlePickSkillBlock(b.nodeType, b.label)}
                title={b.label}
                type="button"
              >
                <b.icon className="size-3 text-muted-foreground" />
                <span className="text-[9px] truncate w-full text-center">{b.label}</span>
              </button>
            ))}
            {PRIMITIVES.map((p) => (
              <button
                key={p.subtype}
                className="flex flex-col items-center gap-0.5 rounded border border-border/50 p-1.5 hover:bg-muted/50 transition-colors"
                onClick={() => handlePickPrimitive(p.subtype, p.type, p.label)}
                title={p.label}
                type="button"
              >
                <p.icon className="size-3 text-muted-foreground" />
                <span className="text-[9px] truncate w-full text-center">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ActionNode = memo(({ data, selected, id }: ActionNodeProps) => {
  // Execution state removed — skill drafting tool
  const selectedNodeId = useAtomValue(selectedNodeAtom);

  if (!data) return null;

  // If the node type was changed to a skill type, don't render — let the correct component handle it
  const skillTypes = new Set(["purpose", "service", "instruction", "decision", "input", "output"]);
  if (skillTypes.has(data.type)) return null;

  const status = data.status;
  const isDisabled = data.enabled === false;
  const isEmpty =
    !data.config?.actionType &&
    !data.config?.spec &&
    !data.config?.subtype &&
    data.type !== "x402" &&
    data.type !== "logic" &&
    data.type !== "data";

  // Empty state — show inline search-first card
  if (isEmpty) {
    return (
      <Node
        className={cn(
          "flex w-72 flex-col shadow-none transition-all duration-150 ease-out",
          selected && "border-primary",
          isDisabled && "opacity-50"
        )}
        handles={{ target: true, source: true }}
        status={status}
      >
        {selectedNodeId === id ? (
          <EmptyNodeSearch nodeId={id} />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6">
            <Search className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <NodeTitle className="text-sm">Click to add a step</NodeTitle>
            <NodeDescription className="text-[11px] text-center">
              Search 1000s of services or pick a primitive
            </NodeDescription>
          </div>
        )}
      </Node>
    );
  }

  // Configured x402 node
  if (data.type === "x402") {
    const spec = data.config?.spec as Record<string, unknown> | undefined;
    const origin = (spec?.origin as string) || "";
    const price = ((spec?.price as Record<string, unknown>)?.amount as string) || "0";
    const hasGeneratedImage = false;

    return (
      <Node
        className={cn(
          "relative flex h-48 w-48 flex-col items-center justify-center shadow-none transition-all duration-150 ease-out",
          selected && "border-primary",
          isDisabled && "opacity-50"
        )}
        handles={{ target: true, source: true }}
        status={status}
      >
        {isDisabled && (
          <div className="absolute top-2 left-2 rounded-full bg-gray-500/50 p-1">
            <EyeOff className="size-3.5 text-white" />
          </div>
        )}
        <StatusBadge status={status} />
        <div className="flex flex-col items-center justify-center gap-2 p-4">
          {hasGeneratedImage ? (
            <GeneratedImageThumbnail base64="" />
          ) : (
            <Zap className="size-10 text-amber-300" strokeWidth={1.5} />
          )}
          <div className="flex flex-col items-center gap-0.5 text-center">
            <NodeTitle className="text-sm">{data.label || "x402 call"}</NodeTitle>
            {origin && (
              <NodeDescription className="text-[10px] truncate max-w-[160px]">
                {origin.replace("https://", "")}
              </NodeDescription>
            )}
            {price !== "0" && (
              <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[9px] font-medium text-green-600 dark:text-green-400">
                ${price} per call
              </span>
            )}
          </div>
        </div>
      </Node>
    );
  }

  // Configured logic / data primitive
  if (data.type === "logic" || data.type === "data") {
    const subtype = (data.config?.subtype as string) || "";
    const Icon = SUBTYPE_ICONS[subtype] || Zap;
    const label = data.label || SUBTYPE_LABELS[subtype] || subtype;

    return (
      <Node
        className={cn(
          "relative flex h-44 w-44 flex-col items-center justify-center shadow-none transition-all duration-150 ease-out",
          selected && "border-primary",
          isDisabled && "opacity-50"
        )}
        handles={{ target: true, source: true }}
        status={status}
      >
        {isDisabled && (
          <div className="absolute top-2 left-2 rounded-full bg-gray-500/50 p-1">
            <EyeOff className="size-3.5 text-white" />
          </div>
        )}
        <StatusBadge status={status} />
        <div className="flex flex-col items-center gap-2 p-4">
          <Icon className="size-9 text-muted-foreground" strokeWidth={1.5} />
          <div className="flex flex-col items-center text-center">
            <NodeTitle className="text-sm">{label}</NodeTitle>
            <NodeDescription className="text-[10px] uppercase tracking-wider">
              {data.type}
            </NodeDescription>
          </div>
        </div>
      </Node>
    );
  }

  // Legacy "action" node (in-progress migration) — render generically
  return (
    <Node
      className={cn(
        "relative flex h-48 w-48 flex-col items-center justify-center shadow-none transition-all duration-150 ease-out",
        selected && "border-primary",
        isDisabled && "opacity-50"
      )}
      handles={{ target: true, source: true }}
      status={status}
    >
      {isDisabled && (
        <div className="absolute top-2 left-2 rounded-full bg-gray-500/50 p-1">
          <EyeOff className="size-3.5 text-white" />
        </div>
      )}
      <StatusBadge status={status} />
      <div className="flex flex-col items-center gap-2 p-4">
        <Zap className="size-10 text-amber-300" strokeWidth={1.5} />
        <NodeTitle className="text-sm">{data.label || "Action"}</NodeTitle>
        {data.description && (
          <NodeDescription className="text-[10px] text-center max-w-[160px]">
            {data.description}
          </NodeDescription>
        )}
      </div>
    </Node>
  );
});

ActionNode.displayName = "ActionNode";
