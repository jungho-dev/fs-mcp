/**
 * @file src/features/context/context-output-compactor.ts
 * @description Tool output compaction through the context index.
 * @author JUNGHO
 * @since 2026-05-07
 */

import type {ServerResponseContent} from "@assets/type/common";
import type {StandardToolOutput} from "@cores/responses/responses-tool-result";
import {type ContextIndexReference, contextIndexService} from "@features/context/context-index-service";

interface CompactionState {
  indexedPayloads: number;
  references: ContextIndexReference[];
  seen: Map<string, ContextIndexReference>;
  toolName: string;
}

const STRUCTURED_CONTEXT_FIELDS = new Set(["diff", "listing", "output", "stderr", "stdout", "textContent"]);
const STRUCTURED_COLLECTION_FIELDS = new Set(["batchResults", "branches", "commits", "contexts", "documents", "entries", "files", "items", "matches", "processes", "resources", "results", "sessions", "stashes", "tags", "tools"]);

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Safe stringify ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  }
  catch {
    return null;
  }
}

// 3. Count payload items ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countPayloadItems(value: unknown): number | null {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (isRecord(value)) {
    return Object.keys(value).length;
  }
  return null;
}

// 4. Create indexed text summary ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createIndexedTextSummary(reference: ContextIndexReference): string {
  return [`Indexed output: ${reference.indexId}`, `Original: ${reference.originalLength} chars`, "Preview:", reference.preview].join("\n");
}

// 5. Create indexed structured summary ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function createIndexedStructuredSummary(reference: ContextIndexReference, value: unknown): Record<string, unknown> {
  const itemCount = countPayloadItems(value);

  return {
    indexId: reference.indexId,
    indexed: true,
    itemCount: itemCount ?? undefined,
    omitted: true,
    originalLength: reference.originalLength,
    payloadType: Array.isArray(value) ? "array" : "object",
    preview: reference.preview,
  };
}

// 6. Index once ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexOnce(value: string, source: string, state: CompactionState): ContextIndexReference {
  const cached = state.seen.get(value);

  if (cached !== undefined) {
    return cached;
  }
  const reference = contextIndexService.indexText(source, value, state.toolName);

  state.seen.set(value, reference);
  state.references.push(reference);
  state.indexedPayloads += 1;
  return reference;
}

// 7. Compact content item ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactContentItem(item: ServerResponseContent, index: number, state: CompactionState): ServerResponseContent {
  if (item.type !== "text" || typeof item.text !== "string" || !contextIndexService.shouldAutoIndex(item.text)) {
    return item;
  }
  const reference = indexOnce(item.text, `${state.toolName}:content[${index}]`, state);

  return {
    ...item,
    text: createIndexedTextSummary(reference),
  };
}

// 8. Compact structured collection ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactStructuredCollection(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): unknown | null {
  if (fieldName === null || !STRUCTURED_COLLECTION_FIELDS.has(fieldName) || (!Array.isArray(value) && !isRecord(value))) {
    return null;
  }
  const serialized = safeStringify(value);

  if (serialized === null || !contextIndexService.shouldAutoIndex(serialized)) {
    return null;
  }
  const reference = indexOnce(serialized, `${state.toolName}:${sourcePath}`, state);

  return createIndexedStructuredSummary(reference, value);
}

// 9. Compact structured value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactStructuredValue(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): unknown {
  if (typeof value === "string") {
    if (fieldName !== null && STRUCTURED_CONTEXT_FIELDS.has(fieldName) && contextIndexService.shouldAutoIndex(value)) {
      return indexOnce(value, `${state.toolName}:${sourcePath}`, state);
    }
    return value;
  }
  const compactedCollection = compactStructuredCollection(value, fieldName, sourcePath, state);

  if (compactedCollection !== null) {
    return compactedCollection;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => compactStructuredValue(item, null, `${sourcePath}[${index}]`, state));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, compactStructuredValue(item, key, sourcePath.length > 0 ? `${sourcePath}.${key}` : key, state)]),
  );
}

// 10. Compact standard output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function compactStandardToolOutput(toolName: string, output: StandardToolOutput): StandardToolOutput {
  if (!contextIndexService.getRuntimeConfig().enabled) {
    return output;
  }
  const state: CompactionState = {
    indexedPayloads: 0,
    references: [],
    seen: new Map(),
    toolName,
  };

  try {
    const compactedContent = output.data.content.map((item, index) => compactContentItem(item, index, state));
    const compactedStructuredContent = compactStructuredValue(output.data.structuredContent, "structuredContent", "structuredContent", state) as StandardToolOutput["data"]["structuredContent"];
    const compactedOutput: StandardToolOutput = {
      ...output,
      data: {
        content: compactedContent,
        structuredContent: compactedStructuredContent,
        text: compactedContent.map((item) => item.text ?? "").join("\n"),
      },
    };

    if (state.references.length > 0) {
      compactedOutput.contextIndexes = state.references;
    }
    return compactedOutput;
  }
  catch (error) {
    return {
      ...output,
      contextIndexError: error instanceof Error ? error.message : String(error),
    };
  }
}
