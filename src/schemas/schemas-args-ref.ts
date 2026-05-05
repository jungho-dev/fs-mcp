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

// 1. With args path schema ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function withArgsPathSchema<T extends z.ZodTypeAny>(schema: T): z.ZodUnion<[typeof ArgsPathArgsSchema, T]> {
  return z.union([ArgsPathArgsSchema, schema]);
}
