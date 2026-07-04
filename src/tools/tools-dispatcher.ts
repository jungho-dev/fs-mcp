/**
 * @file src/tools/tools-dispatcher.ts
 * @description MCP tool call dispatcher.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ServerResult} from "@assets/type/common";
import {handleEditBlocks as hndlEdtBlck2, handleEditLines as hndlEdtLns} from "@controllers/controllers-edit";
import {handleCopyFiles as hndlCpyFls, handleCreateDirectories as hndlCrtDrct, handleGetFileInfos as hndlGtFlInfs, handleListDirectories as hndlLstDrct, handleMoveFiles as hndlMvFls, handleReadFiles as hndlRdFls, handleRemoveFiles as hndlRmvFls, handleWriteFiles as hndlWrtFls, handleReadFilesWithLineNumber as hndRdFlLn} from "@controllers/controllers-filesystem";
import {handleGitTool as hndlGtTl} from "@controllers/controllers-git";
import {handleFsInspect as hndlFsInsp} from "@controllers/controllers-inspect";
import {handleRegexSearches as hndlRgxSrch} from "@controllers/controllers-search";
import {handleDownloadToFile as hndlDwnlFl, handleWebExtract as hndlWbExtr, handleWebFetch as hndlWbFtch, handleWebRender as hndlWbRndr} from "@controllers/controllers-web";
import {createErrorResponse as crtErrRes} from "@cores/responses/responses-error";
import {normalizeToolResult as nrmlTlRes} from "@cores/responses/responses-tool-result";
import {readTextSliceInternal as rdTxtSlcInt} from "@features/filesystem/filesystem-service";
import {EGTN} from "@schemas/schemas-git";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export declare type ToolDispatchHandler = (args: unknown) => Promise<ServerResult> | ServerResult;

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

const APFN = new Set(["args_path", "args_offset", "args_length"]);
const ASMF = "__fs_mcp_args_source";
const APIPTN = new Set(["file-write"]);

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
  const argsText = await rdTxtSlcInt(reference.args_path, offset, length);
  let parsedArgs: unknown;

  try {
    parsedArgs = JSON.parse(argsText);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`args_path must contain valid JSON: ${message}`);
  }
  const inlnOvrr = Object.fromEntries(Object.entries(args).filter(([key]) => !APFN.has(key)));
  const usdInlnOvrr = Object.keys(inlnOvrr).length > 0;

  if (!usdInlnOvrr) {
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
      ...inlnOvrr,
    },
  };
}

// 3. Decorate resolved args for dispatch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function decorateResolvedArgsForDispatch(name: string, resolvedArgs: ResolvedToolArgs): unknown {
  if (
    resolvedArgs.source !== "args_path"
    || resolvedArgs.usedInlineOverrides
    || !APIPTN.has(name)
    || !isRecord(resolvedArgs.value)
  ) {
    return resolvedArgs.value;
  }
  return {
    ...resolvedArgs.value,
    [ASMF]: "args_path",
  };
}

const GT_TL_DSPT = Object.fromEntries(
  EGTN.map((toolName) => [toolName, (args: unknown) => hndlGtTl(toolName, args)]),
) as Record<(typeof EGTN)[number], ToolDispatchHandler>;

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const TL_DSPT: Readonly<Record<string, ToolDispatchHandler>> = {
  "file-read": (args: unknown) => hndlRdFls(args),
  "file-read-line-range": (args: unknown) => hndRdFlLn(args),
  "file-write": (args: unknown) => hndlWrtFls(args),
  "dir-create": (args: unknown) => hndlCrtDrct(args),
  "dir-list": (args: unknown) => hndlLstDrct(args),
  "path-copy": (args: unknown) => hndlCpyFls(args),
  "path-move": (args: unknown) => hndlMvFls(args),
  "path-remove": (args: unknown) => hndlRmvFls(args),
  "path-stat": (args: unknown) => hndlGtFlInfs(args),
  "file-edit": (args: unknown) => hndlEdtBlck2(args),
  "file-edit-lines": (args: unknown) => hndlEdtLns(args),
  "fs-inspect": (args: unknown) => hndlFsInsp(args),
  "fs-search": (args: unknown) => hndlRgxSrch(args),
  "web-fetch": (args: unknown) => hndlWbFtch(args),
  "web-render": (args: unknown) => hndlWbRndr(args),
  "web-extract": (args: unknown) => hndlWbExtr(args),
  "download-to-file": (args: unknown) => hndlDwnlFl(args),
  ...GT_TL_DSPT,
};

// 1. Get dispatchable tool names ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getDispatchableToolNames(): string[] {
  return Object.keys(TL_DSPT);
}

// 2. Dispatch tool call ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function dispatchToolCall(name: string, args: unknown): Promise<ServerResult> {
  const startTime = Date.now();
  const nrmlDsptRes = (result: ServerResult): ServerResult => nrmlTlRes(name, result, Date.now() - startTime);

  const dispatcher = TL_DSPT[name];
  if (!dispatcher) {
    return nrmlDsptRes(crtErrRes(`Unknown tool: ${name}`));
  }
  try {
    const resolvedArgs = await resolveToolArgsReference(args);
    const dispatchArgs = decorateResolvedArgsForDispatch(name, resolvedArgs);
    const result = await dispatcher(dispatchArgs);

    return nrmlDsptRes(result);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return nrmlDsptRes(crtErrRes(errorMessage));
  }
}
