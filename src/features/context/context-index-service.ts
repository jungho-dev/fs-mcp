/**
 * @file src/features/context/context-index-service.ts
 * @description SQLite-backed context index service.
 * @author JUNGHO
 * @since 2026-05-07
 */

import {Buffer} from "node:buffer";
import {Database} from "bun:sqlite";
import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {getDefaultContextIndexDbPath as gtDeCtIdDbPt} from "@features/config/config-client";
import {cfgMgr} from "@features/config/config-store";

export declare interface ContextIndexDocument extends Record<string, unknown> {
  createdAt: string;
  indexId: string;
  indexedLength?: number;
  lineCount: number;
  originalBytes: number;
  originalLength: number;
  source: string;
  toolName?: string;
  truncated?: boolean;
}
export declare interface ContextIndexReference extends ContextIndexDocument {
  indexed: true;
  preview: string;
}
export declare interface ContextSearchResult extends Record<string, unknown> {
  chunkIndex: number;
  indexId: string;
  lineEnd: number;
  lineStart: number;
  rank: number;
  source: string;
  text: string;
}
export declare interface ContextListOptions {
  limit?: number;
  source?: string;
}
export declare interface ContextClearOptions {
  all?: boolean;
  before?: string;
  indexIds?: string[];
  source?: string;
  vacuum?: boolean;
}
export declare interface ContextIndexConfig {
  allowedDirectories: string[];
  autoMinChars: number;
  autoMinLines: number;
  dbPath: string;
  enabled: boolean;
  maxBytes: number;
  maxDocuments: number;
  maxEntryChars: number;
  replaceLargeOutputs: boolean;
}

const DAMC = 5000;
const DAML = 120;
const DEF_MX_BYTS = 104_857_600;
const DEF_MX_DOCS = 2000;
const DMEC = 1_000_000;
const CCLC = 80;
const CCLO = 20;
const CDBS = 500;
const CLDL = 500;
const CLML = 500;
const CTX_PRVW_LEN = 160;
const CTX_SCH_VRSN = 3;
const LN_SPLT_PAT = /\r\n|\r|\n/;
const TOK_PAT = /[\p{L}\p{N}_]+/gu;
const LIKE_ESC_PAT = /[~%_]/g;

type ContextDocumentRow = {
  content_hash: string | null;
  created_at: string;
  index_id: string;
  indexed_length: number | null;
  line_count: number;
  original_bytes: number | null;
  original_length: number;
  source: string;
  tool_name: string | null;
  truncated: number | null;
};

type TableInfoRow = {
  name: string;
};

type CountRow = {
  count: number;
};

type RetentionDocumentRow = {
  index_id: string;
  original_bytes: number | null;
  original_length: number;
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
  return value.length <= CTX_PRVW_LEN ? value : value.slice(0, CTX_PRVW_LEN) + "... (omitted)";
}

// 4. Create index id ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createIndexId(): string {
  return "ctx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

// 5. Create content hash ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createContentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// 6. Count UTF-8 bytes ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countUtf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

// 7. Get row byte count ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getRowOriginalBytes(row: Pick<ContextDocumentRow, "original_bytes" | "original_length">): number {
  return row.original_bytes ?? row.original_length;
}

// 8. Normalize document row ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeDocumentRow(row: ContextDocumentRow): ContextIndexDocument {
  const document: ContextIndexDocument = {
    createdAt: row.created_at,
    indexId: row.index_id,
    lineCount: row.line_count,
    originalBytes: getRowOriginalBytes(row),
    originalLength: row.original_length,
    source: row.source,
  };

  if (row.indexed_length !== null) {
    document.indexedLength = row.indexed_length;
  }
  if (row.tool_name !== null) {
    document.toolName = row.tool_name;
  }
  if (row.truncated !== null) {
    document.truncated = row.truncated === 1;
  }
  return document;
}

// 9. Tokenize query ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function tokenizeQuery(query: string): string[] {
  const matches = query.match(TOK_PAT) ?? [];
  const uniqueTokens = new Set(matches.map((match) => match.toLowerCase()).filter((match) => match.length > 0));

  return [...uniqueTokens].slice(0, 12);
}

// 10. Create FTS query ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createFtsQuery(query: string): string | null {
  const tokens = tokenizeQuery(query);

  if (tokens.length === 0) {
    return null;
  }
  return tokens.map((token) => "\"" + token.replace(/"/g, "\"\"") + "\"").join(" AND ");
}

// 11. Ensure table column ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function ensureTableColumn(db: Database, tableName: string, columnName: string, addColumnSql: string): void {
  const rows = db.query<TableInfoRow, []>("PRAGMA table_info(" + tableName + ")").all();

  if (!rows.some((row) => row.name === columnName)) {
    db.exec(addColumnSql);
  }
}

