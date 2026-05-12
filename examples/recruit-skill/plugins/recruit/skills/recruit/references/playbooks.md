# Recruiting Playbooks

Two playbooks, picked by role type. Read only the one that matches the brief.

Both playbooks lean on **Apollo via Orthogonal `/people/match`** for enrichment — one $0.01 call returns verified email + full profile, replacing what used to be a multi-step org-enrich + email-guess + verify chain.

When the recruiter has a **target company list** ("AEs at Stripe, Plaid, Square"), prefer **Tomba `/v1/domain-search`** ($0.01 per company, returns up to 50 verified emails per call) over Exa+Apollo — it's sourcing + enrichment in one call.

## Tech

### Sourcing call sequence

For tech roles (engineering, ML, data, infra, security), web evidence (GitHub, blogs, LinkedIn) beats firmographic-only signals. Lead with Exa.

Run **in parallel** (one Bash message, multiple `awal x402 pay` calls):

1. **Exa LinkedIn profile search** — primary credentialing signal
   ```json
   {"query": "<seniority> <role> <key skills> <location?>", "numResults": 25, "category": "linkedin profile"}
   ```
2. **Exa GitHub search** — primary capability signal
   ```json
   {"query": "<key skills/frameworks> <domain>", "numResults": 25, "category": "github"}
   ```
3. **Exa personal site search** — finds engineers who write (a strong positive signal)
   ```json
   {"query": "<role> <skills> blog", "numResults": 15, "category": "personal site"}
   ```
4. **Apollo `/mixed_people/api_search`** (FREE) — universe scan, see which orgs have these titles in this region
   ```json
   {"person_titles": ["<Title 1>", "<Title 2>"], "person_locations": [<location>], "per_page": 25}
   ```
5. **Tomba `/v1/domain-search`** ($0.01 each) — only when the recruiter named target companies; one call per company returns up to 50 verified-email candidates in the engineering department
   ```bash
   awal x402 pay 'https://x402.orth.sh/tomba/v1/domain-search?domain=stripe.com&company=Stripe&department=engineering&limit=50' -X GET --json
   ```

Aim for **60–100 raw hits**. Total sourcing cost ~$0.03–$0.10.

### Filtering signals (drop these)

- LinkedIn profiles with no listed work history or <2 years total experience (when sourcing senior+)
- GitHub accounts with no commits in the last 18 months and no pinned repos
- Personal sites that haven't been touched since 2021
- Apollo hits whose `title` is wildly off (e.g. you searched "ML engineer", got "ML manager") — keep adjacency only if seniority matches

### Ranking signals (weight ~)

| Signal | Weight | Source |
|--------|--------|--------|
| Recent (≤12mo) commits in directly relevant repos | 3 | Exa GitHub + `contents` on top repo |
| Public writing on the exact problem domain | 2.5 | Exa personal site + `contents` on top post |
| Tenure at a recognized company doing similar work | 2 | Apollo `/people/match` |
| Conference talks, meaningful OSS maintainership | 2 | Exa search + Serper news |
| Adjacent stack (e.g. Go when you wanted Rust) | 0.5–1 | LinkedIn / GitHub |
| Years of experience in range | 1 | Apollo `/people/match` employment_history |

### Enrichment pass

For the **top 20** by ranking, run in parallel batches of 5–10:

1. **Apollo `/people/match`** ($0.01) with `linkedin_url` + `reveal_personal_emails: true` → verified business email, full profile, current title, organization with domain, seniority, employment_history
2. If `email` came back null → **Tomba `/v1/linkedin?url=...`** ($0.01) as backup
3. If still no email → cache the company's email pattern with **Tomba `/v1/email-format?domain=...`** ($0.01 once per unique company), construct from top pattern, then verify with **Tomba `/v1/email-verifier`** ($0.01)
4. If still no `result === "deliverable"` → mark "LinkedIn only — recruiter to InMail"
5. **Exa `/contents`** ($0.002) on the candidate's LinkedIn URL → headline, full work history, recent activity, GitHub link if present
6. **Exa `/contents`** ($0.002) on the candidate's top GitHub repo → 1-line "what they build" summary

Per-candidate enrichment cost: $0.014 typical, up to $0.04 with full email fallback chain.

For the **top 5** only:

7. **Serper `/news`** ($0.04) → conference talks, quotes, recent moves
8. **Apollo `/organizations/enrich`** ($0.01) on the candidate's current company if firmographics matter to the brief

### Tech-specific gotchas

