/**
 * @file src/mcp/schemas/edit-schema.mts
 * @description Edit argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const EditBlockArgsSchema = z.object({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  expected_replacements: z.number().optional().default(1),
});
