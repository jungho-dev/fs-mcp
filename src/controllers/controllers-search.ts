/**
 * @file src/controllers/controllers-search.ts
 * @description MCP search tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse as crtBtchTlRes, runParallelBatch as rnPrllBtch } from "@controllers/controllers-batch";
import { readFileInternal as rdFlInt } from "@features/filesystem/filesystem-service";
import { srchMgr } from "@features/search/search-service";
import { RgxSrArSc, RgxSrArSc2 } from "@schemas/schemas-search";

const RGX_POLL_MS = 50;

// 1. Sleep ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 2. Handle regex search ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRegexSearch(args: unknown): Promise<ServerResult> {
  const parsed = RgxSrArSc.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments for regex_search: ${parsed.error}` }],
      isError: true,
    };
  }
  try {
    const pattern = parsed.data.pattern ?? await rdFlInt(parsed.data.pattern_path ?? "", parsed.data.pattern_offset, parsed.data.pattern_length);
    const started = await srchMgr.startSearch({
      contextLines: parsed.data.contextLines,
      filePattern: parsed.data.filePattern,
      ignoreCase: parsed.data.ignoreCase,
      includeHidden: parsed.data.includeHidden,
      literalSearch: false,
      maxResults: parsed.data.maxResults,
      pattern: pattern,
      rootPath: parsed.data.path,
      searchType: "content",
      timeout: parsed.data.timeout_ms,
    });
    const deadline = Date.now() + parsed.data.timeout_ms;
    let results = srchMgr.readSearchResults(started.sessionId, 0);

    while (!results.isComplete && Date.now() < deadline) {
      // biome-ignore lint/performance/noAwaitInLoops: Polling waits for one ripgrep session to finish.
      await sleep(RGX_POLL_MS);
      results = srchMgr.readSearchResults(started.sessionId, 0);
    }
    if (!results.isComplete) {
      srchMgr.terminateSearch(started.sessionId);
      await sleep(RGX_POLL_MS);
      results = srchMgr.readSearchResults(started.sessionId, 0);
    }

    let output = `Regex search session: ${started.sessionId}\n`;
    output += `Pattern: "${pattern}"\n`;
    output += `Path: ${parsed.data.path}\n`;
    if (parsed.data.filePattern) {
      output += `File pattern: ${parsed.data.filePattern}\n`;
    }
    output += `Status: ${results.isComplete ? "COMPLETED" : "TERMINATED"}\n`;
    output += `Runtime: ${Math.round(results.runtime / 1000)}s\n`;
    output += `Total results found: ${results.totalResults} (${results.totalMatches} matches)\n\n`;

    if (results.results.length === 0) {
      output += "No matches found.";
    }
    else {
      output += "Results:\n";

      for (const result of results.results) {
        output += `${result.file}:${result.line} - ${result.match?.slice(0, 100)}${result.match && result.match.length > 100 ? "..." : ""}\n`;
      }
    }
    if (results.wasIncomplete) {
      output += "\nWarning: Some files were inaccessible due to permissions. Results may be incomplete.";
    }
    if (results.wasLimited) {
      output += "\nResult limit reached. Narrow the query or set maxResults explicitly for broader scans.";
    }
    return {
      content: [{ type: "text", text: output }],
      structuredContent: {
        isComplete: results.isComplete,
        returnedCount: results.returnedCount,
        results: results.results,
        sessionId: started.sessionId,
        totalMatches: results.totalMatches,
        totalResults: results.totalResults,
        wasIncomplete: results.wasIncomplete === true,
        wasLimited: results.wasLimited === true,
      },
    };
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error running regex search: ${errorMessage}` }],
      isError: true,
    };
  }
}

// 3. Handle regex searches ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRegexSearches(args: unknown): Promise<ServerResult> {
  const parsed = RgxSrArSc2.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleRegexSearch(item));
  const response = crtBtchTlRes("fs-search", results, { resultMode: "full" });

  return response;
}
