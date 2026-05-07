/**
 * @file src/features/context/context-index-service.ts
 * @description SQLite-backed context index service.
 * @author JUNGHO
 * @since 2026-05-07
 */

import {Database} from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {configManager} from "@features/config/config-store";

export interface ContextIndexDocument extends Record<string, unknown> {
  createdAt: string;
  indexId: string;
  lineCount: number;
  originalLength: number;
  source: string;
  toolName?: string;
}
export interface ContextIndexReference extends ContextIndexDocument {
  indexed: true;
  preview: string;
}
export interface ContextSearchResult extends Record<string, unknown> {
  chunkIndex: number;
  indexId: string;
  lineEnd: number;
  lineStart: number;
  rank: number;
  source: string;
  text: string;
}

interface ContextIndexConfig {
  autoMinChars: number;
  autoMinLines: number;
  dbPath: string;
  enabled: boolean;
  maxEntryChars: number;
}

const DEFAULT_CONTEXT_INDEX_DB_PATH = "~/.codex/sqlite/fs-mcp.sqlite";
const DEFAULT_AUTO_MIN_CHARS = 5000;
const DEFAULT_AUTO_MIN_LINES = 120;
const DEFAULT_MAX_ENTRY_CHARS = 1_000_000;
const CONTEXT_CHUNK_LINE_COUNT = 80;
const CONTEXT_CHUNK_LINE_OVERLAP = 20;
const CONTEXT_PREVIEW_LENGTH = 160;
const LINE_SPLIT_PATTERN = /\r\n|\r|\n/;
const TOKEN_PATTERN = /[\p{L}\p{N}_]+/gu;

type ContextDocumentRow = {
  created_at: string;
  index_id: string;
  line_count: number;
  original_length: number;
  source: string;
  tool_name: string | null;
};

type ContextChunkRow = {
  chunk_index: number;
  index_id: string;
  line_end: number;
  line_start: number;
  rank: number;
  source: string;
  text: string;
};

// 1. Count lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countLines(value: string): number {
  if (value.length === 0) {
    return 0;
  }
  let lineCount = 1;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (code === 10) {
      lineCount += 1;
    }
    else if (code === 13) {
      lineCount += 1;
      if (value.charCodeAt(index + 1) === 10) {
        index += 1;
      }
    }
  }
  return lineCount;
}

// 2. Expand home path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

// 3. Create preview ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createPreview(value: string): string {
  return value.length <= CONTEXT_PREVIEW_LENGTH ? value : `${value.slice(0, CONTEXT_PREVIEW_LENGTH)}... (omitted)`;
}

// 4. Create index id ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createIndexId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// 5. Normalize document row ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeDocumentRow(row: ContextDocumentRow): ContextIndexDocument {
  const document: ContextIndexDocument = {
    createdAt: row.created_at,
    indexId: row.index_id,
    lineCount: row.line_count,
    originalLength: row.original_length,
    source: row.source,
  };

  if (row.tool_name !== null) {
    document.toolName = row.tool_name;
  }
  return document;
}

// 6. Tokenize query ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function tokenizeQuery(query: string): string[] {
  const matches = query.match(TOKEN_PATTERN) ?? [];
  const uniqueTokens = new Set(matches.map((match) => match.toLowerCase()).filter((match) => match.length > 0));

  return [...uniqueTokens].slice(0, 12);
}

// 7. Create FTS query ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createFtsQuery(query: string): string | null {
  const tokens = tokenizeQuery(query);

  if (tokens.length === 0) {
    return null;
  }
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" AND ");
}

