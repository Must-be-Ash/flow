# Testing log

Verification notes for the `recruit` skill. **Not loaded into the agent's context** — this is for skill maintainers to track what works, what doesn't, and where awal compatibility differs from endpoint reality.

Last verified: 2026-04-22.

## How to test an endpoint

The skill assumes awal pays any working x402 endpoint. To distinguish "endpoint broken" from "awal client bug", test directly with `x402-fetch` + a raw private key. If a call works via x402-fetch but awal reports failure, the endpoint stays in the skill (we'll fix awal); if it fails both ways, the endpoint is genuinely broken.

```bash
# One-time setup in /tmp/x402-test
mkdir -p /tmp/x402-test && cd /tmp/x402-test
npm init -y && npm install --silent x402-fetch viem
```

Save this as `/tmp/x402-test/call.mjs`:

```javascript
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const pk = process.env.WALLET_PRIVATE_KEY;
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
const fetchPay = wrapFetchWithPayment(fetch, account);

const url = process.argv[2];
const method = process.argv[3] || "GET";
const body = process.argv[4] || null;

const opts = { method, headers: {} };
if (body) {
  opts.headers["Content-Type"] = "application/json";
  opts.body = body;
}

const res = await fetchPay(url, opts);
const text = await res.text();
let parsed;
try { parsed = JSON.parse(text); } catch { parsed = text; }
console.log(JSON.stringify({ status: res.status, ok: res.ok, data: parsed }, null, 2));
```

Run via:

```bash
set -a; source <path-to-env>/.env.local; set +a
cd /tmp/x402-test && node call.mjs '<url>' POST '<json-body>'
```

For stableenrich endpoints (x402 v2), use awal directly:

```bash
npx awal@latest x402 pay <url> -X POST -d '<json>' --json
```

## Endpoint status

### ✅ Working — included in skill

| Endpoint | Surface | Price | Notes |
|----------|---------|-------|-------|
| `apollo/api/v1/people/match` (with `reveal_personal_emails:true`) | `x402.orth.sh` | $0.01 | Verified: Satya Nadella → `email: satyan@microsoft.com`, `email_status: "verified"`, full profile + departments + seniority + employment_history. **Best one-call enrichment.** |
| `apollo/api/v1/mixed_people/api_search` | `x402.orth.sh` | FREE | Verified: 7271 entries for SF Account Executives. Returns obfuscated `last_name_obfuscated`; pair with `/people/match` to deobfuscate. |
| `apollo/api/v1/organizations/enrich?domain=` | `x402.orth.sh` | $0.01 | Verified on stripe.com → 8000 employees, 100+ keywords, 100+ tech stack items, industry, funding. **5× cheaper than stableenrich's `/api/apollo/org-enrich` ($0.0495); same data.** |
| `tomba/v1/linkedin?url=` | `x402.orth.sh` | $0.01 | Verified Satya → `email: satyan@microsoft.com`, `pattern: {f}{last}`, `score: 100`, `verification.status: valid`. Coverage gap: unknown candidates return all nulls + `score: 0`. |
| `tomba/v1/email-finder?domain=&first_name=&last_name=` | `x402.orth.sh` | $0.01 | Verified: returns email + pattern + score + verification + sources. Score lower than `/v1/linkedin` (72 vs 100). |
| `tomba/v1/email-format?domain=` | `x402.orth.sh` | $0.01 | Verified on stripe.com → distribution of patterns (`{first}` 64%, `{f}{last}` 23%, `{first}.{last}` 9%, ...). **Major win for batch email construction.** |
| `tomba/v1/email-verifier?email=` | `x402.orth.sh` | $0.01 | Verified on satya@microsoft.com → `result: deliverable`, `score: 99`, full SMTP/MX detail. **3× cheaper than Hunter ($0.03), same signal.** |
| `tomba/v1/phone-finder?linkedin=` | `x402.orth.sh` | $0.01 | Verified Satya → `+14254450068` (Bellevue/Seattle), `e164_format`, `line_type`, timezone. Optional — most recruiters are email-first. |
| `tomba/v1/domain-search?domain=&company=&department=` | `x402.orth.sh` | $0.01 | Verified on stripe.com engineering → 216 total entries available, returned 5 with email + name + position + LinkedIn URL + verification. **Sourcing+enrichment combo: up to 50 candidates per company per call.** |
| `exa/search` | `stableenrich.dev` | $0.01 | Verified: 25 LinkedIn URLs in ~800ms with full names parsed in `title` field. Best LinkedIn discovery. |
| `exa/contents` | `stableenrich.dev` | $0.002 | Verified on Satya's LinkedIn → returned full profile in markdown (12 years tenure, board memberships, education, recent posts, GitHub link). **Often replaces a separate Apollo call when you only need profile details, not the verified email.** Actual cost was $0.001 (lower than listed). |
| `firecrawl/scrape` | `stableenrich.dev` | $0.0126 | Verified on langchain.com/blog → returns `{url, title, content}` markdown. Use as backup when exa/contents misses. |
| `serper/news` | `stableenrich.dev` | $0.04 | Verified on "Satya Nadella Microsoft" → 8 news articles with title, snippet, date (`"4 hours ago"` format), source. Real recency signal. |

### ❌ Removed from skill

| Endpoint | Surface | Why removed |
|----------|---------|-------------|
| `exa/find-similar` | `stableenrich.dev` | Tested on Satya's LinkedIn → returned Wikipedia/IMDb/news.microsoft.com pages about Satya, NOT similar PEOPLE. Not what its name suggests. For "more like this person", just re-run Exa search with a richer query. |
| `exa/answer` | `stableenrich.dev` | Tested on "top open source contributors to LangChain in 2025" → vague AI summary saying "not explicitly named in the latest data" + generic article links. No actual candidate names returned. |
| `firecrawl/search` | `stableenrich.dev` | Returned 3 LinkedIn results at $0.0252 vs Exa's 25 results at $0.01 — 20× more expensive per result. Exa search dominates. |
| `reddit/search`, `reddit/post-comments` | `stableenrich.dev` | Tested with "best engineers I worked with at fintech" → 5 results were Indian startup guide, cold email rant, Cognizant hiring announcement, Jaipur mentor offer, and a QA resignation post. Pure noise; never surfaces recruitable candidates. |
| `stablesocial/api/instagram/profile` (et al) | `stablesocial.dev` | Tested → returns 202 + JWT token requiring async polling on `/api/jobs?token=...`. Different pattern than rest of skill. Niche use case (audience-building roles only). If a recruiter ever needs this, they can use Bazaar fallback. |
| `hunter/email-verifier` | `stableenrich.dev` | $0.03 vs Tomba's verifier at $0.01 with same `result: deliverable` signal. Pure replacement. |
| `apollo/people-enrich` | `stableenrich.dev` | Server-broken: empty body via x402-fetch with `linkedin_url`, `email`, and `person_id` inputs. Replaced by `apollo orth /people/match` ($0.01) which works. |
| `apollo/org-search` | `stableenrich.dev` | Redundant with `apollo orth /mixed_companies/search` ($0.01 vs $0.02). Also: `q_keywords` filtering is weak per testing. |
| `apollo/org-enrich` | `stableenrich.dev` | Same data as `apollo orth /organizations/enrich` at $0.0495 vs $0.01 — 5× more expensive for identical data. |
| `clado/contacts-enrich` | `stableenrich.dev` | Server-broken: empty body via x402-fetch on multiple LinkedIn URL formats. Endpoint exists in `awal x402 details` but every call charges $0.20 and returns nothing. |
| `minerva/resolve`, `minerva/enrich`, `minerva/validate-emails` | `stableenrich.dev` | Verified `resolve` works (requires email/phone input, not just name+linkedin). But Minerva's unique value is consumer-marketing data (financial signals, address history, relatives) — not useful for recruiting. Work history + education already returned by `apollo orth /people/match`. |
| `fiber/v1/natural-language-search/profiles` | `x402.orth.sh` | Server-broken: returns 500 `"Failed to process payment middleware"`. |
| `apollo orth /api/v1/news_articles/search` | `x402.orth.sh` | Verified working ($0.01 returns articles with `event_categories: ["partners_with", "launches"]`), but it's company-level signal. Our playbooks rank candidates not companies. Removed for catalog leanness. |
| `apollo orth /api/v1/organizations/{id}/job_postings` | `x402.orth.sh` | Niche: only useful for "is this company hiring my role". Not in any playbook. |

### ⚠️ awal-specific bug (endpoint works, awal client cannot render)

Verified 2026-04-22 with awal versions 2.0.3, 2.8.0, and 2.8.1. Latest tested: 2.8.1.

awal reports `"Payment was authorized but rejected by server"` for any endpoint hosted at `https://x402.orth.sh/...`. **Basescan confirms USDC does transfer on-chain** for these "Failed" calls — payment settles cleanly, the server returns the response, but awal's client doesn't render the v1 response shape and discards the data.

The skill catalog includes orth.sh endpoints assuming awal will catch up. To use them today, the agent must run the Node `x402-fetch` script above.

When awal updates its v1 response handling, every orth.sh endpoint in the "Working" table above becomes awal-payable with no skill changes.

## Test wallet info

- Test wallet (orth.sh tests): `0x16CA9e69E97EF3E740f573E79b913183BF500C18` (loaded from `WALLET_PRIVATE_KEY` in `bundle-maker/.env.local`)
- awal wallet (stableenrich tests): `0xC160EaEFEb8CabB7D276EB92582755808e286581`
- Total spent across all verification (cumulative across rounds): ~$1.00 USDC

## Things still untested

The current catalog covers everything used by the playbooks. If you add new endpoints, test them with the script above and capture: status, body fields, response shape, and what to do with the response next.

Endpoints not in the skill but documented in `bundle-maker/enrich/`:

- Other Tomba endpoints (`combined/find`, `enrich`, `companies/find`, `email-count`, `email-sources`, `domain-suggestions`, `domain-status`, `similar`, `technology`, `phone-validator`, `author-finder`, `location`, `reveal/search`, `people/find`)
- All Nyne endpoints (deep enrichment with async polling pattern)
- All Sixtyfour endpoints (find-email, find-phone, enrich-lead, enrich-company)
- Other Apollo orth endpoints (`bulk_enrich`, `bulk_match`, `mixed_companies/search`)
- Other Exa endpoints (`/research/v1`, async deep research with `outputSchema`)
- Influencer endpoints (irrelevant to recruiting)
- Whitepages, Google Maps, Cloudflare browser rendering (irrelevant to recruiting)

## How to run a fresh end-to-end smoke test

A 5-candidate GTM brief exercising the full path:

```bash
# 1. Free universe scan
node call.mjs 'https://x402.orth.sh/apollo/api/v1/mixed_people/api_search' POST \
  '{"person_titles":["Account Executive"],"person_locations":["San Francisco"],"per_page":5}'

# 2. Enrich one of the returned ids (or use a known LinkedIn URL)
node call.mjs 'https://x402.orth.sh/apollo/api/v1/people/match' POST \
  '{"linkedin_url":"https://www.linkedin.com/in/<known-person>","reveal_personal_emails":true}'

# 3. Backup email lookup if Apollo missed
node call.mjs 'https://x402.orth.sh/tomba/v1/linkedin?url=https://www.linkedin.com/in/<known-person>' GET

# 4. If still no email: get pattern + verify
node call.mjs 'https://x402.orth.sh/tomba/v1/email-format?domain=<company>.com' GET
node call.mjs 'https://x402.orth.sh/tomba/v1/email-verifier?email=<constructed>' GET
```

Total cost for the smoke test: ~$0.05. Run before any release.
