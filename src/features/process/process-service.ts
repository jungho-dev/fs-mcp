/**
 * @file src/features/process/process-service.ts
 * @description Process management service.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {exec} from "node:child_process";
import os from "node:os";
import {promisify} from "node:util";
import type {ProcessInfo, ServerResult} from "@assets/type/common";
import {KillProcessArgsSchema} from "@schemas/schemas-process";

const execAsync = promisify(exec);
const PROCESS_COLUMN_SPLIT_PATTERN = /\\s+/;

// 1. List processes ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function listProcesses(): Promise<ServerResult> {
  const command = os.platform() === "win32" ? "tasklist" : "ps aux";
  try {
    const {stdout} = await execAsync(command);
    const processes = stdout
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(PROCESS_COLUMN_SPLIT_PATTERN);
        return {
          command: parts.at(-1),
          cpu: parts[2],
          memory: parts[3],
          pid: Number.parseInt(parts[1], 10),
        } as ProcessInfo;
      });

    return {
      content: [
        {
          text: processes.map((p) => `PID: ${p.pid}, Command: ${p.command}, CPU: ${p.cpu}, Memory: ${p.memory}`).join("\n"),
          type: "text",
        },
      ],
    };
  }
  catch (error) {
    return {
      content: [{text: `Error: Failed to list processes: ${error instanceof Error ? error.message : String(error)}`, type: "text" }],
      isError: true,
    };
  }
}
// 2. Kill process ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function killProcess(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{text: `Error: Invalid arguments for kill_process: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  try {
    process.kill(parsed.data.pid);
    return {
      content: [{text: `Successfully terminated process ${parsed.data.pid}`, type: "text" }],
    };
  }
  catch (error) {
    return {
      content: [{text: `Error: Failed to kill process: ${error instanceof Error ? error.message : String(error)}`, type: "text" }],
      isError: true,
    };
  }
}