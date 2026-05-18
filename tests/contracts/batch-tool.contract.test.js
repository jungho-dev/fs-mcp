/**
 * @file tests/contracts/batch-tool.contract.test.js
 * @description Batch tool surface contract tests.
 * @author JUNGHO
 * @since 2026-05-03
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { createBatchToolResponse as crtBtchTlRes } from "../../out/controllers/controllers-batch.js";
import { configManager as cfgMgr } from "../../out/features/config/config-store.js";
import { dispatchToolCall as dsptTlCll } from "../../out/tools/tools-dispatcher.js";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-batch-tool-contract");
const CREATED_DIR = path.join(TEST_DIR, "created-dir");
const SOURCE_FILE = path.join(TEST_DIR, "source.txt");
const EXTRA_FILE = path.join(TEST_DIR, "extra.txt");
const CPY_SRC_FL = path.join(TEST_DIR, "copy-source.txt");
const COPIED_FILE = path.join(TEST_DIR, "copied.txt");
const CPD_FRC_FL = path.join(TEST_DIR, "copied-force.txt");
const CPY_SRC_DR = path.join(TEST_DIR, "copy-source-dir");
const COPIED_DIR = path.join(TEST_DIR, "copied-dir");
const LARGE_FILE = path.join(TEST_DIR, "large.txt");
const LRG_WRTT_FL = path.join(TEST_DIR, "large-written.txt");
const LWRF = path.join(TEST_DIR, "large-write-ref.txt");
const APWF = path.join(TEST_DIR, "args-path-written.txt");
const APWAF = path.join(TEST_DIR, "args-path-write-args.json");
const OIWF = path.join(TEST_DIR, "oversized-inline-written.txt");
const PRTL_WRTT_FL = path.join(TEST_DIR, "partial-written.txt");
const PWRF = path.join(TEST_DIR, "partial-write-ref.txt");
const LEORF = path.join(TEST_DIR, "large-edit-old-ref.txt");
const LENRF = path.join(TEST_DIR, "large-edit-new-ref.txt");
const PRTL_EDT_FL = path.join(TEST_DIR, "partial-edit.txt");
const FZZY_EDT_FL = path.join(TEST_DIR, "fuzzy-edit.txt");
const PEORF = path.join(TEST_DIR, "partial-edit-old-ref.txt");
const PENRF = path.join(TEST_DIR, "partial-edit-new-ref.txt");
const APEF = path.join(TEST_DIR, "args-path-edit.txt");
const APESF = path.join(TEST_DIR, "args-path-edit-second.txt");
const APEAF = path.join(TEST_DIR, "args-path-edit-args.json");
const MOVED_FILE = path.join(TEST_DIR, "moved.txt");
const RENAMED_FILE = path.join(TEST_DIR, "renamed.txt");
const WRITTEN_FILE = path.join(TEST_DIR, "written.txt");
const MLSF = path.join(TEST_DIR, "many-line-source.txt");
const BRPMC = 160;
const OLD_VAL_PAT = /old value/;
const EXTR_VAL_PAT = /extra value/;
const CRTD_DR_PAT = /created-dir/;
const CMPT_PAT = / \.\.\./;
const UNST_LN_PAT = /unstructured line 79/;
const RTLP = /Reading 2 lines/;
const THXP = /x{300}/;
const THYP = /y{300}/;
const LICP = /Large inline content can stall MCP hosts/;
const CPOAPP = /content_path or args_path/;
const LARGE_TEXT = `${"x".repeat(300)}\n${"y".repeat(300)}\n`;
const TN_THSN_A = "a".repeat(10_000);
const TN_THSN_B = "b".repeat(10_000);
const MNY_LN_PRFX = Array.from({ length: 1100 }, (_value, index) => `prefix-${index}`).join("\n");
const MNY_LN_TXT = `${MNY_LN_PRFX}\n${TN_THSN_A}\n`;
const MLRT = `${MNY_LN_PRFX}\n${TN_THSN_B}\n`;

// 1. Parse tool output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseToolOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.ok(result.content[0].text.length > 0);
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  return result.structuredContent;
}

// 2. Extract batch results ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractBatchResults(result) {
  const output = parseToolOutput(result);
  const batchPayload = output.data.structuredContent;

  assert.equal(typeof batchPayload.totalCount, "number");
  assert.equal(Array.isArray(batchPayload.results), true);
  return batchPayload.results;
}

// 1. Path exists helper ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  }
  catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// 4. Setup ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function setup() {
  const origCfg = await cfgMgr.getConfig();

  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(SOURCE_FILE, "old value\n", "utf8");
  await fs.writeFile(EXTRA_FILE, "extra value\n", "utf8");
  await fs.writeFile(CPY_SRC_FL, "copy value\n", "utf8");
  await fs.writeFile(CPD_FRC_FL, "old copy\n", "utf8");
  await fs.mkdir(CPY_SRC_DR, { recursive: true });
  await fs.writeFile(path.join(CPY_SRC_DR, "nested.txt"), "nested copy\n", "utf8");
  await fs.writeFile(LARGE_FILE, LARGE_TEXT, "utf8");
  await fs.writeFile(LWRF, TN_THSN_A, "utf8");
  await fs.writeFile(PWRF, "abc\0\0", "utf8");
  await fs.writeFile(LEORF, TN_THSN_A, "utf8");
  await fs.writeFile(LENRF, TN_THSN_B, "utf8");
  await fs.writeFile(PRTL_EDT_FL, "alpha\n", "utf8");
  await fs.writeFile(FZZY_EDT_FL, "function oldName() {\n  return 1;\n}\n", "utf8");
  await fs.writeFile(PEORF, "alpha\0\0", "utf8");
  await fs.writeFile(PENRF, "omega\0\0", "utf8");
  await fs.writeFile(APEF, "alpha\nbeta\n", "utf8");
  await fs.writeFile(APESF, "one\ntwo\n", "utf8");
  await fs.writeFile(MLSF, MNY_LN_TXT, "utf8");
  await cfgMgr.updateConfig({
    ...origCfg,
    allowedDirectories: [TEST_DIR],
    contextIndexEnabled: false,
    fileReadLineLimit: 1,
  });

  return origCfg;
}

// 5. Teardown ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function teardown(origCfg) {
  await cfgMgr.updateConfig(origCfg);
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

// 6. Test read files surface ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testReadFilesSurface() {
  const result = await dsptTlCll("read_files", {
    paths: [SOURCE_FILE, EXTRA_FILE],
  });
  const batchResults = extractBatchResults(result);

  assert.equal(batchResults.length, 2);
  assert.equal(batchResults[0].ok, true);
  assert.ok(batchResults[0].result.content[0].text.length <= BRPMC);
  assert.ok(batchResults[1].result.content[0].text.length <= BRPMC);
  assert.match(batchResults[0].result.structuredContent.textContent, OLD_VAL_PAT);
  assert.match(batchResults[1].result.structuredContent.textContent, EXTR_VAL_PAT);

  const largeResult = await dsptTlCll("read_files", {
    paths: [LARGE_FILE],
  });
  const largeOutput = parseToolOutput(largeResult);
  const lrgBtchRess = largeOutput.data.structuredContent.results;

  assert.equal(lrgBtchRess[0].ok, true);
  assert.match(lrgBtchRess[0].result.content[0].text, CMPT_PAT);
  assert.ok(lrgBtchRess[0].result.content[0].text.length <= BRPMC);
  assert.match(lrgBtchRess[0].result.structuredContent.textContent, RTLP);
  assert.doesNotMatch(largeOutput.data.text, THXP);
  assert.doesNotMatch(largeOutput.data.text, THYP);
  assert.match(lrgBtchRess[0].result.structuredContent.textContent, THXP);
  assert.match(lrgBtchRess[0].result.structuredContent.textContent, THYP);
  assert.match(JSON.stringify(lrgBtchRess[0].result), THYP);

  const missingFile = path.join(TEST_DIR, "missing.txt");
  const defMssnRes = await dsptTlCll("read_files", {
    paths: [missingFile],
  });
  const defMssnPyld = parseToolOutput(defMssnRes).data.structuredContent;
  assert.equal(defMssnPyld.failedCount, 1);

  const allwMssnRes = await dsptTlCll("read_files", {
    allowMissing: true,
    paths: [SOURCE_FILE, missingFile],
  });
  const allwMssnPyld = parseToolOutput(allwMssnRes).data.structuredContent;
  assert.equal(allwMssnPyld.failedCount, 0);
  assert.equal(allwMssnPyld.results[1].ok, true);
  assert.equal(allwMssnPyld.results[1].result.structuredContent.missing, true);

  const mssnInfRes = await dsptTlCll("get_file_infos", {
    allowMissing: true,
    paths: [missingFile],
  });
  const mssnInfPyld = parseToolOutput(mssnInfRes).data.structuredContent;
  assert.equal(mssnInfPyld.failedCount, 0);
  assert.equal(mssnInfPyld.results[0].result.structuredContent.missing, true);

  const mssnDirRes = await dsptTlCll("list_directories", {
    allowMissing: true,
    items: [{ path: path.join(TEST_DIR, "missing-dir") }],
  });
  const mssnDirPyld = parseToolOutput(mssnDirRes).data.structuredContent;
  assert.equal(mssnDirPyld.failedCount, 0);
  assert.equal(mssnDirPyld.results[0].result.structuredContent.missing, true);
}

// 7. Test large unstructured result preview ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testLargeUnstructuredResultPreview() {
  const unstLnZrPat = /unstructured line 0/;
  const largeText = Array.from({ length: 80 }, (_value, index) => `unstructured line ${index} ${"z".repeat(40)}`).join("\n");
  const result = crtBtchTlRes("synthetic_tool", [
    {
      index: 1,
      input: { id: 1 },
      ok: true,
      result: {
        content: [{ type: "text", text: largeText }],
      },
    },
  ]);
  const batchResult = result.structuredContent.results[0].result;

  assert.match(batchResult.content[0].text, CMPT_PAT);
  assert.ok(batchResult.content[0].text.length <= BRPMC);
  assert.match(batchResult.content[0].text, unstLnZrPat);
  assert.doesNotMatch(batchResult.content[0].text, UNST_LN_PAT);
  assert.match(batchResult.structuredContent.textContent, UNST_LN_PAT);
}

// 8. Test create and list directory surface ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testCreateAndListDirectorySurface() {
  const createResult = await dsptTlCll("create_directories", {
    paths: [CREATED_DIR],
  });
  const crtBtchRess = extractBatchResults(createResult);
  assert.equal(crtBtchRess[0].ok, true);

  const listResult = await dsptTlCll("list_directories", {
    items: [
      {
        depth: 2,
        path: TEST_DIR,
      },
    ],
  });
  const listOutput = parseToolOutput(listResult);
  const lstBtchRess = listOutput.data.structuredContent.results;

  assert.equal(lstBtchRess.length, 1);
  assert.equal(lstBtchRess[0].ok, true);
  assert.equal(typeof lstBtchRess[0].result.structuredContent.listing, "string");
  assert.match(lstBtchRess[0].result.structuredContent.listing, CRTD_DR_PAT);
  assert.match(listOutput.data.text, CRTD_DR_PAT);
}

// 9. Test copy files surface ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testCopyFilesSurface() {
  const copyResult = await dsptTlCll("copy_files", {
    items: [
      {
        destination: COPIED_FILE,
        source: CPY_SRC_FL,
      },
      {
        destination: CPD_FRC_FL,
        force: true,
        source: CPY_SRC_FL,
      },
      {
        destination: COPIED_DIR,
        recursive: true,
        source: CPY_SRC_DR,
      },
    ],
  });
  const cpyBtchRess = extractBatchResults(copyResult);

  assert.equal(cpyBtchRess.length, 3);
  assert.equal(cpyBtchRess[0].ok, true);
  assert.equal(cpyBtchRess[1].ok, true);
  assert.equal(cpyBtchRess[2].ok, true);
  assert.equal(await fs.readFile(COPIED_FILE, "utf8"), "copy value\n");
  assert.equal(await fs.readFile(CPD_FRC_FL, "utf8"), "copy value\n");
  assert.equal(await fs.readFile(path.join(COPIED_DIR, "nested.txt"), "utf8"), "nested copy\n");
  assert.equal(await fs.readFile(CPY_SRC_FL, "utf8"), "copy value\n");

  const ovrwRes = await dsptTlCll("copy_files", {
    items: [
      {
        destination: COPIED_FILE,
        source: CPY_SRC_FL,
      },
    ],
  });
  const ovrwBtchRess = extractBatchResults(ovrwRes);
  assert.equal(ovrwBtchRess[0].ok, false);
}

// 10. Test write move info and edit surface ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testWriteMoveInfoAndEditSurface() {
  const writeResult = await dsptTlCll("write_files", {
    items: [
      {
        content: "written value\n",
        mode: "rewrite",
        path: WRITTEN_FILE,
      },
    ],
  });
  const wrtBtchRess = extractBatchResults(writeResult);
  assert.equal(wrtBtchRess[0].ok, true);

  const lrgWrtRes = await dsptTlCll("write_files", {
    items: [
      {
        content_path: LWRF,
        mode: "rewrite",
        path: LRG_WRTT_FL,
      },
    ],
  });
  const lrgWrBtRe = extractBatchResults(lrgWrtRes);

  assert.equal(lrgWrBtRe[0].ok, true);
  assert.equal(lrgWrBtRe[0].input.content_path, LWRF);
  assert.equal(await fs.readFile(LRG_WRTT_FL, "utf8"), TN_THSN_A);

  const argPtWrPy = {
    items: [
      {
        content: TN_THSN_B,
        mode: "rewrite",
        path: APWF,
      },
    ],
  };
  const argPtWrPyTx = JSON.stringify(argPtWrPy);
  const argPtWrCl = { args_length: argPtWrPyTx.length, args_path: APWAF };

  await fs.writeFile(APWAF, `${argPtWrPyTx}\0\0`, "utf8");
  assert.ok(JSON.stringify(argPtWrCl).length < JSON.stringify(argPtWrPy).length);
  const argPtWrRe = await dsptTlCll("write_files", argPtWrCl);
  const argPtWrBtRe = extractBatchResults(argPtWrRe);
  assert.equal(argPtWrBtRe.length, 1);
  assert.equal(argPtWrBtRe[0].ok, true);
  assert.equal(argPtWrBtRe[0].input.contentLength, TN_THSN_B.length);
  assert.equal(await fs.readFile(APWF, "utf8"), TN_THSN_B);

  const ovrInWrRe = await dsptTlCll("write_files", {
    items: [
      {
        content: "z".repeat(20_000),
        mode: "rewrite",
        path: OIWF,
      },
    ],
  });
  const ovrInWrOt = parseToolOutput(ovrInWrRe);

  assert.equal(ovrInWrRe.isError, true);
  assert.equal(ovrInWrOt.status, "error");
  assert.match(ovrInWrOt.error.message, LICP);
  assert.match(ovrInWrOt.error.message, CPOAPP);
  assert.equal(await pathExists(OIWF), false);

  const prtlWrtRes = await dsptTlCll("write_files", {
    items: [
      {
        content_length: 3,
        content_path: PWRF,
        mode: "rewrite",
        path: PRTL_WRTT_FL,
      },
    ],
  });
  const prtWrBtRe = extractBatchResults(prtlWrtRes);
  assert.equal(prtWrBtRe[0].ok, true);
  assert.equal(await fs.readFile(PRTL_WRTT_FL, "utf8"), "abc");

  const editResult = await dsptTlCll("edit_blocks", {
    items: [
      {
        expected_replacements: 1,
        file_path: SOURCE_FILE,
        new_string: "new value",
        old_string: "old value",
      },
    ],
  });
  const edtBtchRess = extractBatchResults(editResult);
  assert.equal(edtBtchRess[0].ok, true);

  const fzzyMssRes = await dsptTlCll("edit_blocks", {
    items: [
      {
        expected_replacements: 1,
        file_path: FZZY_EDT_FL,
        new_string: "function newName() {\n  return 1;\n}\n",
        old_string: "function oldNme() {\n  return 1;\n}\n",
      },
    ],
  });
  const fzzyMssBtch = extractBatchResults(fzzyMssRes);
  assert.equal(fzzyMssRes.isError, true);
  assert.equal(fzzyMssBtch[0].ok, false);
  assert.match(fzzyMssBtch[0].result.content[0].text, /Exact match not found/);
  assert.equal(await fs.readFile(FZZY_EDT_FL, "utf8"), "function oldName() {\n  return 1;\n}\n");

  const lrgEdtRes = await dsptTlCll("edit_blocks", {
    items: [
      {
        expected_replacements: 1,
        file_path: MLSF,
        new_string_path: LENRF,
        old_string_path: LEORF,
      },
    ],
  });
  const lrgEdBtRe = extractBatchResults(lrgEdtRes);
  assert.equal(lrgEdBtRe[0].ok, true);
  assert.equal(lrgEdBtRe[0].input.old_string_path, LEORF);
  assert.equal(lrgEdBtRe[0].input.new_string_path, LENRF);

  const prtlEdtRes = await dsptTlCll("edit_blocks", {
    items: [
      {
        expected_replacements: 1,
        file_path: PRTL_EDT_FL,
        new_string_length: 5,
        new_string_path: PENRF,
        old_string_length: 5,
        old_string_path: PEORF,
      },
    ],
  });
  const prtEdBtRe = extractBatchResults(prtlEdtRes);
  assert.equal(prtEdBtRe[0].ok, true);
  assert.equal(await fs.readFile(PRTL_EDT_FL, "utf8"), "omega\n");

  const argPtEdPy = {
    items: [
      {
        expected_replacements: 1,
        file_path: APEF,
        new_string: "gamma",
        old_string: "alpha",
      },
      {
        expected_replacements: 1,
        file_path: APESF,
        new_string: "delta",
        old_string: "two",
      },
    ],
  };
  const argPtPyTx = JSON.stringify(argPtEdPy);
  const argsPathCall = { args_length: argPtPyTx.length, args_path: APEAF };

  await fs.writeFile(APEAF, `${argPtPyTx}\0\0`, "utf8");
  assert.ok(JSON.stringify(argsPathCall).length < JSON.stringify(argPtEdPy).length);
  const argPtEdRe = await dsptTlCll("edit_blocks", argsPathCall);
  const argPtEdBtRe = extractBatchResults(argPtEdRe);
  assert.equal(argPtEdBtRe.length, 2);
  assert.equal(argPtEdBtRe[0].ok, true);
  assert.equal(argPtEdBtRe[1].ok, true);
  assert.equal(await fs.readFile(APEF, "utf8"), "gamma\nbeta\n");
  assert.equal(await fs.readFile(APESF, "utf8"), "one\ndelta\n");

  const lrgRdRes = await dsptTlCll("read_files", {
    paths: [MLSF],
  });
  const lrgRdOtpt = parseToolOutput(lrgRdRes);
  const lrgRdBtRe = lrgRdOtpt.data.structuredContent.results;
  assert.equal(lrgRdBtRe[0].ok, true);
  assert.match(lrgRdBtRe[0].result.content[0].text, CMPT_PAT);
  assert.equal(lrgRdOtpt.data.text.includes(TN_THSN_B), false);
  assert.equal(lrgRdBtRe[0].result.structuredContent.textContent.includes(TN_THSN_B), true);
  assert.equal(JSON.stringify(lrgRdBtRe[0].result).includes("previewOnly"), false);

  const renameResult = await dsptTlCll("move_files", {
    items: [
      {
        destination: RENAMED_FILE,
        source: WRITTEN_FILE,
      },
    ],
  });
  const rnmBtchRess = extractBatchResults(renameResult);
  assert.equal(rnmBtchRess[0].ok, true);

  const moveResult = await dsptTlCll("move_files", {
    items: [
      {
        destination: MOVED_FILE,
        source: RENAMED_FILE,
      },
    ],
  });
  const mvBtchRess = extractBatchResults(moveResult);
  assert.equal(mvBtchRess[0].ok, true);

  const infoResult = await dsptTlCll("get_file_infos", {
    paths: [SOURCE_FILE, MOVED_FILE],
  });
  const infBtchRess = extractBatchResults(infoResult);
  assert.equal(infBtchRess.length, 2);
  assert.equal(infBtchRess[0].ok, true);
  assert.equal(infBtchRess[1].ok, true);

  const editedText = await fs.readFile(SOURCE_FILE, "utf8");
  const lrgEdtdTxt = await fs.readFile(MLSF, "utf8");
  const movedText = await fs.readFile(MOVED_FILE, "utf8");

  assert.equal(editedText, "new value\n");
  assert.equal(lrgEdtdTxt, MLRT);
  assert.equal(movedText, "written value\n");

  const removeResult = await dsptTlCll("remove_files", {
    items: [
      { path: MOVED_FILE },
      { path: CREATED_DIR },
    ],
  });
  const rmvBtchRess = extractBatchResults(removeResult);
  assert.equal(rmvBtchRess.length, 2);
  assert.equal(rmvBtchRess[0].ok, true);
  assert.equal(rmvBtchRess[1].ok, true);
  assert.equal(await pathExists(MOVED_FILE), false);
  assert.equal(await pathExists(CREATED_DIR), false);
}

// 10. Main \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015

async function main() {
  const origCfg = await setup();

  try {
    await testReadFilesSurface();
    testLargeUnstructuredResultPreview();
    await testCreateAndListDirectorySurface();
    await testCopyFilesSurface();
    await testWriteMoveInfoAndEditSurface();
  }
  finally {
    await teardown(origCfg);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
