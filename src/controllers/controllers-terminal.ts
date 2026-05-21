/**
 * @file src/controllers/controllers-terminal.ts
 * @description MCP terminal tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse as crtBtchTlRes, runParallelBatch as rnPrllBtch } from "@controllers/controllers-batch";
import { interactWithProcess as intrWthProc, listSessions, readProcessOutput as rdProcOtpt, startProcess } from "@features/process/process-runner";
import {
  IntWtPrArSc,
  RdPrOtArSc,
  StrPrArSc,
} from "@schemas/schemas-process";

// 1. Handle start process ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStartProcess(args: unknown): Promise<ServerResult> {
  const parsed = StrPrArSc.parse(args);
  return startProcess(parsed);
}

// 2. Handle read process output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadProcessOutput(args: unknown): Promise<ServerResult> {
  const parsed = RdPrOtArSc.parse(args);
  return rdProcOtpt(parsed);
}

// 3. Handle interact with process ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleInteractWithProcess(args: unknown): Promise<ServerResult> {
  return intrWthProc(args);
}

// 4. Handle list sessions ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListSessions(args: unknown): Promise<ServerResult> {
  return listSessions(args);
}

// 5. Handle interact with processes ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleInteractWithProcesses(args: unknown): Promise<ServerResult> {
  const parsed = IntWtPrArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleInteractWithProcess(item));
  const response = crtBtchTlRes("interact_with_processes", results);

  return response;
}
