/**
 * @file src/schemas/schemas-search.ts
 * @description Search argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

const ITAML = 50_000;

export const StrSrArSc = z.object({
  path: z.string(),
  pattern: z.string().max(ITAML, "Use pattern_path for large patterns").optional(),
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

export const StrSrArSc2 = z.object({
  items: z.array(StrSrArSc).min(1),
});

export const RgxSrArSc = z.object({
  path: z.string(),
  pattern: z.string().max(ITAML, "Use pattern_path for large patterns").optional(),
  pattern_path: z.string().optional(),
  pattern_offset: z.number().optional().default(0),
  pattern_length: z.number().optional(),
  filePattern: z.string().optional(),
  ignoreCase: z.boolean().optional().default(true),
  maxResults: z.number().optional(),
  includeHidden: z.boolean().optional().default(false),
  contextLines: z.number().optional().default(2),
  timeout_ms: z.number().optional().default(10_000),
}).refine((args) => args.pattern !== undefined || args.pattern_path !== undefined, {
  message: "Either pattern or pattern_path is required",
});

export const RgxSrArSc2 = z.object({
  items: z.array(RgxSrArSc).min(1),
});

export const GtMrSrReArSc = z.object({
  sessionId: z.string(),
  offset: z.number().optional().default(0),
  length: z.number().optional(),
});

export const GtFlSrReArSc = z.object({
  items: z.array(GtMrSrReArSc).min(1),
});

export const StpSrArSc = z.object({
  sessionId: z.string(),
});

export const StpSrArSc2 = z.object({
  sessionIds: z.array(z.string()).min(1),
});
