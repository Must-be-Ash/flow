/**
 * Skill bundle export — generates a Claude Code skill bundle
 * matching the recruit-skill / mail-skill shape.
 *
 * Produces:
 *   SKILL.md                     — natural language program
 *   references/endpoints.md      — x402 endpoint catalog
 *   assets/output-template.md    — if Output nodes have templates
 *   data/.gitkeep                — if Input nodes have saveAs
 *   .claude-plugin/marketplace.json
 *   plugins/<slug>/.claude-plugin/plugin.json
 *   README.md, TESTING.md, LICENSE, .gitignore
 */

import JSZip from "jszip";
import type { StoredWorkflow } from "../store";
import type { WorkflowNodeData, EndpointData } from "../workflow-store";

type Author = { name: string; url: string };
type SkillNode = { id: string; data: WorkflowNodeData; position: { x: number; y: number } };
type SkillEdge = { id: string; source: string; target: string; sourceHandle?: string };

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
}

// ─── Graph walk ──────────────────────────────────────────────────────

function topologicalSort(nodes: SkillNode[], edges: SkillEdge[]): SkillNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);
  const sorted: SkillNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    for (const next of adj.get(id) || []) {
      const deg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  // Add any remaining nodes not reached (disconnected)
  for (const n of nodes) {
    if (!sorted.find((s) => s.id === n.id)) sorted.push(n);
  }

  return sorted;
}

// ─── Extractors ──────────────────────────────────────────────────────

function getPurposeNode(nodes: SkillNode[]): SkillNode | undefined {
  return nodes.find((n) => n.data.type === "purpose");
}

function getServiceNodes(nodes: SkillNode[]): SkillNode[] {
  return nodes.filter((n) => n.data.type === "service" && n.data.endpoint);
}

function getOutputNodes(nodes: SkillNode[]): SkillNode[] {
  return nodes.filter((n) => n.data.type === "output");
}

function getInputNodesWithSaveAs(nodes: SkillNode[]): SkillNode[] {
  return nodes.filter((n) => n.data.type === "input" && n.data.saveAs);
}

function getUniqueOrigins(nodes: SkillNode[]): string[] {
  const origins = new Set<string>();
  for (const n of getServiceNodes(nodes)) {
    if (n.data.endpoint?.origin) origins.add(n.data.endpoint.origin);
  }
  return Array.from(origins);
}

// ─── SKILL.md ────────────────────────────────────────────────────────

