/**
 * @file src/schemas/schemas-config.ts
 * @description Configuration argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { CONFIG_QUERY_KEYS, isConfigQueryKey } from "@features/config/config-metadata";
import { z } from "zod";

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
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
});

export const SetConfigValuesArgsSchema = z.object({
  items: z.array(SetConfigValueArgsSchema).min(1),
});
