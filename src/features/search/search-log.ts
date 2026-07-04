/**
 * @file src/features/search/search-log.ts
 * @description Search logging helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@cores/runtime/runtime-app-logger";

export declare interface FuzzySearchLogEntry {
  belowThreshold: boolean;
  characterCodes: string;
  diff: string;
  diffLength: number;
  exactMatchCount: number;
  executionTime: number;
  expectedReplacements: number;
  fileExtension: string;
  foundLength: number;
  foundText: string;
  fuzzyThreshold: number;
  searchLength: number;
  searchText: string;
  similarity: number;
  timestamp: Date;
  uniqueCharacterCount: number;
}

const HEADERS = [
  "timestamp",
  "searchText",
  "foundText",
  "similarity",
  "executionTime",
  "exactMatchCount",
  "expectedReplacements",
  "fuzzyThreshold",
  "belowThreshold",
  "diff",
  "searchLength",
  "foundLength",
  "fileExtension",
  "characterCodes",
  "uniqueCharacterCount",
  "diffLength",
].join("\t");

// 1. Fuzzy search logger -------------------------------------------------------
class FuzzySearchLogger {
  private readonly logPath: string;
  private initialized = false;

  // 2. Constructor -------------------------------------------------------------
  constructor() {
    const logDir = path.join(os.homedir(), ".mcp/");
    this.logPath = path.join(logDir, "fuzzy-search.log");
  }

  // 3. Ensure log file ----------------------------------------------------------
  private async ensureLogFile(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const logDir = path.dirname(this.logPath);
      await fs.mkdir(logDir, { "recursive": true });

      try {
        await fs.access(this.logPath);
      }
      catch {
        await fs.writeFile(this.logPath, `${HEADERS}\n`);
      }
      this.initialized = true;
    }
    catch (error) {
      logger.error("Failed to initialize fuzzy search log file", { error });
      throw error;
    }
  }

  // 4. Log --------------------------------------------------------------------
  async log(entry: FuzzySearchLogEntry): Promise<void> {
    try {
      await this.ensureLogFile();
      const logLine = [
        entry.timestamp.toISOString(),
        sanitizeField(entry.searchText),
        sanitizeField(entry.foundText),
        entry.similarity.toString(),
        entry.executionTime.toString(),
        entry.exactMatchCount.toString(),
        entry.expectedReplacements.toString(),
        entry.fuzzyThreshold.toString(),
        entry.belowThreshold.toString(),
        sanitizeField(entry.diff),
        entry.searchLength.toString(),
        entry.foundLength.toString(),
        entry.fileExtension,
        entry.characterCodes,
        entry.uniqueCharacterCount.toString(),
        entry.diffLength.toString(),
      ].join("\t");

      await fs.appendFile(this.logPath, `${logLine}\n`);
    }
    catch (error) {
      logger.error("Failed to write to fuzzy search log", { error });
    }
  }

  // 5. Get log path ------------------------------------------------------------
  async getLogPath(): Promise<string> {
    await this.ensureLogFile();
    return this.logPath;
  }

  // 6. Get recent logs ---------------------------------------------------------
  async getRecentLogs(count: number = 10): Promise<string[]> {
    try {
      await this.ensureLogFile();
      const content = await fs.readFile(this.logPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      return lines.slice(-count - 1, -1);
    }
    catch (error) {
      logger.error("Failed to read fuzzy search logs", { error });
      return [];
    }
  }

  // 7. Clear log ---------------------------------------------------------------
  async clearLog(): Promise<void> {
    try {
      await fs.writeFile(this.logPath, `${HEADERS}\n`);
      logger.info("Fuzzy search log cleared");
    }
    catch (error) {
      logger.error("Failed to clear fuzzy search log", { error });
    }
  }
}

// 8. Sanitize field ------------------------------------------------------------
function sanitizeField(value: string): string {
  return value.replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

export const fzzySrchLggr = new FuzzySearchLogger();
