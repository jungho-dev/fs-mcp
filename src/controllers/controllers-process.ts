/**
 * @file src/controllers/controllers-process.ts
 * @description MCP process tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { killProcess, listProcesses } from "@features/process/process-service";
import { KillProcessArgsSchema, KillProcessesArgsSchema } from "@schemas/schemas-process";

// 1. Handle list processes ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListProcesses(): Promise<ServerResult> {
  return listProcesses();
}

// 2. Handle kill process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleKillProcess(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessArgsSchema.parse(args);
  return killProcess(parsed);
}

// 3. Handle kill processes ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleKillProcesses(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.pids, (pid) => handleKillProcess({ pid: pid }));
  const response = createBatchToolResponse("kill_processes", results);

  return response;
}
