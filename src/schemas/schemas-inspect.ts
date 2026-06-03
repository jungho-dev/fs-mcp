/**
 * @file src/schemas/schemas-inspect.ts
 * @description Filesystem inspection argument schemas.
 * @author JUNGHO
 * @since 2026-06-03
 */

import {z} from "zod";

export const InspExtrSc = z.object({
  name: z.string(),
  regex: z.string(),
});

export const InspReqSc = z.object({
  id: z.string().optional(),
  op: z.enum(["count-files", "search", "json-pick", "snippet", "git-status"]),
  path: z.string(),
  glob: z.string().optional(),
  recursive: z.boolean().optional(),
  pattern: z.string().optional(),
  literal: z.boolean().optional().default(false),
  filePattern: z.string().optional(),
  maxMatches: z.number().optional().default(20),
  extract: z.array(InspExtrSc).min(1).optional(),
  pointers: z.array(z.string()).optional(),
  patterns: z.array(z.string()).optional(),
  contextLines: z.number().optional().default(2),
  maxSnippets: z.number().optional().default(10),
});

export const InspArSc = z.object({
  root: z.string(),
  requests: z.array(InspReqSc).min(1),
  maxSnippetChars: z.number().optional().default(6000),
  mode: z.enum(["strict", "balanced", "speed"]).optional().default("strict"),
});
