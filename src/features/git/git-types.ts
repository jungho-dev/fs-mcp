/**
 * @file src/features/git/git-types.ts
 * @description Shared git feature types.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {GT_INPT_SCHS, GitToolName} from "@schemas/schemas-git";
import type {z} from "zod";

export type GitArgsMap = {
  [K in GitToolName]: z.infer<(typeof GT_INPT_SCHS)[K]>;
};

export type GitCommandError = Error & {
  code?: number | string | null;
  stdout?: string;
  stderr?: string;
};

export type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type GitStatusBucket = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
  renamed?: string[];
  copied?: string[];
};

export type GitWorkingTreeBucket = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
};

export type GitStatusSummary = {
  currentBranch: string | null;
  upstream?: string;
  ahead?: number;
  behind?: number;
  isClean: boolean;
  stagedChanges: GitStatusBucket;
  unstagedChanges: GitWorkingTreeBucket;
  untrackedFiles: string[];
  conflictedFiles: string[];
};

export type GitToolOutput = Record<string, unknown>;
