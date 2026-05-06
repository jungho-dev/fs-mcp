/**
 * @file src/features/edit/edit-service.ts
 * @description Edit operation service.
 * @author JUNGHO
 * @since 2026-05-02
 */

// Text file editing via search/replace with fuzzy matching support.

import path from "node:path";
import {resolvePreviewFileType} from "@assets/readers/readers-filetypes";
import type {ServerResult} from "@assets/type/common";
import {createErrorResponse} from "@cores/responses/responses-error";
import {capture} from "@cores/runtime/runtime-output-capture";
import {configManager} from "@features/config/config-store";
import {detectLineEnding, normalizeLineEndings} from "@features/edit/edit-line-ending-policy";
import {resolveAbsolutePath} from "@features/filesystem/filesystem-path-resolver";
import {readFileInternal, validatePath, writeFile} from "@features/filesystem/filesystem-service";
import {getSimilarityRatio, recursiveFuzzyIndexOf} from "@features/search/search-fuzzy-matcher";
import {type FuzzySearchLogEntry, fuzzySearchLogger} from "@features/search/search-log";
import {EditBlockArgsSchema} from "@schemas/schemas-edit";

interface SearchReplace {
  replace: string;
  search: string;
}
// Threshold for fuzzy matching - similarity must be at least this value to be considered
// (0-1 scale where 1 is perfect match and 0 is completely different)
const FUZZY_THRESHOLD = 0.7;

// 1. Extract character code data from diff ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// @param expected The string that was searched for
// @param actual The string that was found
// @returns Character code statistics

// 1. Get character code data ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getCharacterCodeData(
  expected: string,
  actual: string,
): {
  report: string;
  uniqueCount: number;
  diffLength: number;
} {
  // Find common prefix and suffix
  let prefixLength = 0;
  const minLength = Math.min(expected.length, actual.length);

  // Determine common prefix length
  while (prefixLength < minLength && expected[prefixLength] === actual[prefixLength]) {
    prefixLength++;
  }
  // Determine common suffix length
  let suffixLength = 0;
  while (suffixLength < minLength - prefixLength && expected.at(1 + suffixLength) === actual.at(1 + suffixLength)) {
    suffixLength++;
  }
  // Extract the different parts
  const expectedDiff = expected.slice(prefixLength, expected.length - suffixLength);
  const actualDiff = actual.slice(prefixLength, actual.length - suffixLength);

  // Count unique character codes in the diff
  const characterCodes = new Map<number, number>();
  const fullDiff = expectedDiff + actualDiff;

  for (const character of fullDiff.split("")) {
    const charCode = character.charCodeAt(0);
    characterCodes.set(charCode, (characterCodes.get(charCode) || 0) + 1);
  }
  // Create character codes string report
  const charCodeReport: string[] = [];
  characterCodes.forEach((count, code) => {
    // Include character representation for better readability
    const char = String.fromCharCode(code);
    // Make special characters more readable
    const charDisplay = code < 32 || code > 126 ? `\\x${code.toString(16).padStart(2, "0")}` : char;
    charCodeReport.push(`${code}:${count}[${charDisplay}]`);
  });

  // Sort by character code for consistency
  charCodeReport.sort((a, b) => {
    const codeA = Number.parseInt(a.split(":")[0], 10);
    const codeB = Number.parseInt(b.split(":")[0], 10);
    return codeA - codeB;
  });

  return {
    diffLength: fullDiff.length,
    report: charCodeReport.join(","),
    uniqueCount: characterCodes.size,
  };
}

