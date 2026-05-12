---
name: recruit
description: Run a deep candidate search for a recruiter using x402 pay-per-call endpoints (Apollo, Tomba, Exa, Firecrawl, Serper) on Base USDC via the awal wallet. Use when the user asks to source candidates, find applicants, build a shortlist, run a recruiting search, find engineers/developers/ML hires, find sales/marketing/BD hires, or "research who could fit role X". Output is a ranked, evidence-backed candidate report. Tech (engineering, ML) and GTM (sales, marketing, BD) recruiting are first-class; do not use for executive-only searches without the recruiter confirming.
---

# Recruit

## Overview

Source and enrich candidate shortlists for a recruiter by orchestrating x402 pay-per-call endpoints. Payments are made automatically in USDC on Base from the user's awal wallet. Output is a ranked markdown report with evidence and contact data per candidate.

## Prerequisites

Before sourcing, confirm:

1. **Wallet authenticated**: `npx awal@latest status`. If not authed, run the `authenticate-wallet` skill.
2. **USDC balance sufficient**: `npx awal@latest balance`. A typical 20-candidate search costs **$0.20–$0.50 USDC**. If balance is low, run the `fund` skill.

Do not proceed without both.

## Workflow

### Step 1 — Parse the brief

Extract from the recruiter's request:

- **Role type**: tech (engineer, ML, data, infra, security) or GTM (AE, SDR, marketing, BD, CSM, RevOps)
- **Seniority**: IC / senior / staff / lead / manager / director
- **Must-haves**: skills, domains, frameworks, industries, languages
- **Nice-to-haves**: tenure, education, prior employers
- **Location & work model**: city/region, remote/hybrid/onsite
- **Headcount target**: how many candidates to surface (default: 15–20)

If any must-have is ambiguous, ask **one** clarifying question before spending — the rest can be inferred.

### Step 2 — Pick the playbook

| Role type | Playbook |
|-----------|----------|
| Tech | `references/playbooks.md#tech` — Exa LinkedIn + GitHub + personal site for sourcing; Apollo via Orthogonal for one-call enrichment with verified email |
| GTM | `references/playbooks.md#gtm` — free Apollo people-search for universe scan; Apollo via Orthogonal for one-call enrichment with verified email |

Read the relevant playbook section before running calls.

### Step 3 — Source (wide net)

Run 2–4 parallel sourcing calls based on the playbook. Aim for **40–80 raw hits** before filtering. Track running USDC spend.

### Step 4 — Filter and dedupe

- Drop hits missing the must-haves
- Dedupe by (LinkedIn URL || full name + current employer)
- Keep top **20** by initial fit signals (see playbook ranking heuristics)

### Step 5 — Enrich top N

For each survivor, one Apollo via Orthogonal `/people/match` call ($0.01) returns verified business email, full profile, current title, organization with domain, and seniority. If Apollo doesn't have the candidate:

1. Tomba `/v1/linkedin?url=...` ($0.01) as direct backup
2. If still no email: Tomba `/v1/email-format?domain=...` ($0.01 once per company, cache by domain) → construct from top pattern → Tomba `/v1/email-verifier` ($0.01)
3. If no `result === "deliverable"`: mark "LinkedIn only — recruiter to InMail"

For tech candidates, also run `exa/contents` ($0.002) on the candidate's LinkedIn URL — returns full markdown profile (title, work history, recent posts, GitHub link). Optionally `exa/contents` on the GitHub repo for a 1-line "what they build" snippet.

### Step 6 — Rank

Score each candidate 0–10 against the brief using the playbook's signal weights. Sort descending. Surface ties by recency of relevant activity.

### Step 7 — Write the report

Use `assets/report-template.md` as the structure. Include the running total spend at the bottom. Save to the user's working directory as `candidates-<role>-<YYYYMMDD>.md`.

## Calling endpoints with awal

All endpoints called via:

```bash
npx awal@latest x402 pay <url> -X POST -d '<json-body>' --json
```

GET endpoints (Tomba, etc.):

```bash
npx awal@latest x402 pay '<url-with-query-string>' -X GET --json
```

**Critical rules**:

- Always pass `--json` so the response parses cleanly. The awal CLI rejects text/markdown responses, so JSON-returning endpoints are mandatory — every endpoint in `references/endpoints.md` returns JSON.
- Single-quote JSON bodies to avoid shell expansion: `-d '{"person_titles":["Account Executive"]}'`.
- Single-quote URLs with query strings to prevent shell mangling.
- Do **not** pass `--max-amount` — the user has opted out of caps. Spend freely but report the total.
- Run independent calls in parallel via separate Bash tool invocations in one message.
- Output starts with a status line, then JSON — parse from the first `{`.

Example — Apollo via Orthogonal one-call enrichment:

```bash
npx awal@latest x402 pay https://x402.orth.sh/apollo/api/v1/people/match \
  -X POST \
  -d '{"linkedin_url":"https://www.linkedin.com/in/edanharel","reveal_personal_emails":true}' \
  --json
```

Full endpoint catalog (URLs, body shapes, response fields, prices) lives in **`references/endpoints.md`** — read it before constructing any call.

## Cost tracking

Maintain a running tally as `Σ = sum of per-call prices from references/endpoints.md`. Surface the total in the final report. If the running total crosses $2 mid-search, briefly note it to the user but continue (no caps).

## Output

Always produce a markdown report following `assets/report-template.md`. Do not return raw JSON dumps to the user — synthesize.

## What this skill is not for

- **Outreach / email sending** — research only. If the recruiter asks to send messages, decline and suggest they handle outreach themselves.
- **Background checks / criminal records** — not in scope.
- **Executive search** without recruiter confirmation — the sourcing depth tuned here is for IC through director, not C-suite.
