/**
 * @file src/mcp/schemas/filesystem-schema.ts
 * @description Filesystem argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const ReadFileArgsSchema = z.object({
  path: z.string(),
  isUrl: z.boolean().optional().default(false),
  offset: z.number().optional().default(0),
  length: z.number().optional().default(1000),
  options: z.record(z.any()).optional(),
});

export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

export const ReadFilesArgsSchema = z.union([
  z.object({
    paths: z.array(z.string()).min(1),
  }),
  z.object({
    items: z.array(ReadFileArgsSchema).min(1),
  }),
]);

export const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
  mode: z.enum(["rewrite", "append"]).default("rewrite"),
});

export const WriteFilesArgsSchema = z.object({
  items: z.array(WriteFileArgsSchema).min(1),
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
});

export const ListDirectoriesArgsSchema = z.object({
  items: z.array(ListDirectoryArgsSchema).min(1),
});

export const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

export const MoveFilesArgsSchema = z.object({
  items: z.array(MoveFileArgsSchema).min(1),
});

export const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

export const GetFileInfosArgsSchema = z.object({
  paths: z.array(z.string()).min(1),
});