// 12. Normalize path for containment ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizePathForContainment(value: string): string {
  return path.resolve(expandHomePath(value));
}

// 13. Is path inside ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isPathInside(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

// 14. Get default context index DB directory ―――――――――――――――――――――――――――――――――――――――――――――
function getDefaultContextIndexDbDirectory(): string {
  return normalizePathForContainment(path.dirname(gtDeCtIdDbPt()));
}

// 15. Normalize positive integer config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

// 16. Read context config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function readContextIndexConfig(): ContextIndexConfig {
  const config = cfgMgr.getConfigSync();
  const allwDrct = Array.isArray(config.allowedDirectories)
    ? config.allowedDirectories.filter((directory): directory is string => typeof directory === "string" && directory.trim().length > 0)
    : [];

  return {
    allowedDirectories: allwDrct,
    autoMinChars: typeof config.contextIndexAutoMinChars === "number" ? config.contextIndexAutoMinChars : DAMC,
    autoMinLines: typeof config.contextIndexAutoMinLines === "number" ? config.contextIndexAutoMinLines : DAML,
    dbPath: typeof config.contextIndexDbPath === "string" ? config.contextIndexDbPath : gtDeCtIdDbPt(),
    enabled: typeof config.contextIndexEnabled === "boolean" ? config.contextIndexEnabled : true,
    maxBytes: normalizePositiveInteger(config.contextIndexMaxBytes, DEF_MX_BYTS),
    maxDocuments: normalizePositiveInteger(config.contextIndexMaxDocuments, DEF_MX_DOCS),
    maxEntryChars: normalizePositiveInteger(config.contextIndexMaxEntryChars, DMEC),
    replaceLargeOutputs: config.contextIndexReplaceLargeOutputs === true,
  };
}

// 17. Resolve context index DB path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveContextIndexDbPath(config: ContextIndexConfig): string {
  const rawPath = config.dbPath.trim();

  if (rawPath.length === 0) {
    throw new Error("contextIndexDbPath must be a non-empty string");
  }
  const resolvedPath = normalizePathForContainment(rawPath);
  const defaultPath = normalizePathForContainment(gtDeCtIdDbPt());
  const allowedRoots = [
    getDefaultContextIndexDbDirectory(),
    ...config.allowedDirectories.map((directory) => normalizePathForContainment(directory)),
  ];

  if (!allowedRoots.some((rootPath) => isPathInside(rootPath, resolvedPath))) {
    throw new Error("contextIndexDbPath must stay under ~/.mcp or an allowedDirectories entry");
  }
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    throw new Error("contextIndexDbPath must point to a SQLite file, not a directory");
  }
  const prntDir = path.dirname(resolvedPath);

  if (resolvedPath === defaultPath) {
    fs.mkdirSync(prntDir, {recursive: true});
    return resolvedPath;
  }
  if (!fs.existsSync(prntDir)) {
    throw new Error("contextIndexDbPath parent directory must exist for custom paths");
  }
  if (!fs.statSync(prntDir).isDirectory()) {
    throw new Error("contextIndexDbPath parent must be a directory");
  }
  return resolvedPath;
}

// 18. Create LIKE contains pattern ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createLikeContainsPattern(value: string): string {
  return "%" + value.replace(LIKE_ESC_PAT, (match) => "~" + match) + "%";
}

// 19. Validate ISO date string ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function validateIsoDateString(value: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("before must be a valid date string");
  }
}

