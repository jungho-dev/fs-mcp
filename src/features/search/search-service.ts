/**
 * @file src/features/search/search-service.ts
 * @description Search service operations.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {type ChildProcess, spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {capture} from "@cores/runtime/runtime-output-capture";
import {validatePath} from "@features/filesystem/filesystem-service";
import {getRipgrepPath} from "@features/search/search-ripgrep-adapter";
import PizZip from "pizzip";

const FIRST_CHUNK_WAIT_MS = 40;
const EXACT_FILENAME_TIMEOUT_MS = 1500;
const SEARCH_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const SEARCH_CLEANUP_INITIAL_DELAY_MS = 1000;
const EARLY_TERMINATION_DELAY_MS = 100;
const MATCH_CONTEXT_CHARS = 1000;
const SEARCH_LINE_SEPARATOR = "\n";
const GLOB_PATTERN_SEPARATOR = "|";
const LAST_READ_MARKER_FILE = "__LAST_READ_MARKER__";
const RIPGREP_CONTEXT_TYPE_TOKEN = '"type":"context"';
const RIPGREP_ERROR_PREFIX = "rg:";
const DISPLAY_MAX_CHARS = 10;
const ERROR_NOISE_LINE_PATTERN = /^[)(\s\d:]*$/;
const EXACT_FILENAME_PATTERN = /\.[a-zA-Z0-9]+$/;
const GLOB_META_CHARS = ["*", "?", "[", "{", "]", "}"];
const DOCX_EXTENSIONS = [".docx"];
const DOCX_TEXT_XML_PARTS = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"] as const;
const WORD_TEXT_PATTERN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const GLOB_REGEX_ESCAPE_PATTERN = /[.+^${}()|[\]\\]/g;
const GLOB_ASTERISK_PATTERN = /\*/g;

