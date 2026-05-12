# Endpoint Reference — AI News Anchor

## Perplexity Search

**URL**: `https://perplexity.mpp.paywithlocus.com/perplexity/search`  
**Method**: POST  
**Protocol**: MPP (Tempo chain)  
**Price**: Variable (typically $0.005–$0.03 per call)  
**Auth**: Handled automatically by `mcp__agentcash__fetch`

### Request body

```json
{
  "query": "SpaceX Starship launch latest news",
  "max_results": 8,
  "search_recency_filter": "week",
  "search_domain_filter": "bbc.com,reuters.com,apnews.com,cnn.com,theguardian.com,nytimes.com"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | ✅ | The search query — make it specific |
| `max_results` | number | no | 1–20, use 8 for news anchor |
| `search_recency_filter` | string | no | `'hour'` `'day'` `'week'` `'month'` `'year'` — always use `'week'` |
| `search_domain_filter` | string | no | Comma-separated domains (max 20) |
| `search_language_filter` | string | no | ISO 639-1 code (e.g. `'en'`) |
| `search_after_date_filter` | string | no | `'MM/DD/YYYY'` |
| `search_before_date_filter` | string | no | `'MM/DD/YYYY'` |
| `country` | string | no | ISO 3166-1 alpha-2 (e.g. `'us'`) |

### Example call

```python
result = mcp__agentcash__fetch(
    url="https://perplexity.mpp.paywithlocus.com/perplexity/search",
    method="POST",
    body={
        "query": "EU AI Act enforcement 2025",
        "max_results": 8,
        "search_recency_filter": "week",
        "search_domain_filter": "bbc.com,reuters.com,apnews.com,cnn.com,theguardian.com,nytimes.com"
    },
    paymentNetwork="tempo",
    paymentProtocol="mpp"
)
```

### Response shape

```json
{
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "content": "...",
      "score": 0.92,
      "published_date": "2025-05-10"
    }
  ],
  "query": "...",
  "search_context_size": "medium"
}
```

### Decision rules

- If `results` is empty or all results are irrelevant: **stop and ask user to refine topic**
- Use `content` field for facts, `url` for attribution
- Prefer results with a `published_date` within the last 7 days
- If a result's domain is not in the filter list, treat it as lower confidence

### Critical pitfalls

- Do NOT set `search_domain_filter` to social media domains — this skill is news-only
- `search_recency_filter: "hour"` may return no results for slow-moving topics — fall back to `"day"` if needed

---

## ElevenLabs TTS

**URL**: `https://x402helper.xyz/v1/tools/text-to-speech`  
**Method**: POST  
**Protocol**: x402  
**Price**: **$0.013 USDC fixed** (Base chain)  
**Auth**: Handled automatically by `mcp__agentcash__fetch`

### Request body

```json
{
  "text": "Breaking news from Brussels tonight. The European Union has..."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `text` | string | ✅ | The script to convert — **must be ≤160 words** |

### Example call

```python
result = mcp__agentcash__fetch(
    url="https://x402helper.xyz/v1/tools/text-to-speech",
    method="POST",
    body={"text": script_text},
    paymentNetwork="base",
    paymentProtocol="x402",
    maxAmount=0.02
)
```

### Response shape

The response contains a base64-encoded MP3. The exact key may vary — check for:

```json
{ "audio": "<base64-string>" }
```
or
```json
{ "audio_base64": "<base64-string>", "format": "mp3" }
```

Use `result.get('audio') or result.get('audio_base64')` to handle both.

### Decision rules

- If the response key is neither `audio` nor `audio_base64`, log the full response keys and stop — do not try to guess
- If the call returns a 402 error (payment required), verify agentcash has Base USDC balance
- If the response is empty or malformed, do NOT retry automatically — report to user

### Critical pitfalls

- **160-word limit is hard** — TTS will truncate or error on longer input. Count words before calling.
- The endpoint returns base64, not a file URL — you must decode it yourself (see SKILL.md Step 6)
- Do NOT call this endpoint if Perplexity returned no useful results

---

## Decoding and saving the MP3

```python
import base64, os, datetime, re

def save_mp3(audio_b64: str, topic: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', topic.lower()).strip('-')
    date = datetime.date.today().strftime('%Y%m%d')
    path = os.path.expanduser(f"~/news-anchor-{slug}-{date}.mp3")
    with open(path, 'wb') as f:
        f.write(base64.b64decode(audio_b64))
    return path
```
