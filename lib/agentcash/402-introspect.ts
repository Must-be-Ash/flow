/**
 * 402 Introspection — probe endpoints to build NodeSpec
 *
 * Sends a zero-payment probe to an endpoint, parses the 402
 * response to extract payment requirements, then fetches
 * /llm.txt, /agent.md, /openapi.json if available.
 */

export type JSONSchema = Record<string, unknown>;

export type NodeSpec = {
  kind: "x402";
  origin: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  price: { amount: string; asset: "USDC"; chain: "base" | "solana" | string };
  inputSchema: JSONSchema;
  outputShape?: JSONSchema;
  pollingHints?: {
    kind: "long-poll" | "job-token" | "storage-link";
    statusPath?: string;
    completionField?: string;
  };
  docs?: {
    llmTxt?: string;
    agentMd?: string;
    openapi?: string;
    skillMd?: string;
  };
  source: { discoveredAt: string; via: "search" | "discover" | "manual" };
};

/**
 * Probe an endpoint for x402 payment requirements.
 * Sends a zero-payment request and parses the 402 response.
 */
export async function introspect402(
  origin: string,
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "POST"
): Promise<NodeSpec> {
  const url = `${origin}${path}`;

  // Send probe request
  let price = { amount: "0", asset: "USDC" as const, chain: "base" as string };
  let inputSchema: JSONSchema = {};

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method !== "GET" ? JSON.stringify({}) : undefined,
    });

    if (res.status === 402) {
      // Parse x402 payment-required response
      const body = await res.json().catch(() => ({}));

      // x402 v2 format
      if (body.accepts) {
        const accept = Array.isArray(body.accepts)
          ? body.accepts[0]
          : body.accepts;
        if (accept) {
          price = {
            amount: String(accept.maxAmountRequired || accept.amount || "0"),
            asset: "USDC",
            chain: accept.network || accept.chain || "base",
          };
        }
      }

      // Try to extract schema from the 402 body
      if (body.schema) {
        inputSchema = body.schema;
      }
    }
  } catch {
    // Probe failed — not fatal, we just won't have price info
  }

  // Try to fetch docs
  const docs: NodeSpec["docs"] = {};
  await Promise.allSettled([
    fetchText(`${origin}/llm.txt`).then((t) => {
      if (t) docs.llmTxt = t;
    }),
    fetchText(`${origin}/agent.md`).then((t) => {
      if (t) docs.agentMd = t;
    }),
    fetchText(`${origin}/openapi.json`).then((t) => {
      if (t) {
        docs.openapi = t;
        // Try to extract input schema from OpenAPI
        try {
          const openapi = JSON.parse(t);
          const pathObj = openapi.paths?.[path];
          if (pathObj) {
            const op = pathObj[method.toLowerCase()];
            if (op?.requestBody?.content?.["application/json"]?.schema) {
              inputSchema =
                op.requestBody.content["application/json"].schema;
            }
          }
        } catch {
          // OpenAPI parse failed — non-fatal
        }
      }
    }),
    fetchText(`${origin}/skill.md`).then((t) => {
      if (t) docs.skillMd = t;
    }),
  ]);

  return {
    kind: "x402",
    origin,
    path,
    method,
    price,
    inputSchema,
    docs: Object.keys(docs).length > 0 ? docs : undefined,
    source: { discoveredAt: new Date().toISOString(), via: "discover" },
  };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
