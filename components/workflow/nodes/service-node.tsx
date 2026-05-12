"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { useSetAtom } from "jotai";
import {
  ArrowRight,
  Loader2,
  Search,
  Zap,
} from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  updateNodeDataAtom,
  type WorkflowNodeData,
} from "@/lib/workflow-store";

type SearchResult = {
  name: string;
  summary: string;
  origin: string;
  originName: string;
  path: string;
  method: string;
  price?: string;
};

type ServiceNodeProps = NodeProps & { data: WorkflowNodeData; id: string };

function ServiceSearch({ nodeId }: { nodeId: string }) {
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

  const handlePick = async (result: SearchResult) => {
    // Set node data immediately with what we know
    updateNodeData({
      id: nodeId,
      data: {
        label: result.summary.length > 50 ? result.summary.slice(0, 47) + "..." : result.summary,
        description: result.summary,
        endpoint: {
          origin: result.origin,
          path: result.path,
          method: result.method,
          price: result.price || "0",
          summary: result.summary,
        },
      },
    });

    // Auto-introspect the endpoint in the background
    try {
      const url = `${result.origin}${result.path}`;
      const res = await fetch(`/api/discover/check?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const check = await res.json();
        updateNodeData({
          id: nodeId,
          data: {
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
          },
        });
      }
    } catch {
      // Introspection failed — non-fatal, we already have basic endpoint data
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 p-3 nodrag nowheel" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2 size-3 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            autoFocus
            className="w-full h-7 pl-7 pr-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
            autoComplete="one-time-code"
            data-1p-ignore
            data-lpignore="true"
            name="srch-x402-svc"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                executeSearch(query);
              }
            }}
            placeholder="What do you need?"
            value={query}
          />
        </div>
        <button
          className="h-7 px-2 rounded-md border bg-green-600 text-white text-[10px] font-medium hover:bg-green-700 disabled:opacity-50 shrink-0"
          disabled={!query.trim() || loading}
          onClick={() => executeSearch(query)}
          type="button"
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : "Search"}
        </button>
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : results.length > 0 ? (
          results.map((r, i) => (
            <button
              key={`${r.origin}${r.path}-${i}`}
              className="w-full rounded border border-border/50 px-2 py-1.5 text-left hover:bg-muted/50"
              onClick={() => handlePick(r)}
              type="button"
            >
              <p className="text-[10px] font-medium leading-snug line-clamp-2">{r.summary}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[8px] text-muted-foreground">{r.originName}</span>
                {r.price && (
                  <span className="rounded-full bg-green-500/10 px-1 py-0.5 text-[7px] font-medium text-green-600 dark:text-green-400">
                    ${r.price}
                  </span>
                )}
              </div>
            </button>
          ))
        ) : searched ? (
          <p className="py-3 text-center text-[10px] text-muted-foreground">No services found</p>
        ) : null}
      </div>
    </div>
  );
}

export const ServiceNode = memo(({ data, selected, id }: ServiceNodeProps) => {
  const hasEndpoint = !!data.endpoint;

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card shadow-sm transition-all",
        hasEndpoint ? "w-56 px-4 py-3" : "w-64",
        selected ? "border-green-500 shadow-green-500/20 shadow-md" : "border-green-500/30",
      )}
    >
      <Handle type="target" position={Position.Left} id="left" className="!bg-green-500 !w-3 !h-3 !border-2 !border-background" />

      {hasEndpoint ? (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="rounded-lg bg-green-500/10 p-1">
              <Zap className="size-3.5 text-green-500" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-green-500">
              Service
            </span>
            {data.endpoint?.price && (
              <span className="ml-auto rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-medium text-green-600 dark:text-green-400">
                ${data.endpoint.price}
              </span>
            )}
          </div>

          <p className="text-xs font-medium leading-snug line-clamp-2">
            {data.label || data.endpoint?.summary || "Untitled service"}
          </p>

          {data.description && data.description !== data.label && (
            <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
              {data.description}
            </p>
          )}
        </>
      ) : (
        <ServiceSearch nodeId={id} />
      )}

      <Handle type="source" position={Position.Right} id="right" className="!bg-green-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
});

ServiceNode.displayName = "ServiceNode";
