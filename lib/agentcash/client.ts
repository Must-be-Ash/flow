/**
 * AgentCash client — wraps search + discover + paid fetch
 *
 * Uses the agentcash CLI for service discovery and payments.
 * The CLI handles x402/MPP payment protocols automatically.
 * Docs: https://agentcash.dev/docs
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { agentcash } from "./cli";
import { introspect402, type NodeSpec } from "./402-introspect";

const CACHE_PATH = join(process.cwd(), ".flow", "discover-cache.json");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ─── Cache ───────────────────────────────────────────────────────────

type CacheEntry = {
  spec: NodeSpec;
  cachedAt: string;
};

type DiscoverCache = Record<string, CacheEntry>;

async function readCache(): Promise<DiscoverCache> {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    const raw = await readFile(CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeCache(cache: DiscoverCache): Promise<void> {
  try {
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch {
    // Non-fatal
  }
}

function cacheKey(origin: string, path: string, method: string): string {
  return `${method}:${origin}${path}`;
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - new Date(entry.cachedAt).getTime() < CACHE_TTL;
}

// ─── Search ──────────────────────────────────────────────────────────

export type SearchResult = {
  /** Human-readable name for this endpoint */
  name: string;
  /** One-line description of what this endpoint does */
  summary: string;
  /** Origin URL (e.g. https://stablestudio.dev) */
  origin: string;
  /** Origin brand name (e.g. "StableStudio") */
  originName: string;
  /** API path */
  path: string;
  /** HTTP method */
  method: string;
  /** Price per call in USD */
  price?: string;
  /** x402 or mpp */
  authMode?: string;
  /** Relevance score */
  score?: number;
};

/**
 * Search for x402 services by keyword.
 * Uses `npx agentcash search <query>` which queries the AgentCash search index.
 * Returns ranked origins with their most relevant endpoints.
 */
export async function search(query: string): Promise<SearchResult[]> {
  try {
    const result = await agentcash(["search", query], { timeout: 20_000 });

    if (result.json) {
      // CLI returns: { success, data: { success, results: { results: [...] } } }
      const outer = result.json as Record<string, unknown>;
      const data = (outer.data || outer) as Record<string, unknown>;
      const resultsWrapper = (data.results || data) as Record<string, unknown>;
      const rawResults = (resultsWrapper.results || resultsWrapper) as unknown;

      if (Array.isArray(rawResults)) {
        const mapped = (rawResults as Array<Record<string, unknown>>)
          .filter((r) => r.path && r.summary)
          .map((r) => {
            const originObj = r.origin as Record<string, unknown> | undefined;
            const originUrl = String(originObj?.url || r.origin || "");
            const rawTitle = String(originObj?.title || "");
            const originName = rawTitle.split(" - ")[0]
              || originUrl.replace("https://", "").replace("http://", "").split("/")[0];

            const summary = String(r.summary || "");

            // Extract family key from semanticDescription for dedup.
            // Family key looks like "stablestudio.dev::gpt-image-2"
            // Strip the hostname part so .io and .dev variants merge.
            const semDesc = String(r.semanticDescription || "");
            const familyMatch = semDesc.match(/Family key:\s*(.+)/);
            let familyKey = familyMatch ? familyMatch[1].trim() : `${originUrl}::${r.path}`;
            // Normalize: "stablestudio.io::gpt-image-2" → "::gpt-image-2"
            const colonIdx = familyKey.indexOf("::");
            if (colonIdx >= 0) {
              familyKey = familyKey.substring(colonIdx);
            }

            return {
              name: summary,
              summary,
              origin: originUrl,
              originName: originName || "Unknown",
              path: String(r.path || ""),
              method: String(r.method || "POST"),
              price: r.price != null ? String(r.price) : undefined,
              authMode: r.authMode ? String(r.authMode) : undefined,
              score: typeof r.score === "number" ? r.score : undefined,
              _familyKey: familyKey,
            };
          });

        // Deduplicate: keep only the highest-score result per family key
        const bestByFamily = new Map<string, (typeof mapped)[0]>();
        for (const item of mapped) {
          const existing = bestByFamily.get(item._familyKey);
          if (!existing || (item.score ?? 0) > (existing.score ?? 0)) {
            bestByFamily.set(item._familyKey, item);
          }
        }

        return Array.from(bestByFamily.values()).map(({ _familyKey, ...rest }) => rest);
      }
    }
  } catch (err) {
    console.error("[AgentCash search] CLI error:", err);
  }

  return [];
}

// ─── Discover Endpoints ──────────────────────────────────────────────

export type EndpointInfo = {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  description?: string;
  price?: string;
  spec?: NodeSpec;
};

/**
 * Discover endpoints for an origin.
 * Uses `npx agentcash discover <origin>` which fetches the origin's
 * OpenAPI spec and extracts x-payment-info annotations.
 */
