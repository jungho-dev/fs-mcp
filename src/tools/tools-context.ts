/**
 * @file src/tools/tools-context.ts
 * @description Context index tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-07
 */

import {withArgsPathSchema} from "@schemas/schemas-args-ref";
import {ClearContextsArgsSchema, IndexContextsArgsSchema, ListContextsArgsSchema, SearchContextsArgsSchema} from "@schemas/schemas-context";
import {getDefaultContextIndexDbPath} from "@features/config/config-client";
import {CMD_PREFIX_DESCRIPTION, type ToolCatalogEntry} from "@tools/tools-const";
import {zodToJsonSchema} from "zod-to-json-schema";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CONTEXT_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "index_contexts",
    description: (
      "\n      Index one or many text payloads into fs-mcp's SQLite context index." +
      "\n      Use items: [{ source?, content?, content_path?, content_offset?, content_length? }]." +
      "\n      Inline content is capped; use content_path for large content so tool-call logs do not echo the full text." +
      `\n      Indexed content is stored at ${getDefaultContextIndexDbPath()} by default for the active client.` +
      "\n      " + CMD_PREFIX_DESCRIPTION
    ),
    inputSchema: zodToJsonSchema(withArgsPathSchema(IndexContextsArgsSchema)),
    annotations: {
      title: "Index Contexts",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "search_contexts",
    description: (
      "\n      Search fs-mcp's SQLite context index." +
      "\n      Use queries: string[] with optional limit and source filter." +
      "\n      " + CMD_PREFIX_DESCRIPTION
    ),
    inputSchema: zodToJsonSchema(withArgsPathSchema(SearchContextsArgsSchema)),
    annotations: {
      title: "Search Contexts",
      readOnlyHint: true,
    },
  },
  {
    name: "list_contexts",
    description: (
      "\n      List documents currently stored in fs-mcp's SQLite context index." +
      "\n      " + CMD_PREFIX_DESCRIPTION
    ),
    inputSchema: zodToJsonSchema(withArgsPathSchema(ListContextsArgsSchema)),
    annotations: {
      title: "List Contexts",
      readOnlyHint: true,
    },
  },
  {
    name: "clear_contexts",
    description: (
      "\n      Clear indexed contexts by source, indexIds, or all contexts when no filter is provided." +
      "\n      This only deletes fs-mcp context-index rows, not source files." +
      "\n      " + CMD_PREFIX_DESCRIPTION
    ),
    inputSchema: zodToJsonSchema(withArgsPathSchema(ClearContextsArgsSchema)),
    annotations: {
      title: "Clear Contexts",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];
