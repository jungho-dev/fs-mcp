/**
 * @file src/controllers/controllers-context.ts
 * @description MCP context index tools.
 * @author JUNGHO
 * @since 2026-05-07
 */

import type {ServerResult} from "@assets/type/common";
import {createBatchToolResponse, runParallelBatch} from "@controllers/controllers-batch";
import {createErrorResponse} from "@cores/responses/responses-error";
import {contextIndexService} from "@features/context/context-index-service";
import {readFileInternal} from "@features/filesystem/filesystem-service";
import {ClearContextsArgsSchema, IndexContextArgsSchema, IndexContextsArgsSchema, ListContextsArgsSchema, SearchContextsArgsSchema} from "@schemas/schemas-context";

// 1. Create source label ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createSourceLabel(source: string | undefined, contentPath: string | undefined): string {
  if (source !== undefined && source.trim().length > 0) {
    return source.trim();
  }
  if (contentPath !== undefined && contentPath.trim().length > 0) {
    return contentPath.trim();
  }
  return "manual";
}

// 2. Handle index context ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleIndexContext(args: unknown): Promise<ServerResult> {
  try {
    const parsed = IndexContextArgsSchema.parse(args);
    const content = parsed.content ?? await readFileInternal(parsed.content_path ?? "", parsed.content_offset, parsed.content_length);
    const reference = contextIndexService.indexText(createSourceLabel(parsed.source, parsed.content_path), content, "index_contexts");

    return {
      content: [
        {
          text: "Indexed context " + reference.indexId + "\nSource: " + reference.source + "\nOriginal: " + reference.lineCount + " lines, " + reference.originalLength + " chars",
          type: "text",
        },
      ],
      structuredContent: reference,
    };
  }
  catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

// 3. Handle index contexts ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleIndexContexts(args: unknown): Promise<ServerResult> {
  const parsed = IndexContextsArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleIndexContext(item));
  const response = createBatchToolResponse("index_contexts", results);

  return response;
}

// 4. Handle search contexts ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleSearchContexts(args: unknown): Promise<ServerResult> {
  try {
    const parsed = SearchContextsArgsSchema.parse(args);
    const queryResults = parsed.queries.map((query) => ({
      query,
      results: contextIndexService.search(query, parsed.limit, parsed.source),
    }));
    const text = queryResults.map((queryResult) => {
      const lines = ["Query: " + queryResult.query, "Results: " + queryResult.results.length];

      for (const result of queryResult.results) {
        lines.push("- " + result.indexId + " " + result.source + ":" + result.lineStart + "-" + result.lineEnd);
        lines.push(result.text);
      }
      return lines.join("\n");
    }).join("\n\n");

    return {
      content: [{text, type: "text"}],
      structuredContent: {
        queries: queryResults,
        source: parsed.source ?? null,
      },
    };
  }
  catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

// 5. Handle list contexts ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListContexts(args: unknown): Promise<ServerResult> {
  try {
    ListContextsArgsSchema.parse(args ?? {});
    const documents = contextIndexService.listDocuments();
    const text = documents.length === 0
      ? "No indexed contexts."
      : documents.map((document) => document.indexId + " | " + document.source + " | " + document.lineCount + " lines | " + document.createdAt).join("\n");

    return {
      content: [{text, type: "text"}],
      structuredContent: {
        count: documents.length,
        documents,
      },
    };
  }
  catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

// 6. Handle clear contexts ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleClearContexts(args: unknown): Promise<ServerResult> {
  try {
    const parsed = ClearContextsArgsSchema.parse(args ?? {});
    const clearedCount = contextIndexService.clearDocuments({
      indexIds: parsed.indexIds,
      source: parsed.source,
    });

    return {
      content: [{text: "Cleared " + clearedCount + " indexed context(s).", type: "text"}],
      structuredContent: {
        clearedCount,
      },
    };
  }
  catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}
