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
const PROCESS_COLUMN_SPLIT_PATTERN = /\s+/;
const WINDOWS_TASKLIST_LINE_PATTERN = /^(.+?)\s+(\d+)\s+(.+?)\s+(\d+)\s+(.+)$/;

// 1. Parse Unix process line ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseUnixProcessLine(line: string): ProcessInfo | null {
  const parts = line.trim().split(PROCESS_COLUMN_SPLIT_PATTERN);
  if (parts.length < 11) {
    return null;
  }
  const pid = Number.parseInt(parts[1], 10);
  if (Number.isNaN(pid)) {
    return null;
  }
  return {
    command: parts.slice(10).join(" "),
    cpu: parts[2],
    memory: parts[3],
    pid,
  };
}

// 2. Parse Windows process line ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseWindowsProcessLine(line: string): ProcessInfo | null {
  const match = line.trim().match(WINDOWS_TASKLIST_LINE_PATTERN);
  if (!match) {
    return null;
  }
  const pid = Number.parseInt(match[2], 10);
  if (Number.isNaN(pid)) {
    return null;
  }
  return {
    command: match[1].trim(),
    cpu: "N/A",
    memory: match[5].trim(),
    pid,
  };
}

// 3. Parse process line ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseProcessLine(line: string, platform: NodeJS.Platform): ProcessInfo | null {
  const parsedProcess = platform === "win32" ? parseWindowsProcessLine(line) : parseUnixProcessLine(line);
  return parsedProcess;
}

// 4. List processes ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function listProcesses(): Promise<ServerResult> {
  const lineSeparatorPattern = /\r?\n/;
  const platform = os.platform();
  const command = platform === "win32" ? "tasklist" : "ps aux";
  try {
    const {stdout} = await execAsync(command);
    const processes = stdout
      .split(lineSeparatorPattern)
      .slice(1)
      .filter(Boolean)
      .map((line) => parseProcessLine(line, platform))
      .filter((processInfo): processInfo is ProcessInfo => processInfo !== null);

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

// 5. Kill process ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
