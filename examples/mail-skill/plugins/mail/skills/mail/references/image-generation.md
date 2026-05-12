# AI Image Generation for Postcards

Generate postcard artwork via recraft-v3 on fal.ai, paid with USDC on Base via x402.

**Model:** recraft-v3
**Endpoint:** `https://fal.x402.paysponge.com/fal-ai/recraft-v3`
**Cost:** $0.04 USDC per image

## Default aesthetic (when user gives no style direction)

When the user describes their postcard idea without specifying a visual style, bring your own creative direction to the prompt. The target aesthetic is:

**Charming hand-drawn doodle** — clean simple ink lines, light watercolor accents, white background, full character visible, cute and simple composition. Think: a character holding a sign, drawn like a friendly sketch in a notebook. Not heavily rendered, not dark or scratchy, not photo-realistic.

This is a **creative direction**, not a string to paste. Use your judgment to express this aesthetic in the prompt in whatever way best fits the subject. The goal is output that looks like it was hand-sketched with care — clean, warm, and print-friendly.

**Apply this aesthetic when** the user's description focuses on subject or message but gives no style cues:
- "a happy panda holding a sign" → you provide the aesthetic direction
- "flowers and butterflies for grandma" → you provide the aesthetic direction
- "a cat wearing a birthday hat" → you provide the aesthetic direction

**Do NOT apply this aesthetic when** the user explicitly describes a visual style — use their style as-is, untouched:
- "watercolour colourful hippie style" → their words, their style
- "futuristic sci-fi neon astronaut" → their words, their style
- "anime style cute panda" → their words, their style

When in doubt, apply the default — most users describe *what* they want, not *how* it should look.

## Prompt construction

### Rules

1. **Strip postcard/card words** — Never include: `card`, `greeting card`, `postcard`, `mockup`, `print`, `paper`, `envelope`, `frame`, `border`, `photograph`, `photo of`. These cause the model to generate an image OF a physical card instead of the artwork itself.
2. **If no style given, add aesthetic direction** — Translate the default doodle aesthetic above into appropriate prompt language for the subject. Don't mechanically paste a fixed string — craft style language that fits.
3. **Preserve the user's words exactly for the subject** — Do not add creative flourishes, extra elements, or descriptors the user didn't mention. The style language does the visual steering, not the subject.
4. **Use "sign" not "banner"** — When the user wants text on something the character is holding, always use "sign". "Banner" causes the model to generate a ribbon/streamer composition instead of a handheld sign.
5. **Quote sign text explicitly and completely** — The model can truncate text, especially names at the end of a phrase. When text needs to appear in the image, quote it explicitly: `holding a sign with the text "GET WELL SOON DAN" written clearly and completely`. The explicit quoting and "written clearly and completely" phrasing significantly improves text fidelity.

### Example transformations

| User says | Style detected? | Agent prompt (example — exact wording is yours to craft) |
|-----------|----------------|----------------------------------------------------------|
| "a happy panda holding a sign that says get well soon Dan" | No → add aesthetic direction | `"a happy panda holding a sign with the text 'GET WELL SOON DAN' written clearly and completely, hand-drawn doodle style, clean simple ink lines, light watercolor accents, white background, full character visible, cute and charming"` |
| "watercolour colourful hippie style flowers for Sarah" | Yes → pass through untouched | `"watercolour colourful hippie style flowers for Sarah"` |
| "futuristic sci-fi neon astronaut for Jake's birthday saying Happy Birthday Jake" | Yes → pass through untouched | `"futuristic sci-fi neon astronaut for Jake's birthday saying Happy Birthday Jake"` |
| "thank you with flowers" | No → add aesthetic direction | `"thank you with flowers, hand-drawn doodle style, clean simple ink lines, light watercolor accents, white background, cute and charming"` |

## Postcard size → image size mapping

Always use landscape for postcards:

| Postcard size | Image size | Aspect ratio |
|---------------|-----------|--------------|
| **4x6** | `{"width": 1800, "height": 1200}` | 3:2 landscape |
| **6x9** | `{"width": 1800, "height": 1200}` | 3:2 landscape |
| **11x6** | `{"width": 2200, "height": 1200}` | 11:6 landscape |

The user never needs to specify dimensions — the skill maps it automatically from the postcard size.

## Full flow

### Step 1: Generate image (paid)

```bash
npx awal@latest x402 pay 'https://fal.x402.paysponge.com/fal-ai/recraft-v3' \
  -X POST \
  -d '{"prompt":"<constructed prompt>","image_size":{"width":1800,"height":1200},"style":"digital_illustration"}' \
  --json
```

Response contains a `request_id` and the job is queued async:

```json
{
  "status": "IN_QUEUE",
  "request_id": "<uuid>",
  "response_url": "https://queue.fal.run/fal-ai/recraft-v3/requests/<request_id>"
}
```

### Step 2: Poll for result (free)

Polling also uses awal x402 pay via the paysponge URL — the amount is 0 so no USDC is spent:

```bash
npx awal@latest x402 pay 'https://fal.x402.paysponge.com/fal-ai/recraft-v3/requests/<request_id>' \
  -X GET --json
```

Wait ~6 seconds before first poll. If status is still `IN_QUEUE` or `IN_PROGRESS`, wait 3 seconds and poll again. Typical generation time: 6–12 seconds.

Completed response:
```json
{
  "images": [{"url": "https://v3b.fal.media/files/...", "content_type": "image/webp"}]
}
```

Extract `images[0].url`.

### Step 3: Download and show

**This step is MANDATORY and must happen immediately — do not skip it, do not wait for the user to ask.**

```bash
curl -sL '<image_url>' -o ~/Downloads/postcard-artwork.webp
```

Then immediately read `~/Downloads/postcard-artwork.webp` using the Read tool so the image appears inline in the conversation. Do not just share the URL — the user cannot see temporary cloud URLs.

After showing it, ask:

> *"Here's the generated artwork. Want to use this for your postcard, or would you like me to regenerate?"*

- If the user approves → continue to Step 4
- If the user wants changes → go back to Step 1 with an adjusted prompt (costs another $0.04)

### Step 4: Convert to 2-page postcard PDF

PostalForm postcards require a 2-page PDF: page 1 = artwork, page 2 = mailing side (blank — PostalForm fills it).

Use Python + Pillow:

```python
from PIL import Image
import sys

img = Image.open(sys.argv[1]).convert("RGB")

sizes = {"4x6": (432, 288), "6x9": (648, 432), "11x6": (792, 432)}
size = sizes.get(sys.argv[2], sizes["6x9"])

img_resized = img.resize(size, Image.LANCZOS)
blank = Image.new("RGB", size, "white")
img_resized.save(sys.argv[3], "PDF", save_all=True, append_images=[blank])
```

Run:
```bash
python3 /tmp/postcard_pdf.py ~/Downloads/postcard-artwork.webp 6x9 /tmp/postcard.pdf
```

### Step 5: Base64-encode and pass to PostalForm

```bash
base64 -i /tmp/postcard.pdf
```

Use in the PostalForm payload:
```json
"pdf": "data:application/pdf;base64,<base64-output>"
```

## Cost

$0.04 USDC per image generation (paid via x402). Polling is free. PostalForm mailing cost is ~$1–3 USDC, paid separately via x402.
