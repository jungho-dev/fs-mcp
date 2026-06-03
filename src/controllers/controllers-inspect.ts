/**
 * @file src/controllers/controllers-inspect.ts
 * @description MCP filesystem inspection tool controller.
 * @author JUNGHO
 * @since 2026-06-03
 */

import type {ServerResult} from "@assets/type/common";
import {runFsInspect as rnFsInsp} from "@features/inspect/inspect-service";

// 1. Handle fs inspect ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleFsInspect(args: unknown): Promise<ServerResult> {
  return rnFsInsp(args);
}
