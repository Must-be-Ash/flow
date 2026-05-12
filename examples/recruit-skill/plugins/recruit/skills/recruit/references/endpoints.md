# Endpoint Catalog

All endpoints below are x402 pay-per-call, settle in USDC on Base, return JSON, and are paid via awal:

```bash
npx awal@latest x402 pay <url> -X POST -d '<json>' --json
# GET endpoints:
npx awal@latest x402 pay '<url-with-query-string>' -X GET --json
```

## Table of contents

1. [Apollo via Orthogonal — universe scan + verified-email enrichment](#apollo-via-orthogonal)
2. [Tomba — email discovery, verification, domain-based candidate lists](#tomba)
3. [Exa — sourcing and LinkedIn content extraction](#exa)
4. [Firecrawl — scrape JS-heavy candidate pages](#firecrawl)
5. [Serper — recency / news signal](#serper)
6. [Bazaar fallback](#bazaar-fallback)

---

## Apollo via Orthogonal

Base URL: `https://x402.orth.sh/apollo`

**The primary enrichment surface in this skill.** One call returns verified email + full profile.

### `POST /api/v1/mixed_people/api_search` — FREE

Universe scan. Returns up to 100 people per page matching structured filters.

**Critical pitfalls**:

- Use `person_titles` (string array) for title filtering, **NOT** `q_keywords`. Putting a title in `q_keywords` returns 0 hits.
- **Do not combine** `person_titles` with `q_keywords` in the same call — the combination returns 0 hits. Use one or the other.
- Names come back partly obfuscated (`first_name` returned in full, `last_name_obfuscated` returned as `"Du***g"`). To get the full name + verified email, take the `id` from each result and call `/api/v1/people/match` (next endpoint, $0.01).

Body fields:

| Field | Type | Notes |
|-------|------|-------|
| `person_titles` | string[] | Required for title filtering. Array of exact-ish titles, e.g. `["Account Executive", "Senior Account Executive"]`. |
| `person_seniorities` | string[] | `owner`, `founder`, `c_suite`, `partner`, `vp`, `head`, `director`, `manager`, `senior`, `entry`. |
| `person_locations` | string[] | City names or regions. |
| `organization_locations` | string[] | Filter by company HQ location. |
| `organization_num_employees_ranges` | string[] | E.g. `["1,10"]`, `["50,100"]`, `["1000,5000"]`. |
| `q_keywords` | string | Free text for industry/skill. Use **only without** `person_titles`. |
| `per_page` | number | Up to 100. Use 25 for first pass. |
| `page` | number | Pagination. |

```json
{"person_titles": ["Account Executive", "Enterprise Account Executive"], "person_locations": ["San Francisco"], "per_page": 25}
```

Response shape per person: `{"id": "...", "first_name": "Karen", "last_name_obfuscated": "Du***g", "title": "Account Executive", "organization": {"name": "Salesforce", ...}, "has_email": true, ...}`. Hand the `id` to `/people/match` for the rest.

### `POST /api/v1/people/match` — $0.01

The enrichment workhorse. Pass a LinkedIn URL (preferred), email, or `first_name`+`last_name`+`organization_name` and get back:

- `email` — verified business email
- `email_status` — `"verified"` when present
- `first_name`, `last_name`, `headline`, `title`
- `linkedin_url`, `photo_url`, `twitter_url`, `github_url`
- `organization` — full firmographics (`name`, `primary_domain`, `website_url`, headcount, revenue)
- `seniority`, `departments`, `subdepartments`, `functions`
- `employment_history` — full work history
- `personal_emails` — when available

Body:

```json
{"linkedin_url": "https://www.linkedin.com/in/edanharel", "reveal_personal_emails": true}
```

**Do not** also pass `reveal_phone_number: true` without `webhook_url` — Apollo returns 400 because phone reveal is async-only.

### `GET /api/v1/organizations/enrich?domain=<domain>` — $0.01

Full firmographics for one company by domain. **Use this over stableenrich's `/api/apollo/org-enrich` ($0.0495) — 5× cheaper, same Apollo data.**

```bash
npx awal@latest x402 pay 'https://x402.orth.sh/apollo/api/v1/organizations/enrich?domain=stripe.com' -X GET --json
```

Response shape (interesting fields under `data.organization`):

```json
{"organization": {
  "id": "5d0a0fbff6512580bf33a120",
  "name": "Stripe", "primary_domain": "stripe.com", "website_url": "...",
  "linkedin_url": "...", "founded_year": 2010,
  "industry": "information technology & services",
  "estimated_num_employees": 8000,
  "annual_revenue": ..., "total_funding": ..., "latest_funding_stage": "...",
  "publicly_traded_symbol": null,
  "keywords": ["payments", "developer tools", ...100+ tags],
  "current_technologies": [{"name": "Apache Kafka", "category": "Data Management Platform"}, ...],
  "short_description": "..."
}}
```

Use cases:

- Get the email domain for guess-and-verify (`primary_domain`)
- Score "worked at peer company" signal during ranking (`industry`, `keywords`, `estimated_num_employees`)
- Detect tech-stack alignment for tech roles (`current_technologies`)

---

## Tomba

Base URL: `https://x402.orth.sh/tomba`

LinkedIn → email backup when Apollo `/people/match` doesn't return one. All endpoints are $0.01.

### `GET /v1/linkedin?url=<linkedin-url>` — $0.01

Returns email + pattern + verification status from a LinkedIn profile URL.

```bash
npx awal@latest x402 pay 'https://x402.orth.sh/tomba/v1/linkedin?url=https://www.linkedin.com/in/satyanadella' -X GET --json
```

Response shape:
```json
{"data": {"email": "satyan@microsoft.com", "first_name": "Satya", "last_name": "Nadella",
  "company": "Microsoft", "website_url": "microsoft.com", "pattern": "{f}{last}",
  "department": "executive", "position": "ceo", "score": 100,
  "verification": {"status": "valid"}}}
```

Coverage: well-known professionals are covered with `score: 100`; unknown candidates return all nulls + `score: 0` — fall back to the next strategy.

### `GET /v1/email-finder?domain=<d>&company=<c>&first_name=<f>&last_name=<l>` — $0.01

Backup email construction when Apollo `/people/match` and Tomba `/v1/linkedin` both miss. Pass full name + company domain.

```bash
npx awal@latest x402 pay 'https://x402.orth.sh/tomba/v1/email-finder?domain=microsoft.com&company=Microsoft&first_name=Satya&last_name=Nadella' -X GET --json
```

Response shape:

```json
{"data": {"email": "satyanadella@microsoft.com", "pattern": "{first}{last}",
  "score": 72, "accept_all": true,
  "verification": {"status": "valid" | "unknown" | "invalid"},
  "sources": [{"uri": "...", "last_seen_on": "..."}]}}
```

Decision rule: trust the returned `email` only when `verification.status === "valid"` AND `score >= 80`. Otherwise verify with Hunter `email-verifier` ($0.03) before reporting.

### `GET /v1/email-format?domain=<domain>` — $0.01

**Best email-discovery primitive for batches.** Returns the distribution of email patterns at a company — knowing the dominant pattern lets you construct a single high-confidence guess instead of brute-forcing 3 patterns through Hunter.

```bash
npx awal@latest x402 pay 'https://x402.orth.sh/tomba/v1/email-format?domain=stripe.com' -X GET --json
```

Response shape (formats sorted by usage):

```json
{"data": [
  {"format": "{first}", "percentage": 64},
  {"format": "{f}{last}", "percentage": 23},
  {"format": "{first}.{last}", "percentage": 9},
  {"format": "{f}{l}", "percentage": 2},
  {"format": "{last}", "percentage": 2}
]}
```

Format placeholders: `{first}` = first name, `{last}` = last name, `{f}` = first initial, `{l}` = last initial. All lowercase.

Decision rule: pick the format with the highest `percentage` (≥ 50% is strong, 30–50% is decent, < 30% means try the top 2 formats). Construct the email, then verify with Hunter `email-verifier` ($0.03) or Tomba's own verifier (next entry, $0.01).

Recommended flow per unique candidate-company in the shortlist:
1. Call `/v1/email-format?domain=<company-domain>` once per company (cache by domain — most candidates share employers)
2. For each candidate at that company, construct the email from the top pattern
3. Verify the constructed email
4. If `result === "deliverable"`, report it; otherwise try the second pattern

### `GET /v1/email-verifier?email=<email>` — $0.01

The verification workhorse. Returns the same `result: "deliverable" | "risky" | "undeliverable"` signal as a typical SMTP-probe verifier, plus richer detail (SMTP provider, MX records, accept-all detection, disposable/webmail flags).

```bash
npx awal@latest x402 pay 'https://x402.orth.sh/tomba/v1/email-verifier?email=satya@microsoft.com' -X GET --json
```

Response shape (interesting fields under `data.email`):

```json
{"data": {"email": {
  "email": "satya@microsoft.com",
  "result": "deliverable",
  "status": "valid",
  "score": 99,
  "smtp_provider": "Microsoft Outlook / Office 365",
  "mx_check": true,
  "smtp_check": true,
  "accept_all": true,
  "disposable": false,
  "webmail": false,
  "gibberish": false,
  "block": true
}}}
```

Decision rule for reporting an email to the recruiter:

- `result === "deliverable"` AND `score >= 80` → report
- `result === "risky"` OR `accept_all === true` AND `score < 90` → report with a note "may be a catch-all — recruiter should test before mass send"
- `result === "undeliverable"` OR `disposable === true` → drop and try the next pattern

### `GET /v1/phone-finder?linkedin=<url>` — $0.01

Find a phone number from a LinkedIn URL. Optional — only call when the recruiter explicitly asks for phone in the brief (most recruiting briefs are email-first).

```bash
npx awal@latest x402 pay 'https://x402.orth.sh/tomba/v1/phone-finder?linkedin=https://www.linkedin.com/in/satyanadella' -X GET --json
```

Response shape:

```json
{"data": {"valid": true, "intl_format": "+1 425-445-0068", "e164_format": "+14254450068",
  "country_code": "US", "line_type": "FIXED_LINE_OR_MOBILE", "timezones": ["America/Los_Angeles"]}}
```

Use `e164_format` in the report — it's the unambiguous machine-readable form. Skip if `valid !== true`.

### `GET /v1/domain-search?domain=<d>&company=<c>&department=<dept>&limit=<n>` — $0.01

**Sourcing + enrichment in one call.** Returns up to 50 people at a company in a department, with name + email + title + LinkedIn URL + seniority. When the recruiter has a target-company list, this beats Exa search → Apollo enrichment because it's one $0.01 call per company instead of dozens.

```bash
npx awal@latest x402 pay 'https://x402.orth.sh/tomba/v1/domain-search?domain=stripe.com&company=Stripe&department=engineering&limit=50' -X GET --json
```

Required: `domain` + `company` (3-75 chars). Optional: `department`, `country` (two-letter code), `limit` (10/20/50, default 10), `page`.

Departments accepted: `engineering`, `sales`, `finance`, `hr`, `it`, `marketing`, `operations`, `management`, `executive`, `legal`, `support`, `communication`, `software`, `security`, `pr`, `warehouse`, `diversity`, `administrative`, `facilities`, `accounting`.

Response shape:

```json
{"data": {"emails": [
  {"email": "alice@stripe.com", "first_name": "Alice", "last_name": "Smith",
   "full_name": "Alice Smith", "position": "staff software engineer", "department": "engineering",
   "seniority": "senior", "linkedin": "https://www.linkedin.com/in/alice-smith",
   "twitter": null, "score": 51,
   "verification": {"status": "valid", "date": "2025-04-30"},
   "sources": [...]}
]}, "meta": {"total": 216, "pageSize": 50, "current": 1}}
```

Decision rule: trust `email` only when `verification.status === "valid"`. Score below 50 means thin web evidence — verify with `/v1/email-verifier` ($0.01) before reporting.

When to use over the Exa+Apollo flow:

- **Use domain-search** when the recruiter names target companies ("AEs at Stripe, Plaid, Square") — one call per company gives you a pre-filtered list.
- **Use Exa+Apollo** when sourcing across an open universe ("staff engineers in NYC fintech") — Tomba's department-level list won't match arbitrary niches.

---

## Exa

Base URL: `https://stableenrich.dev`

Sourcing workhorse for finding candidates with full names + URLs.

### `POST /api/exa/search` — $0.01

Semantic web search with category filter. Use 25 results for first pass.

| Field | Type | Notes |
|-------|------|-------|
| `query` | string | Natural language. Include role + skill/industry + location/company. |
| `numResults` | number | Default 10, up to 100. |
| `category` | string | `"linkedin profile"`, `"github"`, `"personal site"`, `"company"`, `"news"`, `"research paper"`, `"pdf"`, `"tweet"`, `"financial report"`. |

Patterns that work:

```json
{"query": "senior account executive developer tools San Francisco", "numResults": 25, "category": "linkedin profile"}
{"query": "open source contributors Rust async runtime", "numResults": 25, "category": "github"}
{"query": "ML engineer transformers inference optimization blog", "numResults": 15, "category": "personal site"}
```

Title format on LinkedIn results: `"Full Name - Title @ Company"`. Parse the title for current employer when present.

### `POST /api/exa/contents` — $0.002

Extract clean content from URLs. Dirt cheap — use freely. **For LinkedIn URLs this returns the entire profile in markdown** (title, current company, tenure, full work history, education, skills, recent activity, GitHub profile link). For GitHub repo URLs it returns the README.

```json
{"urls": ["https://www.linkedin.com/in/satyanadella", "https://github.com/alice/repo"]}
```

Response shape:

```json
{"results": [{
  "id": "<url>",
  "url": "<url>",
  "title": "Full Name | Current Title at Company",
  "author": "Full Name",
  "text": "<markdown profile: name, headline, location, connections, About, Experience (each role with title, company, dates, durations, dept, level), Education, Skills, Activity (recent posts, likes, shares), GitHub link>",
  "image": "<photo url>"
}], "statuses": [{"status": "success", "source": "cached"}], "costDollars": {"total": 0.001}}
```

What to extract per LinkedIn URL:

- **Current title + company**: parse from `title` field (`"Name | Title at Company"`) or first `### ... at [Company] (Current)` section in `text`
- **Tenure at current role**: the dates after the current-role heading (e.g. `"Feb 2014 - Present • 12 years"`)
- **Work history**: each `### <title> at [<company>]` block in `text`
- **Tech "what they build" signal**: scan recent Activity posts for keywords matching the brief
- **GitHub username**: look for `## GitHub` section near end of `text`

This often replaces multiple separate calls (no need to also call Apollo if you just want title + tenure + work history; only call Apollo for the verified email).

---

## Firecrawl

Base URL: `https://stableenrich.dev`

### `POST /api/firecrawl/scrape` — $0.0126

Backup scraper for when `exa/contents` returns thin text (JS-heavy candidate portfolios, custom team pages, etc.). For LinkedIn URLs prefer `exa/contents` — it's cheaper and structured.

```json
{"url": "https://alice.dev/about"}
```

Response shape:

```json
{"url": "<final-url>", "title": "<page title>", "content": "<full page markdown>"}
```

`content` includes inline image URLs as Markdown — strip those before passing to the LLM if you want a tighter prompt.

---

## Serper

Base URL: `https://stableenrich.dev`

### `POST /api/serper/news` — $0.04

Google News search. Use on top 5 candidates to surface recent quotes, conference talks, hiring news, or "X joins Y" moves — strong recency signal for ranking.

| Field | Type | Notes |
|-------|------|-------|
| `q` | string | Search query — typically `"<Full Name> <Company>"` or `"<Full Name> <Title>"`. |
| `num` | number | Number of articles to return (5–10 is enough for ranking). |
| `gl` | string | Two-letter country code, e.g. `"us"`, `"gb"`. |
| `hl` | string | Language code, e.g. `"en"`. |

```json
{"q": "Edan Harel CodeRabbit", "num": 5, "gl": "us", "hl": "en"}
```

Response shape per article: `{"title": "...", "link": "...", "snippet": "...", "date": "4 hours ago" | "3 days ago" | "1 month ago", "source": "TechCrunch", "imageUrl": "..."}`. Plus a top-level `credits` count.

What to extract: only articles where `date` is within the last 12 months and the candidate's name appears in `title` or `snippet`. Pull 1–2 most relevant into the report's "evidence" line.

---

## Bazaar fallback

This skill ships with a curated list by design. Do **not** call Bazaar discovery during normal sourcing.

Exception: if the recruiter's brief is genuinely outside this catalog (e.g. "find drone-pilot candidates with FAA Part 107 certs"), run `npx awal@latest x402 bazaar search "<query>"` to see if a specialized endpoint exists. Surface the new endpoint to the user before paying.
