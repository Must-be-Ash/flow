"use client";

import { useReactFlow } from "@xyflow/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  FlaskConical,
  GitBranch,
  Loader2,
  MessageSquare,
  Plus,
  Redo2,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import {
  addNodeAtom,
  canRedoAtom,
  canUndoAtom,
  clearWorkflowAtom,
  currentWorkflowIdAtom,
  currentWorkflowNameAtom,
  deleteEdgeAtom,
  deleteNodeAtom,
  edgesAtom,
  hasUnsavedChangesAtom,

  isGeneratingAtom,
  isSavingAtom,
  nodesAtom,
  propertiesPanelActiveTabAtom,
  redoAtom,
  selectedEdgeAtom,

  selectedNodeAtom,
  showClearDialogAtom,
  showDeleteDialogAtom,

  undoAtom,
  updateNodeDataAtom,
  type WorkflowEdge,
  type WorkflowNode,
} from "@/lib/workflow-store";
import {
  findActionById,
  flattenConfigFields,
  getIntegrationLabels,
} from "@/plugins";
import { Panel } from "../ai-elements/panel";
import { WorkflowIcon } from "../ui/workflow-icon";
import { WalletStatus } from "../wallet-status";
import { UserMenu } from "../workflows/user-menu";
import { PanelInner } from "./node-config-panel";

type WorkflowToolbarProps = {
  workflowId?: string;
};

// Helper functions to reduce complexity
function updateNodesStatus(
  nodes: WorkflowNode[],
  updateNodeData: (update: {
    id: string;
    data: { status?: "idle" | "running" | "success" | "error" };
  }) => void,
  status: "idle" | "running" | "success" | "error"
) {
  for (const node of nodes) {
    updateNodeData({ id: node.id, data: { status } });
  }
}

// Type for broken template reference info
type BrokenTemplateReferenceInfo = {
  nodeId: string;
  nodeLabel: string;
  brokenReferences: Array<{
    fieldKey: string;
    fieldLabel: string;
    referencedNodeId: string;
    displayText: string;
  }>;
};

// Extract template variables from a string and check if they reference existing nodes
function extractTemplateReferences(
  value: unknown
): Array<{ nodeId: string; displayText: string }> {
  if (typeof value !== "string") {
    return [];
  }

  const pattern = /\{\{@([^:]+):([^}]+)\}\}/g;
  const matches = value.matchAll(pattern);

  return Array.from(matches).map((match) => ({
    nodeId: match[1],
    displayText: match[2],
  }));
}

// Recursively extract all template references from a config object
function extractAllTemplateReferences(
  config: Record<string, unknown>,
  prefix = ""
): Array<{ field: string; nodeId: string; displayText: string }> {
  const results: Array<{ field: string; nodeId: string; displayText: string }> =
    [];

  for (const [key, value] of Object.entries(config)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "string") {
      const refs = extractTemplateReferences(value);
      for (const ref of refs) {
        results.push({ field: fieldPath, ...ref });
      }
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      results.push(
        ...extractAllTemplateReferences(
          value as Record<string, unknown>,
          fieldPath
        )
      );
    }
  }

  return results;
}

// Get broken template references for workflow nodes
function getBrokenTemplateReferences(
  nodes: WorkflowNode[]
): BrokenTemplateReferenceInfo[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const brokenByNode: BrokenTemplateReferenceInfo[] = [];

  for (const node of nodes) {
    // Skip disabled nodes
    if (node.data.enabled === false) {
      continue;
    }

    const config = node.data.config as Record<string, unknown> | undefined;
    if (!config || typeof config !== "object") {
      continue;
    }

    const allRefs = extractAllTemplateReferences(config);
    const brokenRefs = allRefs.filter((ref) => !nodeIds.has(ref.nodeId));

    if (brokenRefs.length > 0) {
      // Get action for label lookups
      const actionType = config.actionType as string | undefined;
      const action = actionType ? findActionById(actionType) : undefined;
      const flatFields = action ? flattenConfigFields(action.configFields) : [];

      brokenByNode.push({
        nodeId: node.id,
        nodeLabel: node.data.label || action?.label || "Unnamed Step",
        brokenReferences: brokenRefs.map((ref) => {
          // Look up human-readable field label
          const configField = flatFields.find((f) => f.key === ref.field);
          return {
            fieldKey: ref.field,
            fieldLabel: configField?.label || ref.field,
            referencedNodeId: ref.nodeId,
            displayText: ref.displayText,
          };
        }),
      });
    }
  }

  return brokenByNode;
}