// 20. Context index service ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class ContextIndexService {
  private db: Database | null = null;
  private dbPath: string | null = null;

  getRuntimeConfig(): ContextIndexConfig {
    return readContextIndexConfig();
  }

  shouldAutoIndex(value: string): boolean {
    const config = this.getRuntimeConfig();

    if (!config.enabled) {
      return false;
    }
    return value.length >= config.autoMinChars || countLines(value) >= config.autoMinLines;
  }

  private getDatabase(): Database {
    const config = this.getRuntimeConfig();
    const resolvedPath = resolveContextIndexDbPath(config);

    if (this.db !== null && this.dbPath === resolvedPath) {
      return this.db;
    }
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
    this.db = new Database(resolvedPath);
    this.dbPath = resolvedPath;
    this.initializeSchema(this.db);
    return this.db;
  }

  private initializeSchema(db: Database): void {
    db.exec([
      "PRAGMA busy_timeout = 5000;",
      "PRAGMA foreign_keys = ON;",
      "PRAGMA journal_mode = WAL;",
      "PRAGMA synchronous = NORMAL;",
      "CREATE TABLE IF NOT EXISTS context_documents (",
      "  index_id TEXT PRIMARY KEY,",
      "  source TEXT NOT NULL,",
      "  tool_name TEXT,",
      "  created_at TEXT NOT NULL,",
      "  original_length INTEGER NOT NULL,",
      "  original_bytes INTEGER,",
      "  indexed_length INTEGER,",
      "  line_count INTEGER NOT NULL,",
      "  truncated INTEGER,",
      "  content_hash TEXT",
      ");",
      "CREATE TABLE IF NOT EXISTS context_chunks (",
      "  chunk_id TEXT PRIMARY KEY,",
      "  index_id TEXT NOT NULL,",
      "  chunk_index INTEGER NOT NULL,",
      "  source TEXT NOT NULL,",
      "  text TEXT NOT NULL,",
      "  line_start INTEGER NOT NULL,",
      "  line_end INTEGER NOT NULL,",
      "  FOREIGN KEY(index_id) REFERENCES context_documents(index_id) ON DELETE CASCADE",
      ");",
      "CREATE VIRTUAL TABLE IF NOT EXISTS context_chunks_fts USING fts5(",
      "  chunk_id UNINDEXED,",
      "  index_id UNINDEXED,",
      "  source,",
      "  text",
      ");",
    ].join("\n"));
    ensureTableColumn(db, "context_documents", "content_hash", "ALTER TABLE context_documents ADD COLUMN content_hash TEXT");
    ensureTableColumn(db, "context_documents", "indexed_length", "ALTER TABLE context_documents ADD COLUMN indexed_length INTEGER");
    ensureTableColumn(db, "context_documents", "original_bytes", "ALTER TABLE context_documents ADD COLUMN original_bytes INTEGER");
    ensureTableColumn(db, "context_documents", "truncated", "ALTER TABLE context_documents ADD COLUMN truncated INTEGER");
    db.exec("UPDATE context_documents SET original_bytes = original_length WHERE original_bytes IS NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_context_documents_created_at ON context_documents(created_at DESC)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_context_documents_content_hash ON context_documents(content_hash)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_context_chunks_index_id ON context_chunks(index_id)");
    this.rebuildFtsIfNeeded(db);
    db.exec("PRAGMA user_version = " + CTX_SCH_VRSN);
  }

  private rebuildFtsIfNeeded(db: Database): void {
    const chunkCount = db.query<CountRow, []>("SELECT COUNT(*) AS count FROM context_chunks").get()?.count ?? 0;
    const ftsCount = db.query<CountRow, []>("SELECT COUNT(*) AS count FROM context_chunks_fts").get()?.count ?? 0;

    if (chunkCount === ftsCount) {
      return;
    }
    db.transaction(() => {
      db.exec("DELETE FROM context_chunks_fts");
      db.exec("INSERT INTO context_chunks_fts (chunk_id, index_id, source, text) SELECT chunk_id, index_id, source, text FROM context_chunks");
    })();
  }

  private findReusableIndex(db: Database, contentHash: string, source: string, toolName: string | undefined, content: string, origLen: number, origBytes: number, indxLen: number): ContextIndexReference | null {
    const normTlNm = toolName ?? null;
    const row = db.query<ContextDocumentRow, [string, string, string | null, string | null, number, number, number]>([
      "SELECT index_id, source, tool_name, created_at, original_length, original_bytes, indexed_length, line_count, truncated, content_hash",
      "FROM context_documents",
      "WHERE content_hash = ?",
      "  AND source = ?",
      "  AND (tool_name = ? OR (tool_name IS NULL AND ? IS NULL))",
      "  AND original_length = ?",
      "  AND original_bytes = ?",
      "  AND indexed_length = ?",
      "LIMIT 1",
    ].join("\n")).get(contentHash, source, normTlNm, normTlNm, origLen, origBytes, indxLen);

    if (row === null || row === undefined) {
      return null;
    }
    return {
      ...normalizeDocumentRow(row),
      indexed: true,
      preview: createPreview(content),
    };
  }

  private selectExistingDocumentIds(db: Database, ids: string[]): string[] {
    const existingIds = new Set<string>();

    for (let start = 0; start < ids.length; start += CDBS) {
      const batchIds = ids.slice(start, start + CDBS);
      const placeholders = batchIds.map(() => "?").join(", ");
      const rows = db.query<{index_id: string}, string[]>("SELECT index_id FROM context_documents WHERE index_id IN (" + placeholders + ")").all(...batchIds);

      for (const row of rows) {
        existingIds.add(row.index_id);
      }
    }
    return [...existingIds];
  }

  private deleteDocumentsByIds(db: Database, ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    db.transaction(() => {
      for (let start = 0; start < ids.length; start += CDBS) {
        const batchIds = ids.slice(start, start + CDBS);
        const placeholders = batchIds.map(() => "?").join(", ");

        db.query("DELETE FROM context_chunks_fts WHERE index_id IN (" + placeholders + ")").run(...batchIds);
        db.query("DELETE FROM context_chunks WHERE index_id IN (" + placeholders + ")").run(...batchIds);
        db.query("DELETE FROM context_documents WHERE index_id IN (" + placeholders + ")").run(...batchIds);
      }
    })();
  }

  private enforceRetention(db: Database, config: ContextIndexConfig): void {
    const maxDocuments = Math.max(1, Math.floor(config.maxDocuments));
    const maxBytes = Math.max(1, Math.floor(config.maxBytes));
    const rows = db.query<RetentionDocumentRow, []>([
      "SELECT index_id, original_length, original_bytes",
      "FROM context_documents",
      "ORDER BY rowid ASC",
    ].join("\n")).all();
    const idsToDelete = new Set<string>();

    if (rows.length > maxDocuments) {
      for (const row of rows.slice(0, rows.length - maxDocuments)) {
        idsToDelete.add(row.index_id);
      }
    }
    let rtndByts = rows.reduce((total, row) => total + getRowOriginalBytes(row), 0);

    for (const row of rows) {
      const rowBytes = getRowOriginalBytes(row);

      if (idsToDelete.has(row.index_id)) {
        rtndByts -= rowBytes;
        continue;
      }
      if (rtndByts <= maxBytes) {
        break;
      }
      if (rows.length - idsToDelete.size <= 1) {
        break;
      }
      idsToDelete.add(row.index_id);
      rtndByts -= rowBytes;
    }
    if (idsToDelete.size === 0) {
      return;
    }
    this.deleteDocumentsByIds(db, [...idsToDelete]);
    db.exec("PRAGMA optimize");
  }

  indexText(source: string, content: string, toolName?: string): ContextIndexReference {
    const config = this.getRuntimeConfig();
    const db = this.getDatabase();
    const indexId = createIndexId();
    const createdAt = new Date().toISOString();
    const origLen = content.length;
    const origBytes = countUtf8Bytes(content);
    const indexedText = content.slice(0, config.maxEntryChars);
    const indxLen = indexedText.length;
    const truncated = indxLen < origLen;
    const contentHash = createContentHash(content);
    const lines = indexedText.length === 0 ? [] : indexedText.split(LN_SPLT_PAT);
    const lineCount = countLines(content);
    const rsblIdx = this.findReusableIndex(db, contentHash, source, toolName, content, origLen, origBytes, indxLen);

    if (rsblIdx !== null) {
      return rsblIdx;
    }
    const insrDoc = db.prepare([
      "INSERT INTO context_documents",
      "(index_id, source, tool_name, created_at, original_length, original_bytes, indexed_length, line_count, truncated, content_hash)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" "));
    const insertChunk = db.prepare("INSERT INTO context_chunks (chunk_id, index_id, chunk_index, source, text, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertFts = db.prepare("INSERT INTO context_chunks_fts (chunk_id, index_id, source, text) VALUES (?, ?, ?, ?)");
    const insertAll = db.transaction(() => {
      insrDoc.run(indexId, source, toolName ?? null, createdAt, origLen, origBytes, indxLen, lineCount, truncated ? 1 : 0, contentHash);

      for (let start = 0, chunkIndex = 0; start < lines.length; start += CCLC - CCLO, chunkIndex++) {
        const selLns = lines.slice(start, start + CCLC);

        if (selLns.length === 0) {
          break;
        }
        const chunkId = indexId + "_" + chunkIndex;
        const chunkText = selLns.join("\n");
        const lineStart = start + 1;
        const lineEnd = start + selLns.length;

        insertChunk.run(chunkId, indexId, chunkIndex, source, chunkText, lineStart, lineEnd);
        insertFts.run(chunkId, indexId, source, chunkText);
        if (start + CCLC >= lines.length) {
          break;
        }
      }
    });

    insertAll();
    this.enforceRetention(db, config);
    return {
      createdAt,
      indexId,
      indexed: true,
      indexedLength: indxLen,
      lineCount,
      originalBytes: origBytes,
      originalLength: origLen,
      preview: createPreview(content),
      source,
      toolName,
      truncated,
    };
  }

  search(query: string, limit: number = 5, source?: string): ContextSearchResult[] {
    const ftsQuery = createFtsQuery(query);

    if (ftsQuery === null) {
      return [];
    }
    const db = this.getDatabase();
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    const rows = source
      ? db.query<ContextChunkRow, [string, string, number]>([
          "SELECT c.index_id, c.chunk_index, c.source, c.text, c.line_start, c.line_end, bm25(context_chunks_fts) AS rank",
          "FROM context_chunks_fts",
          "JOIN context_chunks c ON c.chunk_id = context_chunks_fts.chunk_id",
          "WHERE context_chunks_fts MATCH ? AND c.source LIKE ? ESCAPE '~'",
          "ORDER BY rank",
          "LIMIT ?",
        ].join("\n")).all(ftsQuery, createLikeContainsPattern(source), boundedLimit)
      : db.query<ContextChunkRow, [string, number]>([
          "SELECT c.index_id, c.chunk_index, c.source, c.text, c.line_start, c.line_end, bm25(context_chunks_fts) AS rank",
          "FROM context_chunks_fts",
          "JOIN context_chunks c ON c.chunk_id = context_chunks_fts.chunk_id",
          "WHERE context_chunks_fts MATCH ?",
          "ORDER BY rank",
          "LIMIT ?",
        ].join("\n")).all(ftsQuery, boundedLimit);

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

  listDocuments(options: ContextListOptions = {}): ContextIndexDocument[] {
    const db = this.getDatabase();
    const boundedLimit = Math.max(1, Math.min(Math.floor(options.limit ?? CLDL), CLML));
    const rows = options.source !== undefined
      ? db.query<ContextDocumentRow, [string, number]>([
          "SELECT index_id, source, tool_name, created_at, original_length, original_bytes, indexed_length, line_count, truncated, content_hash",
          "FROM context_documents",
          "WHERE source LIKE ? ESCAPE '~'",
          "ORDER BY rowid DESC",
          "LIMIT ?",
        ].join("\n")).all(createLikeContainsPattern(options.source), boundedLimit)
      : db.query<ContextDocumentRow, [number]>([
          "SELECT index_id, source, tool_name, created_at, original_length, original_bytes, indexed_length, line_count, truncated, content_hash",
          "FROM context_documents",
          "ORDER BY rowid DESC",
          "LIMIT ?",
        ].join("\n")).all(boundedLimit);

    return rows.map(normalizeDocumentRow);
  }

  countDocuments(source?: string): number {
    const db = this.getDatabase();

    if (source !== undefined) {
      return db.query<CountRow, [string]>("SELECT COUNT(*) AS count FROM context_documents WHERE source LIKE ? ESCAPE '~'").get(createLikeContainsPattern(source))?.count ?? 0;
    }
    return db.query<CountRow, []>("SELECT COUNT(*) AS count FROM context_documents").get()?.count ?? 0;
  }

  clearDocuments(options: ContextClearOptions = {}): number {
    const db = this.getDatabase();
    const hasSelector = options.indexIds !== undefined || options.source !== undefined || options.before !== undefined;
    const ids = new Set<string>();

    if (!hasSelector && options.all === true) {
      const count = this.countDocuments();

      db.transaction(() => {
        db.exec("DELETE FROM context_chunks_fts");
        db.exec("DELETE FROM context_chunks");
        db.exec("DELETE FROM context_documents");
      })();
      if (options.vacuum === true) {
        db.exec("VACUUM");
      }
      return count;
    }
    if (!hasSelector) {
      return 0;
    }
    if (options.indexIds !== undefined && options.indexIds.length > 0) {
      for (const indexId of this.selectExistingDocumentIds(db, [...new Set(options.indexIds)])) {
        ids.add(indexId);
      }
    }
    if (options.source !== undefined) {
      const rows = db.query<{index_id: string}, [string]>("SELECT index_id FROM context_documents WHERE source LIKE ? ESCAPE '~'").all(createLikeContainsPattern(options.source));

      for (const row of rows) {
        ids.add(row.index_id);
      }
    }
    if (options.before !== undefined) {
      validateIsoDateString(options.before);
      const rows = db.query<{index_id: string}, [string]>("SELECT index_id FROM context_documents WHERE created_at < ?").all(options.before);

      for (const row of rows) {
        ids.add(row.index_id);
      }
    }
    const idsToDelete = [...ids];

    if (idsToDelete.length === 0) {
      return 0;
    }
    this.deleteDocumentsByIds(db, idsToDelete);
    if (options.vacuum === true) {
      db.exec("VACUUM");
    }
    return idsToDelete.length;
  }

  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
      this.dbPath = null;
    }
  }
}

export const ctxIdxSvc = new ContextIndexService();
export {ctxIdxSvc as contextIndexService};
