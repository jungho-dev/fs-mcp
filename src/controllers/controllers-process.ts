/**
 * @file src/controllers/controllers-process.ts
 * @description MCP process tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { killProcess } from "@features/process/process-service";
import { KllPrArSc } from "@schemas/schemas-process";

// 2. Handle kill process --------------------------------------------------------------------------
export async function handleKillProcess(args: unknown): Promise<ServerResult> {
  const parsed = KllPrArSc.parse(args);
  return killProcess(parsed);
}