// Type for missing required fields info
type MissingRequiredFieldInfo = {
  nodeId: string;
  nodeLabel: string;
  missingFields: Array<{
    fieldKey: string;
    fieldLabel: string;
  }>;
};

// Check if a field value is effectively empty
function isFieldEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  return false;
}

// Check if a conditional field should be shown based on current config
function shouldShowField(
  field: { showWhen?: { field: string; equals: string } },
  config: Record<string, unknown>
): boolean {
  if (!field.showWhen) {
    return true;
  }
  return config[field.showWhen.field] === field.showWhen.equals;
}

// Get missing required fields for a single node
function getNodeMissingFields(
  node: WorkflowNode
): MissingRequiredFieldInfo | null {
  if (node.data.enabled === false) {
    return null;
  }

  const config = node.data.config as Record<string, unknown> | undefined;
  const actionType = config?.actionType as string | undefined;
  if (!actionType) {
    return null;
  }

  const action = findActionById(actionType);
  if (!action) {
    return null;
  }

  // Flatten grouped fields to check all required fields
  const flatFields = flattenConfigFields(action.configFields);

  const missingFields = flatFields
    .filter(
      (field) =>
        field.required &&
        shouldShowField(field, config || {}) &&
        isFieldEmpty(config?.[field.key])
    )
    .map((field) => ({
      fieldKey: field.key,
      fieldLabel: field.label,
    }));

  if (missingFields.length === 0) {
    return null;
  }

  return {
    nodeId: node.id,
    nodeLabel: node.data.label || action.label || "Unnamed Step",
    missingFields,
  };
}

// Get missing required fields for workflow nodes
function getMissingRequiredFields(
  nodes: WorkflowNode[]
): MissingRequiredFieldInfo[] {
  return nodes
    .map(getNodeMissingFields)
    .filter((result): result is MissingRequiredFieldInfo => result !== null);
}

// Hook for workflow handlers
type WorkflowHandlerParams = {
  currentWorkflowId: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  updateNodeData: (update: {
    id: string;
    data: { status?: "idle" | "running" | "success" | "error" };
  }) => void;
  isExecuting: boolean;
  setIsExecuting: (value: boolean) => void;
  setIsSaving: (value: boolean) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  setActiveTab: (value: string) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedExecutionId: (id: string | null) => void;
};

