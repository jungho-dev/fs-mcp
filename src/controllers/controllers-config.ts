/**
 * @file src/controllers/controllers-config.ts
 * @description MCP config tool
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {ServerResult} from "@assets/type/common";
import {type BatchToolItemResult as BtchTlItmRe2, createBatchToolResponse as crtBtchTlRes} from "@controllers/controllers-batch";
import {prepareConfigValueUpdate as prpCfgVlUpd} from "@features/config/config-service";
import {cfgMgr, type ServerConfig as SrvrCfg} from "@features/config/config-store";
import {StCfVaArSc} from "@schemas/schemas-config";

// 1. Create set config failure results ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createSetConfigFailureResults<T>(items: T[], message: string): BtchTlItmRe2<T>[] {
  return items.map((item, index) => ({
    index: index + 1,
    input: item,
    ok: false,
    result: {
      content: [
        {
          text: "No configuration values were changed: " + message,
          type: "text",
        },
      ],
      isError: true,
    },
  }));
}

// 2. Handle set config values ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleSetConfigValues(args: unknown): Promise<ServerResult> {
  const parsed = StCfVaArSc.parse(args);
  const baseConfig = await cfgMgr.getConfig();
  const draft: SrvrCfg = {...baseConfig};
  const orderedItems = parsed.items.map((item, index) => ({index, item}));
  const planned = new Map<number, Awaited<ReturnType<typeof prpCfgVlUpd>>>();

  try {
    for (const entry of orderedItems) {
      const update = await prpCfgVlUpd(entry.item);

      draft[update.key] = update.value;
      planned.set(entry.index, update);
    }
    await cfgMgr.updateConfig(draft);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const results = createSetConfigFailureResults(parsed.items, message);

    return crtBtchTlRes("set_config_values", results);
  }

  const updtCfg2 = await cfgMgr.getConfig();
  const results: BtchTlItmRe2<(typeof parsed.items)[number]>[] = parsed.items.map((item, index) => {
    const update = planned.get(index);
    const key = update?.key ?? item.key;
    const value = update?.value;

    return {
      index: index + 1,
      input: item,
      ok: true,
      result: {
        content: [
          {
            text: "Successfully set " + key + " to " + JSON.stringify(value, null, 2) + "\n\nUpdated configuration:\n" + JSON.stringify(updtCfg2, null, 2),
            type: "text",
          },
        ],
      },
    };
  });
  const response = crtBtchTlRes("set_config_values", results);

  return response;
}
