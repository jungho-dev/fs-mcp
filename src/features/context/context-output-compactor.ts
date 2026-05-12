/**
 * @file src/features/context/context-output-compactor.ts
 * @description Tool output indexing without data replacement.
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

// 3. Index once ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 4. Index content item ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexContentItem(item: ServerResponseContent, index: number, state: CompactionState): void {
  if (item.type !== "text" || typeof item.text !== "string" || !contextIndexService.shouldAutoIndex(item.text)) {
    return;
  }
  indexOnce(item.text, `${state.toolName}:content[${index}]`, state);
}

// 5. Index structured collection ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexStructuredCollection(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): boolean {
  if (fieldName === null || !STRUCTURED_COLLECTION_FIELDS.has(fieldName) || (!Array.isArray(value) && !isRecord(value))) {
    return false;
  }
  const serialized = safeStringify(value);

  if (serialized === null || !contextIndexService.shouldAutoIndex(serialized)) {
    return false;
  }
  indexOnce(serialized, `${state.toolName}:${sourcePath}`, state);
  return true;
}

// 6. Index structured value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexStructuredValue(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): void {
  if (typeof value === "string") {
    if (fieldName !== null && STRUCTURED_CONTEXT_FIELDS.has(fieldName) && contextIndexService.shouldAutoIndex(value)) {
      indexOnce(value, `${state.toolName}:${sourcePath}`, state);
    }
    return;
  }

  if (indexStructuredCollection(value, fieldName, sourcePath, state)) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      indexStructuredValue(item, null, `${sourcePath}[${index}]`, state);
    });
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    indexStructuredValue(item, key, sourcePath.length > 0 ? `${sourcePath}.${key}` : key, state);
  });
}

// 7. Compact standard output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
    output.data.content.forEach((item, index) => {
      indexContentItem(item, index, state);
    });
    indexStructuredValue(output.data.structuredContent, "structuredContent", "structuredContent", state);
    return state.references.length > 0 ? {...output, contextIndexes: state.references} : output;
  }
  catch (error) {
    return {
      ...output,
      contextIndexError: error instanceof Error ? error.message : String(error),
    };
  }
}
