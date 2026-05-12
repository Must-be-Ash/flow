---
name: mail
description: >-
  Send physical mail (letters and postcards) in the US via PostalForm using x402
  USDC payments on Base from the awal agent wallet. Use when the user asks to
  send mail, post a letter, mail a document, send a postcard, mail a PDF, send
  physical mail, or "mail it to [someone]". Supports user-provided PDFs,
  auto-generation from text, and AI image generation for postcards via recraft-v3
  on fal.ai (paid with x402). Recipient must be in the US. Single recipient per send.
---

## Prerequisites

Before any mail operation, verify wallet readiness:

```bash
npx awal@latest status              # must show authenticated
npx awal@latest balance --chain base  # need ≥ $1 USDC on Base
```

- Not authenticated → run the `authenticate-wallet` skill
- Insufficient funds → run the `fund` skill
- No awal installed → direct user to https://docs.cdp.coinbase.com/agentic-wallet/welcome and `npx skills add coinbase/agentic-wallet-skills`

## Workflow

### 1. Determine mail type

Ask the user: letter or postcard?

| Type | Description |
|------|-------------|
| **Letter** | Printed document in an envelope. Supports color, double-sided, certified. |
| **Postcard** | 4x6, 6x9, or 11x6. Always color, double-sided, standard class. |

### 2. Gather content

Four content modes:

**A. User provides PDF URL** — pass directly in `pdf` field as URL string or `{ "download_url": "<url>" }`.

**B. User provides local PDF file** — read file, base64-encode, pass as `"data:application/pdf;base64,<data>"`.

**C. User types a text message (auto-generate letter)** — use the **bulk endpoint** with a single-row CSV. Wrap the user's message in a clean HTML letter template:

```html
<html><body style="font-family:Georgia,serif;font-size:12pt;margin:1in;">
<p>[date]</p>
<p>[message body — preserve paragraphs]</p>
<p>[sender name]</p>
</body></html>
```

Set `content_mode: "html"` and `template_html` to the rendered HTML. See `references/postalform-api.md` § Bulk (text auto-generation).

**D. AI-generated postcard image** — if the user wants a postcard but has no artwork, generate it using recraft-v3 via fal.ai ($0.04/image). The user just describes what they want — the agent handles all technical details automatically. See `references/image-generation.md` for the full flow.

Key rules the agent MUST follow:
- **Default aesthetic direction**: if the user describes a subject/message without specifying a visual style, bring your own creative direction — aim for a charming hand-drawn doodle aesthetic (clean ink lines, light watercolor, white background, full character visible, simple composition). Translate this into appropriate prompt language yourself; don't paste a fixed string. If the user specifies a style (e.g. "watercolour", "sci-fi neon", "anime"), pass their words through untouched — do not add or override anything.
- **Never** include words like "card", "postcard", "greeting card", "mockup", "envelope", "frame" in the image prompt — these cause the model to generate a photo OF a card instead of the flat artwork
- **Quote sign text explicitly**: use `holding a sign with the text "X" written clearly and completely` to ensure names and phrases render fully
- Always set `"style": "digital_illustration"` in the request body
- Auto-map postcard size to image dimensions: 4x6/6x9 → `1800x1200`, 11x6 → `2200x1200`

Flow:
1. Transform user's prompt (strip card-related words, apply default aesthetic if no style specified)
2. Generate via `npx awal@latest x402 pay 'https://fal.x402.paysponge.com/fal-ai/recraft-v3' -X POST -d '<json>' --json`
3. Wait ~6 seconds, then poll via `npx awal@latest x402 pay 'https://fal.x402.paysponge.com/fal-ai/recraft-v3/requests/<request_id>' -X GET --json` (free — amount is 0). Repeat every 3s if still IN_QUEUE.
4. Download image to `~/Downloads/postcard-artwork.webp` immediately — then **read the file with the Read tool** so it appears inline in the conversation. Do not wait for the user to ask. Do not just share the URL.
5. Ask the user to confirm: *"Here's the generated artwork. Want to use this for your postcard, or would you like me to generate a new one?"*
6. If the user wants a new image → go back to step 1 (costs another $0.04)
7. Once approved → convert to 2-page postcard PDF (Python + Pillow), base64-encode, pass to PostalForm

For **postcards**: PostalForm expects a 2-page PDF (page 1 = artwork, page 2 = mailing side). PostalForm fills addresses/indicia automatically — do NOT include addresses in the PDF.

### 3. Get recipient

