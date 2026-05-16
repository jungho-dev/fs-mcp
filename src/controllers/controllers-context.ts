/**
 * @file src/controllers/controllers-context.ts
 * @description MCP context index tools.
 * @author JUNGHO
 * @since 2026-05-16
 */

import type {ServerResult} from "@assets/type/common";
import {createToolTextResponse as crtTlTxtRes2} from "@cores/responses/responses-tool-result";
import {ctxIdxSvc as ctxIdxSvc2} from "@features/context/context-index-service";
import {ClrCtIdArSc, LstCtIdArSc, SrcCtIdArSc} from "@schemas/schemas-context";

// 1. Handle list context index ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function handleListContextIndex(args: unknown): ServerResult {
  const parsed = LstCtIdArSc.parse(args ?? {});
  const documents = ctxIdxSvc2.listDocuments(parsed);
  const totalCount = ctxIdxSvc2.countDocuments(parsed.source);

  return crtTlTxtRes2("Context index documents: " + documents.length + " of " + totalCount, {
    structuredContent: {
      documents,
      totalCount,
    },
  });
}

// 2. Handle search context index ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function handleSearchContextIndex(args: unknown): ServerResult {
  const parsed = SrcCtIdArSc.parse(args);
  const results = ctxIdxSvc2.search(parsed.query, parsed.limit, parsed.source);

  return crtTlTxtRes2("Context index search results: " + results.length, {
    structuredContent: {
      results,
      totalCount: results.length,
    },
  });
}

// 3. Handle clear context index ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function handleClearContextIndex(args: unknown): ServerResult {
  const parsed = ClrCtIdArSc.parse(args ?? {});
  const deletedCount = ctxIdxSvc2.clearDocuments(parsed);

  return crtTlTxtRes2("Deleted context index documents: " + deletedCount, {
    structuredContent: {
      deletedCount,
    },
  });
}