function useWorkflowHandlers({
  currentWorkflowId,
  nodes,
  edges,
  updateNodeData,
  isExecuting,
  setIsExecuting,
  setIsSaving,
  setHasUnsavedChanges,
  setActiveTab,
  setNodes,
  setEdges,
  setSelectedNodeId,
  setSelectedExecutionId,
}: WorkflowHandlerParams) {
  const [showUnsavedRunDialog, setShowUnsavedRunDialog] = useState(false);
  const [showWorkflowIssuesDialog, setShowWorkflowIssuesDialog] =
    useState(false);
  const [workflowIssues, setWorkflowIssues] = useState<{
    brokenReferences: BrokenTemplateReferenceInfo[];
    missingRequiredFields: MissingRequiredFieldInfo[];
  }>({
    brokenReferences: [],
    missingRequiredFields: [],
  });
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount
  useEffect(
    () => () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    },
    []
  );

  const handleSave = async () => {
    if (!currentWorkflowId) {
      return;
    }

    setIsSaving(true);
    try {
      await api.workflow.update(currentWorkflowId, { nodes, edges });
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to save workflow:", error);
      toast.error("Failed to save workflow. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Execution removed — skill drafting tool
  const executeWorkflow = async () => {};

  const handleExecute = async () => {
    // Guard against concurrent executions
    if (isExecuting) {
      return;
    }

    // Collect all workflow issues at once
    const brokenRefs = getBrokenTemplateReferences(nodes);
    const missingFields = getMissingRequiredFields(nodes);

    // If there are any issues, show the combined dialog
    if (brokenRefs.length > 0 || missingFields.length > 0) {
      setWorkflowIssues({
        brokenReferences: brokenRefs,
        missingRequiredFields: missingFields,
      });
      setShowWorkflowIssuesDialog(true);
      return;
    }

    await executeWorkflow();
  };

  const handleExecuteAnyway = async () => {
    // Guard against concurrent executions
    if (isExecuting) {
      return;
    }

    setShowWorkflowIssuesDialog(false);
    await executeWorkflow();
  };

  return {
    showUnsavedRunDialog,
    setShowUnsavedRunDialog,
    showWorkflowIssuesDialog,
    setShowWorkflowIssuesDialog,
    workflowIssues,
    handleSave,
    handleExecute,
    handleExecuteAnyway,
  };
}

// Hook for workflow state management
function useWorkflowState() {
  const [nodes, setNodes] = useAtom(nodesAtom);
  const [edges, setEdges] = useAtom(edgesAtom);
  const [isGenerating] = useAtom(isGeneratingAtom);
  const clearWorkflow = useSetAtom(clearWorkflowAtom);
  const updateNodeData = useSetAtom(updateNodeDataAtom);
  const [currentWorkflowId] = useAtom(currentWorkflowIdAtom);
  const [workflowName, setCurrentWorkflowName] = useAtom(
    currentWorkflowNameAtom
  );
  const router = useRouter();
  const [showClearDialog, setShowClearDialog] = useAtom(showClearDialogAtom);
  const [showDeleteDialog, setShowDeleteDialog] = useAtom(showDeleteDialogAtom);
  const [isSaving, setIsSaving] = useAtom(isSavingAtom);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useAtom(
    hasUnsavedChangesAtom
  );
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const addNode = useSetAtom(addNodeAtom);
  const [canUndo] = useAtom(canUndoAtom);
  const [canRedo] = useAtom(canRedoAtom);
  const setActiveTab = useSetAtom(propertiesPanelActiveTabAtom);
  const setSelectedNodeId = useSetAtom(selectedNodeAtom);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [generatedCode, _setGeneratedCode] = useState<string>("");
  const [allWorkflows, setAllWorkflows] = useState<
    Array<{
      id: string;
      name: string;
      updatedAt: string;
    }>
  >([]);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState(workflowName);

  // Sync newWorkflowName when workflowName changes
  useEffect(() => {
    setNewWorkflowName(workflowName);
  }, [workflowName]);

  // Load all workflows on mount
  useEffect(() => {
    const loadAllWorkflows = async () => {
      try {
        const workflows = await api.workflow.getAll();
        setAllWorkflows(workflows);
      } catch (error) {
        console.error("Failed to load workflows:", error);
      }
    };
    loadAllWorkflows();
  }, []);

  return {
    nodes,
    edges,
    isExecuting: false,
    setIsExecuting: (_v: boolean) => {},
    isGenerating,
    clearWorkflow,
    updateNodeData,
    currentWorkflowId,
    workflowName,
    setCurrentWorkflowName,
    router,
    showClearDialog,
    setShowClearDialog,
    showDeleteDialog,
    setShowDeleteDialog,
    isSaving,
    setIsSaving,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    undo,
    redo,
    addNode,
    canUndo,
    canRedo,
    isDownloading,
    setIsDownloading,
    showCodeDialog,
    setShowCodeDialog,
    showExportDialog,
    setShowExportDialog,
    generatedCode,
    allWorkflows,
    setAllWorkflows,
    showRenameDialog,
    setShowRenameDialog,
    newWorkflowName,
    setNewWorkflowName,
    setActiveTab,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedExecutionId: (_v: string | null) => {},
    triggerExecute: false,
    setTriggerExecute: (_v: boolean) => {},
  };
}

// Hook for workflow actions
function useWorkflowActions(state: ReturnType<typeof useWorkflowState>) {
  const {
    currentWorkflowId,
    workflowName,
    nodes,
    edges,
    updateNodeData,
    isExecuting,
    setIsExecuting,
    setIsSaving,
    setHasUnsavedChanges,
    setShowClearDialog,
    clearWorkflow,
    setShowDeleteDialog,
    setCurrentWorkflowName,
    setAllWorkflows,
    newWorkflowName,
    setShowRenameDialog,
    setIsDownloading,
    generatedCode,
    setActiveTab,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedExecutionId,

    triggerExecute,
    setTriggerExecute,
  } = state;

  const {
    showUnsavedRunDialog,
    setShowUnsavedRunDialog,
    showWorkflowIssuesDialog,
    setShowWorkflowIssuesDialog,
    workflowIssues,
    handleSave,
    handleExecute,
    handleExecuteAnyway,
  } = useWorkflowHandlers({
    currentWorkflowId,
    nodes,
    edges,
    updateNodeData,
    isExecuting,
    setIsExecuting,
    setIsSaving,
    setHasUnsavedChanges,
    setActiveTab,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedExecutionId,

  });

  // Listen for execute trigger from keyboard shortcut
  useEffect(() => {
    if (triggerExecute) {
      setTriggerExecute(false);
      handleExecute();
    }
  }, [triggerExecute, setTriggerExecute, handleExecute]);

  const handleSaveAndRun = async () => {
    await handleSave();
    setShowUnsavedRunDialog(false);
    await handleExecute();
  };

  const handleRunWithoutSaving = async () => {
    setShowUnsavedRunDialog(false);
    await handleExecute();
  };

  const handleClearWorkflow = () => {
    clearWorkflow();
    setShowClearDialog(false);
  };

  const handleDeleteWorkflow = async () => {
    if (!currentWorkflowId) {
      return;
    }

    try {
      await api.workflow.delete(currentWorkflowId);
      setShowDeleteDialog(false);
      toast.success("Workflow deleted successfully");

      const next = state.allWorkflows.find(
        (w) => w.id !== currentWorkflowId && w.name !== "__current__"
      );
      window.location.href = next ? `/workflows/${next.id}` : "/";
    } catch (error) {
      console.error("Failed to delete workflow:", error);
      toast.error("Failed to delete workflow. Please try again.");
    }
  };

  const handleRenameWorkflow = async () => {
    if (!(currentWorkflowId && (newWorkflowName || "").trim())) {
      return;
    }

    try {
      await api.workflow.update(currentWorkflowId, {
        name: newWorkflowName,
      });
      setShowRenameDialog(false);
      setCurrentWorkflowName(newWorkflowName);
      toast.success("Workflow renamed successfully");
      const workflows = await api.workflow.getAll();
      setAllWorkflows(workflows);
    } catch (error) {
      console.error("Failed to rename workflow:", error);
      toast.error("Failed to rename workflow. Please try again.");
    }
  };

  const handleDownload = async () => {
    if (!currentWorkflowId) {
      toast.error("Please save the skill draft first");
      return;
    }

    setIsDownloading(true);
    toast.info("Exporting skill bundle...");

    try {
      const response = await fetch(`/api/workflows/${currentWorkflowId}/export`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workflowName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-skill.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Workflow downloaded successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download workflow"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDuplicateWorkflow = async () => {
    if (!currentWorkflowId) return;
    try {
      const workflow = await api.workflow.getById(currentWorkflowId);
      const copy = await api.workflow.create({
        name: `${workflowName} (copy)`,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
      });
      toast.success("Workflow duplicated");
      window.location.href = `/workflows/${copy.id}`;
    } catch (error) {
      console.error("Failed to duplicate workflow:", error);
      toast.error("Failed to duplicate workflow");
    }
  };

  const loadWorkflows = async () => {
    try {
      const workflows = await api.workflow.getAll();
      setAllWorkflows(workflows);
    } catch (error) {
      console.error("Failed to load workflows:", error);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    toast.success("Code copied to clipboard");
  };

  return {
    showUnsavedRunDialog,
    setShowUnsavedRunDialog,
    showWorkflowIssuesDialog,
    setShowWorkflowIssuesDialog,
    workflowIssues,
    handleSave,
    handleExecute,
    handleExecuteAnyway,
    handleSaveAndRun,
    handleRunWithoutSaving,
    handleClearWorkflow,
    handleDeleteWorkflow,
    handleDuplicateWorkflow,
    handleRenameWorkflow,
    handleDownload,
    loadWorkflows,
    handleCopyCode,
  };
}

// Toolbar Actions Component - handles add step, undo/redo, save, and run buttons
function ToolbarActions({
  workflowId,
  state,
  actions,
}: {
  workflowId?: string;
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  const [showPropertiesSheet, setShowPropertiesSheet] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [selectedNodeId] = useAtom(selectedNodeAtom);
  const [selectedEdgeId] = useAtom(selectedEdgeAtom);
  const [nodes] = useAtom(nodesAtom);
  const [edges] = useAtom(edgesAtom);
  const deleteNode = useSetAtom(deleteNodeAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const { screenToFlowPosition } = useReactFlow();

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const hasSelection = selectedNode || selectedEdge;

  if (!workflowId) {
    return null;
  }

  const handleDelete = () => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId);
    } else if (selectedEdgeId) {
      deleteEdge(selectedEdgeId);
    }
    setShowDeleteAlert(false);
  };

  const addNodeOfType = (type: string, label: string, extraData?: Record<string, unknown>) => {
    const flowWrapper = document.querySelector(".react-flow");
    if (!flowWrapper) return;

    const rect = flowWrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const position = screenToFlowPosition({ x: centerX, y: centerY });
    position.x -= 112; // half of ~224px node width
    position.y -= 40;

    // Avoid overlap
    const finalPosition = { ...position };
    let attempts = 0;
    while (attempts < 20 && state.nodes.some((n) => Math.abs(n.position.x - finalPosition.x) < 20 && Math.abs(n.position.y - finalPosition.y) < 20)) {
      finalPosition.x += 20;
      finalPosition.y += 20;
      attempts++;
    }

    const newNode: WorkflowNode = {
      id: nanoid(),
      type,
      position: finalPosition,
      data: { label, type: type as WorkflowNode["data"]["type"], ...extraData },
    };

    state.addNode(newNode);
    state.setSelectedNodeId(newNode.id);
    state.setActiveTab("properties");
  };

  return (
    <>
      {/* Add Node - Mobile */}
      <div className="flex lg:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="border hover:bg-black/5 dark:hover:bg-white/5" size="icon" variant="secondary">
              <Plus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => addNodeOfType("service", "", {})}>
              <Zap className="size-4 text-green-500" /> <span>Service</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Paid API</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("instruction", "New instruction", { instruction: "" })}>
              <FileText className="size-4 text-gray-500" /> <span>Instruction</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("decision", "New decision", { question: "", options: [] })}>
              <GitBranch className="size-4 text-amber-500" /> <span>Decision</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("input", "New input", { prompt: "", required: true })}>
              <MessageSquare className="size-4 text-purple-500" /> <span>User Input</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("output", "New output", { format: "" })}>
              <CheckCircle2 className="size-4 text-teal-500" /> <span>Output</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => addNodeOfType("purpose", "", { name: "", useCases: "" })}>
              <Sparkles className="size-4 text-blue-500" /> <span>Purpose</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Start</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Properties - Mobile Vertical (always visible) */}
      <ButtonGroup className="flex lg:hidden" orientation="vertical">
        <Button
          className="border hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => setShowPropertiesSheet(true)}
          size="icon"
          title="Properties"
          variant="secondary"
        >
          <Settings2 className="size-4" />
        </Button>
        {/* Delete - Show when node or edge is selected */}
        {hasSelection && (
          <Button
            className="border hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => setShowDeleteAlert(true)}
            size="icon"
            title="Delete"
            variant="secondary"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </ButtonGroup>

      {/* Properties Sheet - Mobile Only */}
      <Sheet onOpenChange={setShowPropertiesSheet} open={showPropertiesSheet}>
        <SheetContent className="w-full p-0 sm:max-w-full" side="bottom">
          <div className="h-[80vh]">
            <PanelInner />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Alert - Mobile Only */}
      <AlertDialog onOpenChange={setShowDeleteAlert} open={showDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedNode ? "Node" : "Connection"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this{" "}
              {selectedNode ? "node" : "connection"}? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Node - Desktop */}
      <div className="hidden lg:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="border hover:bg-black/5 dark:hover:bg-white/5" size="icon" variant="secondary" title="Add node">
              <Plus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => addNodeOfType("service", "", {})}>
              <Zap className="size-4 text-green-500" /> <span>Service</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Paid API</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("instruction", "New instruction", { instruction: "" })}>
              <FileText className="size-4 text-gray-500" /> <span>Instruction</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("decision", "New decision", { question: "", options: [] })}>
              <GitBranch className="size-4 text-amber-500" /> <span>Decision</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("input", "New input", { prompt: "", required: true })}>
              <MessageSquare className="size-4 text-purple-500" /> <span>User Input</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNodeOfType("output", "New output", { format: "" })}>
              <CheckCircle2 className="size-4 text-teal-500" /> <span>Output</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => addNodeOfType("purpose", "", { name: "", useCases: "" })}>
              <Sparkles className="size-4 text-blue-500" /> <span>Purpose</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Start</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Undo/Redo - Mobile Vertical */}
      <ButtonGroup className="flex lg:hidden" orientation="vertical">
        <Button
          className="border hover:bg-black/5 disabled:opacity-100 dark:hover:bg-white/5 disabled:[&>svg]:text-muted-foreground"
          disabled={!state.canUndo || state.isGenerating}
          onClick={() => state.undo()}
          size="icon"
          title="Undo"
          variant="secondary"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          className="border hover:bg-black/5 disabled:opacity-100 dark:hover:bg-white/5 disabled:[&>svg]:text-muted-foreground"
          disabled={!state.canRedo || state.isGenerating}
          onClick={() => state.redo()}
          size="icon"
          title="Redo"
          variant="secondary"
        >
          <Redo2 className="size-4" />
        </Button>
      </ButtonGroup>

      {/* Undo/Redo - Desktop Horizontal */}
      <ButtonGroup className="hidden lg:flex" orientation="horizontal">
        <Button
          className="border hover:bg-black/5 disabled:opacity-100 dark:hover:bg-white/5 disabled:[&>svg]:text-muted-foreground"
          disabled={!state.canUndo || state.isGenerating}
          onClick={() => state.undo()}
          size="icon"
          title="Undo"
          variant="secondary"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          className="border hover:bg-black/5 disabled:opacity-100 dark:hover:bg-white/5 disabled:[&>svg]:text-muted-foreground"
          disabled={!state.canRedo || state.isGenerating}
          onClick={() => state.redo()}
          size="icon"
          title="Redo"
          variant="secondary"
        >
          <Redo2 className="size-4" />
        </Button>
      </ButtonGroup>

      {/* Save + Duplicate - Mobile Vertical */}
      <ButtonGroup className="flex lg:hidden" orientation="vertical">
        <SaveButton handleSave={actions.handleSave} state={state} />
        <DuplicateButton handleDuplicate={actions.handleDuplicateWorkflow} state={state} />
      </ButtonGroup>

      {/* Save + Duplicate - Desktop Horizontal */}
      <ButtonGroup className="hidden lg:flex" orientation="horizontal">
        <SaveButton handleSave={actions.handleSave} state={state} />
        <DuplicateButton handleDuplicate={actions.handleDuplicateWorkflow} state={state} />
      </ButtonGroup>

      {/* Create Skill — single export action */}
      <CreateSkillButton state={state} />
    </>
  );
}