export interface SearchResult {
  file: string;
  line?: number;
  match?: string;
  type: "file" | "content";
}
export interface SearchSession {
  buffer: string; // For processing incomplete JSON lines
  error?: string;
  id: string;
  isComplete: boolean;
  isError: boolean;
  lastReadTime: number;
  options: SearchSessionOptions;
  process: ChildProcess;
  results: SearchResult[];
  startTime: number;
  totalContextLines: number; // Track context lines separately
  totalMatches: number;
  wasIncomplete?: boolean; // NEW: Track if search was incomplete due to permissions/access issues
}
export interface SearchSessionOptions {
  contextLines?: number;
  earlyTermination?: boolean; // Stop search early when exact filename match is found
  filePattern?: string;
  ignoreCase?: boolean;
  includeHidden?: boolean;
  literalSearch?: boolean; // Force literal string matching (-F flag) instead of regex
  maxResults?: number;
  pattern: string;
  rootPath: string;
  searchType: "files" | "content";
  timeout?: number;
}
// 1. Search Session Manager - handles ripgrep processes like terminal sessions ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Supports both file search and content search with progressive results
// 1. Search manager ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export class SearchManager {
  private readonly sessions = new Map<string, SearchSession>();
  private sessionCounter = 0;

  // 2. Start a new search session (like start_process) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Returns immediately with initial state and results

  async startSearch(options: SearchSessionOptions): Promise<{
    sessionId: string;
    isComplete: boolean;
    isError: boolean;
    results: SearchResult[];
    totalResults: number;
    runtime: number;
  }> {
    const sessionId = `search_${++this.sessionCounter}_${Date.now()}`;

    // Validate path first
    const validPath = await validatePath(options.rootPath);

    // Build ripgrep arguments
    const args = this.buildRipgrepArgs({...options, rootPath: validPath});

    // Get ripgrep path with fallback resolution
    let rgPath: string;
    try {
      rgPath = await getRipgrepPath();
    }
    catch (err) {
      throw new Error(`Failed to locate ripgrep binary: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Start ripgrep process
    const rgProcess = spawn(rgPath, args, {windowsHide: true}); // Prevent visible console windows on Windows

    if (!rgProcess.pid) {
    	throw new Error("Failed to start ripgrep process");
    }
    // Create session
    const session: SearchSession = {
      buffer: "",
      id: sessionId,
      isComplete: false,
      isError: false,
      lastReadTime: Date.now(),
      options,
      process: rgProcess,
      results: [],
      startTime: Date.now(),
      totalContextLines: 0,
      totalMatches: 0,
    };

    this.sessions.set(sessionId, session);

    // Set up process event handlers
    this.setupProcessHandlers(session);

    // Start cleanup interval now that we have a session
    startCleanupIfNeeded();

    // Set up timeout if specified and auto-terminate
    // For exact filename searches, use a shorter default timeout
    const timeoutMs = options.timeout ?? (this.isExactFilename(options.pattern) ? EXACT_FILENAME_TIMEOUT_MS : undefined);

    let killTimer: NodeJS.Timeout | null = null;
    if (timeoutMs) {
      killTimer = setTimeout(() => {
        if (!session.isComplete && !session.process.killed) {
        	session.process.kill("SIGTERM");
        }
      }, timeoutMs);
    }
    // Clear timer on process completion
    session.process.once("close", () => {
      if (killTimer) {
      	clearTimeout(killTimer);
        killTimer = null;
      }
    });

    session.process.once("error", () => {
      if (killTimer) {
      	clearTimeout(killTimer);
        killTimer = null;
      }
    });

    capture("search_session_started", {
      hasTimeout: !!timeoutMs,
      requestedPath: options.rootPath,
      searchType: options.searchType,
      sessionId,
      timeoutMs,
      validatedPath: validPath,
    });

    // For content searches, also search DOCX files
    const shouldSearchDocx = options.searchType === "content" && this.shouldIncludeDocxSearch(options.filePattern, validPath);

    if (shouldSearchDocx) {
      this.searchDocxFiles(validPath, options.pattern, options.ignoreCase !== false, options.maxResults, options.filePattern, options.literalSearch)
        .then((docxResults) => {
          for (const result of docxResults) {
            session.results.push(result);
            session.totalMatches++;
          }
        })
        .catch ((err) => {
          capture("docx_search_error", {error: err instanceof Error ? err.message : String(err)});
        });
    }
    // Wait for first chunk of data or early completion instead of fixed delay
    const firstChunk = new Promise<void>((resolve) => {
      const onData = () => {
        session.process.stdout?.off("data", onData);
        resolve();
      };
      session.process.stdout?.once("data", onData);
      setTimeout(resolve, FIRST_CHUNK_WAIT_MS);
    });

    // Only wait for ripgrep first chunk; DOCX results merge asynchronously
    await firstChunk;

    return {
      isComplete: session.isComplete,
      isError: session.isError,
      results: [...session.results],
      runtime: Date.now() - session.startTime,
      sessionId,
      totalResults: session.totalMatches,
    };
  }
  // Read search results with offset-based pagination (like read_file)
  // Supports both range reading and tail behavior
  readSearchResults(
    sessionId: string,
    offset: number = 0,
    length?: number,
  ): {
    results: SearchResult[];
    returnedCount: number; // Renamed from newResultsCount
    totalResults: number;
    totalMatches: number; // Actual matches (excluding context)
    isComplete: boolean;
    isError: boolean;
    error?: string;
    hasMoreResults: boolean; // New field
    runtime: number;
    wasIncomplete?: boolean; // NEW: Indicates if search was incomplete due to permissions
  } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Search session ${sessionId} not found`);
    }
    // Get all results (excluding internal markers)
    const allResults = session.results.filter((r) => r.file !== LAST_READ_MARKER_FILE);

    // Handle negative offsets (tail behavior) - like file reading
    if (offset < 0) {
      const tailCount = Math.abs(offset);
      const tailResults = allResults.slice(-tailCount);
      return {
        error: session.error?.trim() || undefined,
        hasMoreResults: false, // Tail always returns what's available
        isComplete: session.isComplete,
        isError: session.isError && !!session.error?.trim(), // Only error if we have actual errors
        results: tailResults,
        returnedCount: tailResults.length,
        runtime: Date.now() - session.startTime,
        totalMatches: session.totalMatches, // Actual matches only
        totalResults: session.totalMatches + session.totalContextLines,
        wasIncomplete: session.wasIncomplete,
      };
    }
    // Handle positive offsets (range behavior) - like file reading
    const slicedResults = length === undefined ? allResults.slice(offset) : allResults.slice(offset, offset + length);
    const hasMoreResults = length === undefined ? !session.isComplete : offset + length < allResults.length || !session.isComplete;

    session.lastReadTime = Date.now();

    return {
      error: session.error?.trim() || undefined,
      hasMoreResults,
      isComplete: session.isComplete,
      isError: session.isError && !!session.error?.trim(), // Only error if we have actual errors
      results: slicedResults,
      returnedCount: slicedResults.length,
      runtime: Date.now() - session.startTime,
      totalMatches: session.totalMatches, // Actual matches only
      totalResults: session.totalMatches + session.totalContextLines,
      wasIncomplete: session.wasIncomplete,
    };
  }
  // 3. Terminate a search session (like force_terminate) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  terminateSearch(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
    	return false;
    }
    if (!session.process.killed) {
    	session.process.kill("SIGTERM");
    }
    // Don't delete session immediately - let user read final results
    // It will be cleaned up by cleanup process

    return true;
  }
  // 4. Get list of active search sessions (like list_sessions) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  listSearchSessions(): Array<{
    id: string;
    searchType: string;
    pattern: string;
    isComplete: boolean;
    isError: boolean;
    runtime: number;
    totalResults: number;
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      isComplete: session.isComplete,
      isError: session.isError,
      pattern: session.options.pattern,
      runtime: Date.now() - session.startTime,
      searchType: session.options.searchType,
      totalResults: session.totalMatches + session.totalContextLines,
    }));
  }
  // 2. Should include docx search ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private shouldIncludeDocxSearch(filePattern?: string, rootPath?: string): boolean {
    if (rootPath) {
      const lowerPath = rootPath.toLowerCase();
      if (DOCX_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) {
      	return true;
      }
    }
    if (filePattern) {
      const lowerPattern = filePattern.toLowerCase();
      if (DOCX_EXTENSIONS.some((ext) => lowerPattern.includes(`*${ext}`) || lowerPattern.endsWith(ext))) {
      	return true;
      }
    }
    return false;
  }
  // 6. Search DOCX files for content matches ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Extracts <w:t> text from document.xml and searches it
  // 3. Search docx files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private async searchDocxFiles(rootPath: string, pattern: string, ignoreCase: boolean, maxResults?: number, filePattern?: string, _literalSearch?: boolean): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // DOCX search always uses literal matching to prevent ReDoS.
    // Regex patterns are treated as literal strings — this is intentional.
    const searchTerm = ignoreCase ? pattern.toLowerCase() : pattern;

    let docxFiles = await this.findDocxFiles(rootPath);

    if (filePattern) {
      const patterns = filePattern
        .split(GLOB_PATTERN_SEPARATOR)
        .map((p) => p.trim())
        .filter(Boolean);
      docxFiles = docxFiles.filter((filePath) => {
        const fileName = path.basename(filePath);
        return patterns.some((pat) => {
          if (pat.includes("*")) {
          	return buildGlobPatternRegExp(pat).test(fileName);
          }
          return fileName.toLowerCase() === pat.toLowerCase();
        });
      });
    }
    for (const filePath of docxFiles) {
      if (maxResults && results.length >= maxResults) {
      	break;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: DOCX files are scanned sequentially to honor maxResults short-circuiting.
        const buf = await fs.readFile(filePath);
        const zip = new PizZip(buf);

        for (const xmlPath of DOCX_TEXT_XML_PARTS) {
          if (maxResults && results.length >= maxResults) {
          	break;
          }
          const file = zip.file(xmlPath);
          if (!file) {
          	continue;
          }
          const xml = file.asText();
          let lineNum = 0;

          for (const m of xml.matchAll(WORD_TEXT_PATTERN)) {
            if (maxResults && results.length >= maxResults) {
            	break;
            }
            const text = m[1];
            if (!text?.trim()) {
            	continue;
            }
            lineNum++;

            const textToSearch = ignoreCase ? text.toLowerCase() : text;
            const matchIndex = textToSearch.indexOf(searchTerm);
            if (matchIndex !== -1) {
              const matchContext = this.getMatchContext(text, matchIndex, searchTerm.length);

              const partName = xmlPath === "word/document.xml" ? "" : `:${xmlPath.replace("word/", "")}`;
              results.push({
                file: `${filePath}${partName}`,
                line: lineNum,
                match: matchContext,
                type: "content",
              });
            }
          }
        }
      }
      catch {}
    }
    return results;
  }
  // 4. Find docx files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private async findDocxFiles(rootPath: string): Promise<string[]> {
    const docxFiles: string[] = [];
    const isDocx = (name: string) => name.toLowerCase().endsWith(".docx");

    // 5. Walk ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
    async function walk(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, {withFileTypes: true});
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
              // biome-ignore lint/performance/noAwaitInLoops: Recursive walk is sequential to keep traversal bounded and simple.
            	await walk(fullPath);
            }
          }
          else if (entry.isFile() && isDocx(entry.name)) {
          	docxFiles.push(fullPath);
          }
        }
      }
      catch {
        /* skip */
      }
    }
    try {
      const stats = await fs.stat(rootPath);
      if (stats.isFile() && isDocx(rootPath)) {
      	return [rootPath];
      }
      else if (stats.isDirectory()) {
      	await walk(rootPath);
      }
    }
    catch {
      /* skip */
    }
    return docxFiles;
  }
  // 6. Get match context ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getMatchContext(text: string, matchStart: number, matchLength: number): string {
    const start = Math.max(0, matchStart - MATCH_CONTEXT_CHARS);
    const end = Math.min(text.length, matchStart + matchLength + MATCH_CONTEXT_CHARS);

    let context = text.slice(start, end);

    // Add ellipsis if truncated
    if (start > 0) {
      context = `...${context}`;
    }
    if (end < text.length) {
      context = `${context}...`;
    }
    return context;
  }
  // 9. Clean up completed sessions older than specified time ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Called automatically by cleanup interval
  cleanupSessions(maxAge: number = SEARCH_CLEANUP_INTERVAL_MS): void {
    const cutoffTime = Date.now() - maxAge;

    for (const [sessionId, session] of this.sessions) {
      if (session.isComplete && session.lastReadTime < cutoffTime) {
      	this.sessions.delete(sessionId);
      }
    }
  }
  // 10. Get total number of active sessions (excluding completed ones) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter((session) => !session.isComplete).length;
  }
  // 11. Detect if pattern looks like an exact filename ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // (has file extension and no glob wildcards)
  // 7. Is exact filename ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private isExactFilename(pattern: string): boolean {
    return EXACT_FILENAME_PATTERN.test(pattern) && !this.isGlobPattern(pattern);
  }
  // 8. Is glob pattern ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private isGlobPattern(pattern: string): boolean {
    return GLOB_META_CHARS.some((char) => pattern.includes(char));
  }
  // 9. Build ripgrep args ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private buildRipgrepArgs(options: SearchSessionOptions): string[] {
    const args: string[] = [];

    if (options.searchType === "content") {
      // Content search mode
      args.push("--json", "--line-number");

      // Add literal search support for content searches
      if (options.literalSearch) {
      	args.push("-F"); // Fixed string matching (literal)
      }
      if (options.contextLines && options.contextLines > 0) {
      	args.push("-C", options.contextLines.toString());
      }
    }
    else {
    	// File search mode
      args.push("--files");
    }
    // Case-insensitive: content searches use -i flag, file searches use --iglob
    if (options.searchType === "content" && options.ignoreCase !== false) {
    	args.push("-i");
    }
    if (options.includeHidden) {
    	args.push("--hidden");
    }
    if (options.maxResults && options.maxResults > 0) {
    	args.push("-m", options.maxResults.toString());
    }
    // File pattern filtering (for file type restrictions like *.js, *.d.ts)
    if (options.filePattern) {
      const patterns = options.filePattern
        .split(GLOB_PATTERN_SEPARATOR)
        .map((p) => p.trim())
        .filter(Boolean);

      for (const p of patterns) {
        if (options.searchType === "content") {
        	args.push("-g", p);
        }
        else {
          // For file search: use --iglob for case-insensitive or --glob for case-sensitive
          if (options.ignoreCase !== false) {
          	args.push("--iglob", p);
          }
          else {
          	args.push("--glob", p);
          }
        }
      }
    }
    // Handle the main search pattern
    if (options.searchType === "files") {
      // For file search: determine how to treat the pattern
      const globFlag = options.ignoreCase !== false ? "--iglob" : "--glob";

      if (this.isExactFilename(options.pattern)) {
      	// Exact filename: use appropriate glob flag with the exact pattern
        args.push(globFlag, options.pattern);
      }
      else if (this.isGlobPattern(options.pattern)) {
      	// Already a glob pattern: use appropriate glob flag as-is
        args.push(globFlag, options.pattern);
      }
      else {
        // Substring/fuzzy search: wrap with wildcards
        args.push(globFlag, `*${options.pattern}*`);
      }
      // Add the root path for file mode
      args.push(options.rootPath);
    }
    else {
    	// Content search: terminate options before the pattern to prevent
      // patterns starting with '-' being interpreted as flags
      args.push("--", options.pattern, options.rootPath);
    }
    return args;
  }
  // 10. Setup process handlers ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private setupProcessHandlers(session: SearchSession): void {
    const {process} = session;

    process.stdout?.on("data", (data: Buffer) => {
      session.buffer += data.toString();
      this.processBufferedOutput(session);
    });

    process.stderr?.on("data", (data: Buffer) => {
      const errorText = data.toString();

      // Store error text for potential user display, but don't capture individual errors
      // We'll capture incomplete search status in the completion event instead
      session.error = (session.error || "") + errorText;

      // Filter meaningful errors
      const filteredErrors = errorText.split(SEARCH_LINE_SEPARATOR).filter((line) => {
        const trimmed = line.trim();

        // Skip empty lines and lines with just symbols/numbers/colons
        if (!trimmed || ERROR_NOISE_LINE_PATTERN.test(trimmed)) {
        	return false;
        }
        // Skip all ripgrep system errors that start with "rg:"
        if (trimmed.startsWith(RIPGREP_ERROR_PREFIX)) {
        	return false;
        }
        return true;
      });

      // Only add to session.error if there are actual meaningful errors after filtering
      if (filteredErrors.length > 0) {
        const meaningfulErrors = filteredErrors.join(SEARCH_LINE_SEPARATOR).trim();
        if (meaningfulErrors) {
          session.error = `${(session.error || "") + meaningfulErrors}\n`;
          capture("search_session_error", {
            error: meaningfulErrors.slice(0, DISPLAY_MAX_CHARS),
            sessionId: session.id,
          });
        }
      }
    });

    process.on("close", (code: number) => {
      // Process any remaining buffer content
      if (session.buffer.trim()) {
      	this.processBufferedOutput(session, true);
      }
      session.isComplete = true;

      // Track if search was incomplete due to access issues
      // Ripgrep exit code 2 means "some files couldn't be searched"
      if (code === 2) {
      	session.wasIncomplete = true;
      }
      // Only treat as error if:
      // 1. Unexpected exit code (not 0, 1, or 2) AND
      // 2. We have meaningful errors after filtering AND
      // 3. We found no results at all
      // Codes 0=success, 1=no matches, 2=some files couldn't be searched
      if (code !== 0 && code !== 1 && code !== 2 && session.error?.trim() && session.totalMatches === 0) {
        session.isError = true;
        session.error = session.error || `ripgrep exited with code ${code}`;
      }
      // If we have results, don't mark as error even if there were permission issues
      if (session.totalMatches > 0) {
      	session.isError = false;
      }
      capture("search_session_completed", {
        exitCode: code,
        runtime: Date.now() - session.startTime,
        sessionId: session.id,
        totalMatches: session.totalMatches,
        totalResults: session.totalMatches + session.totalContextLines,
        wasIncomplete: session.wasIncomplete || false, // NEW: Track incomplete searches
      });

      // Rely on cleanupSessions(maxAge) only; no per-session timer
    });

    process.on("error", (error: Error) => {
      session.isComplete = true;
      session.isError = true;
      session.error = `Process error: ${error.message}`;

      // Rely on cleanupSessions(maxAge) only; no per-session timer
    });
  }
  // 11. Process buffered output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private processBufferedOutput(session: SearchSession, isFinal: boolean = false): void {
    const lines = session.buffer.split(SEARCH_LINE_SEPARATOR);

    // Keep the last incomplete line in the buffer unless this is final processing
    if (!isFinal) {
    	session.buffer = lines.pop() || "";
    }
    else {
    	session.buffer = "";
    }
    for (const line of lines) {
      if (!line.trim()) {
      	continue;
      }
      const result = this.parseLine(line, session.options.searchType);
      if (result) {
        session.results.push(result);
        // Separate counting of matches vs context lines
        if (result.type === "content" && line.includes(RIPGREP_CONTEXT_TYPE_TOKEN)) {
        	session.totalContextLines++;
        }
        else {
        	session.totalMatches++;
        }
        // Early termination for exact filename matches (if enabled)
        if (
          session.options.earlyTermination !== false && // Default to true
          session.options.searchType === "files" && this.isExactFilename(session.options.pattern)
        ) {
          const pat = path.normalize(session.options.pattern);
          const filePath = path.normalize(result.file);
          const ignoreCase = session.options.ignoreCase !== false;
          const ends = ignoreCase ? filePath.toLowerCase().endsWith(pat.toLowerCase()) : filePath.endsWith(pat);
          if (ends) {
            // Found exact match, terminate search early
            setTimeout(() => {
              if (!session.process.killed) {
              	session.process.kill("SIGTERM");
              }
            }, EARLY_TERMINATION_DELAY_MS);
            break;
          }
        }
      }
    }
  }
  // 12. Parse line ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private parseLine(line: string, searchType: "files" | "content"): SearchResult | null {
    if (searchType === "content") {
      // Parse JSON output from content search
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === "match") {
          // Handle multiple submatches per line - return first submatch
          const submatch = parsed.data?.submatches?.[0];
          return {
            file: parsed.data.path.text,
            line: parsed.data.line_number,
            match: submatch?.match?.text || parsed.data.lines.text,
            type: "content",
          };
        }
        if (parsed.type === "context") {
          return {
            file: parsed.data.path.text,
            line: parsed.data.line_number,
            match: parsed.data.lines.text.trim(),
            type: "content",
          };
        }
        // Handle summary to reconcile totals
        if (parsed.type === "summary") {
        	// Optional: could reconcile totalMatches with parsed.data.stats?.matchedLines
          return null;
        }
        return null;
      }
      catch (_error) {
        // Skip invalid JSON lines
        return null;
      }
    }
    else {
      // File search - each line is a file path
      return {
        file: line.trim(),
        type: "file",
      };
    }
  }
}

// 13. Build glob pattern reg exp ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function buildGlobPatternRegExp(pattern: string): RegExp {
  const regexPattern = pattern.replace(GLOB_REGEX_ESCAPE_PATTERN, "\\$&").replace(GLOB_ASTERISK_PATTERN, ".*");
  return new RegExp(`^${regexPattern}$`, "i");
}

// Global search manager instance
export const searchManager = new SearchManager();

// Cleanup management - run on fixed schedule
let cleanupInterval: NodeJS.Timeout | null = null;

// 14. Start cleanup if needed ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function startCleanupIfNeeded(): void {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => {
      searchManager.cleanupSessions();
    }, SEARCH_CLEANUP_INTERVAL_MS);

    // Also check immediately after a short delay (let search process finish)
    setTimeout(() => {
      searchManager.cleanupSessions();
    }, SEARCH_CLEANUP_INITIAL_DELAY_MS);
  }
}
