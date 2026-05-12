# recruit — a Claude Code skill for x402-powered candidate sourcing

A Claude Code skill that gives an agent the ability to source candidates for a recruiter by orchestrating pay-per-call x402 endpoints (Apollo, Tomba, Exa, Hunter, Minerva, Firecrawl). Payments settle automatically in USDC on Base from the user's [awal](https://www.npmjs.com/package/awal) agent wallet.

The agent's output is a ranked, evidence-backed markdown shortlist — not raw API dumps.

## What you get

- **Tech recruiting** — Exa LinkedIn + GitHub + personal-site sourcing; Apollo via Orthogonal one-call enrichment with verified email; Tomba as backup LinkedIn → email path.
- **GTM recruiting** — free Apollo `mixed_people/api_search` for universe scan; Apollo via Orthogonal for one-call enrichment with verified email.
- **Cost transparency** — running USDC spend tally surfaced in the final report. Typical 20-candidate search: **$0.20–$0.50 USDC**.
- **Research only** — the skill does not send outreach. The recruiter handles that.

## Install

```
npx skills add Must-be-Ash/recruit-skill
```

Then start a new session and the `recruit` skill is available.

## Prerequisites

This skill requires the **awal** agent wallet. If you don't have it, install it first:

```
npx skills add coinbase/agentic-wallet-skills
```

This ships the `authenticate-wallet` and `fund` skills. Run them to set up and top up your wallet before using `recruit`.

Then confirm you're ready:

- `npx awal@latest status` — confirm authenticated
- `npx awal@latest balance` — confirm USDC > $1

## Usage

Just describe the role. Examples:

> Find me 20 staff backend engineers in NYC with strong distributed-systems chops at fintechs.

> Source enterprise AEs in Boston who've sold cybersecurity to F500 in the last 3 years.

> Build me a shortlist of 15 ML engineers shipping inference-optimization work — open-source contributors preferred.

The agent will:

1. Parse the brief (role type, seniority, location, must-haves).
2. Pick a playbook (tech vs GTM).
3. Source 60–120 raw hits in parallel (Exa for tech, free Apollo search for GTM).
4. Filter, dedupe, and rank.
5. Enrich the top 20 with one Apollo `/people/match` call each ($0.01) for verified email + full profile, with Tomba LinkedIn lookup as backup.
6. Deep-enrich the top 5 with Hunter verification, Serper news, and Minerva work history.
7. Hand back a ranked markdown report with evidence per candidate and total spend.

## What's inside the skill

```
plugins/recruit/skills/recruit/
├── SKILL.md                  # workflow + when to use
├── references/
│   ├── endpoints.md          # x402 endpoint catalog
│   └── playbooks.md          # tech vs GTM sourcing playbooks
└── assets/
    └── report-template.md    # output report structure
```

## Limitations

- **Not for outreach.** Research only.
- **Not tuned for executive search.** IC through director is the sweet spot.
- **No spending caps by default.** The skill trusts the awal wallet balance as the ceiling and reports total spend. Add `--max-amount` to individual calls if you want per-call limits.

## Maintainer notes

Endpoint testing log lives at [`TESTING.md`](TESTING.md) — what we've verified, what's broken on the server side, and how to run a fresh smoke test with `x402-fetch` + a raw key.

## Contributing

Pull requests welcome. Especially:

- New curated endpoints (must be x402, return JSON, settle on Base).
- Playbook tweaks based on real recruiter feedback.
- Better ranking heuristics.

## License

MIT