export async function discoverEndpoints(
  origin: string,
  opts?: { refresh?: boolean }
): Promise<EndpointInfo[]> {
  try {
    const result = await agentcash(["discover", origin], { timeout: 15_000 });

    if (result.json) {
      const data = result.json as Record<string, unknown>;
      const rawEndpoints = (data.endpoints || data) as Array<Record<string, unknown>>;

      if (Array.isArray(rawEndpoints)) {
        const endpoints: EndpointInfo[] = rawEndpoints.map((e) => ({
          path: String(e.path || ""),
          method: (String(e.method || "POST").toUpperCase() as EndpointInfo["method"]),
          description: e.description ? String(e.description) : e.summary ? String(e.summary) : undefined,
          price: e.price != null ? String(e.price) : undefined,
        }));

        // Enrich each endpoint with full NodeSpec (using cache)
        const cache = await readCache();
        const results: EndpointInfo[] = [];

        for (const ep of endpoints) {
          const key = cacheKey(origin, ep.path, ep.method);
          if (!opts?.refresh && cache[key] && isCacheValid(cache[key])) {
            results.push({ ...ep, spec: cache[key].spec });
          } else {
            // Build NodeSpec from discovered data
            const spec: NodeSpec = {
              kind: "x402",
              origin,
              path: ep.path,
              method: ep.method,
              price: { amount: ep.price || "0", asset: "USDC", chain: "base" },
              inputSchema: {},
              source: { discoveredAt: new Date().toISOString(), via: "discover" },
            };

            // Try to get input schema via check_endpoint_schema
            try {
              const checkResult = await agentcash(
                ["check", `${origin}${ep.path}`],
                { timeout: 10_000 }
              );
              const checkData = checkResult.json as Record<string, unknown> | null;
              if (checkData) {
                if (checkData.inputSchema) {
                  spec.inputSchema = checkData.inputSchema as Record<string, unknown>;
                }
                if (checkData.outputSchema) {
                  spec.outputShape = checkData.outputSchema as Record<string, unknown>;
                }
                if (checkData.price != null) {
                  spec.price.amount = String(checkData.price);
                }
              }
            } catch {
              // Schema check failed — non-fatal, proceed with empty schema
            }

            cache[key] = { spec, cachedAt: new Date().toISOString() };
            results.push({ ...ep, spec });
          }
        }

        await writeCache(cache);
        return results;
      }
    }
  } catch {
    // CLI not available — fall back to direct probe
  }

  // Fallback: probe OpenAPI directly
  return discoverEndpointsDirect(origin, opts);
}

/**
 * Direct endpoint discovery without CLI — probes /openapi.json and /.well-known/x402
 */
async function discoverEndpointsDirect(
  origin: string,
  opts?: { refresh?: boolean }
): Promise<EndpointInfo[]> {
  const endpoints: EndpointInfo[] = [];

  try {
    const openapiRes = await fetch(`${origin}/openapi.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (openapiRes.ok) {
      const openapi = await openapiRes.json();
      if (openapi.paths) {
        for (const [path, methods] of Object.entries(
          openapi.paths as Record<string, Record<string, unknown>>
        )) {
          for (const [method, details] of Object.entries(methods)) {
            if (["get", "post", "put", "delete"].includes(method)) {
              const d = details as Record<string, unknown>;
              const paymentInfo = d["x-payment-info"] as Record<string, unknown> | undefined;
              endpoints.push({
                path,
                method: method.toUpperCase() as EndpointInfo["method"],
                description: (d.summary || d.description) as string | undefined,
                price: paymentInfo?.price != null ? String(paymentInfo.price) : undefined,
              });
            }
          }
        }
      }
    }
  } catch {
    // No OpenAPI
  }

  if (endpoints.length === 0) {
    try {
      const wellKnownRes = await fetch(`${origin}/.well-known/x402`, {
        signal: AbortSignal.timeout(5000),
      });
      if (wellKnownRes.ok) {
        const data = await wellKnownRes.json();
        if (Array.isArray(data.endpoints)) {
          for (const e of data.endpoints) {
            endpoints.push({
              path: String(e.path || ""),
              method: (String(e.method || "POST").toUpperCase() as EndpointInfo["method"]),
              description: e.description ? String(e.description) : undefined,
              price: e.price != null ? String(e.price) : undefined,
            });
          }
        }
      }
    } catch {
      // No well-known
    }
  }

  // Introspect for NodeSpec
  const cache = await readCache();
  const results: EndpointInfo[] = [];

  for (const ep of endpoints) {
    const key = cacheKey(origin, ep.path, ep.method);
    if (!opts?.refresh && cache[key] && isCacheValid(cache[key])) {
      results.push({ ...ep, spec: cache[key].spec });
    } else {
      try {
        const spec = await introspect402(origin, ep.path, ep.method);
        if (ep.price) spec.price.amount = ep.price;
        cache[key] = { spec, cachedAt: new Date().toISOString() };
        results.push({ ...ep, spec });
      } catch {
        results.push(ep);
      }
    }
  }

  await writeCache(cache);
  return results;
}

/**
 * Make a paid API call via AgentCash fetch.
 * Uses `npx agentcash fetch <url>` which handles x402/MPP payments automatically.
 */
export async function agentcashFetch(
  url: string,
  opts?: {
    method?: string;
    body?: unknown;
    headers?: string[];
    timeout?: number;
  }
): Promise<{ data: unknown; paymentInfo?: { amount: string; txHash?: string; chain?: string } }> {
  const args = ["fetch", url];

  if (opts?.method) {
    args.push("--method", opts.method);
  }

  if (opts?.body) {
    args.push("--body", JSON.stringify(opts.body));
  }

  if (opts?.headers) {
    for (const h of opts.headers) {
      args.push("--header", h);
    }
  }

  const result = await agentcash(args, { timeout: opts?.timeout ?? 60_000 });

  const parsed = result.json as Record<string, unknown> | null;
  return {
    data: parsed?.data ?? parsed,
    paymentInfo: parsed?.paymentInfo as { amount: string; txHash?: string; chain?: string } | undefined,
  };
}
