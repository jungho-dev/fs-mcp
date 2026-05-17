/**
 * @file src/features/context/context-output-compactor.ts
 * @description Tool output indexing with optional data replacement.
 * @author JUNGHO
 * @since 2026-05-07
 */

import type {ServerResponseContent as SrvrResCont} from "@assets/type/common";
import type {StandardToolOutput as StndTlOtpt} from "@cores/responses/responses-tool-result";
import {type ContextIndexReference as CtxIdxRef, contextIndexService as ctxIdxSvc} from "@features/context/context-index-service";

interface CompactionState {
  indexedPayloads: number;
  references: CtxIdxRef[];
  replaceLargeOutputs: boolean;
  seen: Map<string, CtxIdxRef>;
  toolName: string;
}

const STR_CTX_FLD = new Set(["diff", "listing", "output", "stderr", "stdout", "textContent"]);
const STR_CLL_FLD = new Set(["batchResults", "branches", "commits", "contexts", "documents", "entries", "files", "items", "matches", "processes", "resources", "results", "sessions", "stashes", "tags", "tools"]);
const CBTN = new Set(["get_full_search", "list_directories", "read_files", "regex_searches"]);

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
  return CBTN.has(toolName) || [...CBTN].some((name) => toolName.endsWith(`__${name}`));
}

// 4. Index once ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexOnce(value: string, source: string, state: CompactionState): CtxIdxRef {
  const cached = state.seen.get(value);

  if (cached !== undefined) {
    return cached;
  }
  const reference = ctxIdxSvc.indexText(source, value, state.toolName);

  state.seen.set(value, reference);
  state.references.push(reference);
  state.indexedPayloads += 1;
  return reference;
}

// 5. Create reference payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createReferencePayload(reference: CtxIdxRef): Record<string, unknown> {
  return {
    contextIndex: reference,
    omitted: true,
    reason: "large output indexed into context store",
  };
}

// 6. Create reference text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createReferenceText(reference: CtxIdxRef): string {
  return `[context-index:${reference.indexId}] ${reference.preview}`;
}

// 7. Index content item ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexContentItem(item: SrvrResCont, index: number, state: CompactionState): SrvrResCont {
  if (item.type !== "text" || typeof item.text !== "string" || !ctxIdxSvc.shouldAutoIndex(item.text)) {
    return item;
  }
  const reference = indexOnce(item.text, `${state.toolName}:content[${index}]`, state);

  return state.replaceLargeOutputs ? {...item, text: createReferenceText(reference)} : item;
}

// 8. Index structured collection ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexStructuredCollection(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): CtxIdxRef | null {
  if (fieldName === null || !STR_CLL_FLD.has(fieldName) || (!Array.isArray(value) && !isRecord(value))) {
    return null;
  }
  const serialized = safeStringify(value);

  if (serialized === null || !ctxIdxSvc.shouldAutoIndex(serialized)) {
    return null;
  }
  return indexOnce(serialized, `${state.toolName}:${sourcePath}`, state);
}

// 9. Index structured value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function indexStructuredValue(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): unknown {
  if (typeof value === "string") {
    if (fieldName !== null && STR_CTX_FLD.has(fieldName) && ctxIdxSvc.shouldAutoIndex(value)) {
      const reference = indexOnce(value, `${state.toolName}:${sourcePath}`, state);
      return state.replaceLargeOutputs ? createReferencePayload(reference) : value;
    }
    return value;
  }

  const cllcRef = indexStructuredCollection(value, fieldName, sourcePath, state);
  if (cllcRef !== null) {
    return state.replaceLargeOutputs ? createReferencePayload(cllcRef) : value;
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
export function compactStandardToolOutput(toolName: string, output: StndTlOtpt): StndTlOtpt {
  const config = ctxIdxSvc.getRuntimeConfig();

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
    const strcCont = indexStructuredValue(output.data.structuredContent, "structuredContent", "structuredContent", state) as StndTlOtpt["data"]["structuredContent"];
    const text = content.map((item) => item.text ?? "").join("\n");
    const cmpcOtpt = state.replaceLargeOutputs ? {...output, data: {...output.data, content, structuredContent: strcCont, text}} : output;

    return state.references.length > 0 ? {...cmpcOtpt, contextIndexes: state.references} : cmpcOtpt;
  }
  catch (error) {
    return {
      ...output,
      contextIndexError: error instanceof Error ? error.message : String(error),
    };
  }
}
