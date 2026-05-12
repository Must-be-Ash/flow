"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { FileText } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "@/lib/workflow-store";

type InstructionNodeProps = NodeProps & { data: WorkflowNodeData; id: string };

export const InstructionNode = memo(({ data, selected }: InstructionNodeProps) => {
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card px-4 py-3 shadow-sm transition-all w-56",
        selected ? "border-gray-500 shadow-gray-500/20 shadow-md" : "border-gray-500/30",
      )}
    >
      <Handle type="target" position={Position.Left} id="left" className="!bg-gray-500 !w-3 !h-3 !border-2 !border-background" />

      <div className="flex items-center gap-2 mb-1.5">
        <div className="rounded-lg bg-gray-500/10 p-1">
          <FileText className="size-3.5 text-gray-500" />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Instruction
        </span>
      </div>

      <p className="text-xs font-medium leading-snug">
        {data.label || "Give an instruction"}
      </p>

      {data.instruction && (
        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-3">
          {data.instruction}
        </p>
      )}

      <Handle type="source" position={Position.Right} id="right" className="!bg-gray-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
});

InstructionNode.displayName = "InstructionNode";
