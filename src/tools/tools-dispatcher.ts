/**
 * @file src/tools/tools-dispatcher.ts
 * @description MCP tool call dispatcher.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ServerResult} from "@assets/type/common";
import {handleClearContexts, handleIndexContexts, handleListContexts, handleSearchContexts} from "@controllers/controllers-context";
import {handleGetConfigs, handleSetConfigValues} from "@controllers/controllers-config";
import {handleEditBlocks} from "@controllers/controllers-edit";
import {handleCreateDirectories, handleGetFileInfos, handleListDirectories, handleMoveFiles, handleReadFiles, handleRemoveFiles, handleRenameFiles, handleWriteFiles} from "@controllers/controllers-filesystem";
import {handleGitTool} from "@controllers/controllers-git";
import {handleKillProcesses, handleListProcesses} from "@controllers/controllers-process";
import {handleGetSearchResults, handleListSearches, handleStartSearches, handleStopSearches} from "@controllers/controllers-search";
import {handleInteractWithProcesses, handleListSessions, handleReadProcessOutputs, handleStartProcesses} from "@controllers/controllers-terminal";
import {createErrorResponse} from "@cores/responses/responses-error";
import {normalizeToolResult} from "@cores/responses/responses-tool-result";
import {readFileInternal} from "@features/filesystem/filesystem-service";
import type {GitToolName} from "@schemas/schemas-git";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export type ToolDispatchHandler = (args: unknown) => Promise<ServerResult> | ServerResult;

type ToolArgsReference = {
  args_path?: unknown;
  args_offset?: unknown;
  args_length?: unknown;
};

const ARGS_PATH_FIELD_NAMES = new Set(["args_path", "args_offset", "args_length"]);

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 1. Resolve args path number ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveArgsPathNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return value;
}

// 2. Resolve tool args reference ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveToolArgsReference(args: unknown): Promise<unknown> {
  if (!isRecord(args)) {
    return args;
  }
  const reference = args as ToolArgsReference;
  if (reference.args_path === undefined) {
    return args;
  }
  if (typeof reference.args_path !== "string") {
    throw new Error("args_path must be a string");
  }
  const offset = resolveArgsPathNumber(reference.args_offset, "args_offset") ?? 0;
  const length = resolveArgsPathNumber(reference.args_length, "args_length");
  const argsText = await readFileInternal(reference.args_path, offset, length);
  let parsedArgs: unknown;

  try {
    parsedArgs = JSON.parse(argsText);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`args_path must contain valid JSON: ${message}`);
  }
  const inlineOverrides = Object.fromEntries(Object.entries(args).filter(([key]) => !ARGS_PATH_FIELD_NAMES.has(key)));
  if (Object.keys(inlineOverrides).length === 0) {
    return parsedArgs;
  }
  if (!isRecord(parsedArgs)) {
    throw new Error("args_path JSON must be an object when inline overrides are provided");
  }
  return {
    ...parsedArgs,
    ...inlineOverrides,
  };
}

const GIT_TOOL_NAMES: GitToolName[] = [
  "git_add",
  "git_blame",
  "git_branch",
  "git_changelog_analyze",
  "git_checkout",
  "git_cherry_pick",
  "git_clean",
  "git_clear_working_dir",
  "git_clone",
  "git_commit",
  "git_diff",
  "git_fetch",
  "git_init",
  "git_log",
  "git_merge",
  "git_pull",
  "git_push",
  "git_rebase",
  "git_reflog",
  "git_remote",
  "git_reset",
  "git_set_working_dir",
  "git_show",
  "git_stash",
  "git_status",
  "git_tag",
  "git_worktree",
  "git_wrapup_instructions",
];

const GIT_TOOL_DISPATCHERS = Object.fromEntries(
  GIT_TOOL_NAMES.map((toolName) => [toolName, (args: unknown) => handleGitTool(toolName, args)]),
) as Record<GitToolName, ToolDispatchHandler>;

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const TOOL_DISPATCHERS: Readonly<Record<string, ToolDispatchHandler>> = {
  get_configs: (args: unknown) => handleGetConfigs(args),
  set_config_values: (args: unknown) => handleSetConfigValues(args),
  index_contexts: (args: unknown) => handleIndexContexts(args),
  search_contexts: (args: unknown) => handleSearchContexts(args),
  list_contexts: (args: unknown) => handleListContexts(args),
  clear_contexts: (args: unknown) => handleClearContexts(args),
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
  remove_files: (args: unknown) => handleRemoveFiles(args),
  get_file_infos: (args: unknown) => handleGetFileInfos(args),
  edit_blocks: (args: unknown) => handleEditBlocks(args),
  start_searches: (args: unknown) => handleStartSearches(args),
  get_search_results: (args: unknown) => handleGetSearchResults(args),
  stop_searches: (args: unknown) => handleStopSearches(args),
  list_searches: () => handleListSearches(),
  ...GIT_TOOL_DISPATCHERS,
};

// 1. Get dispatchable tool names ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getDispatchableToolNames(): string[] {
  return Object.keys(TOOL_DISPATCHERS);
}

// 2. Dispatch tool call ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function dispatchToolCall(name: string, args: unknown): Promise<ServerResult> {
  const startTime = Date.now();
  const normalizeDispatchResult = (result: ServerResult): ServerResult => normalizeToolResult(name, result, Date.now() - startTime);

  const dispatcher = TOOL_DISPATCHERS[name];
  if (!dispatcher) {
    return normalizeDispatchResult(createErrorResponse(`Unknown tool: ${name}`));
  }
  try {
    const resolvedArgs = await resolveToolArgsReference(args);
    const result = await dispatcher(resolvedArgs);

    return normalizeDispatchResult(result);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return normalizeDispatchResult(createErrorResponse(errorMessage));
  }
}
