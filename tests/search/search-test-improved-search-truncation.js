// Test script to verify improved search result behavior using new streaming API

import path from "node:path";
import { fileURLToPath } from "node:url";
import { configManager } from "../../out/features/config/config-store.mjs";
import { handleGetMoreSearchResults, handleStartSearch, handleStopSearch } from "../../out/controllers/controllers-search.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEARCH_FIXTURE_DIR = path.join(__dirname, "..", "fixtures", "output");
const SEARCH_FIXTURE_PATH = path.join(SEARCH_FIXTURE_DIR, "output-file-with-1500-lines.txt");

/**
 * Helper function to wait for search completion and get all results
 */
async function searchAndWaitForCompletion(searchArgs, timeout = 30_000) {
  const result = await handleStartSearch(searchArgs);
  let completedResult;

  // Extract session ID from result with tighter regex
  const sessionIdMatch = result.content[0].text.match(/Started .* session:\s*([a-zA-Z0-9_-]+)/);
  if (!sessionIdMatch) {
    throw new Error("Could not extract session ID from search result");
  }
  const sessionId = sessionIdMatch[1];

  try {
    // Wait for completion by polling
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const moreResults = await handleGetMoreSearchResults({ sessionId });
      const resultText = moreResults.content[0].text;

      if (resultText.includes("Search completed") || resultText.includes("Status: COMPLETED")) {
        completedResult = { initialResult: result, finalResult: moreResults, sessionId };
        break;
      }

      if (moreResults.isError || resultText.includes("ERROR")) {
        throw new Error(`Search failed: ${resultText}`);
      }

      // Wait a bit before polling again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!completedResult) {
      throw new Error("Search timed out");
    }
  } finally {
    // Always stop the search session to prevent hanging
    try {
      await handleStopSearch({ sessionId });
    } catch {
      // Ignore errors when stopping - session might already be completed
    }
  }

  return completedResult;
}

async function testImprovedSearchTruncation() {
  try {
    await configManager.setValue("allowedDirectories", [SEARCH_FIXTURE_DIR]);

    // Test search that will produce many results to trigger potential limits
    const searchArgs = {
      path: SEARCH_FIXTURE_PATH,
      pattern: "line",
      searchType: "content",
      maxResults: 5000,
      ignoreCase: true,
      literalSearch: true,
    };
    const _start = Date.now();
    const { initialResult, finalResult } = await searchAndWaitForCompletion(searchArgs);
    const _end = Date.now();

    const totalLength = initialResult.content[0].text.length + finalResult.content[0].text.length;
    const apiLimit = 1_048_576; // 1 MiB - use consistent constant

    // Check if we're within the safe limits using single source of truth
    if (totalLength > apiLimit) {
    } else if (totalLength > Math.floor(0.8 * apiLimit)) {
    } else {
    }

    if (finalResult.content[0].text.includes("Results truncated")) {
      const _truncationIndex = finalResult.content[0].text.indexOf("Results truncated");
    } else {
    }

    // Check character length safety
    const _safetyMargin = apiLimit - totalLength;
  } catch (error) {
    console.error("Test failed:", error);
    throw error;
  }
}

testImprovedSearchTruncation()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
