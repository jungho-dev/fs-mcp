/**
 * @file src/controllers/controllers-process.ts
 * @description MCP process tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse as crtBtchTlRes, runParallelBatch as rnPrllBtch } from "@controllers/controllers-batch";
import { killProcess } from "@features/process/process-service";
import { KllPrArSc, KllPrArSc2 } from "@schemas/schemas-process";

// 2. Handle kill process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleKillProcess(args: unknown): Promise<ServerResult> {
  const parsed = KllPrArSc.parse(args);
  return killProcess(parsed);
}

// 3. Handle kill processes ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleKillProcesses(args: unknown): Promise<ServerResult> {
  const parsed = KllPrArSc2.parse(args);
  const results = await rnPrllBtch(parsed.pids, (pid) => handleKillProcess({ pid: pid }));
  const response = crtBtchTlRes("kill_processes", results);

  return response;
}
