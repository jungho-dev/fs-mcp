/**
 * @file src/tools/tools-const.ts
 * @description Shared MCP tool catalog contracts and guidance text.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {getOSSpecificGuidance, getPathGuidance} from "@cores/runtime/runtime-guidance";
import {getSystemInfo} from "@cores/runtime/runtime-info";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const OS_GUIDANCE = getOSSpecificGuidance(getSystemInfo());

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const PATH_GUIDANCE = (`
  IMPORTANT: ${getPathGuidance(getSystemInfo())} Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
`);

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CMD_PREFIX_DESCRIPTION = (`
  This command can be referenced as "FS-MCP: ..." or "use fs-mcp to ..." in your instructions.
  To prevent verbose tool-call parameter logs, put large or multi-item arguments in a UTF-8 JSON file and call with {"args_path":"ABSOLUTE_PATH_TO_ARGS_JSON"}.
`);
