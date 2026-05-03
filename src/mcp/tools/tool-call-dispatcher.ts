/**
 * @file src/mcp/tools/tool-call-dispatcher.ts
 * @description MCP tool call dispatcher.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { capture } from "@app/runtime/output-capture";
import * as handlers from "@mcp/controllers/controller-exports";
import { createErrorResponse } from "@mcp/responses/error-response";
import { normalizeToolResult } from "@mcp/responses/tool-result-response";
import type { ServerResult } from "@type/common-types";

export type ToolDispatchHandler = (args: unknown) => Promise<ServerResult> | ServerResult;

export const TOOL_DISPATCHERS: Readonly<Record<string, ToolDispatchHandler>> = {
  get_config: () => handlers.handleGetConfig(),
  set_config_values: (args: unknown) => handlers.handleSetConfigValues(args),

  start_processes: (args: unknown) => handlers.handleStartProcesses(args),
  read_process_outputs: (args: unknown) => handlers.handleReadProcessOutputs(args),
  interact_with_processes: (args: unknown) => handlers.handleInteractWithProcesses(args),
  force_terminate_processes: (args: unknown) => handlers.handleForceTerminateProcesses(args),
  list_sessions: () => handlers.handleListSessions(),

  list_processes: () => handlers.handleListProcesses(),
  kill_processes: (args: unknown) => handlers.handleKillProcesses(args),

  read_files: (args: unknown) => handlers.handleReadFiles(args),
  write_files: (args: unknown) => handlers.handleWriteFiles(args),
  create_directories: (args: unknown) => handlers.handleCreateDirectories(args),
  list_directories: (args: unknown) => handlers.handleListDirectories(args),
  move_files: (args: unknown) => handlers.handleMoveFiles(args),
  get_file_infos: (args: unknown) => handlers.handleGetFileInfos(args),
  edit_blocks: (args: unknown) => handlers.handleEditBlocks(args),

  start_searches: (args: unknown) => handlers.handleStartSearches(args),
  get_search_results: (args: unknown) => handlers.handleGetSearchResults(args),
  stop_searches: (args: unknown) => handlers.handleStopSearches(args),
  list_searches: () => handlers.handleListSearches(),
};

export function getDispatchableToolNames(): string[] {
  return Object.keys(TOOL_DISPATCHERS);
}
export async function dispatchToolCall(name: string, args: unknown): Promise<ServerResult> {
  const startTime = Date.now();
  const normalizeDispatchResult = (result: ServerResult): ServerResult => normalizeToolResult(name, result, Date.now() - startTime);

  const dispatcher = TOOL_DISPATCHERS[name];
  if (!dispatcher) {
    capture("server_unknown_tool", { name });
    return normalizeDispatchResult(createErrorResponse(`Unknown tool: ${name}`));
  }
  try {
    const result = await dispatcher(args);

    return normalizeDispatchResult(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    capture("server_tool_dispatch_error", { name, error: errorMessage });

    return normalizeDispatchResult(createErrorResponse(errorMessage));
  }
}
