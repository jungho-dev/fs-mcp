/**
 * @file src/features/search/search-service.ts
 * @description Search service operations.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {type ChildProcess, spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {validatePath} from "@features/filesystem/filesystem-service";
import {getRipgrepPath as gtRpgrPth} from "@features/search/search-ripgrep-adapter";
import PizZip from "pizzip";

const FCWM = 40;
const EFTM = 1500;
const SCIM = 60 * 1000;
const SCIDM = 1000;
const ETDM = 100;
const SPRC = 10;
const MTC_CTX_CHR = 1000;
const SRCH_LN_SPRT = "\n";
const GLB_PAT_SPRT = "|";
const LRMF = "__LAST_READ_MARKER__";
const RCTT = '"type":"context"';
const RPG_ERR_PRF = "rg:";
const ENLP = /^[)(\s\d:]*$/;
const EXC_FLN_PAT = /\.[a-zA-Z0-9]+$/;
const GLB_MT_CHRS = ["*", "?", "[", "{", "]", "}"];
const DCX_EXTS = [".docx"];
const DTXP = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"] as const;
const WRD_TXT_PAT = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const GREP = /[.+^${}()|[\]\\]/g;
const GLB_ASTR_PAT = /\*/g;

export declare interface SearchResult {
  file: string;
  line?: number;
  match?: string;
  type: "file" | "content";
}
export declare interface SearchSession {
  buffer: string; // For processing incomplete JSON lines
  error?: string;
  id: string;
  isComplete: boolean;
  isError: boolean;
  lastReadTime: number;
  options: SearchSessionOptions;
  process: ChildProcess;
  resultLimit?: number;
  results: SearchResult[];
  startTime: number;
  totalContextLines: number; // Track context lines separately
  totalMatches: number;
  wasLimited?: boolean;
  wasIncomplete?: boolean; // NEW: Track if search was incomplete due to permissions/access issues
}
export declare interface SearchSessionOptions {
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

// 1. Search session manager ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Supports both file search and content search with progressive results
// 1. Search manager ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export class SearchManager {
  private readonly sessions = new Map<string, SearchSession>();
  private sessionCounter = 0;

  // 2. Start a new search session (like start_process) ――――――――――――――――――――――――――――――――――――――――――――
  // Returns immediately with initial state and results

