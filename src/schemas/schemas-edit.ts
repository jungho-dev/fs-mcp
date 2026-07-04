/**
 * @file src/schemas/schemas-edit.ts
 * @description Edit argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const EdtBlArSc2 = z.object({
  file_path: z.string(),
  old_string: z.string().optional(),
  old_string_path: z.string().optional(),
  old_string_offset: z.number().optional().default(0),
  old_string_length: z.number().optional(),
  new_string: z.string().optional(),
  new_string_path: z.string().optional(),
  new_string_offset: z.number().optional().default(0),
  new_string_length: z.number().optional(),
  expected_replacements: z.number().optional().default(1),
}).refine((args) => args.old_string !== undefined || args.old_string_path !== undefined, {
  message: "Either old_string or old_string_path is required",
}).refine((args) => args.new_string !== undefined || args.new_string_path !== undefined, {
  message: "Either new_string or new_string_path is required",
});

export const EdtBlArSc = z.object({
  items: z.array(EdtBlArSc2).min(1),
});

export const EdtLnItmSc = z.object({
  file_path: z.string(),
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1).optional(),
  replacement: z.string().optional(),
  replacement_path: z.string().optional(),
  replacement_offset: z.number().optional().default(0),
  replacement_length: z.number().optional(),
  after: z.boolean().optional().default(false),
  expected_lines: z.number().optional(),
});

export const EdtLnArSc = z.object({
  items: z.array(EdtLnItmSc).min(1),
});
