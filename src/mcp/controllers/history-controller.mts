/**
 * @file src/mcp/controllers/history-controller.mts
 * @description MCP history tool handlers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { toolHistory } from "@features/history/tool-history-store";
import { GetRecentToolCallsArgsSchema } from "@mcp/schemas/schema-exports";
import type { ServerResult } from "@type/common-types";

/**
 * Handle get_recent_tool_calls command
 */
export async function handleGetRecentToolCalls(args: unknown): Promise<ServerResult> {
  try {
    const parsed = GetRecentToolCallsArgsSchema.parse(args);

    // Use formatted version with local timezone
    const calls = toolHistory.getRecentCallsFormatted({
      maxResults: parsed.maxResults,
      toolName: parsed.toolName,
      since: parsed.since,
    });

    const stats = toolHistory.getStats();

    // Format the response (excluding file path per user request)
    const summary = `Tool Call History (${calls.length} results, ${stats.totalEntries} total in memory)`;
    const historyJson = JSON.stringify(calls, null, 2);

    return {
      content: [
        {
          type: "text",
          text: `${summary}\n\n${historyJson}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting tool history: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
