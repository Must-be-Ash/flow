/**
 * File-backed store for .flow/ directory
 *
 * Single-user, local-first. Atomic writes via temp-file rename.
 * Stores workflows and runs as individual JSON files.
 */

import { readFile, writeFile, readdir, unlink, mkdir, rename, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// Root data directory
const FLOW_DIR = join(process.cwd(), ".flow");
const WORKFLOWS_DIR = join(FLOW_DIR, "workflows");
const RUNS_DIR = join(FLOW_DIR, "runs");
const EXPORTS_DIR = join(FLOW_DIR, "exports");
const SEED_DIR = join(process.cwd(), "examples", "workflows");

// Ensure directories exist. Seed example workflows the first time
// .flow/workflows/ is created — gives fresh-clone users a non-empty switcher.
// Won't reseed if the user later deletes the examples (the directory will
// already exist on subsequent launches).
async function ensureDirs() {
  for (const dir of [FLOW_DIR, WORKFLOWS_DIR, RUNS_DIR, EXPORTS_DIR]) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
      if (dir === WORKFLOWS_DIR) {
        await seedExamples();
      }
    }
  }
}

async function seedExamples() {
  if (!existsSync(SEED_DIR)) return;
  try {
    const files = await readdir(SEED_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const src = join(SEED_DIR, file);
      const raw = await readFile(src, "utf-8");
      const parsed = JSON.parse(raw) as { id?: string };
      const id = parsed.id ?? randomUUID();
      await copyFile(src, join(WORKFLOWS_DIR, `${id}.json`));
    }
  } catch {
    // Seeding is best-effort; never block app startup on it.
  }
}

// Atomic write — write to temp file then rename
async function atomicWrite(filePath: string, data: string) {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, data, "utf-8");
  await rename(tmpPath, filePath);
}

// ─── Workflow types ──────────────────────────────────────────────────

export type StoredWorkflow = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  notFor?: string;
  version: number;
  nodes: unknown[];
  edges: unknown[];
  createdAt: string;
  updatedAt: string;
};

// ─── Workflow CRUD ───────────────────────────────────────────────────

function workflowPath(id: string): string {
  return join(WORKFLOWS_DIR, `${id}.json`);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled";
}

export async function listWorkflows(): Promise<StoredWorkflow[]> {
  await ensureDirs();
  let files: string[];
  try {
    files = await readdir(WORKFLOWS_DIR);
  } catch {
    return [];
  }

  const workflows: StoredWorkflow[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(WORKFLOWS_DIR, file), "utf-8");
      const w = JSON.parse(raw);
      // Normalise missing/null name from slug or fallback
      if (!w.name) {
        w.name = w.slug
          ? w.slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
          : "Untitled";
      }
      workflows.push(w);
    } catch {
      // Skip corrupted files
    }
  }

  // Sort by updatedAt descending
  workflows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return workflows;
}

export async function getWorkflow(id: string): Promise<StoredWorkflow | null> {
  await ensureDirs();
  const path = workflowPath(id);
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createWorkflow(data: {
  name?: string;
  description?: string;
  nodes?: unknown[];
  edges?: unknown[];
}): Promise<StoredWorkflow> {
  await ensureDirs();

  const id = randomUUID();
  const name = data.name || "Untitled";
  const now = new Date().toISOString();

  const workflow: StoredWorkflow = {
    id,
    name,
    slug: slugify(name),
    description: data.description || "",
    version: 1,
    nodes: data.nodes || [],
    edges: data.edges || [],
    createdAt: now,
    updatedAt: now,
  };

  await atomicWrite(workflowPath(id), JSON.stringify(workflow, null, 2));
  return workflow;
}

export async function updateWorkflow(
  id: string,
  data: Partial<Pick<StoredWorkflow, "name" | "description" | "notFor" | "nodes" | "edges">>
): Promise<StoredWorkflow | null> {
  const existing = await getWorkflow(id);
  if (!existing) return null;

  const updated: StoredWorkflow = {
    ...existing,
    ...data,
    slug: data.name ? slugify(data.name) : existing.slug,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  };

  await atomicWrite(workflowPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const path = workflowPath(id);
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

// ─── Run types ───────────────────────────────────────────────────────

export type StoredRun = {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  endedAt?: string;
  inputs: unknown;
  steps: StoredStepRecord[];
  totalCost?: string;
  error?: { nodeId: string; message: string; stack?: string };
};

export type StoredStepRecord = {
  nodeId: string;
  iteration?: number;
  status: "running" | "completed" | "failed" | "skipped";
  startedAt: string;
  endedAt?: string;
  input: unknown;
  output?: unknown;
  cost?: string;
  latencyMs?: number;
  error?: string;
};

// ─── Run CRUD ────────────────────────────────────────────────────────

function runPath(runId: string): string {
  return join(RUNS_DIR, `${runId}.json`);
}

export async function getRun(runId: string): Promise<StoredRun | null> {
  await ensureDirs();
  try {
    const raw = await readFile(runPath(runId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createRun(data: {
  workflowId: string;
  workflowVersion: number;
  inputs?: unknown;
}): Promise<StoredRun> {
  await ensureDirs();

  const run: StoredRun = {
    runId: randomUUID(),
    workflowId: data.workflowId,
    workflowVersion: data.workflowVersion,
    status: "pending",
    startedAt: new Date().toISOString(),
    inputs: data.inputs || {},
    steps: [],
  };

  await atomicWrite(runPath(run.runId), JSON.stringify(run, null, 2));
  return run;
}

export async function updateRun(
  runId: string,
  data: Partial<Pick<StoredRun, "status" | "endedAt" | "steps" | "totalCost" | "error">>
): Promise<StoredRun | null> {
  const existing = await getRun(runId);
  if (!existing) return null;

  const updated: StoredRun = { ...existing, ...data };
  await atomicWrite(runPath(runId), JSON.stringify(updated, null, 2));
  return updated;
}

export async function listRuns(workflowId?: string): Promise<StoredRun[]> {
  await ensureDirs();
  let files: string[];
  try {
    files = await readdir(RUNS_DIR);
  } catch {
    return [];
  }

  const runs: StoredRun[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(RUNS_DIR, file), "utf-8");
      const run: StoredRun = JSON.parse(raw);
      if (!workflowId || run.workflowId === workflowId) {
        runs.push(run);
      }
    } catch {
      // Skip corrupted files
    }
  }

  runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return runs;
}
