/**
 * @file src/mcp/schemas/search-schema.mts
 * @description Search argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const StartSearchArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  searchType: z.enum(["files", "content"]).default("files"),
  filePattern: z.string().optional(),
  ignoreCase: z.boolean().optional().default(true),
  maxResults: z.number().optional(),
  includeHidden: z.boolean().optional().default(false),
  contextLines: z.number().optional().default(5),
  timeout_ms: z.number().optional(),
  earlyTermination: z.boolean().optional(),
  literalSearch: z.boolean().optional().default(false),
});

export const GetMoreSearchResultsArgsSchema = z.object({
  sessionId: z.string(),
  offset: z.number().optional().default(0),
  length: z.number().optional().default(100),
});

export const StopSearchArgsSchema = z.object({
  sessionId: z.string(),
});

export const ListSearchesArgsSchema = z.object({});
