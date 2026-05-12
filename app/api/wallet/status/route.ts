import { NextResponse } from "next/server";
import { getStatus } from "@/lib/agentcash/wallet";

export async function GET() {
  try {
    const status = await getStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        error: error instanceof Error ? error.message : "Failed to get wallet status",
      },
      { status: 500 }
    );
  }
}
