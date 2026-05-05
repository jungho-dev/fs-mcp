/**
 * @file src/tools/tools-git.ts
 * @description Git tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {withArgsPathSchema} from "@schemas/schemas-args-ref";
import {GIT_INPUT_SCHEMAS, type GitToolName} from "@schemas/schemas-git";
import {CMD_PREFIX_DESCRIPTION, PATH_GUIDANCE, type ToolCatalogEntry} from "@tools/tools-const";
import {zodToJsonSchema} from "zod-to-json-schema";

type GitToolDescription = {
  name: GitToolName;
  title: string;
  description: string;
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
};

const LONG_MESSAGE_GUIDANCE = "Use messagePath/messageOffset/messageLength for long messages so the tool-call argument preview stays small.";

const GIT_TOOL_DESCRIPTIONS: GitToolDescription[] = [
  { name: "git_add", title: "Git Add", description: ["Stage files for commit.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false },
  { name: "git_blame", title: "Git Blame", description: ["Show line-by-line authorship for a file.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
  { name: "git_branch", title: "Git Branch", description: ["List, create, delete, rename, or inspect branches.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false },
  { name: "git_changelog_analyze", title: "Git Changelog Analyze", description: ["Collect git history context and changelog review guidance.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
  { name: "git_checkout", title: "Git Checkout", description: ["Switch branches or restore tracked files.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_cherry_pick", title: "Git Cherry Pick", description: ["Apply commits from another branch.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_clean", title: "Git Clean", description: ["Remove untracked files or preview cleanup.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_clear_working_dir", title: "Git Clear Working Directory", description: ["Clear the session git working directory.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_clone", title: "Git Clone", description: ["Clone a repository from a remote or local source.", PATH_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git_commit", title: "Git Commit", description: ["Create a commit from staged changes.", LONG_MESSAGE_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_diff", title: "Git Diff", description: ["Show differences between commits, branches, or working tree state.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
  { name: "git_fetch", title: "Git Fetch", description: ["Fetch updates from a remote repository.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, openWorldHint: true },
  { name: "git_init", title: "Git Init", description: ["Initialize a new git repository.", PATH_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_log", title: "Git Log", description: ["Read commit history with optional filters.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
  { name: "git_merge", title: "Git Merge", description: ["Merge a branch into the current branch.", LONG_MESSAGE_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_pull", title: "Git Pull", description: ["Fetch and integrate remote changes.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git_push", title: "Git Push", description: ["Push local commits or tags to a remote.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git_rebase", title: "Git Rebase", description: ["Rebase commits onto another base.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_reflog", title: "Git Reflog", description: ["Inspect reference update history.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
  { name: "git_remote", title: "Git Remote", description: ["Manage git remotes and remote URLs.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  { name: "git_reset", title: "Git Reset", description: ["Reset HEAD or unstage paths.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_set_working_dir", title: "Git Set Working Directory", description: ["Pin the session git working directory and return a repository snapshot.", PATH_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_show", title: "Git Show", description: ["Show a git object or file content at a revision.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
  { name: "git_stash", title: "Git Stash", description: ["List, save, apply, pop, or drop stashes.", LONG_MESSAGE_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_status", title: "Git Status", description: ["Show working tree status, staging, and conflicts.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
  { name: "git_tag", title: "Git Tag", description: ["List, create, delete, or verify tags.", LONG_MESSAGE_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_worktree", title: "Git Worktree", description: ["Manage additional git worktrees.", PATH_GUIDANCE, CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: false, destructiveHint: true },
  { name: "git_wrapup_instructions", title: "Git Wrapup Instructions", description: ["Return a git session wrap-up checklist with repository snapshot.", CMD_PREFIX_DESCRIPTION].join("\n"), readOnlyHint: true },
];

// 1. git tool catalog build ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const GIT_TOOL_CATALOG: ToolCatalogEntry[] = GIT_TOOL_DESCRIPTIONS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: zodToJsonSchema(withArgsPathSchema(GIT_INPUT_SCHEMAS[tool.name])),
  annotations: {
    title: tool.title,
    readOnlyHint: tool.readOnlyHint,
    destructiveHint: tool.destructiveHint,
    openWorldHint: tool.openWorldHint,
  },
}));
