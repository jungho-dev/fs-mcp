/**
 * @file src/schemas/schemas-git.ts
 * @description Git tool argument schemas.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { z } from "zod";

const OptnRpPthSch = z.string().optional();
const CmmtRfSch = z.string();
const CnfrSch = z.enum(["Y", "y", "Yes", "yes"]);
const RvwTypSch = z.enum(["security", "features", "storyline", "gaps", "breaking_changes", "quality"]);
const ITAML = 50_000;

export const GT_INPT_SCHS = {
  git_add: z
    .object({
      path: OptnRpPthSch,
      paths: z.array(z.string()).optional(),
      all: z.boolean().optional(),
      update: z.boolean().optional(),
      force: z.boolean().optional(),
    })
    .strict(),
  git_blame: z
    .object({
      path: OptnRpPthSch,
      filePath: z.string(),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
      ignoreWhitespace: z.boolean().optional(),
    })
    .strict(),
  git_branch: z
    .object({
      path: OptnRpPthSch,
      mode: z.enum(["list", "create", "delete", "rename", "show-current"]).optional(),
      branchName: z.string().optional(),
      startPoint: z.string().optional(),
      newBranchName: z.string().optional(),
      force: z.boolean().optional(),
      all: z.boolean().optional(),
      remote: z.boolean().optional(),
      merged: z.union([z.boolean(), z.string()]).optional(),
      noMerged: z.union([z.boolean(), z.string()]).optional(),
      limit: z.number().int().positive().max(1000).optional(),
    })
    .strict(),
  git_changelog_analyze: z
    .object({
      path: OptnRpPthSch,
      branch: z.string().optional(),
      sinceTag: z.string().optional(),
      maxCommits: z.number().int().positive().max(1000).optional(),
      maxTags: z.number().int().positive().max(1000).optional(),
      reviewTypes: z.array(RvwTypSch).min(1),
    })
    .strict(),
  git_checkout: z
    .object({
      path: OptnRpPthSch,
      target: z.string(),
      paths: z.array(z.string()).optional(),
      createBranch: z.boolean().optional(),
      force: z.boolean().optional(),
      track: z.boolean().optional(),
    })
    .strict(),
  git_cherry_pick: z
    .object({
      path: OptnRpPthSch,
      commits: z.array(z.string()).optional(),
      abort: z.boolean().optional(),
      continueOperation: z.boolean().optional(),
      mainline: z.number().int().positive().optional(),
      noCommit: z.boolean().optional(),
      signoff: z.boolean().optional(),
      strategy: z.enum(["ort", "recursive", "octopus", "ours", "subtree"]).optional(),
    })
    .strict(),
  git_clean: z
    .object({
      path: OptnRpPthSch,
      dryRun: z.boolean().optional(),
      force: z.boolean().optional(),
      directories: z.boolean().optional(),
      ignored: z.boolean().optional(),
    })
    .strict(),
  git_clone: z
    .object({
      url: z.string(),
      path: z.string(),
      branch: z.string().optional(),
      depth: z.number().int().positive().optional(),
      bare: z.boolean().optional(),
      mirror: z.boolean().optional(),
    })
    .strict(),
  git_commit: z
    .object({
      path: OptnRpPthSch,
      message: z.string().max(ITAML, "Use messagePath for long commit messages").optional(),
      messagePath: z.string().optional(),
      messageOffset: z.number().optional().default(0),
      messageLength: z.number().optional(),
      author: z
        .object({
          name: z.string().min(1),
          email: z.string().email(),
        })
        .optional(),
      amend: z.boolean().optional(),
      allowEmpty: z.boolean().optional(),
      noVerify: z.boolean().optional(),
      filesToStage: z.array(z.string()).optional(),
    })
    .strict()
    .refine((args) => args.message !== undefined || args.messagePath !== undefined, {
      message: "Either message or messagePath is required",
    }),
  git_diff: z
    .object({
      path: OptnRpPthSch,
      target: CmmtRfSch.optional(),
      source: CmmtRfSch.optional(),
      paths: z.array(z.string()).optional(),
      staged: z.boolean().optional(),
      includeUntracked: z.boolean().optional(),
      nameOnly: z.boolean().optional(),
      stat: z.boolean().optional(),
      contextLines: z.number().int().min(0).max(100).optional(),
      autoExclude: z.boolean().optional(),
    })
    .strict(),
  git_fetch: z
    .object({
      path: OptnRpPthSch,
      remote: z.string().optional(),
      depth: z.number().int().positive().optional(),
      prune: z.boolean().optional(),
      tags: z.boolean().optional(),
    })
    .strict(),
  git_init: z
    .object({
      path: OptnRpPthSch,
      initialBranch: z.string().optional(),
      bare: z.boolean().optional(),
    })
    .strict(),
  git_merge: z
    .object({
      path: OptnRpPthSch,
      branch: z.string(),
      message: z.string().max(ITAML, "Use messagePath for long merge messages").optional(),
      messagePath: z.string().optional(),
      messageOffset: z.number().optional().default(0),
      messageLength: z.number().optional(),
      noFastForward: z.boolean().optional(),
      squash: z.boolean().optional(),
      strategy: z.enum(["ort", "recursive", "octopus", "ours", "subtree"]).optional(),
    })
    .strict(),
  git_pull: z
    .object({
      path: OptnRpPthSch,
      remote: z.string().optional(),
      branch: z.string().optional(),
      fastForwardOnly: z.boolean().optional(),
      rebase: z.boolean().optional(),
    })
    .strict(),
  git_push: z
    .object({
      path: OptnRpPthSch,
      remote: z.string().optional(),
      branch: z.string().optional(),
      remoteBranch: z.string().optional(),
      delete: z.boolean().optional(),
      dryRun: z.boolean().optional(),
      force: z.boolean().optional(),
      forceWithLease: z.boolean().optional(),
      setUpstream: z.boolean().optional(),
      tags: z.boolean().optional(),
      confirmed: z.boolean().optional(),
    })
    .strict(),
  git_rebase: z
    .object({
      path: OptnRpPthSch,
      mode: z.enum(["start", "continue", "abort", "skip"]).optional(),
      branch: z.string().optional(),
      upstream: z.string().optional(),
      onto: z.string().optional(),
      interactive: z.boolean().optional(),
      preserve: z.boolean().optional(),
    })
    .strict(),
  git_reflog: z
    .object({
      path: OptnRpPthSch,
      ref: z.string().optional(),
      maxCount: z.number().int().positive().max(1000).optional(),
    })
    .strict(),
  git_remote: z
    .object({
      path: OptnRpPthSch,
      mode: z.enum(["list", "add", "remove", "rename", "get-url", "set-url"]).optional(),
      name: z.string().optional(),
      newName: z.string().optional(),
      url: z.string().optional(),
      push: z.boolean().optional(),
    })
    .strict(),
  git_reset: z
    .object({
      path: OptnRpPthSch,
      mode: z.enum(["soft", "mixed", "hard", "merge", "keep"]).optional(),
      target: z.string().optional(),
      paths: z.array(z.string()).optional(),
      confirmed: z.boolean().optional(),
    })
    .strict(),
  git_set_working_dir: z
    .object({
      path: z.string(),
      validateGitRepo: z.boolean().optional(),
      initializeIfNotPresent: z.boolean().optional(),
    })
    .strict(),
  git_show: z
    .object({
      path: OptnRpPthSch,
      object: z.string(),
      filePath: z.string().optional(),
      format: z.enum(["raw"]).optional(),
      stat: z.boolean().optional(),
    })
    .strict(),
  git_stash: z
    .object({
      path: OptnRpPthSch,
      mode: z.enum(["list", "push", "pop", "apply", "drop", "clear"]).optional(),
      stashRef: z.string().optional(),
      message: z.string().max(ITAML, "Use messagePath for long stash messages").optional(),
      messagePath: z.string().optional(),
      messageOffset: z.number().optional().default(0),
      messageLength: z.number().optional(),
      includeUntracked: z.boolean().optional(),
      keepIndex: z.boolean().optional(),
      limit: z.number().int().positive().max(1000).optional(),
    })
    .strict(),
  git_status: z
    .object({
      path: OptnRpPthSch,
      includeUntracked: z.boolean().optional(),
    })
    .strict(),
  git_tag: z
    .object({
      path: OptnRpPthSch,
      mode: z.enum(["list", "create", "delete", "verify"]).optional(),
      tagName: z.string().optional(),
      commit: z.string().optional(),
      annotated: z.boolean().optional(),
      force: z.boolean().optional(),
      limit: z.number().int().positive().max(1000).optional(),
      message: z.string().max(ITAML, "Use messagePath for long tag messages").optional(),
      messagePath: z.string().optional(),
      messageOffset: z.number().optional().default(0),
      messageLength: z.number().optional(),
    })
    .strict(),
  git_worktree: z
    .object({
      path: OptnRpPthSch,
      mode: z.enum(["list", "add", "remove", "move", "prune"]).optional(),
      worktreePath: z.string().optional(),
      newPath: z.string().optional(),
      branch: z.string().optional(),
      commitish: z.string().optional(),
      detach: z.boolean().optional(),
      dryRun: z.boolean().optional(),
      force: z.boolean().optional(),
      verbose: z.boolean().optional(),
    })
    .strict(),
} as const;

export declare type GitToolName = keyof typeof GT_INPT_SCHS;

export const EGTN = [
  "git_set_working_dir",
  "git_status",
  "git_diff",
  "git_show",
  "git_add",
  "git_commit",
] as const satisfies readonly GitToolName[];
