/**
 * @file src/mcp/tools/tool-catalog.ts
 * @description MCP tool catalog definitions.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {ToolCatalogEntry} from "@mcp/tools/catalog/catalog-shared";
import {CONFIG_TOOL_CATALOG} from "@mcp/tools/catalog/config-tools";
import {FILESYSTEM_TOOL_CATALOG} from "@mcp/tools/catalog/filesystem-tools";
import {PROCESS_TOOL_CATALOG} from "@mcp/tools/catalog/process-tools";

export function createToolCatalog(): ToolCatalogEntry[] {
  return [...CONFIG_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG];
}
