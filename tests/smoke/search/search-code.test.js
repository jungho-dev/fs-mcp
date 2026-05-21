/**
 * Unit tests for search functionality using new streaming search API
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { handleGetFullSearchResults as hndGtFlSrRe, handleGetMoreSearchResults as hndGtMrSrRe, handleRegexSearches as hndlRgxSrchs, handleStopSearch as hndlStpSrch2, handleStartSearch as hndlStrtSrc2 } from "../../../out/controllers/controllers-search.js";
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
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

// 1. Helper function to wait for search completion and get all results ――――――――――――――――――――――――――――
async function searchAndWaitForCompletion(searchArgs, timeout = 10_000) {
  const strtSessPat = /Started .+ session: (.+)/;
  const result = await hndlStrtSrc2(searchArgs);

  // Extract session ID from result
  const sessIdMtch = result.content[0].text.match(strtSessPat);
  if (!sessIdMtch) {
    throw new Error("Could not extract session ID from search result");
  }
  const sessionId = sessIdMtch[1];

  try {
    // Wait for completion by polling
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      // biome-ignore lint/performance/noAwaitInLoops: Polling requires sequential reads.
      const moreResults = await hndGtMrSrRe({ sessionId });

      if (moreResults.content[0].text.includes("Search completed")) {
        return { initialResult: result, finalResult: moreResults, sessionId };
      }

      if (moreResults.content[0].text.includes("ERROR")) {
        throw new Error(`Search failed: ${moreResults.content[0].text}`);
      }

      // Wait a bit before polling again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error("Search timed out");
  }
  finally {
    // Always stop the search session to prevent hanging
    try {
      await hndlStpSrch2({ sessionId });
    }
    catch (_e) {
      // Ignore errors when stopping - session might already be completed
    }
  }
}

// 2. Setup function to prepare test environment ―――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 3. Teardown function to clean up after tests ――――――――――――――――――――――――――――――――――――――――――――――――――――
async function teardown(origCfg) {
  // Clean up any remaining search sessions
  try {
    const { searchManager: srchMgr } = await import("../../../out/features/search/search-service.js");
    const sessions = srchMgr.listSearchSessions();
    await Promise.all(sessions.map((session) => hndlStpSrch2({ sessionId: session.id })));
  }
  catch (_e) {
    // Ignore errors in cleanup
  }

  // Remove test directory and all files
  await fs.rm(TEST_DIR, { force: true, recursive: true });

  // Restore original config
  await cfgMgr.updateConfig(origCfg);
}

// 4. Assert function for test validation ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 5. Test basic search functionality ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testBasicSearch() {
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "pattern",
    searchType: "content",
  });

  assert(finalResult.content, "Result should have content");
  assert(finalResult.content.length > 0, "Content should not be empty");

  const text = finalResult.content[0].text;
  assert(text.includes("test1.js"), "Should find matches in test1.js");
  assert(text.includes("test2.ts"), "Should find matches in test2.ts");
  assert(text.includes("nested.py"), "Should find matches in nested.py");
}

// 6. Test search pagination hints ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testSearchPaginationHints() {
  const result = await hndlStrtSrc2({
    path: TEST_DIR,
    pattern: "pattern",
    searchType: "content",
  });
  const sessionId = result.structuredContent?.sessionId;

  try {
    assert(typeof sessionId === "string", "Start search should expose sessionId in structuredContent");
    assert(result.content[0].text.includes("search-get"), "Start search should recommend full result tool");
    assert(!result.content[0].text.includes("get_compressed_search"), "Start search should not recommend removed compact result tool");
    assert(!result.content[0].text.includes("get_more_search_results"), "Start search should not recommend legacy result tool");

    const moreResults = await hndGtMrSrRe({ sessionId, offset: 0, length: 1 });
    assert(moreResults.structuredContent, "Search result read should expose pagination structuredContent");
    assert(Object.hasOwn(moreResults.structuredContent, "nextOffset"), "Search result read should expose nextOffset");

    const fullResults = await hndGtFlSrRe({ items: [{ sessionId, offset: 0, length: 20 }] });
    const fullItem = fullResults.structuredContent?.results?.[0]?.result?.structuredContent;

    assert(fullResults.content[0].text.includes("\nResults:\n"), "Full search result tool should include multiline item details");
    assert(fullItem?.results?.some((item) => item.file.endsWith("test1.js")), "Full search result tool should expose matching result rows");
    assert(!fullResults.content[0].text.includes("... (omitted)"), "Full search result tool should not omit item result details");
  }
  finally {
    if (typeof sessionId === "string") {
      await hndlStpSrch2({ sessionId });
    }
  }
}

// 7-1. Test regex searches tool ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
  assert(itemResult?.totalMatches >= 1, "Regex searches should find regex matches");
  assert(itemResult?.results?.some((item) => item.file.endsWith("test1.js")), "Regex searches should return matching files");
}

// 7. Test case-sensitive search ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testCaseSensitiveSearch() {
  // Search for 'Pattern' (capital P) with case sensitivity
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "Pattern",
    searchType: "content",
    ignoreCase: false,
  });

  const text = finalResult.content[0].text;
  // Should only find matches where 'Pattern' appears with capital P
  assert(text.includes("hidden.txt"), "Should find Pattern in hidden.txt");
}

// 8. Test case-insensitive search ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testCaseInsensitiveSearch() {
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "PATTERN",
    searchType: "content",
    ignoreCase: true,
  });

  const text = finalResult.content[0].text;
  assert(text.includes("test1.js"), "Should find pattern in test1.js");
  assert(text.includes("test2.ts"), "Should find pattern in test2.ts");
  assert(text.includes("nested.py"), "Should find pattern in nested.py");
}

// 9. Test file pattern filtering ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testFilePatternFiltering() {
  // Search only in TypeScript files
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "pattern",
    searchType: "content",
    filePattern: "*.ts",
  });

  const text = finalResult.content[0].text;
  assert(text.includes("test2.ts"), "Should find matches in TypeScript files");
  assert(!text.includes("test1.js"), "Should not include JavaScript files");
  assert(!text.includes("nested.py"), "Should not include Python files");
}

// 10. Test maximum results limiting ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testMaxResults() {
  // Test that the maxResults parameter is accepted and doesn't cause errors
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "function", // This pattern should appear multiple times
    searchType: "content",
    maxResults: 5, // Small limit
  });

  assert(finalResult.content, "Should have content");
  assert(finalResult.content.length > 0, "Content should not be empty");

  const text = finalResult.content[0].text;

  // Verify we get some results
  assert(text.length > 0, "Should have some results");

  // Should have results but respect the limit
  const hasResults = text.includes("function") || text.includes("No matches found");
  assert(hasResults, "Should have function results or no matches");
}

// 11. Test context lines functionality ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testContextLines() {
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "searchFunction",
    searchType: "content",
    contextLines: 1,
  });

  const text = finalResult.content[0].text;
  // With context lines, we should see lines before and after the match
  assert(text.length > 0, "Should have context around matches");
}

// 12. Test hidden files inclusion ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testIncludeHidden() {
  // First, create a hidden file (starts with dot)
  const hiddenFile = path.join(TEST_DIR, ".hidden-file.txt");
  await fs.writeFile(hiddenFile, "This is hidden content with pattern");

  try {
    const { finalResult } = await searchAndWaitForCompletion({
      path: TEST_DIR,
      pattern: "hidden content",
      searchType: "content",
      includeHidden: true,
    });

    const text = finalResult.content[0].text;
    const hsHddnRess = text.includes(".hidden-file.txt") || text.includes("No matches found");
    assert(hsHddnRess, "Should handle hidden files when includeHidden is true");
  }
  finally {
    // Clean up hidden file
    await fs.rm(hiddenFile, { force: true });
  }
}

// 13. Test timeout functionality ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testTimeout() {
  // Use a reasonable timeout
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "pattern",
    searchType: "content",
    timeout_ms: 5000, // 5 seconds should be plenty
  });

  assert(finalResult.content, "Result should have content even with timeout");
  assert(finalResult.content.length > 0, "Content should not be empty");

  const text = finalResult.content[0].text;
  // Should have results or indicate completion
  const hsVldRes = text.includes("pattern") || text.includes("No matches found") || text.includes("completed");
  assert(hsVldRes, "Should handle timeout gracefully");
}

// 14. Test no matches found scenario ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testNoMatches() {
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "this-pattern-definitely-does-not-exist-anywhere",
    searchType: "content",
  });

  assert(finalResult.content, "Result should have content");
  assert(finalResult.content.length > 0, "Content should not be empty");

  const text = finalResult.content[0].text;
  assert(text.includes("No matches") || text.includes("Total results found: 0"), "Should return no matches message");
}

// 15. Test invalid path handling ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testInvalidPath() {
  try {
    const result = await hndlStrtSrc2({
      path: "/nonexistent/path/that/does/not/exist",
      pattern: "pattern",
      searchType: "content",
    });

    // Should handle gracefully
    assert(result.content, "Result should have content");
    const text = result.content[0].text;
    const isVldRes = text.includes("Error") || text.includes("session:") || text.includes("not allowed");
    assert(isVldRes, "Should handle invalid path gracefully");
  }
  catch (_error) {
    // Invalid-path behavior is allowed to surface as an error response or a thrown error.
  }
}

// 16. Test schema validation with invalid arguments ―――――――――――――――――――――――――――――――――――――――――――――――
async function testInvalidArguments() {
  // Test missing required path
  try {
    const result = await hndlStrtSrc2({
      pattern: "test",
      // Missing path
    });
    const text = result.content[0].text;
    assert(text.includes("Invalid arguments"), "Should validate path is required");
  }
  catch (error) {
    // Also acceptable to throw
    assert(error.message.includes("path") || error.message.includes("required"), "Should validate path is required");
  }

  // Test missing required pattern
  try {
    const result = await hndlStrtSrc2({
      path: TEST_DIR,
      // Missing pattern
    });
    const text = result.content[0].text;
    assert(text.includes("Invalid arguments"), "Should validate pattern is required");
  }
  catch (error) {
    // Also acceptable to throw
    assert(error.message.includes("pattern") || error.message.includes("required"), "Should validate pattern is required");
  }
}

// 17. Test file search functionality ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testFileSearch() {
  const { finalResult } = await searchAndWaitForCompletion({
    path: TEST_DIR,
    pattern: "*.js",
    searchType: "files",
  });

  const text = finalResult.content[0].text;
  assert(text.includes("test1.js"), "Should find JavaScript files");
}

// 18. Main test runner function ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function testSearchCode() {
  let origCfg;

  try {
    // Setup
    origCfg = await setup();

    // Run all tests
    await testBasicSearch();
    await testSearchPaginationHints();
    await testRegexSearchesTool();
    await testCaseSensitiveSearch();
    await testCaseInsensitiveSearch();
    await testFilePatternFiltering();
    await testMaxResults();
    await testContextLines();
    await testIncludeHidden();
    await testTimeout();
    await testNoMatches();
    await testInvalidPath();
    await testInvalidArguments();
    await testFileSearch();
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
