import { NextResponse } from "next/server";
import { agentcash, AgentCashCliError } from "@/lib/agentcash/cli";

/**
 * Actually call an x402/MPP endpoint (paid) and return the result.
 * Uses `npx agentcash fetch <url>`.
 *
 * Auto-detects the payment protocol (x402 or MPP) based on what the endpoint
 * accepts and what the wallet has funds for. Falls back to MPP/Tempo if x402 fails.
 *
 * POST /api/discover/try
 * Body: { url: string, method?: string, body?: object }
 */
export async function POST(request: Request) {
  try {
    const { url, method, body } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const buildArgs = (extraFlags: string[] = []) => {
      const args = ["fetch", url];
      if (method) args.push("--method", method);
      if (body && Object.keys(body).length > 0) {
        args.push("--body", JSON.stringify(body));
      }
      args.push(...extraFlags);
      return args;
    };

    const parseResult = (stdout: string) => {
      const raw = (() => {
        try {
          const firstBrace = stdout.indexOf("{");
          const firstBracket = stdout.indexOf("[");
          let start = -1;
          if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket);
          else if (firstBrace >= 0) start = firstBrace;
          else if (firstBracket >= 0) start = firstBracket;
          return start >= 0 ? JSON.parse(stdout.substring(start)) : null;
        } catch { return null; }
      })() as Record<string, unknown> | null;
      return raw?.data || raw;
    };

    // 1. Try auto-detection (agentcash picks the best protocol/network)
    try {
      const result = await agentcash(buildArgs(), { timeout: 600_000 });
      return NextResponse.json({ success: true, data: parseResult(result.stdout), raw: result.stdout });
    } catch (firstError) {
      if (!(firstError instanceof AgentCashCliError) || firstError.exitCode !== 3) {
        throw firstError; // Not a payment issue — re-throw
      }
      // Exit code 3 = payment failed on auto-selected protocol/network.
      // Fall through to retry with explicit MPP on Tempo.
    }

    // 2. Retry explicitly with MPP protocol on Tempo network
    //    (covers the case where x402 on Base/Solana failed but user has Tempo balance)
    try {
      const result = await agentcash(
        buildArgs(["--payment-protocol", "mpp", "--payment-network", "tempo"]),
        { timeout: 600_000 }
      );
      return NextResponse.json({
        success: true,
        data: parseResult(result.stdout),
        raw: result.stdout,
        note: "Paid via MPP on Tempo network",
      });
    } catch (secondError) {
      if (!(secondError instanceof AgentCashCliError) || secondError.exitCode !== 3) {
        throw secondError;
      }
      // Both attempts failed
    }

    // Both failed — return a clear message
    return NextResponse.json(
      {
        success: false,
        error: "Insufficient balance",
        hint: "Payment failed on all available networks. Run `npx agentcash balance` to check your funds on Base, Solana, and Tempo.",
      },
      { status: 402 }
    );
  } catch (error) {
    console.error("Try endpoint failed:", error);

    let message = "Call failed";
    let hint: string | null = null;

    if (error instanceof AgentCashCliError) {
      switch (error.exitCode) {
        case 3:
          message = "Insufficient balance";
          hint = "Run `npx agentcash balance` to check your funds across all networks.";
          break;
        default:
          message = error.stderr || `AgentCash error (code ${error.exitCode})`;
      }
    } else if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ success: false, error: message, hint }, { status: 500 });
  }
}