// 2. Perform search replace ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function performSearchReplace(filePath: string, block: SearchReplace, expectedReplacements: number=1): Promise<ServerResult> {
  // Get file extension for diagnostics using path module.
  const fileExtension = path.extname(filePath).toLowerCase();

  // Report file extension and string sizes without capturing the file path.
  capture("server_edit_block", {
    expectedReplacements: expectedReplacements,
    fileExtension: fileExtension,
    newStringLength: block.replace.length,
    newStringLines: block.replace.split("\n").length,
    oldStringLength: block.search.length,
    oldStringLines: block.search.split("\n").length,
  });
  // Check for empty search string to prevent infinite loops
  if (block.search === "") {
    // Report file extension without capturing the file path.
    capture("server_edit_block_empty_search", {expectedReplacements, fileExtension: fileExtension });
    return {
      content: [
        {
          text: "Empty search strings are not allowed. Please provide a non-empty string to search for.",
          type: "text",
        },
      ],
    };
  }
  // Read file directly to preserve line endings - critical for edit operations
  const validPath = await validatePath(filePath);
  const content = await readFileInternal(validPath, 0, Number.MAX_SAFE_INTEGER);

  // Make sure content is a string
  if (typeof content !== "string") {
    capture("server_edit_block_content_not_string", {expectedReplacements, fileExtension: fileExtension });
    throw new Error(`Wrong content for file ${filePath}`);
  }
  // Get the large-edit warning threshold from configuration
  const config = await configManager.getConfig();
  const warningLineLimit = config.fileWriteLineLimit ?? 50;

  // Detect file's line ending style
  const fileLineEnding = detectLineEnding(content);

  // Normalize search string to match file's line endings
  const normalizedSearch = normalizeLineEndings(block.search, fileLineEnding);

  // First try exact match
  const tempContent = content;
  let count = 0;
  let pos = tempContent.indexOf(normalizedSearch);

  while (pos !== -1) {
    count++;
    pos = tempContent.indexOf(normalizedSearch, pos + 1);
  }
  // If exact match found and count matches expected replacements, proceed with exact replacement
  if (count > 0 && count === expectedReplacements) {
    // Replace all occurrences
    let newContent = content;

    // If we're only replacing one occurrence, replace it directly
    if (expectedReplacements === 1) {
      const searchIndex = newContent.indexOf(normalizedSearch);
      newContent = newContent.slice(0, searchIndex) + normalizeLineEndings(block.replace, fileLineEnding) + newContent.slice(searchIndex + normalizedSearch.length);
    }
    else {
      // Replace all occurrences using split and join for multiple replacements
      newContent = newContent.split(normalizedSearch).join(normalizeLineEndings(block.replace, fileLineEnding));
    }
    // Check if search or replace text has too many lines
    const searchLines = block.search.split("\n").length;
    const replaceLines = block.replace.split("\n").length;
    const maxLines = Math.max(searchLines, replaceLines);
    let warningMessage = "";

    if (maxLines > warningLineLimit) {
      const problemText = searchLines > replaceLines ? "search text" : "replacement text";
      warningMessage = `\n\nWARNING: The ${problemText} has ${maxLines} lines (warning threshold: ${warningLineLimit}).

RECOMMENDATION: For large search/replace operations, consider breaking them into smaller chunks with fewer lines.`;
    }
    await writeFile(filePath, newContent);
    capture("server_edit_block_exact_success", {expectedReplacements, fileExtension: fileExtension, hasWarning: warningMessage !== ""});
    const resolvedEditPath = resolveAbsolutePath(filePath);

    // Show a partial preview centered on the edited area
    const newLines = newContent.split("\n");
    const totalLines = newLines.length;
    const changePos = content.indexOf(normalizedSearch);
    const changeStartLine = changePos >= 0 ? newContent.slice(0, changePos).split("\n").length - 1 : 0;
    const changeLineCount = block.replace.split("\n").length;
    const contextLines = 10;
    const previewStart = Math.max(0, changeStartLine - contextLines);
    const previewEnd = Math.min(totalLines, changeStartLine + changeLineCount + contextLines);
    const previewContent = newLines.slice(previewStart, previewEnd).join("\n");
    const previewLineCount = previewEnd - previewStart;
    const remaining = totalLines - previewEnd;
    const statusLine = `Reading ${previewLineCount} lines from ${previewStart === 0 ? "start" : `line ${previewStart}`} (total: ${totalLines} lines, ${remaining} remaining)\n\n`;

    return {
      content: [
        {
          text: `${statusLine}${previewContent}`,
          type: "text",
        },
      ],
      structuredContent: {
        fileName: path.basename(resolvedEditPath),
        filePath: resolvedEditPath,
        fileType: resolvePreviewFileType(resolvedEditPath),
      },
    };
  }
  // If exact match found but count doesn't match expected, inform the user
  if (count > 0 && count !== expectedReplacements) {
    capture("server_edit_block_unexpected_count", {expectedReplacements, expectedReplacementsCount: count, fileExtension: fileExtension });
    return {
      content: [
        {
          text: `Expected ${expectedReplacements} occurrences but found ${count} in ${filePath}. Double check and make sure you understand all occurencies and if you want to replace all ${count} occurrences, set expected_replacements to ${count}. If there are many occurrancies and you want to change some of them and keep the rest. Do it one by one, by adding more lines around each occurrence.If you want to replace a specific occurrence, make your search string more unique by adding more lines around search string.`,
          type: "text",
        },
      ],
    };
  }
  // If exact match not found, try fuzzy search
  if (count === 0) {
    // Track fuzzy search time
    const startTime = performance.now();

    // Perform fuzzy search
    const fuzzyResult = recursiveFuzzyIndexOf(content, block.search);
    const similarity = getSimilarityRatio(block.search, fuzzyResult.value);

    // Calculate execution time in milliseconds
    const executionTime = performance.now() - startTime;

    // Generate diff and gather character code data
    const diff = highlightDifferences(block.search, fuzzyResult.value);

    // Count character codes in diff
    const characterCodeData = getCharacterCodeData(block.search, fuzzyResult.value);

    // Create comprehensive log entry
    const logEntry: FuzzySearchLogEntry = {
      belowThreshold: similarity < FUZZY_THRESHOLD,
      characterCodes: characterCodeData.report,
      diff: diff,
      diffLength: characterCodeData.diffLength,
      exactMatchCount: count,
      executionTime: executionTime,
      expectedReplacements: expectedReplacements,
      fileExtension: fileExtension,
      foundLength: fuzzyResult.value.length,
      foundText: fuzzyResult.value,
      fuzzyThreshold: FUZZY_THRESHOLD,
      searchLength: block.search.length,
      searchText: block.search,
      similarity: similarity,
      timestamp: new Date(),
      uniqueCharacterCount: characterCodeData.uniqueCount,
    };

    // Log to file
    await fuzzySearchLogger.log(logEntry);

    // Combine all fuzzy search data for single capture
    const fuzzySearchData = {
      character_codes: characterCodeData.report,
      execution_time_ms: executionTime,
      file_size: content.length,
      found_text_length: fuzzyResult.value.length,
      search_length: block.search.length,
      similarity: similarity,
      threshold: FUZZY_THRESHOLD,
      total_diff_length: characterCodeData.diffLength,
      unique_character_count: characterCodeData.uniqueCount,
    };

    // Check if the fuzzy match is "close enough"
    if (similarity >= FUZZY_THRESHOLD) {
      // Capture the fuzzy search event with all data
      capture("server_fuzzy_search_performed", fuzzySearchData);

      // If we allow fuzzy matches, we would make the replacement here
      // For now, we'll return a detailed message about the fuzzy match
      return {
        content: [
          {
            text: `Exact match not found, but found a similar text with ${Math.round(similarity * 100)}% similarity (found in ${executionTime.toFixed(2)}ms):\n\nDifferences:\n${diff}\n\nTo replace this text, use the exact text found in the file.\n\nLog entry saved for analysis. Use the following command to check the log:\nCheck log: ${await fuzzySearchLogger.getLogPath()}`,
            type: "text",
          },
        ],
      };
    }
    else {
      // If the fuzzy match isn't close enough
      // Still capture the fuzzy search event with all data
      capture("server_fuzzy_search_performed", {
        ...fuzzySearchData,
        below_threshold: true,
      });

      return {
        content: [
          {
            text: `Search content not found in ${filePath}. The closest match was "${fuzzyResult.value}" with only ${Math.round(similarity * 100)}% similarity, which is below the ${Math.round(FUZZY_THRESHOLD * 100)}% threshold. (Fuzzy search completed in ${executionTime.toFixed(2)}ms)\n\nLog entry saved for analysis. Use the following command to check the log:\nCheck log: ${await fuzzySearchLogger.getLogPath()}`,
            type: "text",
          },
        ],
      };
    }
  }
  throw new Error("Unexpected error during search and replace operation.");
}

