import { NextResponse } from "next/server";
import { getWorkflow } from "@/lib/store";
import { generateSkillBundle } from "@/lib/exports/skill-bundle";

/**
 * Export a skill draft as a skill bundle (.zip).
 *
 * POST /api/workflows/[id]/export
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const workflow = await getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const zip = await generateSkillBundle(workflow);
    const buffer = await zip.generateAsync({ type: "uint8array" });

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${workflow.slug}-skill.zip"`,
      },
    });
  } catch (error) {
    console.error("Export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
