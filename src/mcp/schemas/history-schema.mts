/**
 * @file src/mcp/schemas/history-schema.mts
 * @description History argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const GetRecentToolCallsArgsSchema = z.object({
  maxResults: z.number().min(1).max(1000).optional().default(50),
  toolName: z.string().optional(),
  since: z.string().datetime().optional(),
});
