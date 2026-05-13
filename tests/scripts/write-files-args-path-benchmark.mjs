/**
 * @file tests/scripts/write-files-args-path-benchmark.mjs
 * @description write_files args_path transport benchmark.
 * @author JUNGHO
 * @since 2026-05-13
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchToolCall } from "../../out/tools/tools-dispatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-write-files-benchmark");
const TOKEN_CHARS = 4;
const RUN_COUNT = 7;
const INLINE_REJECTION_PATTERN = /Large inline content can stall MCP hosts/;
const BENCHMARK_SCENARIO = {
  contentLength: 4_000,
  itemCount: 20,
  name: "batch_20x4k",
};
const GUARD_SCENARIO = {
  contentLength: 20_000,
  itemCount: 1,
  name: "oversized_single_20k",
};

function estimateTokens(charCount) {
  return Math.ceil(charCount / TOKEN_CHARS);
}

function summarizeRuns(runs) {
  const total = runs.reduce((acc, value) => acc + value, 0);

  return {
    avgMs: Math.round((total / runs.length) * 100) / 100,
    maxMs: Math.max(...runs),
    minMs: Math.min(...runs),
    runs,
  };
}

function buildPayload(name, itemCount, contentLength) {
  const outputDir = path.join(TEST_DIR, name, "outputs");
  const items = Array.from({ length: itemCount }, (_value, index) => ({
    content: `${String(index).padStart(2, "0")}:${"x".repeat(contentLength - 3)}`,
    mode: "rewrite",
    path: path.join(outputDir, `item-${String(index).padStart(2, "0")}.txt`),
  }));

  return {
    items,
    outputDir,
  };
}

function parseToolOutput(result) {
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  return result.structuredContent;
}

function extractBatchResults(result) {
  const output = parseToolOutput(result);
  return output.data.structuredContent.results;
}

function extractErrorMessage(result) {
  const output = parseToolOutput(result);
  return output.error.message;
}

async function prepareScenario(payload) {
  await fs.rm(payload.outputDir, { force: true, recursive: true });
  await fs.mkdir(payload.outputDir, { recursive: true });
}

async function verifyFiles(items) {
  for (const item of items) {
    const written = await fs.readFile(item.path, "utf8");

    assert.equal(written, item.content);
  }
}

async function runWriteMode(mode, payload, argsFilePath) {
  const runs = [];
  const payloadText = JSON.stringify({ items: payload.items });
  const callArgs = mode === "inline"
    ? { items: payload.items }
    : { args_length: payloadText.length, args_path: argsFilePath };

  for (let runIndex = 0; runIndex < RUN_COUNT; runIndex += 1) {
    await prepareScenario(payload);
    const startedAt = performance.now();
    const result = await dispatchToolCall("write_files", structuredClone(callArgs));
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const batchResults = extractBatchResults(result);

    assert.equal(result.isError, false);
    assert.equal(batchResults.length, payload.items.length);
    assert.equal(batchResults.every((item) => item.ok === true), true);
    await verifyFiles(payload.items);
    runs.push(durationMs);
  }

  return summarizeRuns(runs);
}

async function runBenchmarkScenario() {
  const payload = buildPayload(BENCHMARK_SCENARIO.name, BENCHMARK_SCENARIO.itemCount, BENCHMARK_SCENARIO.contentLength);
  const payloadBody = { items: payload.items };
  const payloadText = JSON.stringify(payloadBody);
  const argsFilePath = path.join(TEST_DIR, BENCHMARK_SCENARIO.name, "write-files-args.json");

  await fs.mkdir(path.dirname(argsFilePath), { recursive: true });
  await fs.writeFile(argsFilePath, payloadText, "utf8");

  const inlineTransportChars = JSON.stringify(payloadBody).length;
  const argsPathTransportChars = JSON.stringify({ args_length: payloadText.length, args_path: argsFilePath }).length;
  const inlineRuns = await runWriteMode("inline", payload, argsFilePath);
  const argsPathRuns = await runWriteMode("args_path", payload, argsFilePath);
  const transportCharsSaved = inlineTransportChars - argsPathTransportChars;
  const transportTokensSaved = estimateTokens(inlineTransportChars) - estimateTokens(argsPathTransportChars);

  return {
    comparedVariable: "inline payload vs args_path payload reference",
    contentLengthPerItem: BENCHMARK_SCENARIO.contentLength,
    dispatchMs: {
      argsPath: argsPathRuns,
      avgDeltaMs: Math.round((argsPathRuns.avgMs - inlineRuns.avgMs) * 100) / 100,
      inline: inlineRuns,
    },
    itemCount: BENCHMARK_SCENARIO.itemCount,
    name: BENCHMARK_SCENARIO.name,
    runsPerMode: RUN_COUNT,
    transport: {
      argsPathChars: argsPathTransportChars,
      argsPathTokens: estimateTokens(argsPathTransportChars),
      inlineChars: inlineTransportChars,
      inlineTokens: estimateTokens(inlineTransportChars),
      payloadFileChars: payloadText.length,
      savedChars: transportCharsSaved,
      savedPercent: Math.round((transportCharsSaved / inlineTransportChars) * 10_000) / 100,
      savedTokens: transportTokensSaved,
    },
  };
}

async function runGuardScenario() {
  const payload = buildPayload(GUARD_SCENARIO.name, GUARD_SCENARIO.itemCount, GUARD_SCENARIO.contentLength);
  const payloadBody = { items: payload.items };
  const payloadText = JSON.stringify(payloadBody);
  const argsFilePath = path.join(TEST_DIR, GUARD_SCENARIO.name, "write-files-args.json");

  await fs.mkdir(path.dirname(argsFilePath), { recursive: true });
  await fs.writeFile(argsFilePath, payloadText, "utf8");
  await prepareScenario(payload);

  const inlineResult = await dispatchToolCall("write_files", payloadBody);

  assert.equal(inlineResult.isError, true);
  assert.match(extractErrorMessage(inlineResult), INLINE_REJECTION_PATTERN);

  await prepareScenario(payload);
  const argsPathResult = await dispatchToolCall("write_files", {
    args_length: payloadText.length,
    args_path: argsFilePath,
  });
  const batchResults = extractBatchResults(argsPathResult);

  assert.equal(argsPathResult.isError, false);
  assert.equal(batchResults.length, 1);
  assert.equal(batchResults[0].ok, true);
  await verifyFiles(payload.items);

  return {
    argsPathTransportChars: JSON.stringify({ args_length: payloadText.length, args_path: argsFilePath }).length,
    inlineRejected: true,
    inlineTransportChars: JSON.stringify(payloadBody).length,
    itemCount: GUARD_SCENARIO.itemCount,
    name: GUARD_SCENARIO.name,
    rejectionPattern: INLINE_REJECTION_PATTERN.source,
  };
}

async function main() {
  await fs.mkdir(TEST_DIR, { recursive: true });

  const benchmark = await runBenchmarkScenario();
  const guard = await runGuardScenario();
  const report = {
    benchmark,
    generatedAt: new Date().toISOString(),
    guard,
    script: path.relative(path.join(__dirname, "..", ".."), __filename).replaceAll("\\", "/"),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
