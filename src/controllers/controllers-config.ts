/**
 * @file src/controllers/controllers-config.ts
 * @description MCP config tool
 * @author JUNGHO
 * @since 2026-05-03
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { getConfig, setConfigValue } from "@features/config/config-service";
import { SetConfigValuesArgsSchema } from "@schemas/schemas-config";

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
