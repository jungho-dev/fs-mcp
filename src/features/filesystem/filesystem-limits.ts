/**
 * @file src/features/filesystem/filesystem-limits.ts
 * @description Filesystem operation limits.
 * @author JUNGHO
 * @since 2026-05-02
 */

export const FL_OP_TMTS = {
  PATH_VALIDATION: 10_000,
  URL_FETCH: 30_000,
  FILE_READ: 30_000,
} as const;

export const FL_SZ_LMTS = {
  LARGE_FILE_THRESHOLD: 10 * 1024 * 1024,
  LINE_COUNT_LIMIT: 10 * 1024 * 1024,
} as const;

export const RD_PERF_THRS = {
  SMALL_READ_THRESHOLD: 100,
  DEEP_OFFSET_THRESHOLD: 1000,
  SAMPLE_SIZE: 10_000,
  CHUNK_SIZE: 8192,
} as const;
