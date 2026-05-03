/**
 * @file src/mcp/controllers/terminal-controller.ts
 * @description MCP terminal tool handlers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { createBatchToolResponse, runParallelBatch } from "@mcp/controllers/batch-tool-support";
import { forceTerminate, interactWithProcess, listSessions, readProcessOutput, startProcess } from "@features/process/process-runner";
import {
  ForceTerminateArgsSchema,
  ForceTerminateProcessesArgsSchema,
  InteractWithProcessesArgsSchema,
  ReadProcessOutputArgsSchema,
  ReadProcessOutputsArgsSchema,
  StartProcessArgsSchema,
  StartProcessesArgsSchema,
} from "@mcp/schemas/schema-exports";
import type { ServerResult } from "@type/common-types";

/**
 * Handle start_process command (improved execute_command)
 */
export async function handleStartProcess(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessArgsSchema.parse(args);
  return startProcess(parsed);
}
/**
 * Handle read_process_output command (improved read_output)
 */
export async function handleReadProcessOutput(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputArgsSchema.parse(args);
  return readProcessOutput(parsed);
}
/**
 * Handle interact_with_process command (improved send_input)
 */
export async function handleInteractWithProcess(args: unknown): Promise<ServerResult> {
  return interactWithProcess(args);
}
/**
 * Handle force_terminate command
 */
export async function handleForceTerminate(args: unknown): Promise<ServerResult> {
  const parsed = ForceTerminateArgsSchema.parse(args);
  return forceTerminate(parsed);
}
/**
 * Handle list_sessions command
 */
export async function handleListSessions(): Promise<ServerResult> {
  return listSessions();
}

/**
 * Handle start_processes command.
 */
export async function handleStartProcesses(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleStartProcess(item));
  const response = createBatchToolResponse("start_processes", results);

  return response;
}

/**
 * Handle read_process_outputs command.
 */
export async function handleReadProcessOutputs(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputsArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleReadProcessOutput(item));
  const response = createBatchToolResponse("read_process_outputs", results);

  return response;
}

/**
 * Handle interact_with_processes command.
 */
export async function handleInteractWithProcesses(args: unknown): Promise<ServerResult> {
  const parsed = InteractWithProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleInteractWithProcess(item));
  const response = createBatchToolResponse("interact_with_processes", results);

  return response;
}

/**
 * Handle force_terminate_processes command.
 */
export async function handleForceTerminateProcesses(args: unknown): Promise<ServerResult> {
  const parsed = ForceTerminateProcessesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.pids, (pid) => handleForceTerminate({ "pid": pid }));
  const response = createBatchToolResponse("force_terminate_processes", results);

  return response;
}
