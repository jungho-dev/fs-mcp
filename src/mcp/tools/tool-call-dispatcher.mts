/**
 * @file src/mcp/tools/tool-call-dispatcher.mts
 * @description MCP tool call dispatcher.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { capture } from "@app/runtime/output-capture";
import { getConfig, setConfigValue } from "@features/config/config-service";
import * as handlers from "@mcp/controllers/controller-exports";
import { createErrorResponse } from "@mcp/responses/error-response";
import { normalizeToolResult } from "@mcp/responses/tool-result-response";
import type { ServerResult } from "@type/common-types";

export type ToolDispatchHandler = (args: unknown) => Promise<ServerResult> | ServerResult;

export const TOOL_DISPATCHERS: Readonly<Record<string, ToolDispatchHandler>> = {
  get_config: () => getConfig(),
  set_config_value: (args: unknown) => setConfigValue(args),

  get_recent_tool_calls: (args: unknown) => handlers.handleGetRecentToolCalls(args),

  start_process: (args: unknown) => handlers.handleStartProcess(args),
  read_process_output: (args: unknown) => handlers.handleReadProcessOutput(args),
  interact_with_process: (args: unknown) => handlers.handleInteractWithProcess(args),
  force_terminate: (args: unknown) => handlers.handleForceTerminate(args),
  list_sessions: () => handlers.handleListSessions(),

  list_processes: () => handlers.handleListProcesses(),
  kill_process: (args: unknown) => handlers.handleKillProcess(args),

  read_file: (args: unknown) => handlers.handleReadFile(args),
  read_multiple_files: (args: unknown) => handlers.handleReadMultipleFiles(args),
  write_file: (args: unknown) => handlers.handleWriteFile(args),
  create_directory: (args: unknown) => handlers.handleCreateDirectory(args),
  list_directory: (args: unknown) => handlers.handleListDirectory(args),
  move_file: (args: unknown) => handlers.handleMoveFile(args),
  get_file_info: (args: unknown) => handlers.handleGetFileInfo(args),
  edit_block: (args: unknown) => handlers.handleEditBlock(args),

  start_search: (args: unknown) => handlers.handleStartSearch(args),
  get_more_search_results: (args: unknown) => handlers.handleGetMoreSearchResults(args),
  stop_search: (args: unknown) => handlers.handleStopSearch(args),
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
