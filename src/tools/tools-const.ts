/**
 * @file src/tools/tools-const.ts
 * @description Shared MCP tool catalog contracts and guidance text.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {getOSSpecificGuidance, getPathGuidance} from "@cores/runtime/runtime-guidance";
import {getSystemInfo} from "@cores/runtime/runtime-info";

const systemInfo = getSystemInfo();

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
};

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const OS_GUIDANCE = getOSSpecificGuidance(systemInfo);

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const PATH_GUIDANCE = (`
  IMPORTANT: ${getPathGuidance(systemInfo)} Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
`);

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const BATCH_GUIDANCE = (`
  BATCH-FIRST: When multiple same-kind operations are needed, include every item in this single tool call instead of calling this tool repeatedly.
`);

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const APPLY_PATCH_PERFORMANCE_GUIDANCE = (`
  APPLY_PATCH PERFORMANCE: For generated text, reports, multi-file rewrites, or two or more same-kind writes/edits, prefer fs-mcp batch tools over apply_patch. Put every item in one tool call and use *_path or args_path for large payloads.
`);

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CMD_PREFIX_DESCRIPTION = (`
  This command can be referenced as "FS-MCP: ..." or "use fs-mcp to ..." in your instructions.
  To prevent verbose tool-call parameter logs, put large or multi-item arguments in a UTF-8 JSON file and call with {"args_path":"ABSOLUTE_PATH_TO_ARGS_JSON"}.
`);
