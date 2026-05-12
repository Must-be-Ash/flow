# PostalForm API Reference

## Endpoints

| Action | Method | URL |
|--------|--------|-----|
| Validate order | POST | `https://postalform.com/api/machine/orders/validate` |
| Create & pay | POST | `https://postalform.com/api/machine/orders` |
| Poll status | GET | `https://postalform.com/api/machine/orders/:id` |

All endpoints use x402 payment protocol. Call via:
```bash
npx awal@latest x402 pay '<url>' -X POST -d '<json>' --json
```

## Letter order payload

```json
{
  "request_id": "<uuid-v4>",
  "buyer_name": "Sender Name",
  "buyer_email": "sender@example.com",
  "pdf": "https://example.com/document.pdf",
  "file_name": "letter.pdf",
  "sender_name": "Sender Name",
  "sender_address_type": "Manual",
  "sender_address_manual": {
    "line1": "123 Main St",
    "line2": "Apt 4",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102"
  },
  "recipient_name": "Recipient Name",
  "recipient_address_type": "Manual",
  "recipient_address_manual": {
    "line1": "456 Oak Ave",
    "line2": "",
    "city": "Oakland",
    "state": "CA",
    "zip": "94618"
  },
  "double_sided": true,
  "color": false,
  "mail_class": "standard",
  "certified": false
}
```

## Postcard order payload

```json
{
  "request_id": "<uuid-v4>",
  "buyer_name": "Sender Name",
  "buyer_email": "sender@example.com",
  "pdf": "https://example.com/postcard.pdf",
  "file_name": "postcard.pdf",
  "mailpiece_type": "postcard",
  "postcard_size": "6x9",
  "sender_name": "Sender Name",
  "sender_address_type": "Manual",
  "sender_address_manual": {
    "line1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102"
  },
  "recipient_name": "Recipient Name",
  "recipient_address_type": "Manual",
  "recipient_address_manual": {
    "line1": "456 Oak Ave",
    "city": "Oakland",
    "state": "CA",
    "zip": "94618"
  }
}
```

Postcard sizes: `4x6`, `6x9`, `11x6`

Postcard PDF: 2-page format. Page 1 = artwork side. Page 2 = mailing side. Do NOT include sender/recipient addresses, indicia, or barcodes — PostalForm fills those automatically.

Postcards are always normalized to: `color=true`, `double_sided=true`, `mail_class="standard"`, `certified=false`.

## PDF field formats

**URL string:**
```json
"pdf": "https://example.com/document.pdf"
```

**Download URL with file ID:**
```json
"pdf": {
  "download_url": "https://example.com/file.pdf",
  "file_id": "file_abc123"
}
```

**Base64 data URI (for local files):**
```json
"pdf": "data:application/pdf;base64,JVBERi0xLjQK..."
```

**Upload token:**
```json
"pdf": {
  "upload_token": "tok_..."
}
```

## Bulk (text auto-generation)

When the user types a text message instead of providing a PDF, use the bulk endpoint with a single-row CSV. This leverages PostalForm's server-side HTML-to-PDF rendering.

The same `/api/machine/orders` endpoint is used — add a `bulk` object and omit `recipient_name` and recipient address fields (they come from the CSV).

```json
{
  "request_id": "<uuid-v4>",
  "buyer_name": "Sender Name",
  "buyer_email": "sender@example.com",
  "sender_name": "Sender Name",
  "sender_address_type": "Manual",
  "sender_address_manual": {
    "line1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102"
  },
  "bulk": {
    "csv_content": "recipient_name,line1,line2,city,state,zip\nJane Doe,100 Main St,,Springfield,IL,62701",
    "content_mode": "html",
    "template_html": "<html><body style=\"font-family:Georgia,serif;font-size:12pt;margin:1in;\"><p>April 24, 2026</p><p>Dear Dan,</p><p>Your message here.</p><p>Sincerely,<br>Sender Name</p></body></html>"
  },
  "double_sided": false,
  "color": false,
  "mail_class": "standard",
  "certified": false
}
```

### Content modes

| Mode | Required field | Description |
|------|---------------|-------------|
| `"html"` | `template_html` | HTML string rendered to PDF by PostalForm |
| `"text"` | `template_text` | Plain text rendered to PDF by PostalForm |
| `"pdf"` | `pdf` field | Use uploaded/linked PDF for all recipients |

### CSV requirements

Mandatory columns: `line1`, `city`, `state`, `zip`

Optional columns: `line2`, `recipient_name`

For single-recipient auto-generation, the CSV has exactly one data row.

### Merge fields

Additional CSV columns become merge-field variables usable in `template_html` or `template_text` with `{{column_name}}` syntax.

## Address rules

- `state`: 2-letter US abbreviation (CA, NY, IL, etc.) — applies to **recipient** address only
- `zip`: 5-digit (94102) or ZIP+4 (94102-1234) — applies to **recipient** address only
- `line2`: optional (apartment, suite, unit)
- **Recipient** must be a US address — PostalForm delivers domestically only
- **Sender/return address** can be any address worldwide — no US format restrictions
- Do NOT mix Loqate ID and manual address for the same party

## Response: successful order (202)

```json
{
  "order_id": "ord_...",
  "request_id": "<your-uuid>",
  "is_paid": true,
  "current_step": "processing",
  "order_complete_url": "https://postalform.com/orders/..."
}
```

For bulk orders, response includes `campaign_url` for per-recipient tracking.

## Response: validation error (422)

```json
{
  "error": "invalid_request",
  "errors": [
    {
      "path": "recipient_address_manual.state",
      "message": "must be a 2-letter US state code",
      "fix": "Use 'CA' instead of 'California'"
    }
  ]
}
```

## Response: payment required (402)

Handled automatically by `npx awal@latest x402 pay`. The awal CLI completes the x402 handshake (receive 402 → create payment → retry with signature).

## Response: conflict (409)

Same `request_id` sent with different payload. Generate a new UUID and retry.

## Status polling

```bash
npx awal@latest x402 pay 'https://postalform.com/api/machine/orders/<order_id>' -X GET --json
```

Returns current fulfillment step and tracking metadata.
