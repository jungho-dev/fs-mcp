/**
 * @file src/schemas/schemas-web.ts
 * @description Web tool argument schemas.
 * @author JUNGHO
 * @since 2026-07-04
 */

import {z} from "zod/v3";

const WbDmpSch = z.enum(["html", "text", "markdown", "links", "readability"]);
const WbExDmpSch = z.enum(["text", "markdown", "links", "readability"]);
const WbRnDmpSch = z.enum(["html", "text", "links"]);

export const WbFtItSc = z.object({
  url: z.string(),
  dump: WbDmpSch.optional(),
  timeoutMs: z.number().optional(),
  maxBytes: z.number().optional(),
  userAgent: z.string().optional(),
});

export const WbFtArSc = z.object({
  url: z.string().optional(),
  items: z.array(WbFtItSc).min(1).optional(),
  dump: WbDmpSch.optional().default("markdown"),
  timeoutMs: z.number().optional().default(20_000),
  maxBytes: z.number().optional().default(5_000_000),
  maxRedirects: z.number().optional().default(5),
  userAgent: z.string().optional(),
});

export const WbRnArSc = z.object({
  url: z.string(),
  dump: WbRnDmpSch.optional().default("html"),
  selector: z.string().optional(),
  wait: z.number().optional().default(5),
  timeout: z.number().optional().default(120),
  waitUntil: z.string().optional(),
  userAgent: z.string().optional(),
  stealth: z.boolean().optional().default(false),
  evalScript: z.string().optional(),
  quiet: z.boolean().optional().default(false),
});

export const WbExItSc = z.object({
  html: z.string().optional(),
  path: z.string().optional(),
  dump: WbExDmpSch.optional().default("markdown"),
  baseUrl: z.string().optional(),
});

export const WbExArSc = z.object({
  items: z.array(WbExItSc).min(1),
});

export const DwFlItSc = z.object({
  url: z.string(),
  path: z.string(),
  maxBytes: z.number().optional(),
  timeoutMs: z.number().optional(),
  overwrite: z.boolean().optional().default(false),
});

export const DwFlArSc = z.object({
  items: z.array(DwFlItSc).min(1),
  maxBytes: z.number().optional(),
  timeoutMs: z.number().optional(),
  maxRedirects: z.number().optional().default(5),
  userAgent: z.string().optional(),
});
