/**
 * @file src/features/git/git-service.ts
 * @description Git tool service operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {ServerResult} from "@assets/type/common";
import {createToolTextResponse} from "@cores/responses/responses-tool-result";
import {runGitBranch, runGitCheckout, runGitCherryPick, runGitClean, runGitMerge, runGitRebase, runGitReset, runGitStash, runGitTag, runGitWorktree} from "@features/git/git-operations-branches";
import {runGitBlame, runGitChangelogAnalyze, runGitReflog} from "@features/git/git-operations-history";
import {runGitFetch, runGitPull, runGitPush, runGitRemote} from "@features/git/git-operations-remotes";
import {runGitClone, runGitInit, runGitSetWorkingDir, runGitStatus} from "@features/git/git-operations-repository";
import {runGitAdd, runGitCommit, runGitDiff, runGitShow} from "@features/git/git-operations-working-tree";
import type {GitArgsMap, GitToolOutput} from "@features/git/git-types";
import type {GitToolName} from "@schemas/schemas-git";

const GIT_TOOL_HANDLERS = {
  "git_add": runGitAdd,
  "git_blame": runGitBlame,
  "git_branch": runGitBranch,
  "git_changelog_analyze": runGitChangelogAnalyze,
  "git_checkout": runGitCheckout,
  "git_cherry_pick": runGitCherryPick,
  "git_clean": runGitClean,
  "git_clone": runGitClone,
  "git_commit": runGitCommit,
  "git_diff": runGitDiff,
  "git_fetch": runGitFetch,
  "git_init": runGitInit,
  "git_merge": runGitMerge,
  "git_pull": runGitPull,
  "git_push": runGitPush,
  "git_rebase": runGitRebase,
  "git_reflog": runGitReflog,
  "git_remote": runGitRemote,
  "git_reset": runGitReset,
  "git_set_working_dir": runGitSetWorkingDir,
  "git_show": runGitShow,
  "git_stash": runGitStash,
  "git_status": runGitStatus,
  "git_tag": runGitTag,
  "git_worktree": runGitWorktree,
} satisfies {[K in GitToolName]: (args: GitArgsMap[K]) => Promise<GitToolOutput>};

// 1. Create JSON response ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createJsonResponse(output: Record<string, unknown>): ServerResult {
  return createToolTextResponse(JSON.stringify(output, null, 2), {structuredContent: output});
}

// 2. Execute git tool ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function executeGitTool<TName extends GitToolName>(name: TName, args: GitArgsMap[TName]): Promise<ServerResult> {
  const handler = GIT_TOOL_HANDLERS[name] as (input: GitArgsMap[TName]) => Promise<GitToolOutput>;
  const output = await handler(args);
  const response = createJsonResponse(output);
  return response;
}
