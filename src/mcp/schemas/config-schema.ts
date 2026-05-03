/**
 * @file src/mcp/schemas/config-schema.ts
 * @description Configuration argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { z } from "zod";

export const GetConfigArgsSchema = z.object({});

export const SetConfigValueArgsSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
});

export const SetConfigValuesArgsSchema = z.object({
  items: z.array(SetConfigValueArgsSchema).min(1),
});
