/**
 * @file src/schemas/schemas-context.ts
 * @description Context index argument schemas.
 * @author JUNGHO
 * @since 2026-05-07
 */

import {z} from "zod";

const INLINE_TEXT_ARGUMENT_MAX_LENGTH = 50_000;

export const IndexContextArgsSchema = z.object({
  source: z.string().optional(),
  content: z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, "Use content_path for large content").optional(),
  content_path: z.string().optional(),
  content_offset: z.number().optional().default(0),
  content_length: z.number().optional(),
}).refine((args) => args.content !== undefined || args.content_path !== undefined, {
  message: "Either content or content_path is required",
});

export const IndexContextsArgsSchema = z.object({
  items: z.array(IndexContextArgsSchema).min(1),
});

export const SearchContextsArgsSchema = z.object({
  queries: z.array(z.string()).min(1),
  limit: z.number().optional().default(5),
  source: z.string().optional(),
}).strict();

export const ListContextsArgsSchema = z.object({}).strict();

export const ClearContextsArgsSchema = z.object({
  source: z.string().optional(),
  indexIds: z.array(z.string()).min(1).optional(),
}).strict();
