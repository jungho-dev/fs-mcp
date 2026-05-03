/**
 * @file src/features/search/search-log.ts
 * @description Search logging helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface FuzzySearchLogEntry {
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
class FuzzySearchLogger {
  private readonly logPath: string;
  private initialized = false;

  constructor() {
    // Create log file in a dedicated directory
    const logDir = path.join(os.homedir(), ".fs-mcp-logs");
    this.logPath = path.join(logDir, "fuzzy-search.log");
  }
  private async ensureLogFile(): Promise<void> {
    if (this.initialized) {
    	return;
    }
    try {
      // Create log directory if it doesn't exist
      const logDir = path.dirname(this.logPath);
      await fs.mkdir(logDir, {recursive: true});

      // Check if log file exists, create with headers if not
      try {
        await fs.access(this.logPath);
      }
      catch {
        // File doesn't exist, create with headers
        const headers = ["timestamp", "searchText", "foundText", "similarity", "executionTime", "exactMatchCount", "expectedReplacements", "fuzzyThreshold", "belowThreshold", "diff", "searchLength", "foundLength", "fileExtension", "characterCodes", "uniqueCharacterCount", "diffLength"].join("\t");
        await fs.writeFile(this.logPath, `${headers}\n`);
      }
      this.initialized = true;
    }
    catch (error) {
      console.error("Failed to initialize fuzzy search log file:", error);
      throw error;
    }
  }
  async log(entry: FuzzySearchLogEntry): Promise<void> {
    try {
      await this.ensureLogFile();

      // Convert entry to tab-separated string
      const logLine = [entry.timestamp.toISOString(), entry.searchText.replace(/\n/g, "\\n").replace(/\t/g, "\\t"), entry.foundText.replace(/\n/g, "\\n").replace(/\t/g, "\\t"), entry.similarity.toString(), entry.executionTime.toString(), entry.exactMatchCount.toString(), entry.expectedReplacements.toString(), entry.fuzzyThreshold.toString(), entry.belowThreshold.toString(), entry.diff.replace(/\n/g, "\\n").replace(/\t/g, "\\t"), entry.searchLength.toString(), entry.foundLength.toString(), entry.fileExtension, entry.characterCodes, entry.uniqueCharacterCount.toString(), entry.diffLength.toString()].join("\t");

      await fs.appendFile(this.logPath, `${logLine}\n`);
    }
    catch (error) {
      console.error("Failed to write to fuzzy search log:", error);
    }
  }
  async getLogPath(): Promise<string> {
    await this.ensureLogFile();
    return this.logPath;
  }
  async getRecentLogs(count: number = 10): Promise<string[]> {
    try {
      await this.ensureLogFile();
      const content = await fs.readFile(this.logPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      // Return last N lines (excluding header)
      return lines.slice(-count - 1, -1);
    }
    catch (error) {
      console.error("Failed to read fuzzy search logs:", error);
      return [];
    }
  }
  async clearLog(): Promise<void> {
    try {
      // Recreate with just headers
      const headers = ["timestamp", "searchText", "foundText", "similarity", "executionTime", "exactMatchCount", "expectedReplacements", "fuzzyThreshold", "belowThreshold", "diff", "searchLength", "foundLength", "fileExtension", "characterCodes", "uniqueCharacterCount", "diffLength"].join("\t");

      await fs.writeFile(this.logPath, `${headers}\n`);
      console.log("Fuzzy search log cleared");
    }
    catch (error) {
      console.error("Failed to clear fuzzy search log:", error);
    }
  }
}

// Singleton instance
export const fuzzySearchLogger = new FuzzySearchLogger();
