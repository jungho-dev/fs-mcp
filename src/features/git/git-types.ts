/**
 * @file src/features/git/git-types.ts
 * @description Shared git feature types.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {GT_INPT_SCHS, GitToolName} from "@schemas/schemas-git";
import type {z} from "zod/v3";

export declare type GitArgsMap = {
  [K in GitToolName]: z.infer<(typeof GT_INPT_SCHS)[K]>;
};

export declare type GitCommandError = Error & {
  code?: number | string | null;
  stdout?: string;
  stderr?: string;
};

export declare type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export declare type GitStatusBucket = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
  renamed?: string[];
  copied?: string[];
};

export declare type GitWorkingTreeBucket = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
};

export declare type GitStatusSummary = {
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

export declare type GitToolOutput = Record<string, unknown>;
