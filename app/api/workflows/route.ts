import { NextResponse } from "next/server";
import { listWorkflows, createWorkflow } from "@/lib/store";

export async function GET() {
  try {
    const workflows = await listWorkflows();
    return NextResponse.json(workflows);
  } catch (error) {
    console.error("Failed to list workflows:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list workflows" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workflow = await createWorkflow({
      name: body.name,
      description: body.description,
      nodes: body.nodes,
      edges: body.edges,
    });
    return NextResponse.json(workflow);
  } catch (error) {
    console.error("Failed to create workflow:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create workflow" },
      { status: 500 }
    );
  }
}
