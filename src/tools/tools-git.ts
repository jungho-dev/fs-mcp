/**
 * @file src/tools/tools-git.ts
 * @description Git tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { EGTN, GT_INPT_SCHS, type GitToolName } from "@schemas/schemas-git";
import { CMD_PRF_DSC, PTH_GDNC, createToolCatalogEntry as crtTlCtEn, type ToolCatalogEntry as TlCtlgEntr } from "@tools/tools-const";

type GitToolDescription = {
  name: GitToolName;
  title: string;
  description: string;
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
};

const LNG_MSG_GDNC = "Use messagePath for long messages.";
const CMM_MSG_GDN = [
  "Use an English multi-line Conventional Commit message.",
  "<type>: <summary>",
  "- <change detail>",
  "- <verification or behavior detail>",
].join("\n");

const EGTNS = new Set<GitToolName>(EGTN);

const GT_TL_DSCR: GitToolDescription[] = [
  { name: "git-add", title: "Git Add", description: ["Stage files for commit.", CMD_PRF_DSC].join("\n"), readOnlyHint: false },
  { name: "git_blame", title: "Git Blame", description: ["Show line-by-line authorship for a file.", CMD_PRF_DSC].join("\n"), readOnlyHint: true },
  { name: "git_branch", title: "Git Branch", description: ["List, create, delete, rename, or inspect branches.", CMD_PRF_DSC].join("\n"), readOnlyHint: false },
  { name: "git_changelog_analyze", title: "Git Changelog Analyze", description: ["Collect git history context and changelog review guidance.", CMD_PRF_DSC].join("\n"), readOnlyHint: true },
  { name: "git_checkout", title: "Git Checkout", description: ["Switch branches or restore tracked files.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_cherry_pick", title: "Git Cherry Pick", description: ["Apply commits from another branch.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_clean", title: "Git Clean", description: ["Remove untracked files or preview cleanup.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_clone", title: "Git Clone", description: ["Clone a repository from a remote or local source.", PTH_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git-commit", title: "Git Commit", description: ["Create a commit from staged changes.", CMM_MSG_GDN, LNG_MSG_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git-diff", title: "Git Diff", description: ["Show differences between commits, branches, or working tree state.", CMD_PRF_DSC].join("\n"), readOnlyHint: true },
  { name: "git_fetch", title: "Git Fetch", description: ["Fetch updates from a remote repository.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, openWorldHint: true },
  { name: "git_init", title: "Git Init", description: ["Initialize a new git repository.", PTH_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_merge", title: "Git Merge", description: ["Merge a branch into the current branch.", LNG_MSG_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_pull", title: "Git Pull", description: ["Fetch and integrate remote changes.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git_push", title: "Git Push", description: ["Push local commits or tags to a remote.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git_rebase", title: "Git Rebase", description: ["Rebase commits onto another base.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_reflog", title: "Git Reflog", description: ["Inspect reference update history.", CMD_PRF_DSC].join("\n"), readOnlyHint: true },
  { name: "git_remote", title: "Git Remote", description: ["Manage git remotes and remote URLs.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git_reset", title: "Git Reset", description: ["Reset HEAD or unstage paths.", CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git-cwd", title: "Git Set Working Directory", description: ["Pin the session git working directory and return a repository snapshot.", PTH_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git-show", title: "Git Show", description: ["Show a git object or file content at a revision.", CMD_PRF_DSC].join("\n"), readOnlyHint: true },
  { name: "git_stash", title: "Git Stash", description: ["List, save, apply, pop, or drop stashes.", LNG_MSG_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git-status", title: "Git Status", description: ["Show working tree status, staging, and conflicts.", CMD_PRF_DSC].join("\n"), readOnlyHint: true },
  { name: "git_tag", title: "Git Tag", description: ["List, create, delete, or verify tags.", LNG_MSG_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_worktree", title: "Git Worktree", description: ["Manage additional git worktrees.", PTH_GDNC, CMD_PRF_DSC].join("\n"), readOnlyHint: false, destructiveHint: true },
];

// 1. git tool catalog build ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const GT_TL_CTLG: TlCtlgEntr[] = GT_TL_DSCR
  .filter((tool) => EGTNS.has(tool.name))
  .map((tool) => crtTlCtEn({
    name: tool.name,
    description: tool.description,
    inputSchema: wthArPtSc(GT_INPT_SCHS[tool.name]),
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnlyHint,
      destructiveHint: tool.destructiveHint,
      openWorldHint: tool.openWorldHint,
    },
  }));

export const GT_TL_CTLG2 = GT_TL_CTLG;
export {GT_TL_CTLG as GIT_TOOL_CATALOG};
