/**
 * @file src/schemas/schemas-search.ts
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

export const StartSearchesArgsSchema = z.object({
  items: z.array(StartSearchArgsSchema).min(1),
});

export const GetMoreSearchResultsArgsSchema = z.object({
  sessionId: z.string(),
  offset: z.number().optional().default(0),
  length: z.number().optional(),
});

export const GetSearchResultsArgsSchema = z.object({
  items: z.array(GetMoreSearchResultsArgsSchema).min(1),
});

export const StopSearchArgsSchema = z.object({
  sessionId: z.string(),
});

export const StopSearchesArgsSchema = z.object({
  sessionIds: z.array(z.string()).min(1),
});

export const ListSearchesArgsSchema = z.object({});