// 2. Character diff formatter ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// @param expected The string that was searched for
// @param actual The string that was found
// @returns A formatted string showing character-level differences

// 3. Highlight differences ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function highlightDifferences(expected: string, actual: string): string {
  // Implementation of a simplified character-level diff

  // Find common prefix and suffix
  let prefixLength = 0;
  const minLength = Math.min(expected.length, actual.length);

  // Determine common prefix length
  while (prefixLength < minLength && expected[prefixLength] === actual[prefixLength]) {
    prefixLength++;
  }
  // Determine common suffix length
  let suffixLength = 0;
  while (suffixLength < minLength - prefixLength && expected.at(1 + suffixLength) === actual.at(1 + suffixLength)) {
    suffixLength++;
  }
  // Extract the common and different parts
  const commonPrefix = expected.slice(0, prefixLength);
  const commonSuffix = expected.slice(expected.length - suffixLength);

  const expectedDiff = expected.slice(prefixLength, expected.length - suffixLength);
  const actualDiff = actual.slice(prefixLength, actual.length - suffixLength);

  // Format the output as a character-level diff
  return `${commonPrefix}{-${expectedDiff}-}{+${actualDiff}+}${commonSuffix}`;
}

// 4. Resolve edit text argument ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveEditTextArgument(value: string | undefined, filePath: string | undefined, offset: number, length: number | undefined, label: string): Promise<string> {
  if (value !== undefined) {
    return value;
  }
  if (filePath === undefined) {
    throw new Error(`${label} or ${label}_path is required`);
  }
  return readFileInternal(filePath, offset, length);
}

