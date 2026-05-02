/**
 * @file src/mcp/tools/tool-history-policy.mts
 * @description Tool history recording policy.
 * @author JUNGHO
 * @since 2026-05-02
 */

export const HISTORY_EXCLUDED_TOOL_NAMES = ["get_recent_tool_calls"] as const;

const historyExcludedTools = new Set<string>(HISTORY_EXCLUDED_TOOL_NAMES);

export function shouldRecordToolHistory(toolName: string): boolean {
  return !historyExcludedTools.has(toolName);
}
