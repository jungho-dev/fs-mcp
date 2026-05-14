/**
 * @file src/schemas/schemas-filesystem.ts
 * @description Filesystem argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

const INLINE_TEXT_ARGUMENT_MAX_LENGTH = 8_000;
const LARGE_INLINE_CONTENT_ERROR = "Large inline content can stall MCP hosts. Use content_path or args_path instead";
const INLINE_WRITE_CONTENT_DESCRIPTION = "Small inline text only. For large generated or pasted payloads, prefer top-level args_path or item-level content_path.";
const WRITE_CONTENT_PATH_DESCRIPTION = "Read UTF-8 content from this file. Preferred for large generated or pasted text.";

export const ReadFileArgsSchema = z.object({
  path: z.string(),
  isUrl: z.boolean().optional().default(false),
  offset: z.number().optional().default(0),
  length: z.number().optional(),
  options: z.record(z.any()).optional(),
});

export const ReadFilesArgsSchema = z.object({
  allowMissing: z.boolean().optional().default(false).describe("When true, missing local paths are returned as non-error missing results."),
  paths: z.array(z.string()).min(1).optional(),
  items: z.array(ReadFileArgsSchema).min(1).optional(),
}).refine((args) => args.paths !== undefined || args.items !== undefined, {
  message: "Either paths or items is required",
});

export const WriteFileArgsSchema = z.object({
  path: z.string(),
  content_path: z.string().optional().describe(WRITE_CONTENT_PATH_DESCRIPTION),
  content: z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, LARGE_INLINE_CONTENT_ERROR).optional().describe(INLINE_WRITE_CONTENT_DESCRIPTION),
  content_offset: z.number().optional().default(0),
  content_length: z.number().optional(),
  mode: z.enum(["rewrite", "append"]).default("rewrite"),
}).refine((args) => args.content !== undefined || args.content_path !== undefined, {
  message: "Either content or content_path is required",
});

export const WriteFileArgsFromArgsPathSchema = z.object({
  path: z.string(),
  content_path: z.string().optional().describe(WRITE_CONTENT_PATH_DESCRIPTION),
  content: z.string().optional().describe(INLINE_WRITE_CONTENT_DESCRIPTION),
  content_offset: z.number().optional().default(0),
  content_length: z.number().optional(),
  mode: z.enum(["rewrite", "append"]).default("rewrite"),
}).refine((args) => args.content !== undefined || args.content_path !== undefined, {
  message: "Either content or content_path is required",
});

export const WriteFilesArgsSchema = z.object({
  items: z.array(WriteFileArgsSchema).min(1),
});

export const WriteFilesArgsFromArgsPathSchema = z.object({
  items: z.array(WriteFileArgsFromArgsPathSchema).min(1),
});

export const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

export const CreateDirectoriesArgsSchema = z.object({
  paths: z.array(z.string()).min(1),
});

export const ListDirectoryArgsSchema = z.object({
  path: z.string(),
  depth: z.number().optional().default(2),
  maxEntries: z.number().int().positive().optional(),
  excludePatterns: z.array(z.string()).optional().default([]),
  includeFiles: z.boolean().optional().default(true),
});

export const ListDirectoriesArgsSchema = z.object({
  allowMissing: z.boolean().optional().default(false).describe("When true, missing local paths are returned as non-error missing results."),
  items: z.array(ListDirectoryArgsSchema).min(1),
});

export const CopyFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
  recursive: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

export const CopyFilesArgsSchema = z.object({
  items: z.array(CopyFileArgsSchema).min(1),
});

export const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

export const MoveFilesArgsSchema = z.object({
  items: z.array(MoveFileArgsSchema).min(1),
});

export const RemovePathArgsSchema = z.object({
  path: z.string(),
  recursive: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

export const RemoveFilesArgsSchema = z.object({
  items: z.array(RemovePathArgsSchema).min(1),
});

export const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

export const GetFileInfosArgsSchema = z.object({
  allowMissing: z.boolean().optional().default(false).describe("When true, missing local paths are returned as non-error missing results."),
  paths: z.array(z.string()).min(1),
});
