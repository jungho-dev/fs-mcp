/**
 * Test script for file handler system
 *
 * This script tests the file handler architecture:
 * 1. File handler factory returns correct handler types
 * 2. FileResult interface consistency
 * 3. ReadOptions interface usage
 * 4. Handler canHandle() method
 * 5. Text file handler basic operations
 * 6. Image file handler detection
 * 7. Binary file handler fallback
 */

import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { getFileHandler as gtFlHdl } from "../../../out/assets/readers/readers-factory.js";
import { handleEditBlock as hndlEdtBlck } from "../../../out/controllers/controllers-edit.js";
import { handleListDirectory as hndlLstDir, handleReadFile as hndlRdFl } from "../../../out/controllers/controllers-filesystem.js";
import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";
import { getFileInfo, readFile, writeFile } from "../../../out/features/filesystem/filesystem-service.js";

// Get directory name
const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);

// Define test directory and files
const TEST_DIR = path.join(__dirname, "test_file_handlers");
const TEXT_FILE = path.join(TEST_DIR, "test.txt");
const JSON_FILE = path.join(TEST_DIR, "test.json");
const MD_FILE = path.join(TEST_DIR, "test.md");
const HTML_FILE = path.join(TEST_DIR, "test.html");
const IMAGE_FILE = path.join(TEST_DIR, "test.png");
const SVG_FILE = path.join(TEST_DIR, "test.svg");
const LIST_DIR = path.join(TEST_DIR, "listing");
const TNY_PNG_BYTS = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12,
  2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0, 238, 169, 235, 25, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130,
];

// 1. Helper function to clean up test directories -------------------------------------------------
async function cleanupTestDirectories () {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }
  catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Error during cleanup:", error);
    }
  }
}

// 2. Setup function -------------------------------------------------------------------------------
async function setup () {
  // Clean up before tests (in case previous run left files)
  await cleanupTestDirectories();

  await fs.mkdir(TEST_DIR, { recursive: true });

  const origCfg = await cfgMgr.getConfig();
  await cfgMgr.setValue("allowedDirectories", [TEST_DIR]);

  return origCfg;
}

// 3. Teardown function ----------------------------------------------------------------------------
// Always runs cleanup, restores config only if provided

// 3. Teardown -------------------------------------------------------------------------------------
async function teardown (origCfg) {
  // Always clean up test directories, even if setup failed
  try {
    await cleanupTestDirectories();
  }
  catch (error) {
    console.error("Warning: Failed to clean up test directories:", error.message);
  }
  // Restore config only if we have the original
  if (origCfg) {
    try {
      await cfgMgr.updateConfig(origCfg);
    }
    catch (error) {
      console.error("Warning: Failed to restore config:", error.message);
    }
  }
}

// 4. Test 1: Handler factory returns correct types ------------------------------------------------
async function testHandlerFactory () {
  const testCases = [
    { file: "test.txt", expected: "TextFileHandler" },
    { file: "test.js", expected: "TextFileHandler" },
    { file: "test.json", expected: "TextFileHandler" },
    { file: "test.md", expected: "TextFileHandler" },
    { file: "test.png", expected: "ImageFileHandler" },
    { file: "test.jpg", expected: "ImageFileHandler" },
    { file: "test.jpeg", expected: "ImageFileHandler" },
    { file: "test.gif", expected: "ImageFileHandler" },
    { file: "test.webp", expected: "ImageFileHandler" },
  ];

  await Promise.all(testCases.map(async ({ file, expected }) => {
    const handler = await gtFlHdl(file);
    assert.strictEqual(handler.constructor.name, expected, `${file} should use ${expected} but got ${handler.constructor.name}`);
  }));
}

// 5. Test 2: FileResult interface consistency -----------------------------------------------------
async function testFileResultInterface () {
  // Create a text file
  await fs.writeFile(TEXT_FILE, "Hello, World!\nLine 2\nLine 3");

  const result = await readFile(TEXT_FILE);

  // Check FileResult structure
  assert.ok("content" in result, "FileResult should have content");
  assert.ok("mimeType" in result, "FileResult should have mimeType");
  assert.ok(result.content !== undefined, "Content should not be undefined");
  assert.ok(typeof result.mimeType === "string", "mimeType should be a string");

  // metadata is optional but should be an object if present
  if (result.metadata) {
    assert.ok(typeof result.metadata === "object", "metadata should be an object");
  }
}

