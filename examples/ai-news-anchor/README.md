# ai-news-anchor

Research any topic using credible news sources (BBC, CNN, Reuters, AP) and generate a polished 60-second audio news segment with a professional anchor voice. Outputs an MP3 file plus a script saved to `data/` for reference.

## Install

```bash
npx skills add Must-be-Ash/ai-news-anchor
```

## How it pays

- **Perplexity search** via MPP on the Tempo chain
- **ElevenLabs TTS** via x402 (~$0.013 USDC on Base per generation)

Both settle automatically from your [awal](https://www.npmjs.com/package/awal) agent wallet — no API keys.

## Usage

In Claude Code, ask:

> "Make a news segment about the AI chip shortage."

Or any of these triggers: "create a news clip about", "audio news briefing", "research and read", "news anchor", "record a news report on", "turn this into a news report".

## Layout

```
plugins/ai-news-anchor/skills/ai-news-anchor/
├── SKILL.md                  # The program — numbered workflow
├── references/endpoints.md   # x402 + MPP endpoint catalog
├── assets/output-template.md # MP3 + script output structure
└── data/                     # Saved scripts per run
```
