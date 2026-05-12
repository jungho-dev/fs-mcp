/**
 * @file src/schemas/schemas-config.ts
 * @description Configuration argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { CONFIG_QUERY_KEYS, isConfigQueryKey } from "@features/config/config-metadata";
import { z } from "zod";

const INLINE_TEXT_ARGUMENT_MAX_LENGTH = 50_000;

export const GetConfigValueArgsSchema = z.object({
  key: z.string().refine((value) => isConfigQueryKey(value), {
    message: `Key must be one of: ${CONFIG_QUERY_KEYS.join(", ")}`,
  }),
});

export const GetConfigsArgsSchema = z.object({
  items: z.array(GetConfigValueArgsSchema).min(1).optional(),
});

export const SetConfigValueArgsSchema = z.object({
  key: z.string(),
  value: z.union([z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, "Use value_path for large values"), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
  value_path: z.string().optional(),
  value_offset: z.number().optional().default(0),
  value_length: z.number().optional(),
}).refine((args) => args.value !== undefined || args.value_path !== undefined, {
  message: "Either value or value_path is required",
});

export const SetConfigValuesArgsSchema = z.object({
  items: z.array(SetConfigValueArgsSchema).min(1),
});
