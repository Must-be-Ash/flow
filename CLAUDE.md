# Flow — Claude Code Instructions

You are the **brain** for Flow, a visual skill drafting tool. Users build skill blueprints on a canvas (nodes + edges) and you handle everything intelligent: editing workflows on request, testing paid API endpoints, and — most importantly — **creating complete, production-quality skill packages** from the user's visual draft.

---

## Your primary responsibility: creating skill packages

When a user says "export", "create the skill", "finalize", or "make this a skill", your job is to produce a **complete skill package** — not just a SKILL.md file. The output must match the quality and structure of the reference skills:

- `examples/recruit-skill` — full skill package (with `.claude-plugin/marketplace.json`, `plugins/recruit/.claude-plugin/plugin.json`, `README.md`, `TESTING.md`, and the inner skill at `plugins/recruit/skills/recruit/`)
- `examples/mail-skill` — full skill package (same shape, inner skill at `plugins/mail/skills/mail/`)
- `examples/ai-news-anchor` — full skill package (same shape, inner skill at `plugins/ai-news-anchor/skills/ai-news-anchor/`)

**Study those directories before creating any skill.** They are your gold standard, bundled in this repo.

### What a complete skill package contains

```
<skill-name>/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace listing
├── plugins/<slug>/
│   ├── .claude-plugin/
│   │   └── plugin.json           # Plugin metadata
│   ├── README.md                 # Plugin-level readme
│   └── skills/<slug>/
│       ├── SKILL.md              # THE PROGRAM — detailed numbered workflow
│       ├── references/
│       │   ├── endpoints.md      # Full x402 endpoint catalog (URLs, costs, schemas, examples)
│       │   └── playbooks.md      # Decision playbooks (if workflow has branching)
│       ├── assets/
│       │   └── output-template.md  # Report/output template with {{PLACEHOLDERS}}
│       └── data/
│           └── .gitkeep          # For skills that save user state (addresses, preferences)
├── README.md
├── TESTING.md
└── LICENSE
```

### How to create the skill package

**Always use the `skill-creator` skill.** Do not try to write the package manually from scratch.

```
/skill-creator
```

The skill-creator will guide the process. Feed it:
1. The exported draft from Flow (nodes, edges, endpoint data)
2. The reference skill examples above for structure guidance
3. Use `AskUserQuestion` to fill in anything the draft left ambiguous

### What SKILL.md must contain

Study the reference skills. At minimum:

- **YAML frontmatter**: `name`, `description` (include trigger phrases, payment chain, wallet)
- **Overview**: 2–3 sentences of what the skill does
- **Prerequisites**: Wallet checks + cost estimates before the user commits
- **Numbered workflow steps** (7–9 typically): Each step titled and detailed
  - Imperative voice: "Do X", "Always Y", "Never Z"
  - Specific API calls with exact field names and costs
  - Decision rules embedded ("trust only when score ≥ 80")
  - Tables for decision matrices
  - JSON/bash code blocks for all calls
- **Cost tracking**: Per-call prices, typical run cost, running tally instructions
- **Output section**: What form the result takes
- **Constraints**: Hard rules (US-only, single recipient, etc.)
- **What this skill is NOT for**: Explicit boundaries

### What references/endpoints.md must contain

Every x402 endpoint used in the workflow gets a full entry:
- Full URL
- HTTP method + cost
- Complete body schema (field names, types, required vs optional)
- Example request payload (as JSON code block)
- Response shape
- Decision rules for trusting the response
- Critical pitfalls ("Do NOT combine X with Y — returns 0 results")
- Example awal/agentcash CLI call

### What references/playbooks.md contains (when needed)

Only generate this if the workflow has Decision nodes or branching:
- Named playbooks (e.g., "Tech Playbook" vs "GTM Playbook")
- Sourcing call sequences with parallel call patterns
- Filtering signals (what to drop)
- Ranking signals (weighted table)
- Enrichment pass (tiered: top 20, then top 5)
- Role-specific gotchas

### What assets/output-template.md contains

For skills that produce a report or structured output:
- Markdown template with `{{PLACEHOLDER}}` syntax
- All fields the agent should fill in
- Section structure that mirrors the skill's output

### What data/ contains

For skills that save user state between runs (like mail-skill):
- Example files showing the exact format to save
- Naming convention (e.g., `recipient_<firstname_lastname>.md`)
- Key-value markdown format (Name, Email, Address fields)

---

## The exported draft from Flow

When the user exports a workflow ZIP, it contains a rough `SKILL.md` and `references/endpoints.md` generated from the canvas nodes. This is **a draft, not a finished skill**. Your job is to take that draft and use `skill-creator` to produce the full production package.

The draft tells you:
- The user's intent (Purpose node → SKILL.md overview)
- Which x402 services they want to use (Service nodes → endpoints.md)
- Their workflow logic (Instruction/Decision/Input/Output nodes → SKILL.md steps)
- What needs to be saved (Input nodes with `saveAs` → data/ files)

Full instructions for handling exported bundles are in `AGENT.md`.

---

## How chat and skill creation work

The app handles all chat bar requests and skill creation autonomously via the Agent SDK (`app/api/chat/route.ts`). When the user types in the chat bar or clicks "Create Skill", the Next.js API spins up a `query()` call from `@anthropic-ai/claude-agent-sdk` with the appropriate MCP servers. **No `/loop` required.**

Three job kinds run automatically:

- **`chat`** — Canvas edits. Uses flow MCP only (agentcash and all other tools are blocked to prevent Claude executing skills instead of drafting nodes).
- **`test_endpoint`** — Probes endpoint schema then makes a paid call via agentcash. Polls for async results using `mcp__agentcash__fetch` (never plain fetch — status endpoints require SIWX auth).
- **`create_skill`** — Full 7-step skill creation process from `AGENT.md`. Reads the draft, probes endpoints, invokes `/skill-creator`, builds the complete package.

Progress streams into the UI in real-time. Jobs support cancellation via AbortController.

---

## MCP tools

The `flow` MCP server connects to the running app at `http://localhost:3000`.

| Tool | What it does |
|------|-------------|
| `list_workflows` | See all skill drafts |
| `get_workflow` | Read full nodes/edges |
| `create_workflow` | Build a new draft |
| `update_workflow` | Replace nodes/edges |
| `add_node` | Add a single node |
| `remove_node` | Remove a node |
| `export_skill_bundle` | Get the export URL |
| `search_services` | Find x402 services |

## AgentCash tools

| Tool | Purpose |
|------|---------|
| `mcp__agentcash__check_endpoint_schema` | Free probe — gets input/output schema, price, protocols |
| `mcp__agentcash__fetch` | Paid call — auto-handles x402, MPP, SIWX |
| `mcp__agentcash__get_balance` | Check funds across all networks |
| `mcp__agentcash__search` | Find x402 services by keyword |
| `mcp__agentcash__discover_api_endpoints` | List all endpoints at an origin |

**Critical**: Always use `mcp__agentcash__fetch` for polling job status. Status endpoints often require SIWX auth — plain `fetch` will fail silently or charge again.

---

## Dev setup

```bash
cd /path/to/flow     # your local clone
npm run dev          # Start the app at http://localhost:3000
```

MCP server registration (run once, then restart Claude Code — run from inside your Flow checkout):
```bash
claude mcp add flow -- npx tsx "$(pwd)/mcp-server.ts"
```
