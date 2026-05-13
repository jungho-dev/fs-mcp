/**
 * @file src/schemas/schemas-search.ts
 * @description Search argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

const INLINE_TEXT_ARGUMENT_MAX_LENGTH = 50_000;

export const StartSearchArgsSchema = z.object({
  path: z.string(),
  pattern: z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, "Use pattern_path for large patterns").optional(),
  pattern_path: z.string().optional(),
  pattern_offset: z.number().optional().default(0),
  pattern_length: z.number().optional(),
  searchType: z.enum(["files", "content"]).default("files"),
  filePattern: z.string().optional(),
  ignoreCase: z.boolean().optional().default(true),
  maxResults: z.number().optional(),
  includeHidden: z.boolean().optional().default(false),
  contextLines: z.number().optional().default(5),
  timeout_ms: z.number().optional(),
  earlyTermination: z.boolean().optional(),
  literalSearch: z.boolean().optional().default(false),
}).refine((args) => args.pattern !== undefined || args.pattern_path !== undefined, {
  message: "Either pattern or pattern_path is required",
});

export const StartSearchesArgsSchema = z.object({
  items: z.array(StartSearchArgsSchema).min(1),
});

export const GetMoreSearchResultsArgsSchema = z.object({
  sessionId: z.string(),
  offset: z.number().optional().default(0),
  length: z.number().optional(),
});

export const GetFullSearchResultsArgsSchema = z.object({
  items: z.array(GetMoreSearchResultsArgsSchema).min(1),
});

export const StopSearchArgsSchema = z.object({
  sessionId: z.string(),
});

export const StopSearchesArgsSchema = z.object({
  sessionIds: z.array(z.string()).min(1),
});
