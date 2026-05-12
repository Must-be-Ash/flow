"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "@/lib/workflow-store";

type InputNodeProps = NodeProps & { data: WorkflowNodeData; id: string };

export const InputNode = memo(({ data, selected }: InputNodeProps) => {
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card px-4 py-3 shadow-sm transition-all w-56",
        selected ? "border-purple-500 shadow-purple-500/20 shadow-md" : "border-purple-500/30",
      )}
    >
      <Handle type="target" position={Position.Left} id="left" className="!bg-purple-500 !w-3 !h-3 !border-2 !border-background" />

      <div className="flex items-center gap-2 mb-1.5">
        <div className="rounded-lg bg-purple-500/10 p-1">
          <MessageSquare className="size-3.5 text-purple-500" />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-purple-500">
          User Input
        </span>
        {data.required && (
          <span className="ml-auto text-[8px] font-medium text-red-500">Required</span>
        )}
      </div>

      <p className="text-xs font-medium leading-snug">
        {data.label || "Ask the user"}
      </p>

      {data.prompt && (
        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
          {data.prompt}
        </p>
      )}

      {data.saveAs && (
        <p className="mt-1 text-[9px] text-purple-500/70 italic">
          Saves to {data.saveAs}
        </p>
      )}

      <Handle type="source" position={Position.Right} id="right" className="!bg-purple-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
});

InputNode.displayName = "InputNode";
