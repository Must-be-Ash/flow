/**
 * AgentCash CLI wrapper
 *
 * Thin spawn wrapper around `npx agentcash <args>`.
 * AgentCash is an MCP-based wallet + service discovery tool.
 * CLI docs: https://agentcash.dev/docs
 */

import { spawn } from "child_process";

export class AgentCashCliError extends Error {
  exitCode: number;
  stderr: string;

  constructor(exitCode: number, stderr: string) {
    super(`agentcash exited with code ${exitCode}: ${stderr}`);
    this.name = "AgentCashCliError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export type CliResult = {
  stdout: string;
  json: unknown;
};

/**
 * Run an agentcash CLI command and return parsed output.
 */
export async function agentcash(
  args: string[],
  opts?: { timeout?: number }
): Promise<CliResult> {
  const timeout = opts?.timeout ?? 30_000;

  return new Promise((resolve, reject) => {
    // Build the full command as a single shell string to preserve quoting
    const escapedArgs = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
    const command = `npx -y agentcash@latest ${escapedArgs}`;

    const child = spawn("sh", ["-c", command], {
      timeout,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new AgentCashCliError(-1, err.message));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new AgentCashCliError(code ?? 1, stderr.trim()));
        return;
      }

      // Parse JSON from stdout
      let json: unknown = null;
      const firstBrace = stdout.indexOf("{");
      const firstBracket = stdout.indexOf("[");
      let jsonStart = -1;

      if (firstBrace >= 0 && firstBracket >= 0) {
        jsonStart = Math.min(firstBrace, firstBracket);
      } else if (firstBrace >= 0) {
        jsonStart = firstBrace;
      } else if (firstBracket >= 0) {
        jsonStart = firstBracket;
      }

      if (jsonStart >= 0) {
        try {
          json = JSON.parse(stdout.substring(jsonStart));
        } catch {
          // JSON parse failed — leave as null
        }
      }

      resolve({ stdout: stdout.trim(), json });
    });
  });
}
