/**
 * @file src/tools/tools-dispatcher.ts
 * @description MCP tool call dispatcher.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ServerResult} from "@assets/type/common";
import {handleGetConfigs, handleSetConfigValues} from "@controllers/controllers-config";
import {handleEditBlocks} from "@controllers/controllers-edit";
import {handleCopyFiles, handleCreateDirectories, handleGetFileInfos, handleListDirectories, handleMoveFiles, handleReadFiles, handleRemoveFiles, handleWriteFiles} from "@controllers/controllers-filesystem";
import {handleGitTool} from "@controllers/controllers-git";
import {handleKillProcesses} from "@controllers/controllers-process";
import {handleGetFullSearchResults, handleStartSearches, handleStopSearches} from "@controllers/controllers-search";
import {handleInteractWithProcesses, handleListSessions, handleReadProcessOutputs, handleStartProcesses} from "@controllers/controllers-terminal";
import {createErrorResponse} from "@cores/responses/responses-error";
import {normalizeToolResult} from "@cores/responses/responses-tool-result";
import {readTextSliceInternal} from "@features/filesystem/filesystem-service";
import {ESSENTIAL_GIT_TOOL_NAMES} from "@schemas/schemas-git";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export type ToolDispatchHandler = (args: unknown) => Promise<ServerResult> | ServerResult;

type ToolArgsReference = {
  args_path?: unknown;
  args_offset?: unknown;
  args_length?: unknown;
};

type ResolvedToolArgs = {
  source: "args_path" | "inline";
  usedInlineOverrides: boolean;
  value: unknown;
};

const ARGS_PATH_FIELD_NAMES = new Set(["args_path", "args_offset", "args_length"]);
const ARGS_SOURCE_METADATA_FIELD = "__fs_mcp_args_source";
const ARGS_PATH_INLINE_PAYLOAD_TOOL_NAMES = new Set(["write_files"]);

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
async function resolveToolArgsReference(args: unknown): Promise<ResolvedToolArgs> {
  if (!isRecord(args)) {
    return {
      source: "inline",
      usedInlineOverrides: false,
      value: args,
    };
  }
  const reference = args as ToolArgsReference;
  if (reference.args_path === undefined) {
    return {
      source: "inline",
      usedInlineOverrides: false,
      value: args,
    };
  }
  if (typeof reference.args_path !== "string") {
    throw new Error("args_path must be a string");
  }
  const offset = resolveArgsPathNumber(reference.args_offset, "args_offset") ?? 0;
  const length = resolveArgsPathNumber(reference.args_length, "args_length");
  const argsText = await readTextSliceInternal(reference.args_path, offset, length);
  let parsedArgs: unknown;

  try {
    parsedArgs = JSON.parse(argsText);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`args_path must contain valid JSON: ${message}`);
  }
  const inlineOverrides = Object.fromEntries(Object.entries(args).filter(([key]) => !ARGS_PATH_FIELD_NAMES.has(key)));
  const usedInlineOverrides = Object.keys(inlineOverrides).length > 0;

  if (!usedInlineOverrides) {
    return {
      source: "args_path",
      usedInlineOverrides: false,
      value: parsedArgs,
    };
  }
  if (!isRecord(parsedArgs)) {
    throw new Error("args_path JSON must be an object when inline overrides are provided");
  }
  return {
    source: "args_path",
    usedInlineOverrides: true,
    value: {
      ...parsedArgs,
      ...inlineOverrides,
    },
  };
}

// 3. Decorate resolved args for dispatch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function decorateResolvedArgsForDispatch(name: string, resolvedArgs: ResolvedToolArgs): unknown {
  if (
    resolvedArgs.source !== "args_path"
    || resolvedArgs.usedInlineOverrides
    || !ARGS_PATH_INLINE_PAYLOAD_TOOL_NAMES.has(name)
    || !isRecord(resolvedArgs.value)
  ) {
    return resolvedArgs.value;
  }
  return {
    ...resolvedArgs.value,
    [ARGS_SOURCE_METADATA_FIELD]: "args_path",
  };
}

const GIT_TOOL_DISPATCHERS = Object.fromEntries(
  ESSENTIAL_GIT_TOOL_NAMES.map((toolName) => [toolName, (args: unknown) => handleGitTool(toolName, args)]),
) as Record<(typeof ESSENTIAL_GIT_TOOL_NAMES)[number], ToolDispatchHandler>;

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const TOOL_DISPATCHERS: Readonly<Record<string, ToolDispatchHandler>> = {
  get_configs: (args: unknown) => handleGetConfigs(args),
  set_config_values: (args: unknown) => handleSetConfigValues(args),
  start_processes: (args: unknown) => handleStartProcesses(args),
  read_process_outputs: (args: unknown) => handleReadProcessOutputs(args),
  interact_with_processes: (args: unknown) => handleInteractWithProcesses(args),
  list_sessions: () => handleListSessions(),
  kill_processes: (args: unknown) => handleKillProcesses(args),
  read_files: (args: unknown) => handleReadFiles(args),
  write_files: (args: unknown) => handleWriteFiles(args),
  create_directories: (args: unknown) => handleCreateDirectories(args),
  list_directories: (args: unknown) => handleListDirectories(args),
  copy_files: (args: unknown) => handleCopyFiles(args),
  move_files: (args: unknown) => handleMoveFiles(args),
  remove_files: (args: unknown) => handleRemoveFiles(args),
  get_file_infos: (args: unknown) => handleGetFileInfos(args),
  edit_blocks: (args: unknown) => handleEditBlocks(args),
  start_searches: (args: unknown) => handleStartSearches(args),
  get_full_search: (args: unknown) => handleGetFullSearchResults(args),
  stop_searches: (args: unknown) => handleStopSearches(args),
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
    const dispatchArgs = decorateResolvedArgsForDispatch(name, resolvedArgs);
    const result = await dispatcher(dispatchArgs);

    return normalizeDispatchResult(result);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return normalizeDispatchResult(createErrorResponse(errorMessage));
  }
}
