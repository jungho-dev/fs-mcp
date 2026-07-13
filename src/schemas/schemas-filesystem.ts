/**
 * @file src/schemas/schemas-filesystem.ts
 * @description Filesystem argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod/v3";

const IWCD = "Inline text accepted. For very large generated or pasted payloads, content_path or args_path can still reduce transport overhead.";
const WCPD = "Read UTF-8 content from this file. Preferred for large generated or pasted text.";

export const RdFlArgsSch = z.object({
  path: z.string(),
  isUrl: z.boolean().optional().default(false),
  offset: z.number().optional().default(0),
  length: z.number().optional(),
});

export const RdFlsArgsSch = z.object({
  allowMissing: z.boolean().optional().default(false).describe("When true, missing local paths are returned as non-error missing results."),
  paths: z.array(z.string()).min(1).optional(),
  items: z.array(RdFlArgsSch).min(1).optional(),
}).refine((args) => args.paths !== undefined || args.items !== undefined, {
  message: "Either paths or items is required",
});

export const RdLnRngItmSc = z.object({
  path: z.string(),
  start_line: z.number().int().min(1).optional().default(1).describe("First line to return, using 1-based line numbers."),
  line_count: z.number().int().min(1).optional().describe("Maximum number of lines to return. Omit to read through end of file."),
});

export const RdLnRngArSc = z.object({
  allowMissing: z.boolean().optional().default(false).describe("When true, missing local paths are returned as non-error missing results."),
  paths: z.array(z.string()).min(1).optional(),
  items: z.array(RdLnRngItmSc).min(1).optional(),
}).refine((args) => args.paths !== undefined || args.items !== undefined, {
  message: "Either paths or items is required",
});

export const WrtFlArgsSch = z.object({
  path: z.string(),
  content_path: z.string().optional().describe(WCPD),
  content: z.string().optional().describe(IWCD),
  content_offset: z.number().optional().default(0),
  content_length: z.number().optional(),
  mode: z.enum(["rewrite", "append"]).default("rewrite"),
}).refine((args) => args.content !== undefined || args.content_path !== undefined, {
  message: "Either content or content_path is required",
});

export const WrtFlArFrArP = z.object({
  path: z.string(),
  content_path: z.string().optional().describe(WCPD),
  content: z.string().optional().describe(IWCD),
  content_offset: z.number().optional().default(0),
  content_length: z.number().optional(),
  mode: z.enum(["rewrite", "append"]).default("rewrite"),
}).refine((args) => args.content !== undefined || args.content_path !== undefined, {
  message: "Either content or content_path is required",
});

export const WrtFlArSc = z.object({
  items: z.array(WrtFlArgsSch).min(1),
});

export const WrtFlArFrAr2 = z.object({
  items: z.array(WrtFlArFrArP).min(1),
});

export const CrtDiArSc = z.object({
  path: z.string(),
});

export const CrtDrArSc = z.object({
  paths: z.array(z.string()).min(1),
});

export const LstDiArSc = z.object({
  path: z.string(),
  depth: z.number().optional().default(2),
  maxEntries: z.number().int().positive().optional(),
  excludePatterns: z.array(z.string()).optional().default([]),
  includeFiles: z.boolean().optional().default(true),
});

export const LstDrArSc = z.object({
  allowMissing: z.boolean().optional().default(false).describe("When true, missing local paths are returned as non-error missing results."),
  items: z.array(LstDiArSc).min(1),
});

export const CpyFlArgsSch = z.object({
  source: z.string(),
  destination: z.string(),
  recursive: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

export const CpyFlArSc = z.object({
  items: z.array(CpyFlArgsSch).min(1),
});

export const MvFlArgsSch = z.object({
  source: z.string(),
  destination: z.string(),
});

export const MvFlsArgsSch = z.object({
  items: z.array(MvFlArgsSch).min(1),
});

export const RmvPtArSc = z.object({
  path: z.string(),
  recursive: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

export const RmvFlArSc = z.object({
  items: z.array(RmvPtArSc).min(1),
});

export const GtFlInArSc = z.object({
  path: z.string(),
});

export const GtFlInArSc2 = z.object({
  allowMissing: z.boolean().optional().default(false).describe("When true, missing local paths are returned as non-error missing results."),
  paths: z.array(z.string()).min(1),
});
