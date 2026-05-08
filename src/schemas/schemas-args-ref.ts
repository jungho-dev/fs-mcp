/**
 * @file src/schemas/schemas-args-ref.ts
 * @description Shared tool argument file-reference schema.
 * @author JUNGHO
 * @since 2026-05-06
 */

import { z } from "zod";

export const ArgsPathArgsSchema = z
  .object({
    args_path: z.string().describe("Path to a UTF-8 JSON file containing the complete arguments for this tool."),
    args_offset: z.number().optional().default(0).describe("Optional character offset inside args_path."),
    args_length: z.number().optional().describe("Optional character length to read from args_path."),
  })
  .strict();

const ArgsPathExtensionShape = {
  args_path: z.string().optional().describe("Path to a UTF-8 JSON file containing the complete arguments for this tool."),
  args_offset: z.number().optional().default(0).describe("Optional character offset inside args_path."),
  args_length: z.number().optional().describe("Optional character length to read from args_path."),
};

// Unwrap ZodEffects (refine/transform) layers to reach the base ZodObject.
function getBaseObject(schema: z.ZodTypeAny): z.AnyZodObject {
  if (schema instanceof z.ZodObject) {
    return schema;
  }
  if (schema instanceof z.ZodEffects) {
    return getBaseObject(schema.innerType());
  }
  throw new Error(`withArgsPathSchema: expected ZodObject, got ${schema.constructor.name}`);
}

// 1. With args path schema ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Merges args_path/args_offset/args_length as optional fields into the base object schema.
// Anthropic API rejects anyOf/oneOf at the root — type:"object" is required at root.
export function withArgsPathSchema<T extends z.ZodTypeAny>(schema: T): z.ZodObject<any> {
  return getBaseObject(schema).extend(ArgsPathExtensionShape);
}