- **List** all files in the skill's local `data/` directory (e.g. `ls data/`) to see saved recipients. Recipient files are named `data/recipient_<firstname_lastname>.md`. Do NOT use glob patterns to search — always list the directory contents first, then match the user's recipient name against the filenames.
- If a saved recipient matches, **read** that file to get the full address, then confirm: "Send to [Name] at [Address]?"
- If no saved recipient matches: ask for full name, street address (line1, line2), city, state (2-letter), ZIP.
- **Always confirm** the recipient name and address before proceeding.
- After successful send, save new recipients to the skill's `data/` directory.

### 4. Get sender

- **Read** the skill's local `data/sender.md` directly to get the saved sender address. Do NOT use glob patterns — just read the file path.
- If found: use it silently (no need to confirm each time).
- If not found: ask for full sender name, email, and address. Save to the skill's `data/` directory after successful send.

### 5. Configure options (letters only)

| Option | Default | Values |
|--------|---------|--------|
| `mail_class` | `"standard"` | `"standard"`, `"priority"`, `"express"` |
| `color` | `false` | `true`, `false` |
| `double_sided` | `true` | `true`, `false` |
| `certified` | `false` | `true`, `false` |

Use defaults unless the user specifies otherwise. Postcards ignore these — always color, double-sided, standard, not certified.

### 6. Validate

Before payment, validate the order:

```bash
npx awal@latest x402 pay 'https://postalform.com/api/machine/orders/validate' \
  -X POST -d '<json-body>' --json
```

If validation returns errors, fix and re-validate. Show validation errors to user in plain language.

### 7. Confirm and send

Show a summary to the user:

```
Mail type:    Letter (standard, B&W)
To:           Jane Doe, 100 Main St, Springfield IL 62701
From:         [sender name + address]
Content:      [PDF URL or "auto-generated from your message"]
Est. cost:    ~$1-3 USDC (PostalForm sets price via x402)
```

Wait for user confirmation, then send:

```bash
npx awal@latest x402 pay 'https://postalform.com/api/machine/orders' \
  -X POST -d '<json-body>' --json
```

### 8. Track status

After a successful 202 response, extract `order_id` and poll:

```bash
npx awal@latest x402 pay 'https://postalform.com/api/machine/orders/<order_id>' \
  -X GET --json
```

Report the current step to the user. No need to poll repeatedly — report the initial status and let the user know they can check again later.

### 9. Save addresses

After successful send, save addresses to the skill's `data/` directory (next to `SKILL.md`). This keeps addresses available across all projects and sessions where the skill is installed.

- Save sender to `data/sender.md` if new (with name, email, full address)
- Save recipient to `data/recipient_<firstname_lastname>.md` (with name and full address)

Format for `data/sender.md`:
```markdown
Name: [name]
Email: [email]
Address: [line1], [line2], [city], [state] [zip]
```

Format for `data/recipient_<name>.md`:
```markdown
Name: [full name]
Address: [line1], [line2], [city], [state] [zip]
```

## x402 calling conventions

PostalForm uses x402 payment protocol via awal:

```bash
# POST (orders)
npx awal@latest x402 pay '<url>' -X POST -d '<json-body>' --json

# GET (status polling)
npx awal@latest x402 pay '<url>' -X GET --json
```

Rules:
- Single-quote JSON bodies and URLs to prevent shell expansion
- Do NOT pass `--max-amount`
- Output starts with a status line, then JSON — parse from first `{`
- Generate a fresh UUID v4 for each `request_id`

Image generation uses x402 via awal for both steps:

```bash
# Step 1: Generate (costs $0.04 USDC)
npx awal@latest x402 pay 'https://fal.x402.paysponge.com/fal-ai/recraft-v3' -X POST -d '<json>' --json

# Step 2: Poll for result (free — amount is 0)
npx awal@latest x402 pay 'https://fal.x402.paysponge.com/fal-ai/recraft-v3/requests/<request_id>' -X GET --json
```

## Constraints

- **Recipient must be in the US** — PostalForm delivers to US addresses only. The sender/return address can be anywhere.
- **Single recipient per send** — one letter or postcard per invocation.
- **Recipient state codes** — must be 2-letter US abbreviation (e.g., CA, NY, IL).
- **Recipient ZIP codes** — 5-digit or ZIP+4 format.
- **Sender address** — can be any address worldwide. No US format restrictions on the return address.
- **Postcards** — artwork PDF must not contain address/indicia data; PostalForm fills those automatically.
- **`buyer_email`** is required — PostalForm sends the payment receipt there.

## Reference

- PostalForm endpoint payloads, address formats, and bulk auto-generation: `references/postalform-api.md`
- AI image generation models, payloads, and image-to-PDF conversion: `references/image-generation.md`