// Save Button Component
function SaveButton({
  state,
  handleSave,
}: {
  state: ReturnType<typeof useWorkflowState>;
  handleSave: () => Promise<void>;
}) {
  return (
    <Button
      className="relative border hover:bg-black/5 disabled:opacity-100 dark:hover:bg-white/5 disabled:[&>svg]:text-muted-foreground"
      disabled={
        !state.currentWorkflowId || state.isGenerating || state.isSaving
      }
      onClick={handleSave}
      size="icon"
      title={state.isSaving ? "Saving..." : "Save workflow"}
      variant="secondary"
    >
      {state.isSaving ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Save className="size-4" />
      )}
      {state.hasUnsavedChanges && !state.isSaving && (
        <div className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
      )}
    </Button>
  );
}

// Duplicate Button Component
function DuplicateButton({
  state,
  handleDuplicate,
}: {
  state: ReturnType<typeof useWorkflowState>;
  handleDuplicate: () => Promise<void>;
}) {
  return (
    <Button
      className="border hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
      disabled={!state.currentWorkflowId || state.isGenerating}
      onClick={handleDuplicate}
      size="icon"
      title="Duplicate workflow"
      variant="secondary"
    >
      <Copy className="size-4" />
    </Button>
  );
}

// Download Button Component
// Single "Create Skill" button — queues the brain to produce the full skill package
function CreateSkillButton({ state }: { state: ReturnType<typeof useWorkflowState> }) {
  const [queued, setQueued] = useState(false);

  const handleCreateSkill = async () => {
    if (!state.currentWorkflowId || state.nodes.length === 0) return;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "create_skill",
          workflowId: state.currentWorkflowId,
        }),
      });
      if (res.ok) {
        setQueued(true);
        toast.success("Claude is creating your skill — check the chat bar for progress");
        setTimeout(() => setQueued(false), 5000);
      }
    } catch {
      toast.error("Failed to queue skill creation");
    }
  };

  return (
    <Button
      className="gap-1.5 border bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-xs font-medium px-3"
      disabled={state.nodes.length === 0 || state.isGenerating || queued}
      onClick={handleCreateSkill}
      size="sm"
      title="Ask Claude to create the complete skill package from this draft"
      variant="default"
    >
      {queued ? (
        <><Loader2 className="size-3.5 animate-spin" />Queued...</>
      ) : (
        <><Download className="size-3.5" />Create Skill</>
      )}
    </Button>
  );
}

