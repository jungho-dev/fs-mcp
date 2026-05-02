/**
 * @file src/mcp/tools/catalog/filesystem-tools.mts
 * @description Filesystem and search tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {zodToJsonSchema} from "zod-to-json-schema";
import {CreateDirectoryArgsSchema, GetFileInfoArgsSchema, GetMoreSearchResultsArgsSchema, ListDirectoryArgsSchema, ListSearchesArgsSchema, MoveFileArgsSchema, ReadFileArgsSchema, ReadMultipleFilesArgsSchema, StartSearchArgsSchema, StopSearchArgsSchema, WriteFileArgsSchema} from "@mcp/schemas/schema-exports";
import {CMD_PREFIX_DESCRIPTION, PATH_GUIDANCE, type ToolCatalogEntry} from "@mcp/tools/catalog/catalog-shared";

export const FILESYSTEM_TOOL_CATALOG: ToolCatalogEntry[] = [
  // Filesystem tools
  {
    name: "read_file",
    description: `
                Read contents from files and URLs.

                Prefer this over 'execute_command' with cat/type for viewing files.

                Supports partial file reading with:
                - 'offset' (start line, default: 0)
                  * Positive: Start from line N (0-based indexing)
                  * Negative: Read last N lines from end (tail behavior)
                - 'length' (max lines to read, default: configurable via 'fileReadLineLimit' setting, initially 1000)
                  * Used with positive offsets for range reading
                  * Ignored when offset is negative (reads all requested tail lines)

                Examples:
                - offset: 0, length: 10     → First 10 lines
                - offset: 100, length: 5    → Lines 100-104
                - offset: -20               → Last 20 lines
                - offset: -5, length: 10    → Last 5 lines (length ignored)

                Performance optimizations:
                - Large files with negative offsets use reverse reading for efficiency
                - Large files with deep positive offsets use byte estimation
                - Small files use fast readline streaming

                When reading from the file system, only works within allowed directories.
                Can fetch content from URLs when isUrl parameter is set to true
                (URLs are always read in full regardless of offset/length).

                FORMAT HANDLING (by extension):
                - Text: Uses offset/length for line-based pagination
                - Images (PNG, JPEG, GIF, WebP): Base64 encoded viewable content
                - DOCX (.docx): Two modes depending on parameters:
                  * DEFAULT (no offset/length): Returns a text-bearing outline — shows paragraphs with text,
                    tables with cell content, styles, image refs. Skips shapes/drawings/SVG noise.
                    Each element shows its body index [0], [1], etc.
                  * WITH offset/length: Returns raw pretty-printed XML with line pagination.
                    Use this to drill into specific sections or see the actual XML for editing.
                  * EDITING WORKFLOW: 1) read_file to get outline, 2) read_file with offset/length
                    to see raw XML around what you want to edit, 3) edit_block with old_string/new_string
                    using XML fragments copied from the read output.
                  * IMPORTANT: offset MUST be non-zero to get raw XML (use offset=1 to start from line 1).
                    offset=0 always returns the outline regardless of length.
                  * For BULK changes (translation, mass replacements): use start_process with Python
                    zipfile module to find/replace all <w:t> elements at once.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ReadFileArgsSchema),
    annotations: {
      title: "Read File or URL",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "read_multiple_files",
    description: `
                Read the contents of multiple files simultaneously.

                Each file's content is returned with its path as a reference.
                Handles text files normally and renders images as viewable content.
                Recognized image types: PNG, JPEG, GIF, WebP.

                Failed reads for individual files won't stop the entire operation.
                Only works within allowed directories.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema),
    annotations: {
      title: "Read Multiple Files",
      readOnlyHint: true,
    },
  },
  {
    name: "write_file",
    description: `
                Write or append to file contents.

                DO NOT use this tool to edit DOCX files. Use 'edit_block' with old_string/new_string instead.
                To CREATE a new DOCX, use write_file with .docx extension — text content with markdown headings (#, ##, ###) is converted to styled DOCX paragraphs.

                CHUNKING IS STANDARD PRACTICE: Always write files in chunks of 25-30 lines maximum.
                This is the normal, recommended way to write files - not an emergency measure.

                STANDARD PROCESS FOR ANY FILE:
                1. FIRST → write_file(filePath, firstChunk, {mode: 'rewrite'})  [≤30 lines]
                2. THEN → write_file(filePath, secondChunk, {mode: 'append'})   [≤30 lines]
                3. CONTINUE → write_file(filePath, nextChunk, {mode: 'append'}) [≤30 lines]

                ALWAYS CHUNK PROACTIVELY - don't wait for performance warnings!

                WHEN TO CHUNK (always be proactive):
                1. Any file expected to be longer than 25-30 lines
                2. When writing multiple files in sequence
                3. When creating documentation, code files, or configuration files

                HANDLING CONTINUATION ("Continue" prompts):
                If user asks to "Continue" after an incomplete operation:
                1. Read the file to see what was successfully written
                2. Continue writing ONLY the remaining content using {mode: 'append'}
                3. Keep chunks to 25-30 lines each

                Files over 50 lines will generate performance notes but are still written successfully.
                Only works within allowed directories.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(WriteFileArgsSchema),
    annotations: {
      title: "Write File",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "create_directory",
    description: `
                Create a new directory or ensure a directory exists.

                Can create multiple nested directories in one operation.
                Only works within allowed directories.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema),
    annotations: {
      title: "Create Directory",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "list_directory",
    description: `
                Get a detailed listing of all files and directories in a specified path.

                Use this instead of 'execute_command' with ls/dir commands.
                Results distinguish between files and directories with and prefixes.

                Supports recursive listing with the 'depth' parameter (default: 2):
                - depth=1: Only direct contents of the directory
                - depth=2: Contents plus one level of subdirectories
                - depth=3+: Multiple levels deep

                CONTEXT OVERFLOW PROTECTION:
                - Top-level directory shows ALL items
                - Nested directories are limited to 100 items maximum per directory
                - When a nested directory has more than 100 items, you'll see a warning like:
                  node_modules: 500 items hidden (showing first 100 of 600 total)
                - This prevents overwhelming the context with large directories like node_modules

                Results show full relative paths from the root directory being listed.
                Example output with depth=2:
                src
                src/index.mts
                src/features
                src/features/filesystem/filesystem-service.mts

                If a directory cannot be accessed, it will show instead.
                Only works within allowed directories.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ListDirectoryArgsSchema),
    annotations: {
      title: "List Directory Contents",
      readOnlyHint: true,
    },
  },
  {
    name: "move_file",
    description: `
                Move or rename files and directories.

                Can move files between directories and rename them in a single operation.
                Both source and destination must be within allowed directories.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(MoveFileArgsSchema),
    annotations: {
      title: "Move/Rename File",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "start_search",
    description: `
                Start a streaming search that can return results progressively.

                SEARCH STRATEGY GUIDE:
                Choose the right search type based on what the user is looking for:

                USE searchType="files" WHEN:
                - User asks for specific files: "find package.json", "locate config files"
                - Pattern looks like a filename: "*.js", "README.md", "test-*.tsx"
                - User wants to find files by name/extension: "all TypeScript files", "Python scripts"
                - Looking for configuration/setup files: ".env", "dockerfile", "tsconfig.json"

                USE searchType="content" WHEN:
                - User asks about code/logic: "authentication logic", "error handling", "API calls"
                - Looking for functions/variables: "getUserData function", "useState hook"
                - Searching for text/comments: "task markers", "review notes", "documentation"
                - Finding patterns in code: "console.log statements", "import statements"
                - User describes functionality: "components that handle login", "files with database queries"

                WHEN UNSURE OR USER REQUEST IS AMBIGUOUS:
                Run TWO searches in parallel - one for files and one for content:

                Example approach for ambiguous queries like "find authentication stuff":
                1. Start file search: searchType="files", pattern="auth"
                2. Simultaneously start content search: searchType="content", pattern="authentication"
                3. Present combined results: "Found 3 auth-related files and 8 files containing authentication code"

                SEARCH TYPES:
                - searchType="files": Find files by name (pattern matches file names)
                - searchType="content": Search inside files for text patterns

                PATTERN MATCHING MODES:
                - Default (literalSearch=false): Patterns are treated as regular expressions
                - Literal (literalSearch=true): Patterns are treated as exact strings

                WHEN TO USE literalSearch=true:
                Use literal search when searching for code patterns with special characters:
                - Function calls with parentheses and quotes
                - Array access with brackets
                - Object methods with dots and parentheses
                - File paths with backslashes
                - Any pattern containing: . * + ? ^ $ { } [ ] | \\ ( )

                IMPORTANT PARAMETERS:
                - pattern: What to search for (file names OR content text)
                - literalSearch: Use exact string matching instead of regex (default: false)
                - filePattern: Optional filter to limit search to specific file types (e.g., "*.js", "package.json")
                - ignoreCase: Case-insensitive search (default: true). Works for both file names and content.
                - earlyTermination: Stop search early when exact filename match is found (optional: defaults to true for file searches, false for content searches)

                DECISION EXAMPLES:
                - "find package.json" → searchType="files", pattern="package.json" (specific file)
                - "find authentication components" → searchType="content", pattern="authentication" (looking for functionality)
                - "locate all React components" → searchType="files", pattern="*.tsx" or "*.jsx" (file pattern)
                - "find task marker comments" → searchType="content", pattern="NOTE" (text in files)
                - "show me login files" → AMBIGUOUS → run both: files with "login" AND content with "login"
                - "find config" → AMBIGUOUS → run both: config files AND files containing config code

                COMPREHENSIVE SEARCH EXAMPLES:
                - Find package.json files: searchType="files", pattern="package.json"
                - Find all JS files: searchType="files", pattern="*.js"
                - Search for marker comments in code: searchType="content", pattern="NOTE", filePattern="*.js|*.ts"
                - Search for exact code: searchType="content", pattern="toast.error('test')", literalSearch=true
                - Ambiguous request "find auth stuff": Run two searches:
                  1. searchType="files", pattern="auth"
                  2. searchType="content", pattern="authentication"

                PRO TIP: When user requests are ambiguous about whether they want files or content,
                run both searches concurrently and combine results for comprehensive coverage.

                Unlike regular search tools, this starts a background search process and returns
                immediately with a session ID. Use get_more_search_results to get results as they
                come in, and stop_search to stop the search early if needed.

                Perfect for large directories where you want to see results immediately and
                have the option to cancel if the search takes too long or you find what you need.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(StartSearchArgsSchema),
    annotations: {
      title: "Start Search",
      readOnlyHint: true,
    },
  },
  {
    name: "get_more_search_results",
    description: `
                Get more results from an active search with offset-based pagination.

                Supports partial result reading with:
                - 'offset' (start result index, default: 0)
                  * Positive: Start from result N (0-based indexing)
                  * Negative: Read last N results from end (tail behavior)
                - 'length' (max results to read, default: 100)
                  * Used with positive offsets for range reading
                  * Ignored when offset is negative (reads all requested tail results)

                Examples:
                - offset: 0, length: 100     → First 100 results
                - offset: 200, length: 50    → Results 200-249
                - offset: -20                → Last 20 results
                - offset: -5, length: 10     → Last 5 results (length ignored)

                Returns only results in the specified range, along with search status.
                Works like read_process_output - call this repeatedly to get progressive
                results from a search started with start_search.

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(GetMoreSearchResultsArgsSchema),
    annotations: {
      title: "Get Search Results",
      readOnlyHint: true,
    },
  },
  {
    name: "stop_search",
    description: `
                Stop an active search.

                Stops the background search process gracefully. Use this when you've found
                what you need or if a search is taking too long. Similar to force_terminate
                for terminal processes.

                The search will still be available for reading final results until it's
                automatically cleaned up after 5 minutes.

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(StopSearchArgsSchema),
    annotations: {
      title: "Stop Search",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "list_searches",
    description: `
                List all active searches.

                Shows search IDs, search types, patterns, status, and runtime.
                Similar to list_sessions for terminal processes. Useful for managing
                multiple concurrent searches.

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ListSearchesArgsSchema),
    annotations: {
      title: "List Active Searches",
      readOnlyHint: true,
    },
  },
  {
    name: "get_file_info",
    description: `
                Retrieve detailed metadata about a file or directory including:
                - size
                - creation time
                - last modified time
                - permissions
                - type
                - lineCount (for text files)
                - lastLine (zero-indexed number of last line, for text files)
                - appendPosition (line number for appending, for text files)

                Only works within allowed directories.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(GetFileInfoArgsSchema),
    annotations: {
      title: "Get File Information",
      readOnlyHint: true,
    },
  },
];
