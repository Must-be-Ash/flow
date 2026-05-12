import { NextResponse } from "next/server";
import { discoverEndpoints } from "@/lib/agentcash/client";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.searchParams.get("origin");
    const refresh = url.searchParams.get("refresh") === "1";

    if (!origin) {
      return NextResponse.json(
        { error: "Missing ?origin= parameter" },
        { status: 400 }
      );
    }

    const endpoints = await discoverEndpoints(origin, { refresh });
    return NextResponse.json(endpoints);
  } catch (error) {
    console.error("Discover endpoints failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discovery failed" },
      { status: 500 }
    );
  }
}