// Workflow Menu Component
function WorkflowMenuComponent({
  workflowId,
  state,
  actions,
}: {
  workflowId?: string;
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  return (
    <div className="flex h-9 items-center overflow-hidden rounded-md border bg-secondary text-secondary-foreground">
      <DropdownMenu onOpenChange={(open) => open && actions.loadWorkflows()}>
        <DropdownMenuTrigger className="flex h-full cursor-pointer items-center gap-2 px-3 font-medium text-sm transition-all hover:bg-black/5 dark:hover:bg-white/5">
          <WorkflowIcon className="size-4" />
          <p className="font-medium text-sm">
            {workflowId ? (
              state.workflowName
            ) : (
              <>
                <span className="sm:hidden">New</span>
                <span className="hidden sm:inline">New Workflow</span>
              </>
            )}
          </p>
          <ChevronDown className="size-3 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
          <a
            href="/"
            className="relative flex cursor-default select-none items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span>New Workflow</span>
            {!workflowId && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
          </a>
          <DropdownMenuSeparator />
          {state.allWorkflows.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No workflows found</div>
          ) : (
            state.allWorkflows
              .filter((w) => w.name !== "__current__")
              .map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => state.router.push(`/workflows/${workflow.id}`)}
                  className="relative flex w-full cursor-default select-none items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="truncate">{workflow.name}</span>
                  {workflow.id === state.currentWorkflowId && (
                    <Check className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Combined Workflow Issues Dialog Component
function WorkflowIssuesDialog({
  state,
  actions,
}: {
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  const { brokenReferences, missingRequiredFields } =
    actions.workflowIssues;

  const handleGoToStep = (nodeId: string) => {
    actions.setShowWorkflowIssuesDialog(false);
    state.setSelectedNodeId(nodeId);
    state.setActiveTab("properties");
  };

  const totalIssues =
    brokenReferences.length +
    missingRequiredFields.length;

  return (
    <>
      <AlertDialog
        onOpenChange={actions.setShowWorkflowIssuesDialog}
        open={actions.showWorkflowIssuesDialog}
      >
        <AlertDialogContent className="flex max-h-[80vh] max-w-lg flex-col overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              Workflow Issues ({totalIssues})
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-muted-foreground text-sm">
                This workflow has issues that may cause it to fail.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto py-2">
            {/* Broken References Section */}
            {brokenReferences.length > 0 && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 font-medium text-red-600 text-sm dark:text-red-400">
                  <AlertTriangle className="size-4" />
                  Broken References ({brokenReferences.length})
                </h4>
                <div className="space-y-2">
                  {brokenReferences.map((broken) => (
                    <div
                      className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3"
                      key={broken.nodeId}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground text-sm">
                          {broken.nodeLabel}
                        </p>
                        <div className="mt-1 space-y-1">
                          {broken.brokenReferences.map((ref, idx) => (
                            <p
                              className="text-muted-foreground text-xs"
                              key={`${ref.fieldKey}-${idx}`}
                            >
                              <span className="font-mono text-red-600 dark:text-red-400">
                                {ref.displayText}
                              </span>{" "}
                              in {ref.fieldLabel}
                            </p>
                          ))}
                        </div>
                      </div>
                      <Button
                        className="shrink-0"
                        onClick={() => handleGoToStep(broken.nodeId)}
                        size="sm"
                        variant="outline"
                      >
                        Fix
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Required Fields Section */}
            {missingRequiredFields.length > 0 && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 font-medium text-orange-600 text-sm dark:text-orange-400">
                  <AlertTriangle className="size-4" />
                  Missing Required Fields ({missingRequiredFields.length})
                </h4>
                <div className="space-y-2">
                  {missingRequiredFields.map((node) => (
                    <div
                      className="flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3"
                      key={node.nodeId}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground text-sm">
                          {node.nodeLabel}
                        </p>
                        <div className="mt-1 space-y-1">
                          {node.missingFields.map((field) => (
                            <p
                              className="text-muted-foreground text-xs"
                              key={field.fieldKey}
                            >
                              Missing:{" "}
                              <span className="font-medium text-orange-600 dark:text-orange-400">
                                {field.fieldLabel}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>
                      <Button
                        className="shrink-0"
                        onClick={() => handleGoToStep(node.nodeId)}
                        size="sm"
                        variant="outline"
                      >
                        Fix
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={actions.handleExecuteAnyway} variant="outline">
              Run Anyway
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}

// Workflow Dialogs Component
function WorkflowDialogsComponent({
  state,
  actions,
}: {
  state: ReturnType<typeof useWorkflowState>;
  actions: ReturnType<typeof useWorkflowActions>;
}) {
  return (
    <>
      <Dialog
        onOpenChange={state.setShowClearDialog}
        open={state.showClearDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all nodes and connections? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => state.setShowClearDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={actions.handleClearWorkflow} variant="destructive">
              Clear Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={state.setShowRenameDialog}
        open={state.showRenameDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Workflow</DialogTitle>
            <DialogDescription>
              Enter a new name for your workflow.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              actions.handleRenameWorkflow();
            }}
          >
            <div className="space-y-2 py-4">
              <Label className="ml-1" htmlFor="workflow-name">
                Workflow Name
              </Label>
              <Input
                id="workflow-name"
                onChange={(e) => state.setNewWorkflowName(e.target.value)}
                placeholder="Enter workflow name"
                value={state.newWorkflowName || ""}
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => state.setShowRenameDialog(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={!(state.newWorkflowName || "").trim()} type="submit">
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={state.setShowDeleteDialog}
        open={state.showDeleteDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{state.workflowName}
              &rdquo;? This will permanently delete the workflow. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => state.setShowDeleteDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={actions.handleDeleteWorkflow}
              variant="destructive"
            >
              Delete Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={state.setShowCodeDialog}
        open={state.showCodeDialog}
      >
        <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Generated Skill Bundle</DialogTitle>
            <DialogDescription>
              This is the generated skill bundle for your workflow. Copy it or
              download the ZIP to install in Claude Code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <pre className="overflow-auto rounded-lg bg-muted p-4 text-sm">
              <code>{state.generatedCode}</code>
            </pre>
          </div>
          <DialogFooter>
            <Button
              onClick={() => state.setShowCodeDialog(false)}
              variant="outline"
            >
              Close
            </Button>
            <Button onClick={actions.handleCopyCode}>Copy to Clipboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={actions.setShowUnsavedRunDialog}
        open={actions.showUnsavedRunDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Would you like to save before running
              the workflow?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={actions.handleRunWithoutSaving} variant="outline">
              Run Without Saving
            </Button>
            <Button onClick={actions.handleSaveAndRun}>Save and Run</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WorkflowIssuesDialog actions={actions} state={state} />
    </>
  );
}

export const WorkflowToolbar = ({ workflowId }: WorkflowToolbarProps) => {
  const state = useWorkflowState();
  const actions = useWorkflowActions(state);

  return (
    <>
      <Panel
        className="flex flex-col gap-2 rounded-none border-none bg-transparent p-0 lg:flex-row lg:items-center"
        position="top-left"
      >
        <WorkflowMenuComponent
          actions={actions}
          state={state}
          workflowId={workflowId}
        />
      </Panel>

      <div className="pointer-events-auto absolute top-4 right-4 z-10">
        <div className="flex flex-col-reverse items-end gap-2 lg:flex-row lg:items-center">
          <ToolbarActions
            actions={actions}
            state={state}
            workflowId={workflowId}
          />
          <div className="flex items-center gap-2">
            <WalletStatus />
            <UserMenu />
          </div>
        </div>
      </div>

      <WorkflowDialogsComponent actions={actions} state={state} />
    </>
  );
};
