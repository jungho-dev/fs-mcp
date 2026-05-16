// Test script to verify search result behavior using new streaming API

import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { handleGetMoreSearchResults as hndGtMrSrRe, handleStartSearch as hndlStrtSrc2, handleStopSearch as hndlStpSrch2 } from "../../../out/controllers/controllers-search.js";
import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);
const SRCH_FXTR_DR = path.join(__dirname, "..", "..", "fixtures", "output");
const SRC_FXT_PTH = path.join(SRCH_FXTR_DR, "output-file-with-1500-lines.txt");

// 1. Helper function to wait for search completion and get all results ――――――――――――――――――――――――――――
async function searchAndWaitForCompletion(searchArgs, timeout = 30_000) {
  const strtSessPat = /Started .* session:\s*([a-zA-Z0-9_-]+)/;
  const result = await hndlStrtSrc2(searchArgs);
  let cmplRes;

  // Extract session ID from result with tighter regex
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
      const resultText = moreResults.content[0].text;

      if (resultText.includes("Search completed") || resultText.includes("Status: COMPLETED")) {
        cmplRes = { initialResult: result, finalResult: moreResults, sessionId };
        break;
      }

      if (moreResults.isError || resultText.includes("ERROR")) {
        throw new Error(`Search failed: ${resultText}`);
      }

      // Wait a bit before polling again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!cmplRes) {
      throw new Error("Search timed out");
    }
  }
  finally {
    // Always stop the search session to prevent hanging
    try {
      await hndlStpSrch2({ sessionId });
    }
    catch {
      // Ignore errors when stopping - session might already be completed
    }
  }

  return cmplRes;
}

// 2. Test search truncation ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testSearchTruncation() {
  try {
    await cfgMgr.setValue("allowedDirectories", [SRCH_FXTR_DR]);

    // Test search that will produce many results
    const searchArgs = {
      path: SRC_FXT_PTH,
      pattern: "line",
      searchType: "content",
      maxResults: 5000,
      ignoreCase: true,
      literalSearch: true,
    };
    const { initialResult: intlRes, finalResult } = await searchAndWaitForCompletion(searchArgs);

    const cmbnLen = intlRes.content[0].text.length + finalResult.content[0].text.length;

    // Use consistent API limit constant
    const apiLimit = 1_048_576; // 1 MiB
    if (cmbnLen > apiLimit && !finalResult.content[0].text.includes("Results truncated")) {
      throw new Error("Search result exceeded API limit without truncation notice");
    }

    if (finalResult.content[0].text.includes("Results truncated")) {
      const _trncIdx = finalResult.content[0].text.indexOf("Results truncated");
    }
  }
  catch (error) {
    console.error("Test failed:", error);
    throw error;
  }
}

testSearchTruncation()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
