"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Eraser,
  Eye,
  EyeOff,
  FileCode,
  MenuIcon,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/ui/code-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateBadgeInput } from "@/components/ui/template-badge-input";
import { TemplateBadgeTextarea } from "@/components/ui/template-badge-textarea";
import { api } from "@/lib/api-client";
// Codegen removed — skill drafting tool, no code generation
import {
  clearNodeStatusesAtom,
  currentWorkflowIdAtom,
  currentWorkflowNameAtom,
  deleteEdgeAtom,
  deleteNodeAtom,
  deleteSelectedItemsAtom,
  edgesAtom,
  isGeneratingAtom,
  nodesAtom,
  propertiesPanelActiveTabAtom,
  selectedEdgeAtom,
  selectedNodeAtom,
  showClearDialogAtom,
  showDeleteDialogAtom,
  updateNodeDataAtom,
} from "@/lib/workflow-store";
import { Panel } from "../ai-elements/panel";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { SkillNodeConfig } from "./config/skill-node-config";

const NON_ALPHANUMERIC_REGEX = /[^a-zA-Z0-9\s]/g;
const WORD_SPLIT_REGEX = /\s+/;

// Multi-selection panel
const MultiSelectionPanel = ({
  selectedNodes,
  selectedEdges,
  onDelete,
}: {
  selectedNodes: { id: string; selected?: boolean }[];
  selectedEdges: { id: string; selected?: boolean }[];
  onDelete: () => void;
}) => {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const nodeText = selectedNodes.length === 1 ? "node" : "nodes";
  const edgeText = selectedEdges.length === 1 ? "line" : "lines";
  const parts: string[] = [];
  if (selectedNodes.length > 0) parts.push(`${selectedNodes.length} ${nodeText}`);
  if (selectedEdges.length > 0) parts.push(`${selectedEdges.length} ${edgeText}`);
  const selectionText = parts.join(" and ");

  return (
    <>
      <div className="flex size-full flex-col">
        <div className="flex h-14 w-full shrink-0 items-center border-b bg-transparent px-4">
          <h2 className="font-semibold text-foreground">Properties</h2>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <Label>Selection</Label>
            <p className="text-muted-foreground text-sm">{selectionText} selected</p>
          </div>
        </div>
        <div className="shrink-0 border-t p-4">
          <Button
            onClick={() => setShowDeleteAlert(true)}
            size="icon"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <AlertDialog onOpenChange={setShowDeleteAlert} open={showDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectionText}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setShowDeleteAlert(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Inline configuration for built-in primitives
function PrimitiveConfig({
  nodeId,
  subtype,
  config,
  onUpdate,
}: {
  nodeId: string;
  subtype: string;
  config: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}) {
  switch (subtype) {
    case "if":
    case "switch":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Condition expression (JSONata)</Label>
          <TemplateBadgeInput
            nodeId={nodeId}
            onChange={(v) => onUpdate("condition", v)}
            placeholder='e.g. {{@nodeId:Label.score}} >= 8'
            value={String(config.condition ?? "")}
          />
          <p className="text-[10px] text-muted-foreground">
            First outgoing edge runs if true; second if false.
          </p>
        </div>
      );
    case "loop":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Iterate over (array reference)</Label>
          <TemplateBadgeInput
            nodeId={nodeId}
            onChange={(v) => onUpdate("items", v)}
            placeholder="{{@nodeId:Label.results}}"
            value={String(config.items ?? "")}
          />
        </div>
      );
    case "delay":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Wait for</Label>
          <Input
            className="h-8 text-xs"
            onChange={(e) => onUpdate("duration", e.target.value)}
            placeholder="30s, 5m, 1h"
            value={String(config.duration ?? "")}
          />
          <p className="text-[10px] text-muted-foreground">
            Uses workflow SDK sleep — durable across restarts.
          </p>
        </div>
      );
    case "merge":
      return (
        <p className="text-[11px] text-muted-foreground">
          Merge collects from all incoming edges into one object. No configuration.
        </p>
      );
    case "http":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Method</Label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              onChange={(e) => onUpdate("method", e.target.value)}
              value={String(config.method ?? "GET")}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <TemplateBadgeInput
              nodeId={nodeId}
              onChange={(v) => onUpdate("url", v)}
              placeholder="https://api.example.com/path"
              value={String(config.url ?? "")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Headers (JSON)</Label>
            <TemplateBadgeTextarea
              nodeId={nodeId}
              onChange={(v) => onUpdate("headers", v)}
              placeholder="{}"
              rows={2}
              value={String(config.headers ?? "")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body (JSON)</Label>
            <TemplateBadgeTextarea
              nodeId={nodeId}
              onChange={(v) => onUpdate("body", v)}
              placeholder="{}"
              rows={3}
              value={String(config.body ?? "")}
            />
          </div>
        </div>
      );
    case "transform":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">JSONata expression</Label>
          <TemplateBadgeTextarea
            nodeId={nodeId}
            onChange={(v) => onUpdate("expression", v)}
            placeholder="$.results.{ name: name, score: score * 2 }"
            rows={4}
            value={String(config.expression ?? "")}
          />
          <p className="text-[10px] text-muted-foreground">
            Operates on the merged input from incoming edges.
          </p>
        </div>
      );
    case "set-variable":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              className="h-8 text-xs"
              onChange={(e) => onUpdate("name", e.target.value)}
              placeholder="myVariable"
              value={String(config.name ?? "")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <TemplateBadgeInput
              nodeId={nodeId}
              onChange={(v) => onUpdate("value", v)}
              placeholder='"hello" or {{@nodeId:Label.field}}'
              value={String(config.value ?? "")}
            />
          </div>
        </div>
      );
    default:
      return (
        <p className="text-[11px] text-muted-foreground">
          No configuration available for &ldquo;{subtype}&rdquo;.
        </p>
      );
  }
}

