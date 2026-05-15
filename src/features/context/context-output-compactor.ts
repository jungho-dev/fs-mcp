/**
 * @file src/features/context/context-output-compactor.ts
 * @description Tool output indexing with optional data replacement.
 * @author JUNGHO
 * @since 2026-05-07
 */

import type {ServerResponseContent} from "@assets/type/common";
import type {StandardToolOutput} from "@cores/responses/responses-tool-result";
import {type ContextIndexReference, contextIndexService} from "@features/context/context-index-service";

interface CompactionState {
  indexedPayloads: number;
  references: ContextIndexReference[];
  replaceLargeOutputs: boolean;
  seen: Map<string, ContextIndexReference>;
  toolName: string;
}

const STRUCTURED_CONTEXT_FIELDS = new Set(["diff", "listing", "output", "stderr", "stdout", "textContent"]);
const STRUCTURED_COLLECTION_FIELDS = new Set(["batchResults", "branches", "commits", "contexts", "documents", "entries", "files", "items", "matches", "processes", "resources", "results", "sessions", "stashes", "tags", "tools"]);
const COMPACTION_BYPASS_TOOL_NAMES = new Set(["get_full_search", "list_directories", "read_files"]);

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

// 3. Bypass output compaction check ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function shouldBypassOutputCompaction(toolName: string): boolean {
  return COMPACTION_BYPASS_TOOL_NAMES.has(toolName) || [...COMPACTION_BYPASS_TOOL_NAMES].some((name) => toolName.endsWith(`__${name}`));
}

// 4. Index once ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 5. Create reference payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createReferencePayload(reference: ContextIndexReference): Record<string, unknown> {
  return {
    contextIndex: reference,
    omitted: true,
    reason: "large output indexed into context store",
  };
}

// 6. Create reference text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createReferenceText(reference: ContextIndexReference): string {
  return `[context-index:${reference.indexId}] ${reference.preview}`;
}

// 7. Index content item ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexContentItem(item: ServerResponseContent, index: number, state: CompactionState): ServerResponseContent {
  if (item.type !== "text" || typeof item.text !== "string" || !contextIndexService.shouldAutoIndex(item.text)) {
    return item;
  }
  const reference = indexOnce(item.text, `${state.toolName}:content[${index}]`, state);

  return state.replaceLargeOutputs ? {...item, text: createReferenceText(reference)} : item;
}

// 8. Index structured collection ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexStructuredCollection(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): ContextIndexReference | null {
  if (fieldName === null || !STRUCTURED_COLLECTION_FIELDS.has(fieldName) || (!Array.isArray(value) && !isRecord(value))) {
    return null;
  }
  const serialized = safeStringify(value);

  if (serialized === null || !contextIndexService.shouldAutoIndex(serialized)) {
    return null;
  }
  return indexOnce(serialized, `${state.toolName}:${sourcePath}`, state);
}

// 9. Index structured value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexStructuredValue(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): unknown {
  if (typeof value === "string") {
    if (fieldName !== null && STRUCTURED_CONTEXT_FIELDS.has(fieldName) && contextIndexService.shouldAutoIndex(value)) {
      const reference = indexOnce(value, `${state.toolName}:${sourcePath}`, state);
      return state.replaceLargeOutputs ? createReferencePayload(reference) : value;
    }
    return value;
  }

  const collectionReference = indexStructuredCollection(value, fieldName, sourcePath, state);
  if (collectionReference !== null) {
    return state.replaceLargeOutputs ? createReferencePayload(collectionReference) : value;
  }
  if (Array.isArray(value)) {
    const nextValue = value.map((item, index) => indexStructuredValue(item, null, `${sourcePath}[${index}]`, state));
    return state.replaceLargeOutputs ? nextValue : value;
  }
  if (!isRecord(value)) {
    return value;
  }
  const nextValue = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, indexStructuredValue(item, key, sourcePath.length > 0 ? `${sourcePath}.${key}` : key, state)]));

  return state.replaceLargeOutputs ? nextValue : value;
}

// 10. Compact standard output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function compactStandardToolOutput(toolName: string, output: StandardToolOutput): StandardToolOutput {
  const config = contextIndexService.getRuntimeConfig();

  if (!config.enabled) {
    return output;
  }
  if (shouldBypassOutputCompaction(toolName)) {
    return output;
  }
  const state: CompactionState = {
    indexedPayloads: 0,
    references: [],
    replaceLargeOutputs: config.replaceLargeOutputs,
    seen: new Map(),
    toolName,
  };

  try {
    const content = output.data.content.map((item, index) => indexContentItem(item, index, state));
    const structuredContent = indexStructuredValue(output.data.structuredContent, "structuredContent", "structuredContent", state) as StandardToolOutput["data"]["structuredContent"];
    const text = content.map((item) => item.text ?? "").join("\n");
    const compactedOutput = state.replaceLargeOutputs ? {...output, data: {...output.data, content, structuredContent, text}} : output;

    return state.references.length > 0 ? {...compactedOutput, contextIndexes: state.references} : compactedOutput;
  }
  catch (error) {
    return {
      ...output,
      contextIndexError: error instanceof Error ? error.message : String(error),
    };
  }
}