// 6. Test 3: ReadOptions interface ----------------------------------------------------------------
async function testReadOptionsInterface () {
  await fs.writeFile(TEXT_FILE, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5");

  // Test offset option
  const result1 = await readFile(TEXT_FILE, { offset: 2 });
  const content1 = result1.content.toString();
  assert.ok(content1.includes("Line 3"), "Offset should skip to line 3");

  // Test length option
  const result2 = await readFile(TEXT_FILE, { offset: 0, length: 2 });
  const content2 = result2.content.toString();
  assert.ok(content2.includes("Line 1"), "Should include Line 1");
  assert.ok(content2.includes("Line 2"), "Should include Line 2");
}

// 7. Test 4: Handler canHandle method -------------------------------------------------------------
async function testCanHandle () {
  const textHandler = await gtFlHdl("test.txt");
  const imageHandler = await gtFlHdl("test.png");

  // Image handler should handle images
  assert.ok(imageHandler.canHandle("photo.png"), "Image handler should handle .png");
  assert.ok(imageHandler.canHandle("photo.jpg"), "Image handler should handle .jpg");
  assert.ok(imageHandler.canHandle("photo.jpeg"), "Image handler should handle .jpeg");

  // Text handler handles most things (fallback)
  assert.ok(textHandler.canHandle("file.txt"), "Text handler should handle .txt");
}

// 8. Test 5: Text handler read/write --------------------------------------------------------------
async function testTextHandler () {
  const content = "Test content\nWith multiple lines\nAnd special chars: äöü";

  // Write
  await writeFile(TEXT_FILE, content);

  // Read
  const result = await readFile(TEXT_FILE);
  const readContent = result.content.toString();
  assert.ok(readContent.includes("Test content"), "Should read back content");
  assert.ok(readContent.includes("äöü"), "Should preserve special characters");
}

// 9. Test 6: Text handler with JSON file ----------------------------------------------------------
async function testJsonFile () {
  const statPrfxPat = /^\[.*?\]\n\n/;
  const data = { name: "Test", values: [1, 2, 3] };
  const content = JSON.stringify(data, null, 2);

  await writeFile(JSON_FILE, content);

  const result = await readFile(JSON_FILE);
  const readContent = result.content.toString();
  const parsed = JSON.parse(readContent.replace(statPrfxPat, "")); // Remove status message

  assert.strictEqual(parsed.name, "Test", "JSON should be preserved");
  assert.deepStrictEqual(parsed.values, [1, 2, 3], "Array should be preserved");
}

// 10. Test 7: File info returns correct structure -------------------------------------------------
async function testFileInfo () {
  await fs.writeFile(TEXT_FILE, "Some content");

  const info = await getFileInfo(TEXT_FILE);

  // Check required fields
  assert.ok("size" in info, "Should have size");
  assert.ok("created" in info || "birthtime" in info, "Should have creation time");
  assert.ok("modified" in info || "mtime" in info, "Should have modification time");
  assert.ok("isFile" in info, "Should have isFile");
  assert.ok("isDirectory" in info, "Should have isDirectory");

  assert.ok(info.size > 0, "Size should be > 0");
  assert.ok(info.isFile === true || info.isFile === "true", "Should be a file");
}

// 11. Test 8: Write mode (rewrite vs append) ------------------------------------------------------
async function testWriteModes () {
  // Initial write (rewrite mode - default)
  await writeFile(TEXT_FILE, "Initial content");

  // Overwrite
  await writeFile(TEXT_FILE, "New content", "rewrite");
  let result = await readFile(TEXT_FILE);
  let content = result.content.toString();
  assert.ok(!content.includes("Initial"), "Rewrite should replace content");
  assert.ok(content.includes("New content"), "Should have new content");

  // Append
  await writeFile(TEXT_FILE, "\nAppended content", "append");
  result = await readFile(TEXT_FILE);
  content = result.content.toString();
  assert.ok(content.includes("New content"), "Should keep original");
  assert.ok(content.includes("Appended content"), "Should have appended");
}

// 12. Read file preview metadata ------------------------------------------------------------------
async function testReadFilePreviewMetadata () {
  const mrkdCont = "# Title\n\n```js\nconst x = 1;\n```";
  const textContent = "hello\nplain text";
  const tinySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>';
  const htmlContent = ["<h1>Preview</h1>", "<", "script", ">alert(1)</", "script", ">"].join("");

  await fs.writeFile(MD_FILE, mrkdCont);
  await fs.writeFile(TEXT_FILE, textContent);
  await fs.writeFile(HTML_FILE, htmlContent);
  await fs.writeFile(IMAGE_FILE, Buffer.from(TNY_PNG_BYTS));
  await fs.writeFile(SVG_FILE, tinySvg);

  const mrkdRes = await hndlRdFl({ path: MD_FILE });
  assert.ok(Array.isArray(mrkdRes.content), "Result should include content array");
  assert.ok(mrkdRes.content[0].text.includes(mrkdCont), "Legacy content should still include markdown body");
  assert.ok(mrkdRes.structuredContent, "Markdown should include structuredContent");
  assert.strictEqual(mrkdRes.structuredContent.fileType, "markdown", "Markdown fileType should be markdown");
  assert.strictEqual(mrkdRes.structuredContent.filePath, MD_FILE, "Markdown file path should be present");

  const textResult = await hndlRdFl({ path: TEXT_FILE });
  assert.ok(Array.isArray(textResult.content), "Result should include content array");
  assert.ok(textResult.content[0].text.includes(textContent), "Legacy content should still include text body");
  assert.ok(textResult.structuredContent, "Text should include structuredContent");
  assert.strictEqual(textResult.structuredContent.fileType, "text", "Text fileType should be text");

  const htmlResult = await hndlRdFl({ path: HTML_FILE });
  assert.ok(Array.isArray(htmlResult.content), "Result should include content array");
  assert.ok(htmlResult.content[0].text.includes("<h1>Preview</h1>"), "Legacy content should still include html body");
  assert.ok(htmlResult.structuredContent, "HTML should include structuredContent");
  assert.strictEqual(htmlResult.structuredContent.fileType, "html", "HTML fileType should be html");

  const imageResult = await hndlRdFl({ path: IMAGE_FILE });
  assert.ok(Array.isArray(imageResult.content), "Image result should include content array");
  assert.ok(!imageResult.content.some((item) => item.type === "image"), "Image result should avoid image content item for host compatibility");
  assert.ok(imageResult.structuredContent, "Image should include structuredContent");
  assert.strictEqual(imageResult.structuredContent.fileType, "image", "Image fileType should map to image preview state");
  assert.strictEqual(typeof imageResult.structuredContent.imageData, "string", "Image structured payload should include imageData");
  assert.ok(imageResult.structuredContent.imageData.length > 0, "Image structured payload should include non-empty imageData");
  assert.strictEqual(imageResult.structuredContent.mimeType, "image/png", "Image structured payload should include mimeType");
  assert.strictEqual(imageResult.structuredContent.filePath, IMAGE_FILE, "Image file path should be present");

  const svgResult = await hndlRdFl({ path: SVG_FILE });
  assert.ok(Array.isArray(svgResult.content), "SVG result should include content array");
  assert.ok(!svgResult.content.some((item) => item.type === "image"), "SVG result should avoid image content item for host compatibility");
  assert.ok(svgResult.structuredContent, "SVG should include structuredContent");
  assert.strictEqual(svgResult.structuredContent.fileType, "image", "SVG should map to image preview state");
  assert.strictEqual(svgResult.structuredContent.mimeType, "image/svg+xml", "SVG structured payload should include SVG mimeType");
  assert.strictEqual(typeof svgResult.structuredContent.imageData, "string", "SVG structured payload should include imageData");
  assert.ok(svgResult.structuredContent.imageData.length > 0, "SVG structured payload should include non-empty imageData");

  const nllArgsRes = await hndlRdFl(null);
  assert.ok(Array.isArray(nllArgsRes.content), "Null-args result should include content array");
  assert.strictEqual(nllArgsRes.isError, true, "Null-args should be returned as error");
  assert.ok(nllArgsRes.content[0].text.includes("Error: No arguments provided for read_file command"), "Null-args should include standard error text");
}

// 13. Test 10: Markdown exact-match save flow works through edit_block ----------------------------
async function testMarkdownExactMatchSave () {
  const rdngStatPat = /\[Reading \d+ lines? from/;
  const origCont = "# Title\n\nOriginal paragraph.\n";
  const updtCont2 = "# Title\n\nUpdated paragraph.\n";

  await fs.writeFile(MD_FILE, origCont);

  const result = await hndlEdtBlck({
    file_path: MD_FILE,
    old_string: origCont,
    new_string: updtCont2,
    expected_replacements: 1,
  });

  assert.ok(Array.isArray(result.content), "edit_block result should include content array");
  // After the file-preview refactor (commit 8fd8f94), edit_block's exact-match
  // path returns a file preview + structuredContent instead of a
  // "Successfully applied N edit(s)" message. Verify the new contract here.
  assert.strictEqual(result.content[0].type, "text", "edit_block result[0] should be text");
  assert.ok(result.structuredContent, "edit_block should return structuredContent");
  assert.ok(result.structuredContent.filePath, "edit_block structuredContent should include filePath");
  assert.match(result.content[0].text, rdngStatPat, "edit_block should return a file-preview status line");

  const readBack = await fs.readFile(MD_FILE, "utf8");
  assert.strictEqual(readBack, updtCont2, "Markdown file should be rewritten with the updated content");
}

// 14. Test 11: Directory listing controls output volume -------------------------------------------
async function testListDirectoryControls () {
  const nestedDir = path.join(LIST_DIR, "nested");
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(path.join(LIST_DIR, "root.txt"), "root");
  await fs.writeFile(path.join(LIST_DIR, "skip.txt"), "skip");
  await fs.writeFile(path.join(nestedDir, "child.txt"), "child");

  const dirsOnly = await hndlLstDir({ path: LIST_DIR, depth: 2, includeFiles: false });
  assert.ok(dirsOnly.content[0].text.includes("nested"), "Directory-only listing should keep directories");
  assert.ok(!dirsOnly.content[0].text.includes("root.txt"), "Directory-only listing should hide files");

  const excluded = await hndlLstDir({ path: LIST_DIR, depth: 1, excludePatterns: ["skip*"] });
  assert.ok(!excluded.content[0].text.includes("skip.txt"), "Excluded glob pattern should hide matching files");

  const limited = await hndlLstDir({ path: LIST_DIR, depth: 1, maxEntries: 1 });
  assert.ok(limited.content[0].text.includes("items hidden"), "maxEntries should report hidden visible entries");
}

// 15. Run all tests -------------------------------------------------------------------------------
async function runAllTests () {
  await testHandlerFactory();
  await testFileResultInterface();
  await testReadOptionsInterface();
  await testCanHandle();
  await testTextHandler();
  await testJsonFile();
  await testFileInfo();
  await testWriteModes();
  await testReadFilePreviewMetadata();
  await testMarkdownExactMatchSave();
  await testListDirectoryControls();
}

// 16. Run tests -----------------------------------------------------------------------------------
export default async function runTests () {
  let origCfg;
  try {
    origCfg = await setup();
    await runAllTests();
  }
  catch (error) {
    console.error("Test failed:", error.message);
    console.error(error.stack);
    return false;
  }
  finally {
    // Always run teardown to clean up test directories and restore config
    // teardown handles the case where originalConfig is undefined
    await teardown(origCfg);
  }
  return true;
}

// If this file is run directly, execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Unhandled error:", error);
      process.exit(1);
    });
}
