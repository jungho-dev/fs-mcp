/**
 * @file src/features/git/git-service.ts
 * @description Git tool service operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {ServerResult} from "@assets/type/common";
import {createToolTextResponse as crtTlTxtRes} from "@cores/responses/responses-tool-result";
import {runGitBranch, runGitCheckout as rnGtChck, runGitCherryPick as rnGtChrrPck, runGitClean, runGitMerge, runGitRebase, runGitReset, runGitStash, runGitTag, runGitWorktree as rnGtWrkt} from "@features/git/git-operations-branches";
import {runGitBlame, runGitChangelogAnalyze as rnGtChngAnly, runGitReflog} from "@features/git/git-operations-history";
import {runGitFetch, runGitPull, runGitPush, runGitRemote} from "@features/git/git-operations-remotes";
import {runGitClone, runGitInit, runGitSetWorkingDir as rnGtStWrknDr, runGitStatus} from "@features/git/git-operations-repository";
import {runGitAdd, runGitCommit, runGitDiff, runGitShow} from "@features/git/git-operations-working-tree";
import type {GitArgsMap, GitToolOutput as GtTlOtpt} from "@features/git/git-types";
import type {GitToolName} from "@schemas/schemas-git";

const GT_TL_HNDL = {
  "git-add": runGitAdd,
  "git_blame": runGitBlame,
  "git_branch": runGitBranch,
  "git_changelog_analyze": rnGtChngAnly,
  "git_checkout": rnGtChck,
  "git_cherry_pick": rnGtChrrPck,
  "git_clean": runGitClean,
  "git_clone": runGitClone,
  "git-commit": runGitCommit,
  "git-diff": runGitDiff,
  "git_fetch": runGitFetch,
  "git_init": runGitInit,
  "git_merge": runGitMerge,
  "git_pull": runGitPull,
  "git_push": runGitPush,
  "git_rebase": runGitRebase,
  "git_reflog": runGitReflog,
  "git_remote": runGitRemote,
  "git_reset": runGitReset,
  "git-cwd": rnGtStWrknDr,
  "git-show": runGitShow,
  "git_stash": runGitStash,
  "git-status": runGitStatus,
  "git_tag": runGitTag,
  "git_worktree": rnGtWrkt,
} satisfies {[K in GitToolName]: (args: GitArgsMap[K]) => Promise<GtTlOtpt>};

// 1. Create JSON response ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createJsonResponse(output: Record<string, unknown>): ServerResult {
  return crtTlTxtRes(JSON.stringify(output, null, 2), {structuredContent: output});
}

// 2. Execute git tool ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function executeGitTool<TName extends GitToolName>(name: TName, args: GitArgsMap[TName]): Promise<ServerResult> {
  const handler = GT_TL_HNDL[name] as (input: GitArgsMap[TName]) => Promise<GtTlOtpt>;
  const output = await handler(args);
  const response = createJsonResponse(output);
  return response;
}
