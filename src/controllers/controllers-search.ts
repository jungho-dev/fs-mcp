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
import { GtFlSrReArSc, GtMrSrReArSc, RgxSrArSc, RgxSrArSc2, StpSrArSc, StpSrArSc2, StrSrArSc, StrSrArSc2 } from "@schemas/schemas-search";

const RGX_POLL_MS = 50;

// 1. Sleep ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. Handle start search ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStartSearch(args: unknown): Promise<ServerResult> {
  const parsed = StrSrArSc.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments for start_search: ${parsed.error}` }],
      isError: true,
    };
  }
  try {
    const pattern = parsed.data.pattern ?? await rdFlInt(parsed.data.pattern_path ?? "", parsed.data.pattern_offset, parsed.data.pattern_length);
    const result = await srchMgr.startSearch({
      rootPath: parsed.data.path,
      pattern: pattern,
      searchType: parsed.data.searchType,
      filePattern: parsed.data.filePattern,
      ignoreCase: parsed.data.ignoreCase,
      maxResults: parsed.data.maxResults,
      includeHidden: parsed.data.includeHidden,
      contextLines: parsed.data.contextLines,
      timeout: parsed.data.timeout_ms,
      earlyTermination: parsed.data.earlyTermination,
      literalSearch: parsed.data.literalSearch,
    });

    const srchTypTxt = parsed.data.searchType === "content" ? "content search" : "file search";
    const dsplIntlRess = Math.min(result.results.length, 10);
    const nextOffset = result.isComplete && result.results.length <= dsplIntlRess ? null : dsplIntlRess;

    let output = `Started ${srchTypTxt} session: ${result.sessionId}\n`;
    output += `Pattern: "${pattern}"\n`;
    output += `Path: ${parsed.data.path}\n`;
    output += `Status: ${result.isComplete ? "COMPLETED" : "RUNNING"}\n`;
    output += `Runtime: ${Math.round(result.runtime)}ms\n`;
    output += `Total results: ${result.totalResults}\n\n`;

    if (result.results.length > 0) {
      output += "Initial results:\n";

      for (const searchResult of result.results.slice(0, 10)) {
        if (searchResult.type === "content") {
          output += `${searchResult.file}:${searchResult.line} - ${searchResult.match?.slice(0, 100)}${searchResult.match && searchResult.match.length > 100 ? "..." : ""}\n`;
        }
        else {
          output += `${searchResult.file}\n`;
        }
      }
      if (result.results.length > 10) {
        output += `... and ${result.results.length - 10} more results\n`;
      }
    }
    if (result.isComplete) {
      output += `\nSearch completed.`;
    }
    else {
      output += `\nSearch in progress. Use search-get with sessionId: ${result.sessionId} and offset: ${nextOffset ?? 0}.`;
    }
    if (result.wasLimited) {
      output += `\nResult limit reached. Narrow the query or set maxResults explicitly for broader scans.`;
    }
    if (nextOffset !== null) {
      output += `\nNext offset: ${nextOffset}. Use search-get with sessionId: ${result.sessionId}.`;
    }
    return {
      content: [{ type: "text", text: output }],
      structuredContent: {
        displayedInitialResults: dsplIntlRess,
        hasMoreResults: nextOffset !== null,
        nextOffset,
        sessionId: result.sessionId,
        status: result.isComplete ? "COMPLETED" : "RUNNING",
        totalResults: result.totalResults,
        wasLimited: result.wasLimited === true,
      },
    };
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error starting search session: ${errorMessage}` }],
      isError: true,
    };
  }
}

