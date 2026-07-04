/**
 * @file src/schemas/schemas-search.ts
 * @description Search argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const RgxSrArSc = z.object({
  path: z.string(),
  pattern: z.string().optional(),
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
