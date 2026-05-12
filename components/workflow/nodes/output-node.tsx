"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { CheckCircle2 } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "@/lib/workflow-store";

type OutputNodeProps = NodeProps & { data: WorkflowNodeData; id: string };

export const OutputNode = memo(({ data, selected }: OutputNodeProps) => {
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card px-4 py-3 shadow-sm transition-all w-56",
        selected ? "border-teal-500 shadow-teal-500/20 shadow-md" : "border-teal-500/30",
      )}
    >
      <Handle type="target" position={Position.Left} id="left" className="!bg-teal-500 !w-3 !h-3 !border-2 !border-background" />

      <div className="flex items-center gap-2 mb-1.5">
        <div className="rounded-lg bg-teal-500/10 p-1">
          <CheckCircle2 className="size-3.5 text-teal-500" />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-teal-500">
          Output
        </span>
        {data.confirm && (
          <span className="ml-auto rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-medium text-amber-600">
            Confirm
          </span>
        )}
      </div>

      <p className="text-xs font-medium leading-snug">
        {data.label || "Define output"}
      </p>

      {data.format && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {data.format}
        </p>
      )}

      {/* Output nodes are terminal — no source handle needed, but allow chaining */}
      <Handle type="source" position={Position.Right} id="right" className="!bg-teal-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
});

OutputNode.displayName = "OutputNode";
