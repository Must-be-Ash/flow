import { NextResponse } from "next/server";
import { agentcash } from "@/lib/agentcash/cli";

/**
 * Probe an endpoint for pricing, auth, and schema without paying.
 * Uses `npx agentcash check <url>`.
 *
 * Also attempts to fetch /llm.txt and /agent.md from the origin.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
    }

    let origin: string;
    try {
      const parsed = new URL(url);
      origin = parsed.origin;
    } catch {
      origin = url.split("/").slice(0, 3).join("/");
    }

    // Call agentcash check
    // Response: { success, data: { url, results: [{ method, inputSchema, outputSchema, authMode, estimatedPrice, summary, ... }] } }
    let endpointInfo: Record<string, unknown> = {};
    try {
      const result = await agentcash(["check", url], { timeout: 15_000 });
      const raw = result.json as Record<string, unknown> | null;
      const data = (raw?.data || raw || {}) as Record<string, unknown>;
      const results = data.results as Array<Record<string, unknown>> | undefined;
      if (results && results.length > 0) {
        endpointInfo = results[0];
      }
    } catch (err) {
      console.error("[check] CLI error:", err);
    }

    // Fetch provider docs
    let instructions = "";
    const docFetches = await Promise.allSettled([
      fetch(`${origin}/llm.txt`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.text() : null),
      fetch(`${origin}/agent.md`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.text() : null),
      fetch(`${origin}/skill.md`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.text() : null),
    ]);

    for (const result of docFetches) {
      if (result.status === "fulfilled" && result.value) {
        instructions += result.value + "\n\n";
      }
    }

    return NextResponse.json({
      price: endpointInfo.estimatedPrice ?? endpointInfo.price ?? null,
      method: endpointInfo.method ?? null,
      summary: endpointInfo.summary ?? null,
      inputSchema: endpointInfo.inputSchema ?? null,
      outputSchema: endpointInfo.outputSchema ?? null,
      authMode: endpointInfo.authMode ?? null,
      protocols: endpointInfo.protocols ?? null,
      instructions: instructions.trim() || null,
    });
  } catch (error) {
    console.error("Check endpoint failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Check failed" },
      { status: 500 }
    );
  }
}