// 2. Handle get more search results ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetMoreSearchResults(args: unknown): Promise<ServerResult> {
  const parsed = GtMrSrReArSc.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments for search result read: ${parsed.error}` }],
      isError: true,
    };
  }
  try {
    const results = srchMgr.readSearchResults(parsed.data.sessionId, parsed.data.offset, parsed.data.length);

    // Only return error if we have no results AND there's an actual error
    // Permission errors should not block returning found results
    if (results.isError && results.totalResults === 0 && results.error?.trim()) {
      return {
        content: [
          {
            type: "text",
            text: `Search session ${parsed.data.sessionId} encountered an error: ${results.error}`,
          },
        ],
        isError: true,
      };
    }
    // Format results for display
    let output = `Search session: ${parsed.data.sessionId}\n`;
    output += `Status: ${results.isComplete ? "COMPLETED" : "IN PROGRESS"}\n`;
    output += `Runtime: ${Math.round(results.runtime / 1000)}s\n`;
    output += `Total results found: ${results.totalResults} (${results.totalMatches} matches)\n`;

    const offset = parsed.data.offset;

    if (offset < 0) {
      // Negative offset - tail behavior
      output += `Showing last ${results.returnedCount} results\n\n`;
    }
    else {
      // Positive offset - range behavior
      const startPos = offset;
      const endPos = startPos + results.returnedCount - 1;
      output += `Showing results ${startPos}-${endPos}\n\n`;
    }
    if (results.results.length === 0) {
      if (results.isComplete) {
        output += results.totalResults === 0 ? "No matches found." : "No results in this range.";
      }
      else {
        output += "No results yet, search is still running...";
      }
    }
    else {
      output += "Results:\n";

      for (const result of results.results) {
        if (result.type === "content") {
          output += `${result.file}:${result.line} - ${result.match?.slice(0, 100)}${result.match && result.match.length > 100 ? "..." : ""}\n`;
        }
        else {
          output += `${result.file}\n`;
        }
      }
    }
    // Add pagination hints
    const nextOffset = offset >= 0 && results.hasMoreResults ? offset + results.returnedCount : null;
    if (nextOffset !== null) {
      output += `\nMore results available. Use search-get with offset: ${nextOffset}`;
    }
    if (results.isComplete) {
      output += `\nSearch completed.`;

      // Warn users if search was incomplete due to permission issues
      if (results.wasIncomplete) {
        output += `\nWarning: Some files were inaccessible due to permissions. Results may be incomplete.`;
      }
    }
    if (results.wasLimited) {
      output += `\nResult limit reached. Narrow the query or set maxResults explicitly for broader scans.`;
    }
    return {
      content: [{ type: "text", text: output }],
      structuredContent: {
        hasMoreResults: results.hasMoreResults,
        isComplete: results.isComplete,
        nextOffset,
        returnedCount: results.returnedCount,
        results: results.results,
        sessionId: parsed.data.sessionId,
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
      content: [{ type: "text", text: `Error reading search results: ${errorMessage}` }],
      isError: true,
    };
  }
}

// 3. Handle stop search ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStopSearch(args: unknown): Promise<ServerResult> {
  const parsed = StpSrArSc.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid arguments for stop_search: ${parsed.error}` }],
      isError: true,
    };
  }
  try {
    const success = srchMgr.terminateSearch(parsed.data.sessionId);

    if (success) {
      return {
        content: [
          {
            type: "text",
            text: `Search session ${parsed.data.sessionId} terminated successfully.`,
          },
        ],
      };
    }
    else {
      return {
        content: [
          {
            type: "text",
            text: `Search session ${parsed.data.sessionId} not found or already completed.`,
          },
        ],
      };
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{ type: "text", text: `Error terminating search session: ${errorMessage}` }],
      isError: true,
    };
  }
}

// 4. Handle regex search ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 5. Handle start searches ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStartSearches(args: unknown): Promise<ServerResult> {
  const parsed = StrSrArSc2.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleStartSearch(item));
  const response = crtBtchTlRes("search-start", results);

  return response;
}

// 6. Handle regex searches ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRegexSearches(args: unknown): Promise<ServerResult> {
  const parsed = RgxSrArSc2.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleRegexSearch(item));
  const response = crtBtchTlRes("search-regex", results, { resultMode: "full" });

  return response;
}

// 7. Handle get full search results ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetFullSearchResults(args: unknown): Promise<ServerResult> {
  const parsed = GtFlSrReArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleGetMoreSearchResults(item));
  const response = crtBtchTlRes("search-get", results, { resultMode: "full" });

  return response;
}

// 8. Handle stop searches ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleStopSearches(args: unknown): Promise<ServerResult> {
  const parsed = StpSrArSc2.parse(args);
  const results = await rnPrllBtch(parsed.sessionIds, (sessionId) => handleStopSearch({ sessionId: sessionId }));
  const response = crtBtchTlRes("search-stop", results);

  return response;
}
