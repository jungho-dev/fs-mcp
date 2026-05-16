/**
 * @file src/schemas/schemas-context.ts
 * @description Context index argument schemas.
 * @author JUNGHO
 * @since 2026-05-16
 */

import {z} from "zod";

export const CtxIdxLmtSch = z.number().int().min(1).max(500).optional();

export const LstCtIdArSc = z.object({
  limit: CtxIdxLmtSch,
  source: z.string().min(1).optional(),
});

export const SrcCtIdArSc = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  query: z.string().min(1),
  source: z.string().min(1).optional(),
});

export const ClrCtIdArSc = z.object({
  all: z.boolean().optional(),
  before: z.string().min(1).optional(),
  indexIds: z.array(z.string().min(1)).min(1).optional(),
  source: z.string().min(1).optional(),
  vacuum: z.boolean().optional(),
}).refine((args) => args.all === true || args.before !== undefined || args.indexIds !== undefined || args.source !== undefined, {
  message: "Set all=true or provide indexIds, source, or before",
});

export const CtxIdxLmtSc2 = CtxIdxLmtSch;
export const LstCtIdArSc2 = LstCtIdArSc;
export const SrcCtIdArSc2 = SrcCtIdArSc;
export const ClrCtIdArSc2 = ClrCtIdArSc;
export {
  LstCtIdArSc as ListContextIndexArgsSchema,
  SrcCtIdArSc as SearchContextIndexArgsSchema,
  ClrCtIdArSc as ClearContextIndexArgsSchema,
};
