/**
 * @file tests/scripts/performance-benchmark.mjs
 * @description fs-mcp runtime performance benchmark.
 * @author JUNGHO
 * @since 2026-05-24
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath as flUrlTPth2} from "node:url";
import {CONFIG_TOOL_CATALOG as CFG_TL_CTLG} from "../../out/tools/tools-config.js";
import {dispatchToolCall as dsptTlCll} from "../../out/tools/tools-dispatcher.js";
import {FILESYSTEM_TOOL_CATALOG as FLSY_TL_CTLG} from "../../out/tools/tools-filesystem.js";
import {GIT_TOOL_CATALOG as GT_TL_CTLG} from "../../out/tools/tools-git.js";
import {PROCESS_TOOL_CATALOG as PROC_TL_CTLG} from "../../out/tools/tools-process.js";
import {normalizeToolResult as nrmlTlRes} from "../../out/cores/responses/responses-tool-result.js";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const benchRoot = path.join(os.tmpdir(), "fs-mcp-performance-benchmark");
const runCount = 7;
const label = "current";
const fileCount = 12;
const fileChars = 4096;
const largeChars = 128 * 1024;

// 1. Sample summary --------------------------------------------------------------------------------
function summarizeSamples(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const avg = total / samples.length;

  return {
    avgMs: Math.round(avg * 100) / 100,
    maxMs: Math.round(Math.max(...samples) * 100) / 100,
    medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
    minMs: Math.round(Math.min(...samples) * 100) / 100,
    runs: samples.map((value) => Math.round(value * 100) / 100),
  };
}

// 2. Timed runs --------------------------------------------------------------------------------------
async function runTimedSamples(sampleCount, runSample) {
  const samples = [];
  let lastValue;

  for (const _item of Array.from({length: sampleCount})) {
    const startedAt = performance.now();
    lastValue = await runSample();
    samples.push(performance.now() - startedAt);
  }
  return {
    lastValue,
    summary: summarizeSamples(samples),
  };
}

// 3. Fixture preparation ----------------------------------------------------------------------------
async function prepareFixtures() {
  const readDir = path.join(benchRoot, "read-files");

  await fs.rm(benchRoot, {force: true, recursive: true});
  await fs.mkdir(readDir, {recursive: true});

  const files = await Promise.all(Array.from({length: fileCount}, async (_value, index) => {
    const fileName = `fixture-${String(index + 1).padStart(2, "0")}.txt`;
    const filePath = path.join(readDir, fileName);
    const content = `${fileName}\n${"x".repeat(fileChars - fileName.length - 1)}`;

    await fs.writeFile(filePath, content, "utf8");
    return {
      content,
      path: filePath,
    };
  }));

  return {
    files,
    readDir,
  };
}

// 4. Catalog benchmark ------------------------------------------------------------------------------
async function benchmarkCatalog() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG, ...GT_TL_CTLG];
  const firstStart = performance.now();
  const firstPayload = JSON.stringify({tools});
  const firstMs = performance.now() - firstStart;
  const warm = await runTimedSamples(runCount, async () => JSON.stringify({tools}).length);
  const descriptionChars = tools.reduce((sum, tool) => sum + tool.description.length, 0);
  const schemaChars = tools.reduce((sum, tool) => sum + JSON.stringify(tool.inputSchema).length, 0);

  return {
    descriptionChars,
    firstStringifyMs: Math.round(firstMs * 100) / 100,
    listToolsPayloadChars: firstPayload.length,
    schemaChars,
    toolCount: tools.length,
    warmStringify: warm.summary,
  };
}

// 5. Result size metrics ----------------------------------------------------------------------------
function createResultMetrics(result) {
  const serialized = JSON.stringify(result);
  const output = result.structuredContent;
  const structuredText = JSON.stringify(output?.data?.structuredContent ?? null);
  const contentTextChars = Array.isArray(output?.data?.content)
    ? output.data.content.reduce((sum, item) => sum + (typeof item.text === "string" ? item.text.length : 0), 0)
    : 0;

  return {
    contentTextChars,
    dataTextChars: typeof output?.data?.text === "string" ? output.data.text.length : 0,
    serializedChars: serialized.length,
    structuredPayloadChars: structuredText.length,
    visibleChars: result.content?.[0]?.text?.length ?? 0,
  };
}

// 6. Read quality assertion ------------------------------------------------------------------------
function assertBatchReadQuality(result, fixtures) {
  const output = result.structuredContent;
  const nested = output?.data?.structuredContent?.results;

  assert.equal(result.isError, false);
  assert.equal(Array.isArray(nested), true);
  assert.equal(nested.length, fixtures.length);

  for (const [index, item] of nested.entries()) {
    const expected = fixtures[index].content;
    const textContent = item.result?.structuredContent?.textContent;
    const contentText = item.result?.content?.[0]?.text;

    const actual = textContent ?? contentText;

    assert.equal(typeof actual, "string");
    assert.equal(actual.endsWith(expected), true);
  }
}

// 7. fs-mcp batch read benchmark ------------------------------------------------------------------
async function benchmarkFsMcpBatchRead(fixtures) {
  const paths = fixtures.map((item) => item.path);
  const measured = await runTimedSamples(runCount, async () => {
    const result = await dsptTlCll("file-read", {paths});
    assertBatchReadQuality(result, fixtures);
    return createResultMetrics(result);
  });

  return {
    fileChars,
    fileCount,
    result: measured.lastValue,
    time: measured.summary,
  };
}

// 8. Pure Bun read benchmark ------------------------------------------------------------------------
async function benchmarkPureBunRead(fixtures) {
  const measured = await runTimedSamples(runCount, async () => {
    const contents = await Promise.all(fixtures.map((item) => Bun.file(item.path).text()));

    for (const [index, content] of contents.entries()) {
      assert.equal(content, fixtures[index].content);
    }
    return {
      chars: contents.reduce((sum, content) => sum + content.length, 0),
    };
  });

  return {
    fileChars,
    fileCount,
    result: measured.lastValue,
    time: measured.summary,
  };
}

// 9. Pure shell sequential read benchmark -------------------------------------------------------
async function benchmarkPureShellRead(fixtures) {
  const measured = await runTimedSamples(runCount, async () => {
    let totalChars = 0;

    for (const fixture of fixtures) {
      const shellPath = fixture.path.replaceAll("'", "''");
      const proc = Bun.spawn(["powershell.exe", "-NoProfile", "-Command", `[Console]::Write([IO.File]::ReadAllText('${shellPath}'))`], {
        stderr: "pipe",
        stdout: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const error = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      const normalized = output.replace(/\r\n/g, "\n");

      assert.equal(exitCode, 0, error);
      assert.equal(normalized, fixture.content);
      totalChars += normalized.length;
    }
    return {
      chars: totalChars,
    };
  });

  return {
    fileChars,
    fileCount,
    result: measured.lastValue,
    time: measured.summary,
  };
}

// 10. Normalization benchmark ---------------------------------------------------------------------
async function benchmarkNormalization() {
  const largeText = `large-start\n${"y".repeat(largeChars - 12)}`;
  const measured = await runTimedSamples(runCount, async () => {
    const result = nrmlTlRes("synthetic-large-read", {
      content: [{text: largeText, type: "text"}],
      structuredContent: {
        fileName: "large.txt",
        filePath: path.join(benchRoot, "large.txt"),
        fileType: "text",
        textContent: largeText,
      },
    }, 1);
    const output = result.structuredContent;
    const directText = output?.data?.text;
    const structuredText = output?.data?.structuredContent?.textContent;
    const contentText = output?.data?.content?.[0]?.text;

    assert.equal(directText ?? structuredText ?? contentText, largeText);
    return createResultMetrics(result);
  });

  return {
    inputChars: largeText.length,
    result: measured.lastValue,
    time: measured.summary,
  };
}

// 11. Main ------------------------------------------------------------------------------------------
async function main() {
  const fixtures = await prepareFixtures();
  const report = {
    benchmark: "fs-mcp-performance",
    cacheState: "cold catalog stringify plus warm repeated dispatch in one Bun process",
    comparedBaselines: ["pure-bun-batch-read", "pure-shell-sequential-read", "fs-mcp-batch-read"],
    generatedAt: new Date().toISOString(),
    label,
    projectRoot,
    runCount,
    tasks: {
      catalog: await benchmarkCatalog(),
      fsMcpBatchRead: await benchmarkFsMcpBatchRead(fixtures.files),
      normalizeLargeText: await benchmarkNormalization(),
      pureBunBatchRead: await benchmarkPureBunRead(fixtures.files),
      pureShellSequentialRead: await benchmarkPureShellRead(fixtures.files),
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