// 3. Handle edit_block command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// 1. Text files: String replacement (old_string/new_string)
// - Uses fuzzy matching for resilience
// - Handles expected_replacements parameter

// 4. Handle edit block ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleEditBlock(args: unknown): Promise<ServerResult> {
  const parsed = EditBlockArgsSchema.parse(args);
  const oldString = await resolveEditTextArgument(parsed.old_string, parsed.old_string_path, parsed.old_string_offset, parsed.old_string_length, "old_string");
  const newString = await resolveEditTextArgument(parsed.new_string, parsed.new_string_path, parsed.new_string_offset, parsed.new_string_length, "new_string");

  // Validate path and resolve handler once.
  let validatedPath: string;
  let handler: Awaited<ReturnType<typeof import("@assets/readers/readers-factory").getFileHandler>>;
  try {
    validatedPath = await validatePath(parsed.file_path);
    const {getFileHandler} = await import("@assets/readers/readers-factory");
    handler = await getFileHandler(validatedPath);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
  const hasEditRange = "editRange" in handler && typeof handler.editRange === "function";

  // If the handler implements editRange it owns text-replacement for its file type
  // (e.g. DocxFileHandler does find/replace on pretty-printed XML rather than raw bytes).
  // Plain text files fall through to performSearchReplace.
  if (hasEditRange) {
    try {
      const result = await handler.editRange?.(validatedPath, "", {
        expected_replacements: parsed.expected_replacements,
        new_string: newString,
        old_string: oldString,
      });

      if (result === undefined) {
        return createErrorResponse("File handler did not return an edit result");
      }
      if (result.success) {
        const resolvedEditRangePath = resolveAbsolutePath(parsed.file_path);
        return {
          content: [
            {
              text: `Successfully applied ${result.editsApplied} edit(s) to ${parsed.file_path}`,
              type: "text",
            },
          ],
          structuredContent: {
            fileName: path.basename(resolvedEditRangePath),
            filePath: resolvedEditRangePath,
            fileType: resolvePreviewFileType(resolvedEditRangePath),
          },
        };
      }
      const errorMsg = result.errors?.map((e) => e.error).join("; ") || "Unknown error";
      return createErrorResponse(errorMsg);
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createErrorResponse(errorMessage);
    }
  }
  return performSearchReplace(
    parsed.file_path,
    {
      replace: newString,
      search: oldString,
    },
    parsed.expected_replacements,
  );
}
