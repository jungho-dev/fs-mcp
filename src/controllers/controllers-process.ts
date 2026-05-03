/**
 * @file src/controllers/controllers-process.ts
 * @description MCP process tool 
 * @author JUNGHO
 * @since 2026-05-02
 */

import { killProcess, listProcesses } from "@features/process/process-service";
import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { KillProcessArgsSchema, KillProcessesArgsSchema } from "@schemas/schemas-process";
import type { ServerResult } from "@assets/type/common";

/**
 * Handle list_processes command
 */
export async function handleListProcesses(): Promise<ServerResult> {
  return listProcesses();
}
/**
 * Handle kill_process command
 */
export async function handleKillProcess(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessArgsSchema.parse(args);
  return killProcess(parsed);
}

/**
 * Handle kill_processes command.
 */
export async function handleKillProcesses(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.pids, (pid) => handleKillProcess({ "pid": pid }));
  const response = createBatchToolResponse("kill_processes", results);

  return response;
}
