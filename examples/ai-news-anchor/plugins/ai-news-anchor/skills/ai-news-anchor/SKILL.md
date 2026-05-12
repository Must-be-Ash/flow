---
name: ai-news-anchor
description: >-
  Research any topic using credible news sources (BBC, CNN, Reuters, AP) and generate
  a polished 60-second audio news segment with a professional anchor voice.
  Use when asked to: "make a news segment", "create a news clip about", "audio news briefing",
  "research and read", "news anchor", "record a news report on", "turn this into a news report".
  Outputs an MP3 file saved to disk + a script saved to data/ for reference.
  Payments: Perplexity search via MPP (Tempo chain) + ElevenLabs TTS via x402 ($0.013 USDC on Base).
---

# AI News Anchor

## Overview

Research a topic using real-time Perplexity search, write a 60-second broadcast-quality script,
then convert it to audio via ElevenLabs TTS. Saves MP3 to disk and script to data/.

Read `references/endpoints.md` before making any API calls — it has exact field names, schemas, and gotchas.

## Prerequisites

Check wallet balance before starting:

```bash
mcp__agentcash__get_balance
```

Typical run cost: **~$0.02–0.05 USDC** (Perplexity MPP variable + ElevenLabs $0.013 fixed).
If balance is low, run the `fund` skill.

## Workflow

### Step 1 — Get the topic

Ask the user for the news topic if not already provided. Examples:
- "AI regulation in Europe"
- "SpaceX latest Starship launch"
- "Federal Reserve interest rate decision"

Derive a slug: lowercase, hyphens, no special chars (e.g. `spacex-starship-launch`).

### Step 2 — Research with Perplexity

Call `mcp__agentcash__fetch` on the Perplexity endpoint. See `references/endpoints.md` § Perplexity.

Key rules:
- Always set `search_recency_filter: "week"` for fresh news
- Restrict to credible outlets via `search_domain_filter`: `"bbc.com,reuters.com,apnews.com,cnn.com,theguardian.com,nytimes.com"`
- Set `max_results: 8`
- **If results are empty or off-topic**: stop, tell the user, ask them to refine the topic. Do NOT proceed to TTS.

### Step 3 — Write the 60-second script

Write a professional broadcast script of **≤160 words** (hard limit — TTS will reject longer input). Structure:

1. **Opening headline** — one punchy sentence stating the news
2. **3–4 key facts** — each attributed ("According to Reuters...", "The BBC reports...")
3. **Quote or expert opinion** — one sentence if available from the research
4. **Closing summary** — one sentence wrapping up or stating what comes next

Rules:
- Authoritative, clear broadcast language — active voice, varied sentence length
- No filler words ("um", "basically", "so")
- Must sound natural when read aloud
- Count the words. If over 160, cut the lowest-value sentence.

### Step 4 — Save the script to data/

Save to `data/<topic-slug>-<YYYYMMDD>.md`:

```markdown
# <Topic>
Date: <YYYY-MM-DD>

## Script
<the full script text>

## Sources
- <source 1>
- <source 2>
```

### Step 5 — Generate audio via ElevenLabs TTS

Call `mcp__agentcash__fetch` on the ElevenLabs endpoint. See `references/endpoints.md` § ElevenLabs.

- **Do NOT call TTS if script is over 160 words or research returned no results**
- Pass the script text in the `text` field
- Response contains a base64-encoded MP3

### Step 6 — Save the MP3 to disk

Decode the base64 audio and write to disk:

```python
import base64, datetime, re, os

slug = re.sub(r'[^a-z0-9]+', '-', topic.lower()).strip('-')
date = datetime.date.today().strftime('%Y%m%d')
path = os.path.expanduser(f"~/news-anchor-{slug}-{date}.mp3")

audio_b64 = result.get('audio') or result.get('audio_base64')
with open(path, 'wb') as f:
    f.write(base64.b64decode(audio_b64))
```

Check `references/endpoints.md` § ElevenLabs for the exact response key name.

### Step 7 — Confirm to user

Use `assets/output-template.md` as the confirmation format. Report:
- Full path to the MP3 file
- Script word count
- Approximate duration (~60 seconds)
- Total cost (Perplexity price from MPP response + $0.013 ElevenLabs)

## Constraints

- **Credible sources only** — never use social media, Reddit, or blogs as primary sources
- **160-word hard limit** — never send more than 160 words to TTS
- **Stop before TTS if research fails** — never spend on empty content
- **Single topic per run** — one search query, one script, one MP3

## What this skill is NOT for

- Podcasts or long-form audio (>60 seconds)
- Opinion pieces or editorials (must be fact-based)
- Real-time breaking news (results cover the past 7 days)