// 8. Read context config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function readContextIndexConfig(): ContextIndexConfig {
  const config = configManager.getConfigSync();

  return {
    autoMinChars: typeof config.contextIndexAutoMinChars === "number" ? config.contextIndexAutoMinChars : DEFAULT_AUTO_MIN_CHARS,
    autoMinLines: typeof config.contextIndexAutoMinLines === "number" ? config.contextIndexAutoMinLines : DEFAULT_AUTO_MIN_LINES,
    dbPath: typeof config.contextIndexDbPath === "string" ? config.contextIndexDbPath : DEFAULT_CONTEXT_INDEX_DB_PATH,
    enabled: typeof config.contextIndexEnabled === "boolean" ? config.contextIndexEnabled : true,
    maxEntryChars: typeof config.contextIndexMaxEntryChars === "number" ? config.contextIndexMaxEntryChars : DEFAULT_MAX_ENTRY_CHARS,
  };
}

// 9. Context index service ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class ContextIndexService {
  private db: Database | null = null;
  private dbPath: string | null = null;

  // 9-1. Get runtime config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getRuntimeConfig(): ContextIndexConfig {
    return readContextIndexConfig();
  }

  // 9-2. Should auto index ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  shouldAutoIndex(value: string): boolean {
    const config = this.getRuntimeConfig();

    if (!config.enabled) {
      return false;
    }
    return value.length > config.autoMinChars || countLines(value) > config.autoMinLines;
  }

  // 9-3. Get database ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getDatabase(): Database {
    const config = this.getRuntimeConfig();
    const resolvedPath = path.resolve(expandHomePath(config.dbPath));

    if (this.db !== null && this.dbPath === resolvedPath) {
      return this.db;
    }
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
    fs.mkdirSync(path.dirname(resolvedPath), {recursive: true});
    this.db = new Database(resolvedPath);
    this.dbPath = resolvedPath;
    this.initializeSchema(this.db);
    return this.db;
  }

  // 9-4. Initialize schema ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private initializeSchema(db: Database): void {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS context_documents (
        index_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        tool_name TEXT,
        created_at TEXT NOT NULL,
        original_length INTEGER NOT NULL,
        line_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS context_chunks (
        chunk_id TEXT PRIMARY KEY,
        index_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        source TEXT NOT NULL,
        text TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        FOREIGN KEY(index_id) REFERENCES context_documents(index_id) ON DELETE CASCADE
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS context_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        index_id UNINDEXED,
        source,
        text
      );
    `);
  }

  // 9-5. Index text ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  indexText(source: string, content: string, toolName?: string): ContextIndexReference {
    const config = this.getRuntimeConfig();
    const db = this.getDatabase();
    const indexId = createIndexId();
    const createdAt = new Date().toISOString();
    const originalLength = content.length;
    const indexedText = content.slice(0, config.maxEntryChars);
    const lines = indexedText.split(LINE_SPLIT_PATTERN);
    const lineCount = content.length === 0 ? 0 : indexedText.length === content.length ? lines.length : countLines(content);
    const insertDocument = db.prepare("INSERT INTO context_documents (index_id, source, tool_name, created_at, original_length, line_count) VALUES (?, ?, ?, ?, ?, ?)");
    const insertChunk = db.prepare("INSERT INTO context_chunks (chunk_id, index_id, chunk_index, source, text, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertFts = db.prepare("INSERT INTO context_chunks_fts (chunk_id, index_id, source, text) VALUES (?, ?, ?, ?)");
    const insertAll = db.transaction(() => {
      insertDocument.run(indexId, source, toolName ?? null, createdAt, originalLength, lineCount);

      for (let start = 0, chunkIndex = 0; start < lines.length; start += CONTEXT_CHUNK_LINE_COUNT - CONTEXT_CHUNK_LINE_OVERLAP, chunkIndex++) {
        const selectedLines = lines.slice(start, start + CONTEXT_CHUNK_LINE_COUNT);

        if (selectedLines.length === 0) {
          break;
        }
        const chunkId = `${indexId}_${chunkIndex}`;
        const chunkText = selectedLines.join("\n");
        const lineStart = start + 1;
        const lineEnd = start + selectedLines.length;

        insertChunk.run(chunkId, indexId, chunkIndex, source, chunkText, lineStart, lineEnd);
        insertFts.run(chunkId, indexId, source, chunkText);
        if (start + CONTEXT_CHUNK_LINE_COUNT >= lines.length) {
          break;
        }
      }
    });

    insertAll();
    return {
      createdAt,
      indexId,
      indexed: true,
      lineCount,
      originalLength,
      preview: createPreview(content),
      source,
      toolName,
    };
  }

  // 9-6. Search contexts ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  search(query: string, limit: number = 5, source?: string): ContextSearchResult[] {
    const ftsQuery = createFtsQuery(query);

    if (ftsQuery === null) {
      return [];
    }
    const db = this.getDatabase();
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    const rows = source
      ? db.query<ContextChunkRow, [string, string, number]>(`
          SELECT c.index_id, c.chunk_index, c.source, c.text, c.line_start, c.line_end, bm25(context_chunks_fts) AS rank
          FROM context_chunks_fts
          JOIN context_chunks c ON c.chunk_id = context_chunks_fts.chunk_id
          WHERE context_chunks_fts MATCH ? AND c.source LIKE ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, `%${source}%`, boundedLimit)
      : db.query<ContextChunkRow, [string, number]>(`
          SELECT c.index_id, c.chunk_index, c.source, c.text, c.line_start, c.line_end, bm25(context_chunks_fts) AS rank
          FROM context_chunks_fts
          JOIN context_chunks c ON c.chunk_id = context_chunks_fts.chunk_id
          WHERE context_chunks_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, boundedLimit);

    return rows.map((row) => ({
      chunkIndex: row.chunk_index,
      indexId: row.index_id,
      lineEnd: row.line_end,
      lineStart: row.line_start,
      rank: row.rank,
      source: row.source,
      text: row.text,
    }));
  }

  // 9-7. List documents ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  listDocuments(): ContextIndexDocument[] {
    const db = this.getDatabase();
    const rows = db.query<ContextDocumentRow, []>(`
      SELECT index_id, source, tool_name, created_at, original_length, line_count
      FROM context_documents
      ORDER BY created_at DESC
    `).all();

    return rows.map(normalizeDocumentRow);
  }

  // 9-8. Clear documents ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  clearDocuments(options: {indexIds?: string[]; source?: string}): number {
    const db = this.getDatabase();
    let ids = options.indexIds ?? [];

    if (options.source !== undefined) {
      const sourceRows = db.query<{index_id: string}, [string]>("SELECT index_id FROM context_documents WHERE source LIKE ?").all(`%${options.source}%`);
      ids = [...new Set([...ids, ...sourceRows.map((row) => row.index_id)])];
    }
    if (ids.length === 0 && options.source === undefined) {
      const count = db.query<{count: number}, []>("SELECT COUNT(*) AS count FROM context_documents").get()?.count ?? 0;

      db.transaction(() => {
        db.exec("DELETE FROM context_chunks_fts");
        db.exec("DELETE FROM context_chunks");
        db.exec("DELETE FROM context_documents");
      })();
      return count;
    }
    if (ids.length === 0) {
      return 0;
    }
    const deleteAll = db.transaction(() => {
      const selectChunks = db.prepare("SELECT chunk_id FROM context_chunks WHERE index_id = ?");
      const deleteFts = db.prepare("DELETE FROM context_chunks_fts WHERE chunk_id = ?");
      const deleteChunks = db.prepare("DELETE FROM context_chunks WHERE index_id = ?");
      const deleteDocument = db.prepare("DELETE FROM context_documents WHERE index_id = ?");

      for (const id of ids) {
        const chunkRows = selectChunks.all(id) as Array<{chunk_id: string}>;

        for (const chunk of chunkRows) {
          deleteFts.run(chunk.chunk_id);
        }
        deleteChunks.run(id);
        deleteDocument.run(id);
      }
    });

    deleteAll();
    return ids.length;
  }

  // 9-9. Close database ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
      this.dbPath = null;
    }
  }
}

export const contextIndexService = new ContextIndexService();
