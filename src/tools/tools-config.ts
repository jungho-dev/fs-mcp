/**
 * @file src/tools/tools-config.ts
 * @description Configuration tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema } from "@schemas/schemas-args-ref";
import { GetConfigsArgsSchema, SetConfigValuesArgsSchema } from "@schemas/schemas-config";
import { BATCH_GUIDANCE, CMD_PREFIX_DESCRIPTION, type ToolCatalogEntry } from "@tools/tools-const";
import { zodToJsonSchema } from "zod-to-json-schema";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CONFIG_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "get_configs",
    description: (`
      Get one or many configuration entries in parallel.
      Use items: [{ key }].
      Supported keys:
      - blockedCommands (array of blocked shell commands)
      - contextIndexEnabled (whether large outputs are compacted into SQLite context index)
      - contextIndexDbPath (SQLite database path for context index)
      - contextIndexAutoMinChars (character threshold for automatic context indexing)
      - contextIndexAutoMinLines (line threshold for automatic context indexing)
      - contextIndexMaxEntryChars (maximum characters indexed per context entry)
      - defaultShell (shell to use for commands)
      - allowedDirectories (paths the server can access)
      - fileReadLineLimit (legacy read hint; reads are uncapped unless length is provided)
      - fileWriteLineLimit (large write/edit warning threshold)
      - currentClient (information about the currently connected MCP client)
      - version (version of the fs-mcp)
      - systemInfo (operating system and runtime details)
      - availableShells (detected shells for new process sessions)
      When items is omitted, all supported keys are returned.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(GetConfigsArgsSchema)),
    annotations: {
      title: "Get Configurations",
      readOnlyHint: true,
    },
  },
  {
    name: "set_config_values",
    description: (`
      Set one or many configuration values in parallel.
      Inline string values are capped; use value_path for large values so tool-call logs do not echo the full value.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(SetConfigValuesArgsSchema)),
    annotations: {
      title: "Set Configuration Values",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];
