/**
 * @file src/schemas/schemas-edit.ts
 * @description Edit argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

const INLINE_TEXT_ARGUMENT_MAX_LENGTH = 2000;

export const EditBlockArgsSchema = z.object({
  file_path: z.string(),
  old_string: z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, "Use old_string_path for large search text").optional(),
  old_string_path: z.string().optional(),
  old_string_offset: z.number().optional().default(0),
  old_string_length: z.number().optional(),
  new_string: z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, "Use new_string_path for large replacement text").optional(),
  new_string_path: z.string().optional(),
  new_string_offset: z.number().optional().default(0),
  new_string_length: z.number().optional(),
  expected_replacements: z.number().optional().default(1),
}).refine((args) => args.old_string !== undefined || args.old_string_path !== undefined, {
  message: "Either old_string or old_string_path is required",
}).refine((args) => args.new_string !== undefined || args.new_string_path !== undefined, {
  message: "Either new_string or new_string_path is required",
});

export const EditBlocksArgsSchema = z.object({
  items: z.array(EditBlockArgsSchema).min(1),
});