- **Recency over prestige**: a recent contributor to a relevant OSS project beats an ex-FAANG engineer who hasn't shipped in 3 years.
- **GitHub != real code**: lots of orgs do private work. Treat sparse GitHub as neutral, not negative, for senior+ candidates with strong employer signals.
- **Exa LinkedIn titles often contain the current employer**: format is `"Full Name - Role @ Company"`. Parse the title before paying for `/contents`.
- **`exa/contents` on LinkedIn URLs** returns the full profile in markdown including work history, skills, and recent posts — often everything you need without calling Apollo for non-email fields.

---

## GTM

### Sourcing call sequence

For GTM roles (AE, SDR, marketing, BD, CSM, RevOps, partnerships), Apollo's structured filters are the precision tool. Apollo `/mixed_people/api_search` is FREE — use it generously.

Run **in parallel**:

1. **Apollo `/mixed_people/api_search`** (FREE) — primary universe scan
   ```json
   {"person_titles": ["<Title 1>", "<Title 2>"], "person_seniorities": ["senior"], "person_locations": [<location>], "per_page": 50}
   ```

2. **Apollo `/mixed_people/api_search`** (FREE) — second pass with industry/employee filters
   ```json
   {"person_titles": ["<Title>"], "organization_num_employees_ranges": ["100,500", "500,1000"], "person_locations": [<location>], "per_page": 50}
   ```

3. **Exa LinkedIn profile search** ($0.01) — catches founders/advisors and people not yet in Apollo
   ```json
   {"query": "<title> <industry/company-type> <location>", "numResults": 15, "category": "linkedin profile"}
   ```

4. **Tomba `/v1/domain-search`** ($0.01 each) — only when the recruiter named target companies; one call per company returns up to 50 verified-email candidates in the sales department
   ```bash
   awal x402 pay 'https://x402.orth.sh/tomba/v1/domain-search?domain=stripe.com&company=Stripe&department=sales&limit=50' -X GET --json
   ```

Aim for **80–120 raw hits**. Total sourcing cost ~$0.01–$0.10 (most calls are free; only pay when scoping to target companies).

### Filtering signals (drop these)

- Current title doesn't match the seniority (e.g. searched "enterprise AE", got "BDR")
- Tenure < 12 months at current role AND < 18 months at previous role (job-hopper unless brief calls for it)
- Wrong industry segment when industry is in the must-haves
- Location mismatch (no "Remote" tag and wrong city)

### Ranking signals (weight ~)

| Signal | Weight | Source |
|--------|--------|--------|
| Title progression at peer companies (proxies for closed enterprise deals) | 3 | Apollo `/people/match` employment_history |
| Tenure ≥ 2 years at most recent role | 2 | Apollo `/people/match` |
| Worked at a recognized peer / target-list company | 2 | Apollo `/people/match` employment_history |
| Title progression upward over career | 1.5 | Apollo `/people/match` |
| Adjacent industry (e.g. cybersecurity when you wanted devtools) | 1 | Apollo `/organizations/enrich` on current company |
| Education / pedigree (only if recruiter flagged it) | 0.5 | Apollo `/people/match` employment_history |

### Enrichment pass

For the **top 20** (after free search results are deduped and filtered):

1. **Apollo `/people/match`** ($0.01) using each candidate's `id` from the free search → verified business email + full profile in one call
2. If `email` came back null → **Tomba `/v1/linkedin`** ($0.01) using the linkedin_url from Apollo's response
3. If still no email → cache pattern via **Tomba `/v1/email-format?domain=...`** ($0.01 once per unique company), construct, verify with **Tomba `/v1/email-verifier`** ($0.01)
4. If no deliverable email → mark "LinkedIn only — recruiter to InMail"

Per-candidate enrichment cost: $0.01 typical, $0.03 with full Tomba fallback chain.

For the **top 5**:

5. **Serper `/news`** ($0.04) — quotes, recent moves, industry mentions
6. **Apollo `/organizations/enrich`** ($0.01) on each candidate's current employer if firmographics enrich the report (headcount, funding stage, growth)

### GTM-specific gotchas

- **Title inflation is real**: an "AE" at a 50-person startup may be doing SDR work; a "BDR" at a $1B public co may be ramping for enterprise AE. Look at company stage (from `/people/match` `organization` data), not just the title string.
- **Use `person_seniorities`** in Apollo search to filter out junior-titled-but-junior people (e.g. when you want "senior" AEs, pass `person_seniorities: ["senior"]` so you don't get ramping ICs at small startups).
- **Apollo `/mixed_people/api_search` is free** — don't be conservative with it. Run multiple variants (different seniorities, employee-count ranges, title synonyms) and dedupe.
- **Tomba `/v1/email-format` is your batch-pattern unlock** — call once per unique company to get the dominant email pattern (e.g. Stripe is 64% `{first}@stripe.com`), then construct + verify. Beats blind 3-pattern guess+verify by ~3x on cost.