function generateSkillMd(nodes: SkillNode[], edges: SkillEdge[]): string {
  const purpose = getPurposeNode(nodes);
  const slug = slugify(purpose?.data.name || "skill");
  const origins = getUniqueOrigins(nodes);
  const sorted = topologicalSort(nodes, edges);

  // Frontmatter
  let md = `---
name: ${slug}
description: >-
  ${purpose?.data.description || "Skill created with Flow."}${origins.length > 0 ? ` Uses x402 pay-per-call endpoints (${origins.map((o) => o.replace("https://", "")).join(", ")}) on USDC via AgentCash.` : ""}${purpose?.data.useCases ? ` ${purpose.data.useCases}` : ""}
---

# ${purpose?.data.name || "Untitled Skill"}

${purpose?.data.description || ""}

## Prerequisites

- \`npx agentcash balance\` — confirm you have USDC
- If no balance: visit agentcash.dev/onboard for free credits
- Install AgentCash MCP: \`claude mcp add agentcash -- npx -y agentcash@latest\`

## Workflow

`;

  // Generate numbered steps from topological walk
  let stepNum = 1;
  for (const node of sorted) {
    const d = node.data;
    if (d.type === "purpose") continue; // Skip — already in header

    md += `### Step ${stepNum} — ${d.label || `Step ${stepNum}`}\n\n`;

    switch (d.type) {
      case "service": {
        const ep = d.endpoint;
        if (ep) {
          md += `${d.description || ep.summary || "Call the API endpoint."}\n\n`;
          md += `See \`references/endpoints.md § ${d.label || ep.summary}\` for the full request/response shape.\n\n`;
          if (d.notes) {
            md += `**Notes:** ${d.notes}\n\n`;
          }
          md += `**Cost:** $${ep.price || "?"} USDC per call.\n\n`;
        }
        break;
      }
      case "instruction":
        md += `${d.instruction || d.label || "Follow the instruction."}\n\n`;
        break;

      case "decision": {
        md += `${d.question || d.label || "Make a decision."}\n\n`;
        const opts = d.options || [];
        if (opts.length > 0) {
          md += "| Option | Description |\n|--------|-------------|\n";
          for (const opt of opts) {
            md += `| ${opt.label} | ${opt.description || ""} |\n`;
          }
          md += "\n";
        }
        break;
      }
      case "input": {
        md += `Ask the user: ${d.prompt || d.label || "Provide input."}\n\n`;
        if (d.hints) {
          md += `**Hints:** ${d.hints}\n\n`;
        }
        if (d.saveAs) {
          md += `Save the response to \`${d.saveAs}\` for reuse in future runs.\n\n`;
        }
        if (d.required) {
          md += `This input is **required** — do not proceed without it.\n\n`;
        }
        break;
      }
      case "output": {
        md += `${d.label || "Present the output."}\n\n`;
        if (d.format) {
          md += `**Format:** ${d.format}\n\n`;
        }
        if (d.confirm) {
          md += `**Wait for user confirmation before proceeding.**\n\n`;
        }
        if (d.template) {
          md += `Follow the template in \`assets/output-template.md\`.\n\n`;
        }
        break;
      }
    }

    stepNum++;
  }

  // Cost tracking
  const serviceNodes = getServiceNodes(nodes);
  if (serviceNodes.length > 0) {
    const totalEstimate = serviceNodes
      .reduce((sum, n) => sum + (parseFloat(n.data.endpoint?.price || "0") || 0), 0)
      .toFixed(4);

    md += `## Cost tracking

Maintain a running tally of endpoint costs. Estimated cost per run: ~$${totalEstimate} USDC.

`;
  }

  // Output section
  const outputs = getOutputNodes(nodes);
  if (outputs.length > 0) {
    md += "## Output\n\n";
    for (const out of outputs) {
      md += `- ${out.data.label || "Output"}: ${out.data.format || "See above"}\n`;
    }
    md += "\n";
  }

  // Not for
  if (purpose?.data.notFor) {
    md += `## What this skill is NOT for\n\n${purpose.data.notFor}\n`;
  }

  return md;
}

// ─── references/endpoints.md ─────────────────────────────────────────

function generateEndpointsMd(nodes: SkillNode[]): string {
  const serviceNodes = getServiceNodes(nodes);
  if (serviceNodes.length === 0) return "# Endpoint Catalog\n\nNo x402 endpoints in this skill.\n";

  let md = "# Endpoint Catalog\n\n";

  // Group by origin
  const byOrigin = new Map<string, SkillNode[]>();
  for (const n of serviceNodes) {
    const origin = n.data.endpoint!.origin;
    const list = byOrigin.get(origin) || [];
    list.push(n);
    byOrigin.set(origin, list);
  }

  for (const [origin, nodes] of byOrigin) {
    md += `## ${origin.replace("https://", "")}\n\n`;
    md += `Base URL: \`${origin}\`\n\n`;

    for (const n of nodes) {
      const ep = n.data.endpoint!;
      md += `### ${n.data.label || ep.summary || "Endpoint"} — $${ep.price || "?"}\n\n`;

      if (n.data.description) {
        md += `${n.data.description}\n\n`;
      }

      md += `**Endpoint:** \`${ep.method} ${ep.path}\`\n\n`;

      // Input schema
      if (ep.inputSchema && Object.keys(ep.inputSchema).length > 0) {
        md += "**Request body:**\n```json\n";
        md += JSON.stringify(ep.inputSchema, null, 2);
        md += "\n```\n\n";
      }

      // Output schema
      if (ep.outputSchema && Object.keys(ep.outputSchema).length > 0) {
        md += "**Response shape:**\n```json\n";
        md += JSON.stringify(ep.outputSchema, null, 2);
        md += "\n```\n\n";
      }

      // Example call
      md += "**Example call:**\n```bash\n";
      md += `npx agentcash fetch '${origin}${ep.path}' --method ${ep.method}\n`;
      md += "```\n\n";

      // Provider instructions
      if (ep.instructions) {
        md += "**Provider instructions:**\n\n";
        md += ep.instructions.slice(0, 2000);
        if (ep.instructions.length > 2000) md += "\n\n*(truncated)*";
        md += "\n\n";
      }

      if (n.data.notes) {
        md += `**Notes:** ${n.data.notes}\n\n`;
      }

      md += "---\n\n";
    }
  }

  return md;
}

