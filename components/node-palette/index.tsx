"use client";

import {
  ArrowRight,
  Clock,
  Code2,
  GitBranch,
  Globe,
  Loader2,
  Repeat,
  Search,
  Sparkles,
  Variable,
  Zap,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SearchResult = {
  origin: string;
  description: string;
  category: string;
  endpoints?: Array<{
    path: string;
    method: string;
    description?: string;
    price?: string;
  }>;
};

type EndpointInfo = {
  path: string;
  method: string;
  description?: string;
  price?: string;
  spec?: unknown;
};

type NodePaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNode: (node: {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }) => void;
};

// Built-in logic nodes
const LOGIC_NODES = [
  { subtype: "if", label: "If / Condition", icon: GitBranch, description: "Branch based on a condition" },
  { subtype: "switch", label: "Switch", icon: GitBranch, description: "Multi-way branch" },
  { subtype: "loop", label: "Loop", icon: Repeat, description: "Repeat steps for each item" },
  { subtype: "delay", label: "Delay", icon: Clock, description: "Wait before continuing" },
  { subtype: "merge", label: "Merge", icon: ArrowRight, description: "Combine multiple branches" },
];

// Built-in data nodes
const DATA_NODES = [
  { subtype: "http", label: "HTTP Request", icon: Globe, description: "Make a free HTTP request" },
  { subtype: "transform", label: "Transform", icon: Code2, description: "Transform data with JSONata" },
  { subtype: "set-variable", label: "Set Variable", icon: Variable, description: "Assign a workflow variable" },
];

export function NodePalette({ open, onOpenChange, onAddNode }: NodePaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointInfo[]>([]);
  const [loadingEndpoints, setLoadingEndpoints] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults([]);
      setSelectedOrigin(null);
      setEndpoints([]);
    }
  }, [open]);

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Debounced search
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedOrigin(null);
      setEndpoints([]);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!value.trim()) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/discover/search?q=${encodeURIComponent(value)}`
          );
          const data = await res.json();
          setResults(Array.isArray(data) ? data : []);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    []
  );

  const handleSelectOrigin = async (origin: string) => {
    setSelectedOrigin(origin);
    setLoadingEndpoints(true);
    try {
      const res = await fetch(
        `/api/discover/endpoints?origin=${encodeURIComponent(origin)}`
      );
      const data = await res.json();
      setEndpoints(Array.isArray(data) ? data : []);
    } catch {
      setEndpoints([]);
    } finally {
      setLoadingEndpoints(false);
    }
  };

  const handleAddX402Node = (endpoint: EndpointInfo, origin: string) => {
    onAddNode({
      id: nanoid(),
      type: "action",
      position: { x: 0, y: 0 },
      data: {
        label: `${endpoint.method} ${endpoint.path}`,
        description: endpoint.description || "",
        type: "x402",
        spec: endpoint.spec || {
          kind: "x402",
          origin,
          path: endpoint.path,
          method: endpoint.method,
          price: { amount: endpoint.price || "0", asset: "USDC", chain: "base" },
          inputSchema: {},
          source: { discoveredAt: new Date().toISOString(), via: "discover" },
        },
        config: {},
        status: "idle",
      },
    });
    onOpenChange(false);
  };

  const handleAddBuiltinNode = (
    type: "logic" | "data",
    subtype: string,
    label: string
  ) => {
    onAddNode({
      id: nanoid(),
      type: "action",
      position: { x: 0, y: 0 },
      data: {
        label,
        type,
        subtype,
        config: {},
        status: "idle",
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Add Node</DialogTitle>
        <Tabs defaultValue="x402" className="flex flex-col">
          <div className="border-b px-3 pt-3">
            <TabsList className="h-8 w-full">
              <TabsTrigger className="text-xs" value="x402">
                <Zap className="mr-1 size-3" />
                AgentCash
              </TabsTrigger>
              <TabsTrigger className="text-xs" value="logic">
                <GitBranch className="mr-1 size-3" />
                Logic
              </TabsTrigger>
              <TabsTrigger className="text-xs" value="data">
                <Code2 className="mr-1 size-3" />
                Data
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="x402" className="m-0">
            <div className="border-b px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  className="h-8 pl-8 text-sm"
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search x402 services... (e.g. email, search, image)"
                  value={query}
                />
              </div>
            </div>

            <div className="max-h-[350px] overflow-y-auto">
              {selectedOrigin ? (
                <div className="p-2">
                  <button
                    className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedOrigin(null);
                      setEndpoints([]);
                    }}
                  >
                    <ArrowRight className="size-3 rotate-180" />
                    Back to results
                  </button>

                  {loadingEndpoints ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : endpoints.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      No endpoints found for this service
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {endpoints.map((ep) => (
                        <button
                          key={`${ep.method}:${ep.path}`}
                          className={cn(
                            "w-full rounded-md border p-2.5 text-left transition-colors",
                            "hover:bg-muted/50"
                          )}
                          onClick={() =>
                            handleAddX402Node(ep, selectedOrigin)
                          }
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-600 dark:text-blue-400">
                              {ep.method}
                            </span>
                            <span className="font-mono text-xs truncate">
                              {ep.path}
                            </span>
                            {ep.price && (
                              <span className="ml-auto shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                                ${ep.price}
                              </span>
                            )}
                          </div>
                          {ep.description && (
                            <p className="mt-1 text-[11px] text-muted-foreground truncate">
                              {ep.description}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : results.length === 0 ? (
                    <div className="py-8 text-center">
                      {query ? (
                        <p className="text-xs text-muted-foreground">
                          No services found for &ldquo;{query}&rdquo;
                        </p>
                      ) : (
                        <div className="space-y-1">
                          <Sparkles className="mx-auto size-5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Search for x402 services to add to your workflow
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {results.map((result) => (
                        <button
                          key={result.origin}
                          className={cn(
                            "w-full rounded-md border p-2.5 text-left transition-colors",
                            "hover:bg-muted/50"
                          )}
                          onClick={() => handleSelectOrigin(result.origin)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs truncate text-foreground">
                              {result.origin.replace("https://", "")}
                            </span>
                            <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {result.category}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                            {result.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="logic" className="m-0">
            <div className="max-h-[350px] overflow-y-auto p-2">
              <div className="space-y-1">
                {LOGIC_NODES.map((node) => (
                  <button
                    key={node.subtype}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-colors",
                      "hover:bg-muted/50"
                    )}
                    onClick={() =>
                      handleAddBuiltinNode("logic", node.subtype, node.label)
                    }
                  >
                    <node.icon className="size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{node.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {node.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="m-0">
            <div className="max-h-[350px] overflow-y-auto p-2">
              <div className="space-y-1">
                {DATA_NODES.map((node) => (
                  <button
                    key={node.subtype}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-colors",
                      "hover:bg-muted/50"
                    )}
                    onClick={() =>
                      handleAddBuiltinNode("data", node.subtype, node.label)
                    }
                  >
                    <node.icon className="size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{node.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {node.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
