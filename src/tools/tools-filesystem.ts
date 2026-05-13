/**
 * @file src/tools/tools-filesystem.ts
 * @description Filesystem and search tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema } from "@schemas/schemas-args-ref";
import { EditBlocksArgsSchema } from "@schemas/schemas-edit";
import { CopyFilesArgsSchema, CreateDirectoriesArgsSchema, GetFileInfosArgsSchema, ListDirectoriesArgsSchema, MoveFilesArgsSchema, ReadFilesArgsSchema, RemoveFilesArgsSchema, WriteFilesArgsSchema } from "@schemas/schemas-filesystem";
import { GetFullSearchResultsArgsSchema, StartSearchesArgsSchema, StopSearchesArgsSchema } from "@schemas/schemas-search";
import { APPLY_PATCH_PERFORMANCE_GUIDANCE, BATCH_GUIDANCE, CMD_PREFIX_DESCRIPTION, PATH_GUIDANCE, createToolCatalogEntry, type ToolCatalogEntry, type ToolCatalogEntryConfig } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const FILESYSTEM_TOOL_DEFINITIONS = [
  {
    name: "read_files",
    description: `
      Read files in parallel.
      Use paths for simple reads or items for offset, length, headers, or URL reads.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `,
    inputSchema: withArgsPathSchema(ReadFilesArgsSchema),
    annotations: {
      title: "Read Files",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "write_files",
    description: (`
      Write files in parallel.
      Prefer content_path or args_path for large text.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(WriteFilesArgsSchema),
    annotations: {
      title: "Write Files",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "create_directories",
    description: (`
      Create one or many directories in parallel.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(CreateDirectoriesArgsSchema),
    annotations: {
      title: "Create Directories",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "list_directories",
    description: (`
      List one or many directories in parallel.
      Use items: [{ path, depth?, maxEntries?, excludePatterns?, includeFiles? }].
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(ListDirectoriesArgsSchema),
    annotations: {
      title: "List Directories",
      readOnlyHint: true,
    },
  },
  {
    name: "copy_files",
    description: (`
      Copy one or many files or directories in parallel.
      Use items: [{ source, destination, recursive?, force? }].
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(CopyFilesArgsSchema),
    annotations: {
      title: "Copy Files",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "move_files",
    description: (`
      Move or rename one or many files in parallel.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(MoveFilesArgsSchema),
    annotations: {
      title: "Move/Rename Files",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "remove_files",
    description: (`
      Delete one or many files or directories in parallel.
      Use items: [{ path, recursive?, force? }].
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(RemoveFilesArgsSchema),
    annotations: {
      title: "Remove Files",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "start_searches",
    description: (`
      Start searches in parallel.
      Use pattern_path for large patterns and filePattern to narrow the target set.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(StartSearchesArgsSchema),
    annotations: {
      title: "Start Searches",
      readOnlyHint: true,
    },
  },
  {
    name: "get_full_search",
    description: (`
      Read one or many active search sessions in parallel with full per-item result text.
      Use offset or length for pagination.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(GetFullSearchResultsArgsSchema),
    annotations: {
      title: "Get Full Search Results",
      readOnlyHint: true,
    },
  },
  {
    name: "stop_searches",
    description: (`
      Stop one or many active searches in parallel.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(StopSearchesArgsSchema),
    annotations: {
      title: "Stop Searches",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "get_file_infos",
    description: (`
      Retrieve metadata for one or many files in parallel.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(GetFileInfosArgsSchema),
    annotations: {
      title: "Get File Information",
      readOnlyHint: true,
    },
  },
  {
    name: "edit_blocks",
    description: (`
      Apply exact block replacements in parallel.
      Prefer *_path or args_path for large text.
      ${APPLY_PATCH_PERFORMANCE_GUIDANCE}
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(EditBlocksArgsSchema),
    annotations: {
      title: "Edit Blocks",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
] satisfies ToolCatalogEntryConfig[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const FILESYSTEM_TOOL_CATALOG: ToolCatalogEntry[] = FILESYSTEM_TOOL_DEFINITIONS.map((entry) => createToolCatalogEntry(entry));
