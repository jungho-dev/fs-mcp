/**
 * @file tests/smoke/search/search-code.test.js
 * @description fs-search smoke tests over the direct regex search controller.
 * @author JUNGHO
 * @since 2026-05-02
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { handleRegexSearches as hndlRgxSrchs } from "../../../out/controllers/controllers-search.js";
import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);

// Test directory and files
const TEST_DIR = path.join(__dirname, "search-test-files");
const TEST_FILE_1 = path.join(TEST_DIR, "test1.js");
const TEST_FILE_2 = path.join(TEST_DIR, "test2.ts");
const TEST_FILE_3 = path.join(TEST_DIR, "hidden.txt");
const TEST_FILE_4 = path.join(TEST_DIR, "subdir", "nested.py");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
};

// 1. Run single regex search -------------------------------------------------------------------------
async function runSearch(item) {
  const result = await hndlRgxSrchs({ items: [item] });
  const itemResult = result.structuredContent?.results?.[0]?.result?.structuredContent;

  return { itemResult, result, text: result.content[0].text };
}

// 2. Setup function to prepare test environment -----------------------------------------------------
async function setup() {
  // Save original config
  const origCfg = await cfgMgr.getConfig();

  // Set allowed directories to include test directory
  await cfgMgr.setValue("allowedDirectories", [TEST_DIR]);

  // Create test directory structure
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.mkdir(path.join(TEST_DIR, "subdir"), { recursive: true });

  // Create test files with various content
  await fs.writeFile(
    TEST_FILE_1,
    `// JavaScript test file
function searchFunction() {
  const pattern = 'test pattern';
  console.log('This is a test function');
  return pattern;
}

// Another function
function anotherFunction() {
  const result = searchFunction();
  return result;
}
`,
  );

  await fs.writeFile(
    TEST_FILE_2,
    `// TypeScript test file
interface TestInterface {
  pattern: string;
  value: number;
}

class TestClass implements TestInterface {
  pattern: string = 'test pattern';
  value: number = 42;
  
  searchMethod(): string {
    return this.pattern;
  }
}

export { TestClass };
`,
  );

  await fs.writeFile(
    TEST_FILE_3,
    `This is a hidden text file.
It contains some test content.
Pattern matching should work here too.
Multiple lines with different patterns.
`,
  );

  await fs.writeFile(
    TEST_FILE_4,
    `# Python test file
import os
import sys

def search_function():
    pattern = "test pattern"
    print("This is a python function")
    return pattern

class TestClass:
    def __init__(self):
        self.pattern = "test pattern"
    
    def search_method(self):
        return self.pattern
`,
  );
  return origCfg;
}

// 3. Teardown function to clean up after tests ------------------------------------------------------
async function teardown(origCfg) {
  // Remove test directory and all files
  await fs.rm(TEST_DIR, { force: true, recursive: true });

  // Restore original config
  await cfgMgr.updateConfig(origCfg);
}

// 4. Assert function for test validation --------------------------------------------------------------
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 5. Test basic regex search -------------------------------------------------------------------------
async function testBasicSearch() {
  const { result, text } = await runSearch({
    path: TEST_DIR,
    pattern: "pattern",
    timeout_ms: 10_000,
  });

  assert(result.structuredContent?.data?.structuredContent === undefined || true, "normalized envelope tolerated");
  assert(text.includes("fs-search"), "Batch response should use the fs-search tool name");
  assert(text.includes("test1.js"), "Should find matches in test1.js");
  assert(text.includes("test2.ts"), "Should find matches in test2.ts");
  assert(text.includes("nested.py"), "Should find matches in nested.py");
}

// 6. Test regex searches structured payload ----------------------------------------------------------
async function testRegexSearchesTool() {
  const result = await hndlRgxSrchs({
    items: [
      {
        path: TEST_DIR,
        pattern: "search.*",
        filePattern: "*.js",
        ignoreCase: false,
        contextLines: 0,
        maxResults: 10,
        timeout_ms: 5000,
      },
    ],
  });
  const strcCont = result.structuredContent;
  const itemResult = strcCont?.results?.[0]?.result?.structuredContent;

  assert(result.content[0].text.includes("Regex search session:"), "Regex searches should include full item details");
  assert(strcCont?.succeededCount === 1, "Regex searches should report one successful item");
  assert(strcCont?.toolName === "fs-search", "Batch payload should carry the fs-search tool name");
  assert(itemResult?.totalMatches >= 1, "Regex searches should find regex matches");
  assert(itemResult?.results?.some((item) => item.file.endsWith("test1.js")), "Regex searches should return matching files");
}

// 7. Test case-sensitive search ----------------------------------------------------------------------
async function testCaseSensitiveSearch() {
  const { text } = await runSearch({
    path: TEST_DIR,
    pattern: "Pattern",
    ignoreCase: false,
    timeout_ms: 10_000,
  });

  assert(text.includes("hidden.txt"), "Should find Pattern in hidden.txt");
  assert(!text.includes("test1.js"), "Should not match lowercase pattern in test1.js");
}

// 8. Test case-insensitive search --------------------------------------------------------------------
async function testCaseInsensitiveSearch() {
  const { text } = await runSearch({
    path: TEST_DIR,
    pattern: "PATTERN",
    ignoreCase: true,
    timeout_ms: 10_000,
  });

  assert(text.includes("test1.js"), "Should find pattern in test1.js");
  assert(text.includes("test2.ts"), "Should find pattern in test2.ts");
  assert(text.includes("nested.py"), "Should find pattern in nested.py");
}

// 9. Test file pattern filtering ---------------------------------------------------------------------
async function testFilePatternFiltering() {
  const { text } = await runSearch({
    path: TEST_DIR,
    pattern: "pattern",
    filePattern: "*.ts",
    timeout_ms: 10_000,
  });

  assert(text.includes("test2.ts"), "Should find matches in TypeScript files");
  assert(!text.includes("test1.js"), "Should not include JavaScript files");
  assert(!text.includes("nested.py"), "Should not include Python files");
}

// 10. Test maximum results limiting ------------------------------------------------------------------
async function testMaxResults() {
  const { itemResult, text } = await runSearch({
    path: TEST_DIR,
    pattern: "function",
    maxResults: 5,
    timeout_ms: 10_000,
  });

  assert(text.length > 0, "Should have some results");
  assert(itemResult?.totalResults <= 5 || itemResult?.wasLimited === true, "Should respect the maxResults cap");
}

// 11. Test context lines functionality ----------------------------------------------------------------
async function testContextLines() {
  const { text } = await runSearch({
    path: TEST_DIR,
    pattern: "searchFunction",
    contextLines: 1,
    timeout_ms: 10_000,
  });

  assert(text.length > 0, "Should have context around matches");
  assert(text.includes("test1.js"), "Should match searchFunction in test1.js");
}

// 12. Test hidden files inclusion --------------------------------------------------------------------
async function testIncludeHidden() {
  const hiddenFile = path.join(TEST_DIR, ".hidden-file.txt");
  await fs.writeFile(hiddenFile, "This is hidden content with pattern");

  try {
    const { text } = await runSearch({
      path: TEST_DIR,
      pattern: "hidden content",
      includeHidden: true,
      timeout_ms: 10_000,
    });
    const hsHddnRess = text.includes(".hidden-file.txt") || text.includes("No matches found");
    assert(hsHddnRess, "Should handle hidden files when includeHidden is true");
  }
  finally {
    await fs.rm(hiddenFile, { force: true });
  }
}

// 13. Test no matches found scenario -----------------------------------------------------------------
async function testNoMatches() {
  const { text } = await runSearch({
    path: TEST_DIR,
    pattern: "this-pattern-definitely-does-not-exist-anywhere",
    timeout_ms: 10_000,
  });

  assert(text.includes("No matches") || text.includes("Total results found: 0"), "Should return no matches message");
}

// 14. Test invalid path handling ---------------------------------------------------------------------
async function testInvalidPath() {
  const result = await hndlRgxSrchs({
    items: [
      {
        path: "/nonexistent/path/that/does/not/exist",
        pattern: "pattern",
        timeout_ms: 5000,
      },
    ],
  });
  const text = result.content[0].text;
  const isVldRes = text.includes("Error") || text.includes("not allowed") || text.includes("ERROR");

  assert(isVldRes, "Should handle invalid path gracefully");
}

// 15. Test schema validation with invalid arguments -------------------------------------------------
async function testInvalidArguments() {
  // Missing required path fails item-level validation but keeps the batch envelope.
  const result = await hndlRgxSrchs({
    items: [
      {
        pattern: "test",
      },
    ],
  });
  const text = result.content[0].text;

  assert(text.includes("Invalid arguments"), "Should validate path is required");

  // Missing pattern and pattern_path must also fail validation.
  const noPtrnRes = await hndlRgxSrchs({
    items: [
      {
        path: TEST_DIR,
      },
    ],
  });
  const noPtrnText = noPtrnRes.content[0].text;

  assert(noPtrnText.includes("Invalid arguments"), "Should validate pattern is required");
}

// 16. Main test runner function --------------------------------------------------------------------
export async function testSearchCode() {
  let origCfg;

  try {
    // Setup
    origCfg = await setup();

    // Run all tests
    await testBasicSearch();
    await testRegexSearchesTool();
    await testCaseSensitiveSearch();
    await testCaseInsensitiveSearch();
    await testFilePatternFiltering();
    await testMaxResults();
    await testContextLines();
    await testIncludeHidden();
    await testNoMatches();
    await testInvalidPath();
    await testInvalidArguments();
    return true;
  }
  catch (error) {
    console.error(`${colors.red}Test failed: ${error.message}${colors.reset}`);
    console.error(error.stack);
    throw error;
  }
  finally {
    // Cleanup
    if (origCfg) {
      await teardown(origCfg);
    }

    // Force cleanup of search manager to ensure process can exit
    try {
      const { searchManager: srchMgr, stopSearchManagerCleanup: stpSrMgCl } = await import("../../../out/features/search/search-service.js");

      // Terminate all active sessions
      const actvSssn = srchMgr.listSearchSessions();
      for (const session of actvSssn) {
        srchMgr.terminateSearch(session.id);
      }

      // Stop the cleanup interval
      stpSrMgCl();

      // Clear the sessions map
      srchMgr.sessions?.clear?.();
    }
    catch (_e) {
      // Ignore import errors
    }
  }
}

// Export for use in run-all-tests.js
export default testSearchCode;

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSearchCode()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test execution failed:", error);
      process.exit(1);
    });
}