export const PanelInner = () => {
  const [selectedNodeId] = useAtom(selectedNodeAtom);
  const [selectedEdgeId] = useAtom(selectedEdgeAtom);
  const [nodes] = useAtom(nodesAtom);
  const edges = useAtomValue(edgesAtom);
  const [isGenerating] = useAtom(isGeneratingAtom);
  const [currentWorkflowId] = useAtom(currentWorkflowIdAtom);
  const [currentWorkflowName, setCurrentWorkflowName] = useAtom(currentWorkflowNameAtom);
  const updateNodeData = useSetAtom(updateNodeDataAtom);
  const deleteNode = useSetAtom(deleteNodeAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const deleteSelectedItems = useSetAtom(deleteSelectedItemsAtom);
  const setShowClearDialog = useSetAtom(showClearDialogAtom);
  const setShowDeleteDialog = useSetAtom(showDeleteDialogAtom);
  const clearNodeStatuses = useSetAtom(clearNodeStatusesAtom);
  const [showDeleteNodeAlert, setShowDeleteNodeAlert] = useState(false);
  const [showDeleteEdgeAlert, setShowDeleteEdgeAlert] = useState(false);
  const [showDeleteRunsAlert, setShowDeleteRunsAlert] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useAtom(propertiesPanelActiveTabAtom);
  const refreshRunsRef = useRef<(() => Promise<void>) | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const selectedNodes = nodes.filter((node) => node.selected);

  // ALL node types use the new skill config panel.
  if (selectedNode) {
    return <SkillNodeConfig />;
  }

  const selectedEdges = edges.filter((edge) => edge.selected);
  const hasMultipleSelections = selectedNodes.length + selectedEdges.length > 1;

  const handleDeleteEdge = () => {
    if (selectedEdgeId) {
      deleteEdge(selectedEdgeId);
    }
  };

  const handleUpdateWorkspaceName = async (newName: string) => {
    setCurrentWorkflowName(newName);
    if (currentWorkflowId) {
      try {
        await api.workflow.update(currentWorkflowId, {
          name: newName,
          nodes,
          edges,
        });
      } catch (error) {
        console.error("Failed to update workflow name:", error);
        toast.error("Failed to update workspace name");
      }
    }
  };

  const handleRefreshRuns = async () => {
    setIsRefreshing(true);
    try {
      if (refreshRunsRef.current) await refreshRunsRef.current();
    } catch (error) {
      console.error("Failed to refresh runs:", error);
      toast.error("Failed to refresh runs");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (hasMultipleSelections) {
    return (
      <MultiSelectionPanel
        onDelete={deleteSelectedItems}
        selectedEdges={selectedEdges}
        selectedNodes={selectedNodes}
      />
    );
  }

  if (selectedEdge) {
    return (
      <>
        <div className="flex size-full flex-col">
          <div className="flex h-14 w-full shrink-0 items-center border-b bg-transparent px-4">
            <h2 className="font-semibold text-foreground">Properties</h2>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-2">
              <Label className="ml-1">Edge ID</Label>
              <Input disabled value={selectedEdge.id} />
            </div>
            <div className="space-y-2">
              <Label className="ml-1">Source</Label>
              <Input disabled value={selectedEdge.source} />
            </div>
            <div className="space-y-2">
              <Label className="ml-1">Target</Label>
              <Input disabled value={selectedEdge.target} />
            </div>
          </div>
          <div className="shrink-0 border-t p-4">
            <Button onClick={() => setShowDeleteEdgeAlert(true)} size="icon" variant="ghost">
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <AlertDialog onOpenChange={setShowDeleteEdgeAlert} open={showDeleteEdgeAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Edge</AlertDialogTitle>
              <AlertDialogDescription>Delete this connection?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteEdge}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // No-node state — show workspace properties + runs + code tabs
  if (!selectedNode) {
    return (
      <Tabs
        className="size-full"
        defaultValue="properties"
        onValueChange={setActiveTab}
        value={activeTab}
      >
        <TabsList className="h-14 w-full shrink-0 rounded-none border-b bg-transparent px-4 py-2.5">
          <TabsTrigger className="bg-transparent" value="properties">Properties</TabsTrigger>
          {/* Code tab removed — skill drafting tool */}
          {/* Runs tab removed — skill drafting tool */}
        </TabsList>
        <TabsContent className="flex flex-col overflow-hidden" value="properties">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-2">
              <Label className="ml-1">Workflow Name</Label>
              <Input
                onChange={(e) => handleUpdateWorkspaceName(e.target.value)}
                value={currentWorkflowName}
              />
            </div>
            <div className="space-y-2">
              <Label className="ml-1">Workflow ID</Label>
              <Input disabled value={currentWorkflowId || "Not saved"} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t p-4">
            <Button onClick={() => setShowClearDialog(true)} variant="ghost">
              <Eraser className="size-4" /> Clear
            </Button>
            <Button onClick={() => setShowDeleteDialog(true)} variant="ghost">
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </TabsContent>
        <TabsContent className="flex flex-col overflow-hidden" value="runs">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Runs tab removed — skill drafting tool */}
              <div className="p-4 text-center text-sm text-muted-foreground">
                Skill drafts are not executed — export as a skill bundle instead.
              </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t p-4">
            <Button
              disabled={isRefreshing}
              onClick={handleRefreshRuns}
              size="icon"
              variant="ghost"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              onClick={() => setShowDeleteRunsAlert(true)}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {/* Run management removed — skill drafting tool */}
        </TabsContent>
        <TabsContent className="flex flex-col overflow-hidden" value="code">
          <div className="p-4 text-center text-sm text-muted-foreground">
            Export your skill draft as a bundle to use with Claude Code.
          </div>
        </TabsContent>
      </Tabs>
    );
  }

  // No node selected — show empty skill config panel
  return <SkillNodeConfig />;
};

export const NodeConfigPanel = () => (
  <>
    <div className="md:hidden">
      <Drawer>
        <DrawerTrigger asChild>
          <Panel position="bottom-right">
            <Button className="h-8 w-8" size="icon" variant="ghost">
              <MenuIcon className="size-4" />
            </Button>
          </Panel>
        </DrawerTrigger>
        <DrawerContent>
          <PanelInner />
        </DrawerContent>
      </Drawer>
    </div>
    <div className="hidden size-full flex-col bg-background dark:bg-[#161616] md:flex">
      <PanelInner />
    </div>
  </>
);
