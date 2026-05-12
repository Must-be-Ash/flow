# mail-skill

Send physical mail (letters and postcards) in the US via [PostalForm](https://postalform.com) — payments settle automatically in USDC on Base from the user's [awal](https://www.npmjs.com/package/awal) agent wallet.

## Install

```bash
npx skills add Must-be-Ash/mail-skill
```

## Prerequisites

1. **awal agent wallet** — install wallet skills first:
   ```bash
   npx skills add coinbase/agentic-wallet-skills
   ```
   This ships `authenticate-wallet` and `fund` skills.

2. **Authenticate** — confirm wallet is ready:
   ```bash
   npx awal@latest status
   ```

3. **Fund** — ensure ≥ $1 USDC balance:
   ```bash
   npx awal@latest balance
   ```

## Usage

Just say what you want to mail:

- "Mail this PDF to Jane Doe at 100 Main St, Springfield IL 62701"
- "Send a postcard to Mom"
- "Generate a sunset beach postcard and mail it to Mom"
- "Write a thank-you letter to my landlord and mail it"
- "/mail"

## What it supports

| Feature | Details |
|---------|---------|
| **Letters** | Standard, priority, express. Color or B&W. Certified available. |
| **Postcards** | 4x6, 6x9, or 11x6. Provide artwork or generate with AI. |
| **AI image gen** | No artwork? Describe what you want — recraft-v3 generates it via x402 ($0.04). |
| **PDF upload** | Provide a URL or local file path. |
| **Auto-generate** | Type your message — PostalForm renders it to a printed letter. |
| **Address memory** | Sender address saved on first use. Recipient addresses remembered by name. |
| **US recipient** | Recipient must be in the US. Sender can be anywhere. |

## How it works

1. You tell the agent what to mail and to whom
2. Agent confirms recipient address (checks memory for known contacts)
3. Agent uses your saved sender address (or asks on first use)
4. Order is validated, then sent via PostalForm's x402 endpoint
5. USDC payment settles automatically on Base via awal
6. Agent reports order status and saves new addresses for next time

## Cost

PostalForm sets pricing via x402. Typical costs: ~$1-3 USDC per letter or postcard depending on mail class and options. AI image generation adds $0.04 USDC per image.

## Skill contents

```
plugins/mail/skills/mail/
├── SKILL.md                        # Workflow and instructions
└── references/
    ├── postalform-api.md           # Endpoint payloads and API details
    └── image-generation.md         # recraft-v3 image generation and image-to-PDF conversion
```

## License

MIT