  // 2. Start search ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async startSearch(options: SearchSessionOptions): Promise<{
    sessionId: string;
    isComplete: boolean;
    isError: boolean;
    results: SearchResult[];
    totalResults: number;
    runtime: number;
    wasLimited?: boolean;
  }> {
    const sessionId = `search_${++this.sessionCounter}_${Date.now()}`;
    const effcMxRess = options.maxResults !== undefined && Number.isFinite(options.maxResults) && options.maxResults > 0
      ? Math.floor(options.maxResults)
      : undefined;

    // Validate path first
    const validPath = await validatePath(options.rootPath);
    const normOpts: SearchSessionOptions = {
      ...options,
      maxResults: effcMxRess,
      rootPath: validPath,
    };

    // Build ripgrep arguments
    const args = this.buildRipgrepArgs(normOpts);

    // Get ripgrep path with fallback resolution
    let rgPath: string;
    try {
      rgPath = await gtRpgrPth();
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
      options: normOpts,
      process: rgProcess,
      resultLimit: effcMxRess,
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
    const timeoutMs = normOpts.timeout ?? (this.isExactFilename(normOpts.pattern) ? EFTM : undefined);

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


    // For content searches, also search DOCX files
    const shldSrchDcx = normOpts.searchType === "content" && this.shouldIncludeDocxSearch(normOpts.filePattern, validPath);

    if (shldSrchDcx) {
      this.searchDocxFiles(validPath, normOpts.pattern, normOpts.ignoreCase !== false, normOpts.maxResults, normOpts.filePattern, normOpts.literalSearch)
        .then((docxResults) => {
          for (const result of docxResults) {
            if (session.resultLimit !== undefined && session.totalMatches >= session.resultLimit) {
              session.wasLimited = true;
              break;
            }
            session.results.push(result);
            session.totalMatches++;
          }
        })
        .catch(() => {
        });
    }
    // Wait for first chunk of data or early completion instead of fixed delay
    const firstChunk = new Promise<void>((resolve) => {
      const onData = () => {
        session.process.stdout?.off("data", onData);
        resolve();
      };
      session.process.stdout?.once("data", onData);
      setTimeout(resolve, FCWM);
    });

    // Only wait for ripgrep first chunk; DOCX results merge asynchronously
    await firstChunk;

    return {
      isComplete: session.isComplete,
      isError: session.isError,
      results: session.results.slice(0, SPRC),
      runtime: Date.now() - session.startTime,
      sessionId,
      totalResults: session.totalMatches,
      wasLimited: session.wasLimited,
    };
  }
  // Read search results with offset-based pagination (like read_file)
  // Supports both range reading and tail behavior

  // 3. Read search results ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
    wasLimited?: boolean;
    wasIncomplete?: boolean; // NEW: Indicates if search was incomplete due to permissions
  } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Search session ${sessionId} not found`);
    }
    // Get all results (excluding internal markers)
    const allResults = session.results.filter((r) => r.file !== LRMF);

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
        wasLimited: session.wasLimited,
        wasIncomplete: session.wasIncomplete,
      };
    }
    // Handle positive offsets (range behavior) - like file reading
    const slcdRess = length === undefined ? allResults.slice(offset) : allResults.slice(offset, offset + length);
    const hsMrRess = length === undefined ? !session.isComplete : offset + length < allResults.length || !session.isComplete;

    session.lastReadTime = Date.now();

    return {
      error: session.error?.trim() || undefined,
      hasMoreResults: hsMrRess,
      isComplete: session.isComplete,
      isError: session.isError && !!session.error?.trim(), // Only error if we have actual errors
      results: slcdRess,
      returnedCount: slcdRess.length,
      runtime: Date.now() - session.startTime,
      totalMatches: session.totalMatches, // Actual matches only
      totalResults: session.totalMatches + session.totalContextLines,
      wasLimited: session.wasLimited,
      wasIncomplete: session.wasIncomplete,
    };
  }

  // 3. Terminate a search session (like force_terminate) ――――――――――――――――――――――――――――――――――――――――――
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

  // 4. Get list of active search sessions (like list_sessions) ――――――――――――――――――――――――――――――――――――
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

  // 2. Should include docx search ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private shouldIncludeDocxSearch(filePattern?: string, rootPath?: string): boolean {
    if (rootPath) {
      const lowerPath = rootPath.toLowerCase();
      if (DCX_EXTS.some((ext) => lowerPath.endsWith(ext))) {
        return true;
      }
    }
    if (filePattern) {
      const lowerPattern = filePattern.toLowerCase();
      if (DCX_EXTS.some((ext) => lowerPattern.includes(`*${ext}`) || lowerPattern.endsWith(ext))) {
        return true;
      }
    }
    return false;
  }

  // 6. Search DOCX files for content matches ――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Extracts <w:t> text from document.xml and searches it
  // 3. Search docx files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private async searchDocxFiles(rootPath: string, pattern: string, ignoreCase: boolean, maxResults?: number, filePattern?: string, _ltrlSrch?: boolean): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // DOCX search always uses literal matching to prevent ReDoS.
    // Regex patterns are treated as literal strings — this is intentional.
    const searchTerm = ignoreCase ? pattern.toLowerCase() : pattern;

    let docxFiles = await this.findDocxFiles(rootPath);

    if (filePattern) {
      const patterns = filePattern
        .split(GLB_PAT_SPRT)
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
      if (maxResults !== undefined && maxResults > 0 && results.length >= maxResults) {
        break;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: DOCX files are scanned sequentially to honor maxResults short-circuiting.
        const buf = await fs.readFile(filePath);
        const zip = new PizZip(buf);

        for (const xmlPath of DTXP) {
          if (maxResults !== undefined && maxResults > 0 && results.length >= maxResults) {
            break;
          }
          const file = zip.file(xmlPath);
          if (!file) {
            continue;
          }
          const xml = file.asText();
          let lineNum = 0;

          for (const m of xml.matchAll(WRD_TXT_PAT)) {
            if (maxResults !== undefined && maxResults > 0 && results.length >= maxResults) {
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

  // 4. Find docx files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private async findDocxFiles(rootPath: string): Promise<string[]> {
    const docxFiles: string[] = [];
    const isDocx = (name: string) => name.toLowerCase().endsWith(".docx");

    // 5. Walk ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

  // 6. Get match context ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getMatchContext(text: string, matchStart: number, matchLength: number): string {
    const start = Math.max(0, matchStart - MTC_CTX_CHR);
    const end = Math.min(text.length, matchStart + matchLength + MTC_CTX_CHR);

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

  // 9. Clean up completed sessions older than specified time ――――――――――――――――――――――――――――――――――――――
  // Called automatically by cleanup interval

  // 11. Cleanup sessions ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  cleanupSessions(maxAge: number = SCIM): void {
    const cutoffTime = Date.now() - maxAge;

    for (const [sessionId, session] of this.sessions) {
      if (session.isComplete && session.lastReadTime < cutoffTime) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // 10. Get total number of active sessions (excluding completed ones) ――――――――――――――――――――――――――――
  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter((session) => !session.isComplete).length;
  }

  // 11. Detect if pattern looks like an exact filename ――――――――――――――――――――――――――――――――――――――――――――
  // (has file extension and no glob wildcards)
  // 7. Is exact filename ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private isExactFilename(pattern: string): boolean {
    return EXC_FLN_PAT.test(pattern) && !this.isGlobPattern(pattern);
  }

  // 8. Is glob pattern ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private isGlobPattern(pattern: string): boolean {
    return GLB_MT_CHRS.some((char) => pattern.includes(char));
  }

  // 9. Build ripgrep args ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
        .split(GLB_PAT_SPRT)
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

  // 10. Setup process handlers ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
      const fltrErrs = errorText.split(SRCH_LN_SPRT).filter((line) => {
        const trimmed = line.trim();

        // Skip empty lines and lines with just symbols/numbers/colons
        if (!trimmed || ENLP.test(trimmed)) {
          return false;
        }
        // Skip all ripgrep system errors that start with "rg:"
        if (trimmed.startsWith(RPG_ERR_PRF)) {
          return false;
        }
        return true;
      });

      // Only add to session.error if there are actual meaningful errors after filtering
      if (fltrErrs.length > 0) {
        const mnngErrs = fltrErrs.join(SRCH_LN_SPRT).trim();
        if (mnngErrs) {
          session.error = `${(session.error || "") + mnngErrs}\n`;
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

      // Rely on cleanupSessions(maxAge) only; no per-session timer
    });

    process.on("error", (error: Error) => {
      session.isComplete = true;
      session.isError = true;
      session.error = `Process error: ${error.message}`;

      // Rely on cleanupSessions(maxAge) only; no per-session timer
    });
  }

  // 11. Process buffered output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private processBufferedOutput(session: SearchSession, isFinal: boolean = false): void {
    const lines = session.buffer.split(SRCH_LN_SPRT);

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
        if (result.type === "content" && line.includes(RCTT)) {
          session.totalContextLines++;
        }
        else {
          session.totalMatches++;
          if (session.resultLimit !== undefined && session.totalMatches >= session.resultLimit) {
            session.wasLimited = true;
          }
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
            }, ETDM);
            break;
          }
        }
      }
    }
  }

  // 12. Parse line ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 13. Build glob pattern reg exp ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function buildGlobPatternRegExp(pattern: string): RegExp {
  const regexPattern = pattern.replace(GREP, "\\$&").replace(GLB_ASTR_PAT, ".*");
  return new RegExp(`^${regexPattern}$`, "i");
}

// Global search manager instance
export const srchMgr = new SearchManager();

// Cleanup management - run on fixed schedule
let clnpIntr: NodeJS.Timeout | null = null;

// 14. Start cleanup if needed ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function startCleanupIfNeeded(): void {
  if (!clnpIntr) {
    clnpIntr = setInterval(() => {
      srchMgr.cleanupSessions();
    }, SCIM);

    // Also check immediately after a short delay (let search process finish)
    setTimeout(() => {
      srchMgr.cleanupSessions();
    }, SCIDM);
  }
}
