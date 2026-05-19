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
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { dispatchToolCall as dsptTlCll } from "../../out/tools/tools-dispatcher.js";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-write-files-benchmark");
const TOKEN_CHARS = 4;
const RUN_COUNT = 7;
const BENCH_SCNR = {
  contentLength: 4_000,
  itemCount: 20,
  name: "batch_20x4k",
};
const GRD_SCNR = {
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

function buildPayload(name, itemCount, contLen) {
  const outputDir = path.join(TEST_DIR, name, "outputs");
  const items = Array.from({ length: itemCount }, (_value, index) => ({
    content: `${String(index).padStart(2, "0")}:${"x".repeat(contLen - 3)}`,
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
    const result = await dsptTlCll("write_files", structuredClone(callArgs));
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
  const payload = buildPayload(BENCH_SCNR.name, BENCH_SCNR.itemCount, BENCH_SCNR.contentLength);
  const payloadBody = { items: payload.items };
  const payloadText = JSON.stringify(payloadBody);
  const argsFilePath = path.join(TEST_DIR, BENCH_SCNR.name, "write-files-args.json");

  await fs.mkdir(path.dirname(argsFilePath), { recursive: true });
  await fs.writeFile(argsFilePath, payloadText, "utf8");

  const inlnTrnsChrs = JSON.stringify(payloadBody).length;
  const argPtTrCh = JSON.stringify({ args_length: payloadText.length, args_path: argsFilePath }).length;
  const inlineRuns = await runWriteMode("inline", payload, argsFilePath);
  const argsPathRuns = await runWriteMode("args_path", payload, argsFilePath);
  const trnsChrsSvd = inlnTrnsChrs - argPtTrCh;
  const trnsToksSvd = estimateTokens(inlnTrnsChrs) - estimateTokens(argPtTrCh);

  return {
    comparedVariable: "inline payload vs args_path payload reference",
    contentLengthPerItem: BENCH_SCNR.contentLength,
    dispatchMs: {
      argsPath: argsPathRuns,
      avgDeltaMs: Math.round((argsPathRuns.avgMs - inlineRuns.avgMs) * 100) / 100,
      inline: inlineRuns,
    },
    itemCount: BENCH_SCNR.itemCount,
    name: BENCH_SCNR.name,
    runsPerMode: RUN_COUNT,
    transport: {
      argsPathChars: argPtTrCh,
      argsPathTokens: estimateTokens(argPtTrCh),
      inlineChars: inlnTrnsChrs,
      inlineTokens: estimateTokens(inlnTrnsChrs),
      payloadFileChars: payloadText.length,
      savedChars: trnsChrsSvd,
      savedPercent: Math.round((trnsChrsSvd / inlnTrnsChrs) * 10_000) / 100,
      savedTokens: trnsToksSvd,
    },
  };
}

async function runLargeInlineScenario() {
  const payload = buildPayload(GRD_SCNR.name, GRD_SCNR.itemCount, GRD_SCNR.contentLength);
  const payloadBody = { items: payload.items };
  const payloadText = JSON.stringify(payloadBody);
  const argsFilePath = path.join(TEST_DIR, GRD_SCNR.name, "write-files-args.json");

  await fs.mkdir(path.dirname(argsFilePath), { recursive: true });
  await fs.writeFile(argsFilePath, payloadText, "utf8");
  await prepareScenario(payload);

  const inlineResult = await dsptTlCll("write_files", payloadBody);
  const inlineResults = extractBatchResults(inlineResult);

  assert.equal(inlineResult.isError, false);
  assert.equal(inlineResults.length, 1);
  assert.equal(inlineResults[0].ok, true);
  await verifyFiles(payload.items);

  await prepareScenario(payload);
  const argsPthRes = await dsptTlCll("write_files", {
    args_length: payloadText.length,
    args_path: argsFilePath,
  });
  const batchResults = extractBatchResults(argsPthRes);

  assert.equal(argsPthRes.isError, false);
  assert.equal(batchResults.length, 1);
  assert.equal(batchResults[0].ok, true);
  await verifyFiles(payload.items);

  return {
    argsPathTransportChars: JSON.stringify({ args_length: payloadText.length, args_path: argsFilePath }).length,
    inlineAccepted: true,
    inlineTransportChars: JSON.stringify(payloadBody).length,
    itemCount: GRD_SCNR.itemCount,
    name: GRD_SCNR.name,
  };
}

async function main() {
  await fs.mkdir(TEST_DIR, { recursive: true });

  const benchmark = await runBenchmarkScenario();
  const largeInline = await runLargeInlineScenario();
  const report = {
    benchmark,
    generatedAt: new Date().toISOString(),
    largeInline,
    script: path.relative(path.join(__dirname, "..", ".."), __filename).replaceAll("\\", "/"),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
