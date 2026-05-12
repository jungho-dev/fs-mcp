/**
 * @file src/controllers/controllers-terminal.ts
 * @description MCP terminal tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { interactWithProcess, listSessions, readProcessOutput, startProcess } from "@features/process/process-runner";
import {
  InteractWithProcessesArgsSchema,
  ReadProcessOutputArgsSchema,
  ReadProcessOutputsArgsSchema,
  StartProcessArgsSchema,
  StartProcessesArgsSchema,
} from "@schemas/schemas-process";

// 1. Handle start process ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStartProcess(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessArgsSchema.parse(args);
  return startProcess(parsed);
}

// 2. Handle read process output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadProcessOutput(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputArgsSchema.parse(args);
  return readProcessOutput(parsed);
}

// 3. Handle interact with process ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleInteractWithProcess(args: unknown): Promise<ServerResult> {
  return interactWithProcess(args);
}

// 4. Handle list sessions ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListSessions(): Promise<ServerResult> {
  return listSessions();
}

// 5. Handle start processes ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStartProcesses(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleStartProcess(item));
  const response = createBatchToolResponse("start_processes", results);

  return response;
}

// 6. Handle read process outputs ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadProcessOutputs(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputsArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleReadProcessOutput(item));
  const response = createBatchToolResponse("read_process_outputs", results);

  return response;
}

// 7. Handle interact with processes ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleInteractWithProcesses(args: unknown): Promise<ServerResult> {
  const parsed = InteractWithProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleInteractWithProcess(item));
  const response = createBatchToolResponse("interact_with_processes", results);

  return response;
}
