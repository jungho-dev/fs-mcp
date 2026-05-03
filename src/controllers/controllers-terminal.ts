/**
 * @file src/controllers/controllers-terminal.ts
 * @description MCP terminal tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { forceTerminate, interactWithProcess, listSessions, readProcessOutput, startProcess } from "@features/process/process-runner";
import {
  ForceTerminateArgsSchema,
  InteractWithProcessesArgsSchema,
  ReadProcessOutputArgsSchema,
  ReadProcessOutputsArgsSchema,
  StartProcessArgsSchema,
  StartProcessesArgsSchema,
} from "@schemas/schemas-process";

// 1. Handle start_process command (improved execute_command) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStartProcess(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessArgsSchema.parse(args);
  return startProcess(parsed);
}
// 2. Handle read_process_output command (improved read_output) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadProcessOutput(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputArgsSchema.parse(args);
  return readProcessOutput(parsed);
}
// 3. Handle interact_with_process command (improved send_input) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleInteractWithProcess(args: unknown): Promise<ServerResult> {
  return interactWithProcess(args);
}
// 4. Handle force_terminate command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleForceTerminate(args: unknown): Promise<ServerResult> {
  const parsed = ForceTerminateArgsSchema.parse(args);
  return forceTerminate(parsed);
}
// 5. Handle list_sessions command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListSessions(): Promise<ServerResult> {
  return listSessions();
}

// 6. Handle start_processes command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStartProcesses(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleStartProcess(item));
  const response = createBatchToolResponse("start_processes", results);

  return response;
}

// 7. Handle read_process_outputs command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadProcessOutputs(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputsArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleReadProcessOutput(item));
  const response = createBatchToolResponse("read_process_outputs", results);

  return response;
}

// 8. Handle interact_with_processes command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleInteractWithProcesses(args: unknown): Promise<ServerResult> {
  const parsed = InteractWithProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleInteractWithProcess(item));
  const response = createBatchToolResponse("interact_with_processes", results);

  return response;
}
