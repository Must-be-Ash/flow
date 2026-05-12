"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "@/lib/workflow-store";

type PurposeNodeProps = NodeProps & { data: WorkflowNodeData; id: string };

export const PurposeNode = memo(({ data, selected }: PurposeNodeProps) => {
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card px-5 py-4 shadow-sm transition-all w-64",
        selected ? "border-blue-500 shadow-blue-500/20 shadow-md" : "border-blue-500/30",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="rounded-lg bg-blue-500/10 p-1.5">
          <Sparkles className="size-4 text-blue-500" />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-blue-500">
          Purpose
        </span>
      </div>

      <p className="font-semibold text-sm leading-snug">
        {data.name || data.label || "What skill do you want to create?"}
      </p>

      {data.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
          {data.description}
        </p>
      )}

      <Handle type="source" position={Position.Right} id="right" className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
});

PurposeNode.displayName = "PurposeNode";
