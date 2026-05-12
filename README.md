# Flow

Create Claude Code skills visually — no coding required.

Flow is a visual skill drafting tool for non-technical users. Build natural-language "programs" as connected blocks on a canvas, then export a skill bundle that Claude Code can follow as instructions.

**No code. No runtime. No API keys.** The output is plain English instructions that an LLM executes.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prerequisites

**AgentCash** — Flow uses AgentCash for x402 service discovery and payments.

```bash
# Get free credits at agentcash.dev/onboard, then:
npx agentcash onboard YOUR_CODE

# Add AgentCash MCP to Claude Code:
claude mcp add agentcash --scope user -- npx -y agentcash@latest

# Check your balance:
npx agentcash balance
```

## Create your first skill (5 minutes)

1. Open Flow — you'll see a **Purpose** node
2. Click it and describe your skill: name, description, when to use it
3. Click **+** to add nodes:
   - **Service** — search for x402 APIs (image generation, web search, email...)
   - **Instruction** — write a plain English step
   - **Decision** — add a branch point
   - **User Input** — define what the user provides
   - **Output** — define what the skill produces
4. Connect nodes with edges to show the workflow
5. Click the **Export** button to download a `.zip` skill bundle
6. Install in Claude Code: `npx skills add ./my-skill`
7. Ask Claude to run it!

## Using Claude as the brain

Flow works best with Claude Code acting as an intelligent co-creator. Claude can:

- **Edit your workflows** by reading your chat requests in real-time
- **Test paid API endpoints** — paying via AgentCash, polling for results, and rendering images/video inline
- **Create complete skill packages** from your visual draft — not just a SKILL.md, but a full installable package matching the quality of [recruit-skill](https://github.com/anthropics/recruit-skill) and [mail-skill](https://github.com/anthropics/mail-skill), including `references/endpoints.md`, `assets/output-template.md`, and `data/` for persistent state

> `CLAUDE.md` at the project root contains Claude's full role and instructions. It is loaded automatically at the start of every Claude Code session — no setup needed beyond the one-time MCP registration below.

### Step 1 — Register the MCP server (once)

```bash
claude mcp add flow -- npx tsx "$(pwd)/mcp-server.ts"
```

Restart Claude Code after running this.

### Step 2 — Start the dev server

```bash
npm run dev
```

### Step 3 — Start the brain loop

Paste this into Claude Code to activate the live chat bridge:

```
/loop At the start of each tick call cleanup_chat to remove completed messages, then call get_pending_chat to check for new requests. For each pending message handle it based on kind:

kind=chat: Call get_workflow(workflowId), understand what the user is asking, make changes with update_workflow/add_node/remove_node, then respond_to_chat with a brief summary.

kind=test_endpoint: Read testEndpoint {url, method, prompt}. Call mcp__agentcash__check_endpoint_schema on the url to get the exact input schema. Call mcp__agentcash__get_balance to confirm funds. Call mcp__agentcash__fetch with the correct body built from the prompt and schema. If the result has a jobId+status:pending, discover the job status URL (check /openapi.json or /llm.txt at the origin) and poll with mcp__agentcash__fetch until done. Call respond_to_chat with response (brief text summary) and testResult (the actual data — imageUrl, videoUrl, or JSON) so the UI can render it.

Keep looping until stopped.
```

Now type requests in the chat bar at the bottom of the canvas and Claude will respond in real-time.

> **Tip**: `CLAUDE.md` at the project root contains Claude's full instructions and is loaded automatically at the start of every session.

## How it works

Flow generates a **skill bundle** — a set of markdown files that serve as a natural-language program:

```
my-skill/
├── plugins/my-skill/skills/my-skill/
│   ├── SKILL.md                  # The program — numbered steps in plain English
│   ├── references/endpoints.md   # x402 endpoint catalog with schemas + pricing
│   ├── assets/output-template.md # Output structure templates
│   └── data/                     # Persistent state across runs
├── .claude-plugin/marketplace.json
├── README.md
└── TESTING.md
```

The exported `SKILL.md` matches the format of production skills like [recruit-skill](https://github.com/anthropics/recruit-skill) and [mail-skill](https://github.com/anthropics/mail-skill).

## Example workflows + skills

The `examples/` directory ships with:

- **`examples/workflows/`** — drop-in `.json` workflows you can copy into `.flow/workflows/` to open in the app. Includes `ai-news-anchor.json` and `news-clip-maker.json`.
- **`examples/recruit-skill/`**, **`examples/mail-skill/`**, and **`examples/ai-news-anchor/`** — full reference skill packages that show the structure exported skills aim to match (`.claude-plugin/marketplace.json`, `plugins/<slug>/.claude-plugin/plugin.json`, `SKILL.md`, `references/`, `assets/`, `data/`).

See `examples/workflows/README.md` for installation instructions.

## Node types

| Node | Purpose | Example |
|------|---------|---------|
| **Purpose** | What the skill does | "Send physical postcards with AI artwork" |
| **Service** | x402 paid API endpoint | Image generation, web search, email |
| **Instruction** | Plain English step | "Show the image before sending" |
| **Decision** | Branch point | "Letter or postcard?" |
| **User Input** | Something the user provides | Recipient address, topic |
| **Output** | What the skill produces | Report, confirmation, tracking info |

## Claude Code integration

Flow has a built-in MCP server and chat bridge so Claude Code can interact with your workflows directly.

```bash
# Register the Flow MCP server (run once)
claude mcp add flow -- npx tsx "$(pwd)/mcp-server.ts"

# Restart Claude Code, then start the app:
npm run dev
```

Once registered, Claude Code can list, read, create, edit, and export your skill drafts without you passing URLs. Type requests in the canvas chat bar and Claude will respond in real-time.

See `AGENT.md` for the full agent instructions and loop command.

## Architecture

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Canvas**: @xyflow/react v12
- **State**: Jotai with autosave/undo/redo
- **UI**: shadcn/ui + Tailwind v4
- **Discovery**: AgentCash — search, discover, and probe x402 endpoints
- **Persistence**: Local JSON files under `.flow/`
- **Export**: Skill bundles matching the Claude Code skill package format

## Credits

Flow began as a heavy fork of Vercel Labs' [workflow-builder-template](https://github.com/vercel-labs/workflow-builder-template). The original template provided the canvas + node-editor scaffolding; Flow has since been rebuilt around AgentCash, x402 service discovery, and Claude Code skill export. Thanks to the Vercel Labs team for the starting point.

## License

MIT
