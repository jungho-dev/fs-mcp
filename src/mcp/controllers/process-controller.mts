/**
 * @file src/mcp/controllers/process-controller.mts
 * @description MCP process tool handlers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { killProcess, listProcesses } from "@features/process/process-service";
import { KillProcessArgsSchema } from "@mcp/schemas/schema-exports";
import type { ServerResult } from "@type/common-types";

/**
 * Handle list_processes command
 */
export async function handleListProcesses(): Promise<ServerResult> {
  return listProcesses();
}
/**
 * Handle kill_process command
 */
export async function handleKillProcess(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessArgsSchema.parse(args);
  return killProcess(parsed);
}
