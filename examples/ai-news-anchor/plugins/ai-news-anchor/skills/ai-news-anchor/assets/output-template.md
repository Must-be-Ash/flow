# Output Template — AI News Anchor

Use this template to confirm the completed news segment to the user:

---

**News segment ready.**

- **Topic**: {{TOPIC}}
- **File**: `{{MP3_PATH}}`
- **Duration**: ~60 seconds ({{WORD_COUNT}} words)
- **Script saved**: `data/{{TOPIC_SLUG}}-{{DATE}}.md`
- **Cost**: {{PERPLEXITY_COST}} (Perplexity) + $0.013 (ElevenLabs) = **~{{TOTAL_COST}} USDC**

Open the MP3 file to listen. The script is saved in data/ for your reference.

---

## Placeholders

| Placeholder | Example |
|-------------|---------|
| `{{TOPIC}}` | EU AI Act enforcement |
| `{{MP3_PATH}}` | ~/news-anchor-eu-ai-act-enforcement-20260512.mp3 |
| `{{WORD_COUNT}}` | 147 |
| `{{TOPIC_SLUG}}` | eu-ai-act-enforcement |
| `{{DATE}}` | 20260512 |
| `{{PERPLEXITY_COST}}` | ~$0.008 |
| `{{TOTAL_COST}}` | ~$0.021 |
