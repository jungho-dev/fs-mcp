/**
 * @file src/tools/tools-config.ts
 * @description Configuration tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { GetConfigsArgsSchema, SetConfigValuesArgsSchema } from "@schemas/schemas-config";
import { CMD_PREFIX_DESCRIPTION, type ToolCatalogEntry } from "@tools/tools-const";
import { zodToJsonSchema } from "zod-to-json-schema";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CONFIG_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "get_configs",
    description: (`
      Get one or many configuration entries in parallel.
      Use items: [{ key }].
      Supported keys:
      - blockedCommands (array of blocked shell commands)
      - defaultShell (shell to use for commands)
      - allowedDirectories (paths the server can access)
      - fileReadLineLimit (legacy read hint; reads are uncapped unless length is provided)
      - fileWriteLineLimit (large write/edit warning threshold)
      - currentClient (information about the currently connected MCP client)
      - version (version of the fs-mcp)
      - systemInfo (operating system and runtime details)
      - availableShells (detected shells for new process sessions)
      When items is omitted, all supported keys are returned.
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(GetConfigsArgsSchema),
    annotations: {
      title: "Get Configurations",
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
