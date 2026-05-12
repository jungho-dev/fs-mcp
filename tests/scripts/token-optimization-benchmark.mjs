/**
 * Token-oriented output compaction benchmark.
 */

import {configManager} from "../../src/features/config/config-store.ts";
import {contextIndexService} from "../../src/features/context/context-index-service.ts";
import {compactStandardToolOutput} from "../../src/features/context/context-output-compactor.ts";

const TOKEN_CHARS = 4;
const BENCHMARK_PREFIX = "bench_";

function estimateTokens(value) {
  return Math.ceil(JSON.stringify(value).length / TOKEN_CHARS);
}

function measureScenario(name, output) {
  const beforeChars = JSON.stringify(output).length;
  const beforeTokens = estimateTokens(output);
  const startedAt = performance.now();
  const compacted = compactStandardToolOutput(name, structuredClone(output));
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const afterChars = JSON.stringify(compacted).length;
  const afterTokens = estimateTokens(compacted);
  const savedTokens = beforeTokens - afterTokens;
  const savedPercent = beforeTokens === 0 ? 0 : Math.round((savedTokens / beforeTokens) * 10_000) / 100;

  return {
    afterChars,
    afterTokens,
    beforeChars,
    beforeTokens,
    contextIndexes: Array.isArray(compacted.contextIndexes) ? compacted.contextIndexes.length : 0,
    durationMs,
    name,
    savedPercent,
    savedTokens,
  };
}

function clearBenchmarkContexts() {
  const indexIds = contextIndexService
    .listDocuments()
    .filter((document) => document.source.startsWith(BENCHMARK_PREFIX) || String(document.toolName ?? "").startsWith(BENCHMARK_PREFIX))
    .map((document) => document.indexId);

  if (indexIds.length > 0) {
    contextIndexService.clearDocuments({indexIds});
  }
}

function createBaseOutput(toolName, text, structuredContent) {
  return {
    data: {
      content: [{text, type: "text"}],
      structuredContent,
      text,
    },
    durationMs: 1,
    error: null,
    schemaVersion: 1,
    status: "success",
    toolName,
  };
}

function createLargeTextScenario() {
  const text = Array.from({length: 420}, (_value, index) => `line-${index}: ${"alpha beta gamma delta ".repeat(10)}`).join("\n");

  return createBaseOutput("bench_large_text", text, {
    fileName: "large.txt",
    filePath: "C:/tmp/large.txt",
    fileType: "text",
    textContent: text,
  });
}

function createSearchResultsScenario() {
  const results = Array.from({length: 180}, (_value, index) => ({
    file: `C:/workspace/src/module-${index % 18}/file-${index}.ts`,
    line: index + 1,
    match: `function match${index}() { return "${"search payload ".repeat(16)}"; }`,
    type: "content",
  }));
  const text = [
    "Search session: benchmark",
    "Status: COMPLETED",
    "Total results found: 180 (180 matches)",
    "Results:",
    ...results.map((result) => `${result.file}:${result.line} - ${result.match.slice(0, 100)}...`),
  ].join("\n");

  return createBaseOutput("bench_search_results", text, {
    hasMoreResults: false,
    isComplete: true,
    results,
    runtime: 125,
    totalMatches: 180,
    totalResults: 180,
  });
}

function createBatchResultsScenario() {
  const batchResults = Array.from({length: 80}, (_value, index) => ({
    index,
    inputPreview: `C:/workspace/input-${index}.txt`,
    ok: true,
    result: {
      content: [{text: `Result ${index}: ${"batch output ".repeat(40)}`, type: "text"}],
      structuredContent: {
        originalLength: 900 + index,
        textContent: `Structured ${index}: ${"structured payload ".repeat(45)}`,
      },
    },
  }));
  const text = batchResults.map((item) => `[${item.index}] OK ${item.inputPreview}`).join("\n");

  return createBaseOutput("bench_batch_results", text, {
    batchResults,
    failedCount: 0,
    succeededCount: batchResults.length,
    totalCount: batchResults.length,
  });
}

const originalConfig = await configManager.getConfig();
await configManager.updateConfig({
  ...originalConfig,
  contextIndexEnabled: true,
});
clearBenchmarkContexts();

let report;

try {
  const scenarios = [
    createLargeTextScenario(),
    createSearchResultsScenario(),
    createBatchResultsScenario(),
  ];
  const results = scenarios.map((scenario) => measureScenario(scenario.toolName, scenario));
  const totals = results.reduce((acc, result) => ({
    afterChars: acc.afterChars + result.afterChars,
    afterTokens: acc.afterTokens + result.afterTokens,
    beforeChars: acc.beforeChars + result.beforeChars,
    beforeTokens: acc.beforeTokens + result.beforeTokens,
    contextIndexes: acc.contextIndexes + result.contextIndexes,
    savedTokens: acc.savedTokens + result.savedTokens,
  }), {
    afterChars: 0,
    afterTokens: 0,
    beforeChars: 0,
    beforeTokens: 0,
    contextIndexes: 0,
    savedTokens: 0,
  });

  report = {
    generatedAt: new Date().toISOString(),
    results,
    totals: {
      ...totals,
      savedPercent: Math.round((totals.savedTokens / totals.beforeTokens) * 10_000) / 100,
    },
  };
}
finally {
  clearBenchmarkContexts();
  await configManager.updateConfig(originalConfig);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
