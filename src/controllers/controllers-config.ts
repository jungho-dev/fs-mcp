/**
 * @file src/controllers/controllers-config.ts
 * @description MCP config tool
 * @author JUNGHO
 * @since 2026-05-03
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { CONFIG_QUERY_KEYS, type ConfigQueryKey } from "@features/config/config-metadata";
import { getConfigValue, setConfigValue } from "@features/config/config-service";
import { configManager } from "@features/config/config-store";
import { GetConfigsArgsSchema, SetConfigValuesArgsSchema } from "@schemas/schemas-config";

// 1. Create default get config items ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createDefaultGetConfigItems(): Array<{ key: ConfigQueryKey }> {
  return CONFIG_QUERY_KEYS.map((key) => ({ key }));
}

// 2. Handle get configs ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetConfigs(args: unknown): Promise<ServerResult> {
  const parsed = GetConfigsArgsSchema.parse(args ?? {});
  const items = parsed.items ?? createDefaultGetConfigItems();

  await configManager.init();
  const results = await runParallelBatch(items, (item) => getConfigValue(item));
  const response = createBatchToolResponse("get_configs", results);

  return response;
}

// 3. Handle set config values ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleSetConfigValues(args: unknown): Promise<ServerResult> {
  const parsed = SetConfigValuesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => setConfigValue(item));
  const response = createBatchToolResponse("set_config_values", results);

  return response;
}
