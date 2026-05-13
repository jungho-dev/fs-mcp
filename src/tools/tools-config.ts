/**
 * @file src/tools/tools-config.ts
 * @description Configuration tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema } from "@schemas/schemas-args-ref";
import { GetConfigsArgsSchema, SetConfigValuesArgsSchema } from "@schemas/schemas-config";
import { BATCH_GUIDANCE, CMD_PREFIX_DESCRIPTION, createToolCatalogEntry, type ToolCatalogEntry, type ToolCatalogEntryConfig } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const CONFIG_TOOL_DEFINITIONS = [
  {
    name: "get_configs",
    description: (`
      Get configuration values by key.
      Omit items to return the full supported config surface.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(GetConfigsArgsSchema),
    annotations: {
      title: "Get Configurations",
      readOnlyHint: true,
    },
  },
  {
    name: "set_config_values",
    description: (`
      Set one or many configuration values in parallel.
      Use value_path for large values.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(SetConfigValuesArgsSchema),
    annotations: {
      title: "Set Configuration Values",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
] satisfies ToolCatalogEntryConfig[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CONFIG_TOOL_CATALOG: ToolCatalogEntry[] = CONFIG_TOOL_DEFINITIONS.map((entry) => createToolCatalogEntry(entry));
