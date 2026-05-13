# Example workflows

Drop-in workflow templates you can open in Flow.

| File | What it does |
|------|--------------|
| `ai-news-anchor.json` | Researches a topic via credible news sources (BBC, CNN, Reuters, AP) and produces a 60-second audio news segment in a professional anchor voice. |
| `headlines.json` | Fetches hard news from BBC, NYT, Guardian, and Al Jazeera RSS feeds + Exa neural search (whitelisted outlets only), deduplicates via a seen-log, and reads headlines aloud via macOS say. ~$0.01/run. |
| `news-clip-maker.json` | Searches the latest news on a topic, writes a short script, and generates a 6-second video clip. |
| `mail-skill.json` | Sends physical mail (letters and postcards) in the US via PostalForm. Supports user PDFs, auto-generated letters from text, and AI-generated postcard artwork. |
| `recruit-skill.json` | Sources candidate shortlists for a recruiter via parallel Apollo + Exa calls, enriches the top 20 with verified emails (Apollo /people/match + Tomba fallback), and writes a ranked markdown report. |
| `tech-pulse.json` | Builder intelligence briefing — scans Twitter/X, Exa, HN, and GitHub for YC launches, funding signals, technique discoveries, and ecosystem shifts. Outputs a ranked text briefing + ElevenLabs audio narration. ~$0.06/run, no API keys. |
| `world-pulse.json` | Science, space, health breakthroughs + high-impact economy + major disasters — no politics, no conflict. Three Exa sweeps + free RSS feeds + ElevenLabs TTS narration. ~$0.07/run, no API keys. |

## How they get loaded

**On first launch**, Flow auto-seeds these examples into your local `.flow/workflows/` directory so a fresh clone shows them in the workflow switcher with no setup. Seeding only happens once — the very first time `.flow/workflows/` is created. If you later delete one of the seeded workflows, it won't reappear.

**To install manually** (or to re-add after deleting), copy the file in and refresh the app:

```bash
cp examples/workflows/ai-news-anchor.json .flow/workflows/
cp examples/workflows/headlines.json .flow/workflows/
cp examples/workflows/news-clip-maker.json .flow/workflows/
cp examples/workflows/mail-skill.json .flow/workflows/
cp examples/workflows/recruit-skill.json .flow/workflows/
cp examples/workflows/tech-pulse.json .flow/workflows/
cp examples/workflows/world-pulse.json .flow/workflows/
```

Open the workflow, tweak the nodes, and export it as a Claude Code skill bundle.
