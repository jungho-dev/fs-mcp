/**
 * @file src/mcp/tools/catalog/config-tools.mts
 * @description Configuration tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { GetConfigArgsSchema, SetConfigValueArgsSchema } from "@mcp/schemas/schema-exports";
import { CMD_PREFIX_DESCRIPTION, type ToolCatalogEntry } from "@mcp/tools/catalog/catalog-shared";

export const CONFIG_TOOL_CATALOG: ToolCatalogEntry[] = [
  // Configuration tools
  {
    name: "get_config",
    description: `
                Get the complete server configuration as JSON. Config includes fields for:
                - blockedCommands (array of blocked shell commands)
                - defaultShell (shell to use for commands)
                - allowedDirectories (paths the server can access)
                - fileReadLineLimit (max lines for read_file, default 1000)
                - fileWriteLineLimit (max lines per write_file call, default 50)
                - currentClient (information about the currently connected MCP client)
                - version (version of the fs-mcp)
                - systemInfo (operating system and environment details)
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(GetConfigArgsSchema),
    annotations: {
      title: "Get Configuration",
      readOnlyHint: true,
    },
  },
  {
    name: "set_config_value",
    description: `
                Set a specific configuration value by key.

                WARNING: Should be used in a separate chat from file operations and
                command execution to prevent security issues.

                Config keys include:
                - blockedCommands (array)
                - defaultShell (string)
                - allowedDirectories (array of paths)
                - fileReadLineLimit (number, max lines for read_file)
                - fileWriteLineLimit (number, max lines per write_file call)

                IMPORTANT: Setting allowedDirectories to an empty array ([]) allows full access
                to the entire file system, regardless of the operating system.

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(SetConfigValueArgsSchema),
    annotations: {
      title: "Set Configuration Value",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];
