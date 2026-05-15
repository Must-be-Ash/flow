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

Flow has a built-in autonomous agent (powered by `@anthropic-ai/claude-agent-sdk`) that handles requests from the canvas chat bar without any manual setup. It can:

- **Edit your workflows** — add, remove, or update nodes from a plain English request
- **Test paid API endpoints** — probe the schema, make a paid call via AgentCash, poll for async results, and render images/video inline
- **Create complete skill packages** from your visual draft — not just a SKILL.md, but a full installable package including `references/endpoints.md`, `assets/output-template.md`, and `data/` for persistent state

> `CLAUDE.md` at the project root contains the agent's full role and instructions.

### Step 1 — Register the MCP server (once)

```bash
claude mcp add flow -- npx tsx "$(pwd)/mcp-server.ts"
```

Restart Claude Code after running this.

### Step 2 — Start the dev server

```bash
npm run dev
```

That's it — type requests in the chat bar at the bottom of the canvas and the built-in agent responds in real-time. No `/loop` required.

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

See `AGENT.md` for the full skill creation process and exported bundle format.

## Architecture

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Canvas**: @xyflow/react v12
- **State**: Jotai with autosave/undo/redo
- **UI**: shadcn/ui + Tailwind v4
- **Agent**: `@anthropic-ai/claude-agent-sdk` — autonomous chat/skill-creation jobs in the API route
- **Discovery**: AgentCash — search, discover, and probe x402 endpoints
- **Persistence**: Local JSON files under `.flow/`
- **Export**: Skill bundles matching the Claude Code skill package format

## Credits

Flow began as a heavy fork of Vercel Labs' [workflow-builder-template](https://github.com/vercel-labs/workflow-builder-template). The original template provided the canvas + node-editor scaffolding; Flow has since been rebuilt around AgentCash, x402 service discovery, and Claude Code skill export. Thanks to the Vercel Labs team for the starting point.

## License

MIT
