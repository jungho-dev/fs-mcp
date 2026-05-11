/**
 * @file src/tools/tools-filesystem.ts
 * @description Filesystem and search tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema } from "@schemas/schemas-args-ref";
import { EditBlocksArgsSchema } from "@schemas/schemas-edit";
import { CreateDirectoriesArgsSchema, GetFileInfosArgsSchema, ListDirectoriesArgsSchema, MoveFilesArgsSchema, ReadFilesArgsSchema, RemoveFilesArgsSchema, RenameFilesArgsSchema, WriteFilesArgsSchema } from "@schemas/schemas-filesystem";
import { GetSearchResultsArgsSchema, ListSearchesArgsSchema, StartSearchesArgsSchema, StopSearchesArgsSchema } from "@schemas/schemas-search";
import { BATCH_GUIDANCE, CMD_PREFIX_DESCRIPTION, PATH_GUIDANCE, type ToolCatalogEntry } from "@tools/tools-const";
import { zodToJsonSchema } from "zod-to-json-schema";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const FILESYSTEM_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "read_files",
    description: `
      Read one or many files in parallel.
      Input modes:
      - { paths: string[] } for simple multi-file reads
      - { items: [{ path, isUrl?, offset?, length?, options? }] } for per-file pagination or URL reads
      This replaces the old single-file and multi-file read split with one batch-first surface.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `,
    inputSchema: zodToJsonSchema(withArgsPathSchema(ReadFilesArgsSchema)),
    annotations: {
      title: "Read Files",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "write_files",
    description: (`
      Write one or many files in parallel.
      Use items: [{ path, content?, content_path?, content_offset?, content_length?, mode? }].
      Inline content is capped; use content_path for large content so tool-call logs do not echo the full text.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(WriteFilesArgsSchema)),
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
    inputSchema: zodToJsonSchema(withArgsPathSchema(CreateDirectoriesArgsSchema)),
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
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(ListDirectoriesArgsSchema)),
    annotations: {
      title: "List Directories",
      readOnlyHint: true,
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
    inputSchema: zodToJsonSchema(withArgsPathSchema(MoveFilesArgsSchema)),
    annotations: {
      title: "Move/Rename Files",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "rename_files",
    description: (`
      Rename one or many files in parallel inside their current parent directory.
      Use items: [{ path, newName }].
      This changes only the basename. Use move_files when the parent directory must change.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(RenameFilesArgsSchema)),
    annotations: {
      title: "Rename Files",
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
      recursive defaults to false so non-empty directories fail unless explicitly requested.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(RemoveFilesArgsSchema)),
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
      Start one or many searches in parallel.
      Inline pattern is capped; use pattern_path for large patterns so tool-call logs do not echo the full pattern.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(StartSearchesArgsSchema)),
    annotations: {
      title: "Start Searches",
      readOnlyHint: true,
    },
  },
  {
    name: "get_search_results",
    description: (`
      Read one or many active search sessions in parallel.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(GetSearchResultsArgsSchema)),
    annotations: {
      title: "Get Search Results",
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
    inputSchema: zodToJsonSchema(withArgsPathSchema(StopSearchesArgsSchema)),
    annotations: {
      title: "Stop Searches",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "list_searches",
    description: (`
      List all active searches.
      Shows search IDs, search types, patterns, status, and runtime.
      Similar to list_sessions for terminal processes. Useful for managing
      multiple concurrent searches.
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(ListSearchesArgsSchema)),
    annotations: {
      title: "List Active Searches",
      readOnlyHint: true,
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
    inputSchema: zodToJsonSchema(withArgsPathSchema(GetFileInfosArgsSchema)),
    annotations: {
      title: "Get File Information",
      readOnlyHint: true,
    },
  },
  {
    name: "edit_blocks",
    description: (`
      Apply one or many exact edit operations in parallel.
      Use items: [{ file_path, old_string?, old_string_path?, new_string?, new_string_path?, expected_replacements? }].
      Inline old_string/new_string are capped; use old_string_path/new_string_path for large text so tool-call logs do not echo full blocks.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(EditBlocksArgsSchema)),
    annotations: {
      title: "Edit Blocks",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];
