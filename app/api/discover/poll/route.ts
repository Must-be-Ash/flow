import { NextResponse } from "next/server";

/**
 * Poll a job status URL using a plain HTTP GET — no payment.
 * Status endpoints should always be free; never use agentcash fetch for polling.
 *
 * POST /api/discover/poll
 * Body: { url: string }
 */
export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    // 402 on a status URL = wrong URL (this endpoint requires payment = not a status endpoint)
    if (res.status === 402) {
      return NextResponse.json({ wrongUrl: true, status: 402 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}`, status: res.status });
    }

    const data = await res.json().catch(() => null);
    return NextResponse.json({ success: true, data, httpStatus: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Poll failed" },
      { status: 500 }
    );
  }
}
