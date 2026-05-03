/**
 * @file src/mcp/tools/catalog/catalog-shared.ts
 * @description Shared MCP tool catalog contracts and guidance text.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {getOSSpecificGuidance, getPathGuidance, getSystemInfo} from "@app/runtime/runtime-info";

const SYSTEM_INFO = getSystemInfo();

export const OS_GUIDANCE = getOSSpecificGuidance(SYSTEM_INFO);
export const PATH_GUIDANCE = `IMPORTANT: ${getPathGuidance(SYSTEM_INFO)} Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.`;
export const CMD_PREFIX_DESCRIPTION = `This command can be referenced as "FS-MCP: ..." or "use fs-mcp to ..." in your instructions.`;

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
