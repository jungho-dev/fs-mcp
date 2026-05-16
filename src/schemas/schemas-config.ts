/**
 * @file src/schemas/schemas-config.ts
 * @description Configuration argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { CFG_QRY_KYS, isConfigQueryKey as isCfgQryKy } from "@features/config/config-metadata";
import { z } from "zod";

const ITAML = 50_000;

export const GtCfVaArSc = z.object({
  key: z.string().refine((value) => isCfgQryKy(value), {
    message: `Key must be one of: ${CFG_QRY_KYS.join(", ")}`,
  }),
});

export const GtCnArSc = z.object({
  items: z.array(GtCfVaArSc).min(1).optional(),
});

export const StCfVaArSc2 = z.object({
  key: z.string(),
  value: z.union([z.string().max(ITAML, "Use value_path for large values"), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
  value_path: z.string().optional(),
  value_offset: z.number().optional().default(0),
  value_length: z.number().optional(),
}).refine((args) => args.value !== undefined || args.value_path !== undefined, {
  message: "Either value or value_path is required",
});

export const StCfVaArSc = z.object({
  items: z.array(StCfVaArSc2).min(1),
});
