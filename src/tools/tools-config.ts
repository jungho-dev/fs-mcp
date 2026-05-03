/**
 * @file src/tools/tools-config.ts
 * @description Configuration tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { GetConfigArgsSchema, SetConfigValuesArgsSchema } from "@schemas/schemas-config";
import { CMD_PREFIX_DESCRIPTION, type ToolCatalogEntry } from "@tools/tools-const";
import { zodToJsonSchema } from "zod-to-json-schema";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CONFIG_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "get_config",
    description: (`
      Get the complete server configuration as JSON. Config includes fields for:
      - blockedCommands (array of blocked shell commands)
      - defaultShell (shell to use for commands)
      - allowedDirectories (paths the server can access)
      - fileReadLineLimit (max lines for read_file, default 1000)
      - fileWriteLineLimit (max lines per write_file call, default 50)
      - currentClient (information about the currently connected MCP client)
      - version (version of the fs-mcp)
      - systemInfo (operating system and environment details)
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(GetConfigArgsSchema),
    annotations: {
      title: "Get Configuration",
      readOnlyHint: true,
    },
  },
  {
    name: "set_config_values",
    description: (`
      Set one or many configuration values in parallel.
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(SetConfigValuesArgsSchema),
    annotations: {
      title: "Set Configuration Values",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];