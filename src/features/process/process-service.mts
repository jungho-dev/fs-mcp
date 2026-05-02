/**
 * @file src/features/process/process-service.mts
 * @description Process management service.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { exec } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { KillProcessArgsSchema } from "@mcp/schemas/schema-exports";
import type { ProcessInfo, ServerResult } from "@type/common-types";

const execAsync = promisify(exec);

export async function listProcesses(): Promise<ServerResult> {
  const command = os.platform() === "win32" ? "tasklist" : "ps aux";
  try {
    const { stdout } = await execAsync(command);
    const processes = stdout
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          pid: Number.parseInt(parts[1], 10),
          command: parts.at(-1),
          cpu: parts[2],
          memory: parts[3],
        } as ProcessInfo;
      });

    return {
      content: [
        {
          type: "text",
          text: processes.map((p) => `PID: ${p.pid}, Command: ${p.command}, CPU: ${p.cpu}, Memory: ${p.memory}`).join("\n"),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: Failed to list processes: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
export async function killProcess(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Error: Invalid arguments for kill_process: ${parsed.error}` }],
      isError: true,
    };
  }
  try {
    process.kill(parsed.data.pid);
    return {
      content: [{ type: "text", text: `Successfully terminated process ${parsed.data.pid}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: Failed to kill process: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
