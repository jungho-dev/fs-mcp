/**
 * @file src/tools/tools-dispatcher.ts
 * @description MCP tool call dispatcher.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ServerResult} from "@assets/type/common";
import {handleGetConfigs, handleSetConfigValues} from "@controllers/controllers-config";
import {handleEditBlocks} from "@controllers/controllers-edit";
import {handleCreateDirectories, handleGetFileInfos, handleListDirectories, handleMoveFiles, handleReadFiles, handleRenameFiles, handleWriteFiles} from "@controllers/controllers-filesystem";
import {handleKillProcesses, handleListProcesses} from "@controllers/controllers-process";
import {handleGetSearchResults, handleListSearches, handleStartSearches, handleStopSearches} from "@controllers/controllers-search";
import {handleInteractWithProcesses, handleListSessions, handleReadProcessOutputs, handleStartProcesses} from "@controllers/controllers-terminal";
import {createErrorResponse} from "@cores/responses/responses-error";
import {normalizeToolResult} from "@cores/responses/responses-tool-result";
import {capture} from "@cores/runtime/runtime-output-capture";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export type ToolDispatchHandler = (args: unknown) => Promise<ServerResult> | ServerResult;

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const TOOL_DISPATCHERS: Readonly<Record<string, ToolDispatchHandler>> = {
  get_configs: (args: unknown) => handleGetConfigs(args),
  set_config_values: (args: unknown) => handleSetConfigValues(args),
  start_processes: (args: unknown) => handleStartProcesses(args),
  read_process_outputs: (args: unknown) => handleReadProcessOutputs(args),
  interact_with_processes: (args: unknown) => handleInteractWithProcesses(args),
  list_sessions: () => handleListSessions(),
  list_processes: () => handleListProcesses(),
  kill_processes: (args: unknown) => handleKillProcesses(args),
  read_files: (args: unknown) => handleReadFiles(args),
  write_files: (args: unknown) => handleWriteFiles(args),
  create_directories: (args: unknown) => handleCreateDirectories(args),
  list_directories: (args: unknown) => handleListDirectories(args),
  move_files: (args: unknown) => handleMoveFiles(args),
  rename_files: (args: unknown) => handleRenameFiles(args),
  get_file_infos: (args: unknown) => handleGetFileInfos(args),
  edit_blocks: (args: unknown) => handleEditBlocks(args),
  start_searches: (args: unknown) => handleStartSearches(args),
  get_search_results: (args: unknown) => handleGetSearchResults(args),
  stop_searches: (args: unknown) => handleStopSearches(args),
  list_searches: () => handleListSearches(),
};

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getDispatchableToolNames(): string[] {
  return Object.keys(TOOL_DISPATCHERS);
}

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function dispatchToolCall(name: string, args: unknown): Promise<ServerResult> {
  const startTime = Date.now();
  const normalizeDispatchResult = (result: ServerResult): ServerResult => normalizeToolResult(name, result, Date.now() - startTime);

  const dispatcher = TOOL_DISPATCHERS[name];
  if (!dispatcher) {
    capture("server_unknown_tool", {name});
    return normalizeDispatchResult(createErrorResponse(`Unknown tool: ${name}`));
  }
  try {
    const result = await dispatcher(args);

    return normalizeDispatchResult(result);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    capture("server_tool_dispatch_error", {name, error: errorMessage});

    return normalizeDispatchResult(createErrorResponse(errorMessage));
  }
}
