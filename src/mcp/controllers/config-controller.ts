/**
 * @file src/mcp/controllers/config-controller.ts
 * @description MCP config tool handlers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { getConfig, setConfigValue } from "@features/config/config-service";
import { createBatchToolResponse, runParallelBatch } from "@mcp/controllers/batch-tool-support";
import { SetConfigValuesArgsSchema } from "@mcp/schemas/schema-exports";
import type { ServerResult } from "@type/common-types";

/**
 * Handle get_config command.
 */
export async function handleGetConfig(): Promise<ServerResult> {
  const result = await getConfig();
  return result;
}

/**
 * Handle set_config_values command.
 */
export async function handleSetConfigValues(args: unknown): Promise<ServerResult> {
  const parsed = SetConfigValuesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => setConfigValue(item));
  const response = createBatchToolResponse("set_config_values", results);

  return response;
}
