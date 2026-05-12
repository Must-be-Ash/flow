"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "@/lib/workflow-store";

type DecisionNodeProps = NodeProps & { data: WorkflowNodeData; id: string };

export const DecisionNode = memo(({ data, selected }: DecisionNodeProps) => {
  const options = data.options || [];

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card px-4 py-3 shadow-sm transition-all w-56",
        selected ? "border-amber-500 shadow-amber-500/20 shadow-md" : "border-amber-500/30",
      )}
    >
      <Handle type="target" position={Position.Left} id="left" className="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />

      <div className="flex items-center gap-2 mb-1.5">
        <div className="rounded-lg bg-amber-500/10 p-1">
          <GitBranch className="size-3.5 text-amber-500" />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-amber-500">
          Decision
        </span>
      </div>

      <p className="text-xs font-medium leading-snug">
        {data.label || data.question || "Make a decision"}
      </p>

      {options.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {options.map((opt) => (
            <span
              key={opt.id}
              className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400"
            >
              {opt.label}
            </span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} id="right" className="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />

      {/* Additional handles for each option on the right side */}
      {options.map((opt, i) => (
        <Handle
          key={opt.id}
          type="source"
          position={Position.Right}
          id={opt.id}
          className="!bg-amber-500 !w-2.5 !h-2.5 !border-2 !border-background"
          style={{ top: `${40 + i * 20}%` }}
        />
      ))}
    </div>
  );
});

DecisionNode.displayName = "DecisionNode";