// ─── Main export ─────────────────────────────────────────────────────

const MIT_LICENSE = `MIT License

Copyright (c) ${new Date().getFullYear()}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export async function generateSkillBundle(
  workflow: StoredWorkflow,
  opts?: { author?: Author }
): Promise<JSZip> {
  const nodes = workflow.nodes as SkillNode[];
  const edges = workflow.edges as SkillEdge[];
  const purpose = getPurposeNode(nodes);
  const slug = slugify(purpose?.data.name || workflow.name || "skill");
  const author = opts?.author || { name: "flow-local", url: "" };
  const origins = getUniqueOrigins(nodes);
  const serviceNodes = getServiceNodes(nodes);
  const outputNodes = getOutputNodes(nodes);
  const inputsWithSave = getInputNodesWithSaveAs(nodes);

  const zip = new JSZip();

  // Top-level files
  zip.file("README.md", `# ${purpose?.data.name || workflow.name}

${purpose?.data.description || "Skill created with Flow."}

## Install

\`\`\`bash
npx skills add ./${slug}
\`\`\`

## Prerequisites

- AgentCash wallet with USDC balance: \`npx agentcash balance\`
- Onboard at agentcash.dev/onboard for free credits

## What you get

A skill that ${purpose?.data.description?.toLowerCase() || "automates a workflow"} using ${serviceNodes.length} x402 service${serviceNodes.length !== 1 ? "s" : ""}.

## License

MIT
`);

  zip.file("TESTING.md", `# Testing ${purpose?.data.name || workflow.name}

## Endpoint verification

Test each endpoint with \`npx agentcash check <url>\` (free probe, no payment):

${serviceNodes.map((n) => {
  const ep = n.data.endpoint!;
  return `- \`npx agentcash check '${ep.origin}${ep.path}'\` — ${n.data.label || ep.summary}`;
}).join("\n")}

## End-to-end test

Install the skill and ask Claude to run it with a test input.
`);

  zip.file("LICENSE", MIT_LICENSE);
  zip.file(".gitignore", "node_modules/\n.env*\n");

  // Marketplace metadata
  zip.file(
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      name: author.name,
      owner: { name: author.name, url: author.url },
      plugins: [{
        name: slug,
        source: `./plugins/${slug}`,
        description: purpose?.data.description || workflow.name,
        version: "0.1.0",
        category: "agents-and-skills",
        keywords: [
          ...origins.map((o) => o.replace("https://", "").replace(/\..*/g, "")),
          "x402", "agentcash", "usdc",
        ],
      }],
    }, null, 2)
  );

  // Plugin metadata
  zip.file(`plugins/${slug}/README.md`, `# ${purpose?.data.name || workflow.name}\n\n${purpose?.data.description || ""}\n`);
  zip.file(
    `plugins/${slug}/.claude-plugin/plugin.json`,
    JSON.stringify({
      name: slug,
      version: "0.1.0",
      description: `${purpose?.data.description || workflow.name}. ${purpose?.data.useCases || ""}`.trim(),
      author: author.name,
    }, null, 2)
  );

  // The skill itself
  zip.file(`plugins/${slug}/skills/${slug}/SKILL.md`, generateSkillMd(nodes, edges));
  zip.file(`plugins/${slug}/skills/${slug}/references/endpoints.md`, generateEndpointsMd(nodes));

  // Output templates
  const templates = outputNodes.filter((n) => n.data.template);
  if (templates.length > 0) {
    zip.file(
      `plugins/${slug}/skills/${slug}/assets/output-template.md`,
      templates.map((n) => n.data.template).join("\n\n---\n\n")
    );
  }

  // Data directory for persistent state
  if (inputsWithSave.length > 0) {
    zip.file(
      `plugins/${slug}/skills/${slug}/data/.gitkeep`,
      `# This directory stores persistent data across runs.\n# Files:\n${inputsWithSave.map((n) => `#   ${n.data.saveAs}`).join("\n")}\n`
    );
  }

  return zip;
}
