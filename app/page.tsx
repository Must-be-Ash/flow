"use client";

import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { WorkflowNode } from "@/lib/workflow-store";

const Home = () => {
  const router = useRouter();
  const hasCreatedRef = useRef(false);

  // Immediately create a new skill draft with a Purpose node and redirect
  useEffect(() => {
    const createAndRedirect = async () => {
      if (hasCreatedRef.current) return;
      hasCreatedRef.current = true;

      const purposeNode: WorkflowNode = {
        id: nanoid(),
        type: "purpose",
        position: { x: 0, y: 0 },
        data: {
          label: "",
          type: "purpose",
          name: "",
          description: "",
          useCases: "",
        },
      };

      try {
        const newWorkflow = await api.workflow.create({
          name: "New Skill",
          description: "",
          nodes: [purposeNode],
          edges: [],
        });

        sessionStorage.setItem("animate-sidebar", "true");
        router.replace(`/workflows/${newWorkflow.id}`);
      } catch (error) {
        console.error("Failed to create skill draft:", error);
        toast.error("Failed to create skill draft");
        hasCreatedRef.current = false;
      }
    };

    createAndRedirect();
  }, [router]);

  return (
    <div className="pointer-events-auto flex h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Creating new skill...</p>
    </div>
  );
};

export default Home;
