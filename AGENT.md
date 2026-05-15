# Flow — Agent Instructions

Flow is a visual skill drafting tool. Users build natural-language "programs" on a canvas (Purpose, Service, Instruction, Decision, Input, Output nodes) and export them as skill bundles that an LLM executes as instructions.

**You are the brain.** The app's API route (`app/api/chat/route.ts`) runs you autonomously via `@anthropic-ai/claude-agent-sdk` whenever the user types in the chat bar or clicks "Create Skill". You act on requests via MCP tools — no manual `/loop` required.

---

## MCP tools available

The `flow` MCP server connects you to the running app at `http://localhost:3000`.

| Tool | What it does |
|------|-------------|
| `list_workflows` | See all skill drafts |
| `get_workflow` | Read full nodes/edges of a draft |
| `create_workflow` | Build a new draft from scratch |
| `update_workflow` | Replace nodes/edges on an existing draft |
| `add_node` | Add a single node + auto-connect it |
| `remove_node` | Remove a node and its edges |
| `export_skill_bundle` | Get the export download URL |
| `search_services` | Find x402 services for service nodes |

---

## When the user clicks "Create Skill" (kind === "create_skill")

This is your most important job. The user has built a visual draft in Flow and wants a **complete, production-ready skill package** — not just a SKILL.md, but a full installable bundle matching the quality of the reference examples.

### Reference examples (study these first)

Before creating anything, read these in full:
- `examples/recruit-skill/recruit/` — API orchestration skill with endpoints.md + playbooks.md + report template
- `examples/mail-skill/mail/` — User-interaction skill with postalform-api.md + image-generation.md + saved addresses

These are your gold standard. The output you produce must match their quality and depth.

### Step 1 — Read the complete draft

Call `get_workflow(workflowId)` to read all nodes and edges. Understand:
- **Purpose node** → skill name, description, use cases, boundaries
- **Service nodes** → which x402 endpoints are used (origin, path, method, price)
- **Instruction nodes** → workflow steps the agent must follow
- **Decision nodes** → branching logic and options
- **Input nodes** → what the user must provide (and what to save for reuse)
- **Output nodes** → what the skill produces

### Step 2 — Ask clarifying questions

Use `AskUserQuestion` to fill in anything the draft left ambiguous. Ask about:
- Steps that need more detail (how exactly should the agent behave?)
- Error handling (what happens if an API fails or returns empty results?)
- Confirmation gates (should the agent always confirm before taking irreversible actions?)
- Data persistence (what should be saved between runs? In what format?)
- Output format (report, message, file, image shown inline?)
- Any constraints (geographic limits, single vs multiple recipients, etc.)

Do not skip this step. Ambiguity now produces a skill that fails in production.

### Step 3 — Probe each endpoint (free, no payment)

For every Service node, call `mcp__agentcash__check_endpoint_schema` on the endpoint URL. This gives you:
- Exact input schema (field names, types, required vs optional)
- Output schema (response shape)
- Price and payment protocols (x402, MPP, SIWX)
- Auth mode

Use this to write accurate endpoint documentation. Never guess field names.

### Step 4 — Create the skill using skill-creator

Invoke the `/skill-creator` skill. Feed it:
1. The workflow draft (nodes + your understanding from step 1)
2. The answers from the user (step 2)
3. The endpoint schemas (step 3)
4. The reference examples for structure guidance

### Step 5 — Build the complete package

The output must be a full directory tree. Decide which files are needed based on the workflow:

**Always required:**
- `SKILL.md` — numbered workflow (7-9 steps), YAML frontmatter with triggers, prerequisites with cost estimates, constraints, "what this is NOT for"
- `references/endpoints.md` — for each endpoint: URL, cost, full body schema with field names and types, example payload, response shape, decision rules, gotchas

**When the workflow has branching (Decision nodes):**
- `references/playbooks.md` — named playbooks per branch, sourcing sequences, filtering signals, ranking weights table, enrichment tiers

**When an endpoint has complex behaviour (polling, multi-step, creative direction):**
- `references/<endpoint-name>.md` — full dedicated reference like `postalform-api.md` or `image-generation.md`

**When the workflow produces a structured report:**
- `assets/output-template.md` — markdown template with `{{PLACEHOLDER}}` fields

**When the workflow saves state between runs:**
- `data/` directory with example files showing exact format (key-value markdown)

### Step 6 — Verify and deliver

- Verify every endpoint URL is correct by checking the AgentCash schema one more time
- Confirm the SKILL.md steps match what the user described in their draft
- Save the skill package to `~/<skill-slug>/` (full package with plugins/, README, TESTING.md, LICENSE)
- Respond to the chat with a summary of what was created and any follow-up recommendations

### Step 7 — Install the skill

Install the skill into Claude Code so it's immediately available as a slash command in any session:

```bash
cp -r ~/<skill-slug>/plugins/<skill-slug>/skills/<skill-slug>/ ~/.claude/skills/<skill-slug>/
```

For example, for `news-clip-maker`:
```bash
cp -r ~/news-clip-maker/plugins/news-clip-maker/skills/news-clip-maker/ ~/.claude/skills/news-clip-maker/
```

After copying, confirm to the user:
- The skill is installed and ready to use
- They can invoke it with `/<skill-slug>` in any new Claude Code session
- The full package is also saved at `~/<skill-slug>/` for distribution or version control

---

## Exported bundle format

```
<skill-name>/
├── .claude-plugin/marketplace.json
├── plugins/<slug>/
│   ├── .claude-plugin/plugin.json
│   └── skills/<slug>/
│       ├── SKILL.md                  # The natural-language program
│       ├── references/endpoints.md   # x402 endpoint catalog
│       ├── assets/output-template.md # Output templates (if any)
│       └── data/                     # Persistent state (if any)
├── README.md
├── TESTING.md
└── LICENSE
```

---

## AgentCash tools

Use these for endpoint verification and discovery:

- `agentcash search <query>` — find x402 services by keyword                                                                                   
- `agentcash discover <origin>` — list endpoints at an origin                                                                                  
- `agentcash check <url>` — probe endpoint schema/pricing without paying                                                                       
- `agentcash fetch <url>` — make a paid API call (handles x402/MPP payments)                                                                   
- `agentcash balance` — check wallet balance   