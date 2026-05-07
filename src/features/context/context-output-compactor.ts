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
  references: ContextIndexReference[];
  seen: Map<string, ContextIndexReference>;
  toolName: string;
}

const STRUCTURED_CONTEXT_FIELDS = new Set(["diff", "listing", "output", "stderr", "stdout", "textContent"]);

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Create indexed text summary ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createIndexedTextSummary(reference: ContextIndexReference): string {
  return [
    `Indexed large output: ${reference.indexId}`,
    `Source: ${reference.source}`,
    `Original: ${reference.lineCount} lines, ${reference.originalLength} chars`,
    "",
    "Preview:",
    reference.preview,
  ].join("\n");
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
  return reference;
}

// 4. Compact content item ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 5. Compact structured value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactStructuredValue(value: unknown, fieldName: string | null, sourcePath: string, state: CompactionState): unknown {
  if (typeof value === "string") {
    if (fieldName !== null && STRUCTURED_CONTEXT_FIELDS.has(fieldName) && contextIndexService.shouldAutoIndex(value)) {
      return indexOnce(value, `${state.toolName}:${sourcePath}`, state);
    }
    return value;
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

// 6. Compact standard output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function compactStandardToolOutput(toolName: string, output: StandardToolOutput): StandardToolOutput {
  if (!contextIndexService.getRuntimeConfig().enabled) {
    return output;
  }
  const state: CompactionState = {
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
