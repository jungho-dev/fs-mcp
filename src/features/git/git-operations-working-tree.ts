/**
 * @file src/features/git/git-operations-working-tree.ts
 * @description Working tree and commit git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { AT_EXCL_PATS, normalizeCommitMessage as nrmlCmmtMsg, requireGitTextArgument as rqrGtTxtArg, runGitCommand as rnGtCmd, splitLines } from "@features/git/git-runtime";
import { getHeadCommit as gtHdCmmt, resolveRepositoryPath as rslvRepoPth } from "@features/git/git-session";
import { detectAutoExcludedFiles as dtcAtExFl, getStatusSummary as gtStatSmmr, sumNumstat, toSnakeStatus as tSnkStat } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput as GtTlOtpt } from "@features/git/git-types";

const GPG_SGN_PAT = /gpg|sign/i;
const HNGL_PAT = /[ㄱ-ㅎㅏ-ㅣ가-힣]/u;
const CNV_CMM_PAT = /^(?:feat|fix|chore|docs|refactor|test|style|perf|build|ci)(?:\([^)]+\))?:\s+\S/im;
const MLT_BLL_PAT = /\n\s*\n[\s\S]*^\s*-\s+\S/m;
// biome-ignore lint/security/noSecrets: Git pretty-format token string, not credential material.
const CMM_SMM_FRM = "%H%x1f%an <%ae>%x1f%ct%x1f%s%x1f%G?";

// 1. Run git add ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitAdd(input: GitArgsMap["git_add"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);

  await rnGtCmd(
    [
      "add",
      ...(input.all ? ["--all"] : []),
      ...(input.update ? ["--update"] : []),
      ...(input.force ? ["--force"] : []),
      ...(input.paths && input.paths.length > 0 ? input.paths : input.all ? [] : ["."]),
    ],
    { cwd },
  );

  const status = await gtStatSmmr(cwd, true);
  const stagedFiles = Object.values(status.stagedChanges).flatMap((value) => value ?? []);

  return {
    success: true,
    stagedFiles,
    totalFiles: stagedFiles.length,
    status: tSnkStat(status),
  };
}

// 2. Run git commit ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitCommit(input: GitArgsMap["git_commit"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const cmmtMsg2 = await rqrGtTxtArg(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");
  const normCmmtMsg = nrmlCmmtMsg(cmmtMsg2);

  if (HNGL_PAT.test(normCmmtMsg)) {
    throw new Error("Commit messages must be written in English. Korean text is not allowed.");
  }
  if (!CNV_CMM_PAT.test(normCmmtMsg)) {
    throw new Error("Commit messages must start with an English Conventional Commit subject, for example: fix: update git commit handling.");
  }
  if (!MLT_BLL_PAT.test(normCmmtMsg)) {
    throw new Error("Commit messages must use a subject line, a blank line, and at least one bullet point.");
  }

  if (input.filesToStage && input.filesToStage.length > 0) {
    await rnGtCmd(["add", ...input.filesToStage], { cwd });
  }
  const commitArgs = ["commit", "-m", normCmmtMsg, ...(input.amend ? ["--amend"] : []), ...(input.allowEmpty ? ["--allow-empty"] : []), ...(input.noVerify ? ["--no-verify"] : []), ...(input.author ? ["--author", `${input.author.name} <${input.author.email}>`] : [])];
  let sgnnWrnn: string | undefined;
  let commitResult = await rnGtCmd(commitArgs, { cwd, allowFailure: true });

  if (commitResult.exitCode !== 0) {
    const cmbnFlr = [commitResult.stderr, commitResult.stdout].join("\n");

    if (GPG_SGN_PAT.test(cmbnFlr)) {
      sgnnWrnn = cmbnFlr.trim();
      commitResult = await rnGtCmd([...commitArgs, "--no-gpg-sign"], { cwd, allowFailure: true });
    }
  }
  if (commitResult.exitCode !== 0) {
    throw new Error([commitResult.stderr.trim(), commitResult.stdout.trim()].filter((value) => value.length > 0).join("\n"));
  }
  const headCommit = await gtHdCmmt(cwd);

  if (!headCommit) {
    throw new Error("Commit completed but HEAD is unavailable.");
  }
  const smmrRes2 = await rnGtCmd(["show", "--numstat", `--format=${CMM_SMM_FRM}`, "-1", headCommit], { cwd });
  const summaryLines = splitLines(smmrRes2.stdout);
  const headerParts = summaryLines[0].split("\x1f");
  const numstatText = summaryLines.slice(1).join("\n");
  const status = await gtStatSmmr(cwd, true);
  const diffStats = sumNumstat(numstatText);
  const cmmtFls = summaryLines.slice(1).map((line) => line.split("\t").slice(2).join("\t").trim()).filter((value) => value.length > 0);

  return {
    success: true,
    commitHash: headerParts[0],
    author: headerParts[1],
    timestamp: Number.parseInt(headerParts[2], 10),
    message: headerParts[3],
    filesChanged: cmmtFls.length,
    committedFiles: cmmtFls,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    signed: (headerParts[4] ?? "").trim().length > 0 && (headerParts[4] ?? "").trim() !== "N",
    ...(sgnnWrnn ? { signingWarning: sgnnWrnn } : {}),
    status: tSnkStat(status),
  };
}

// 3. Run git diff ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitDiff(input: GitArgsMap["git_diff"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const contextLines = input.contextLines ?? 3;
  const autoExclude = input.autoExclude ?? true;
  const diffRange = [...(input.staged ? ["--cached"] : []), ...(input.source ? [input.source] : []), ...(!input.source && input.target ? [input.target] : []), ...(input.source && input.target ? [input.target] : [])];
  const pathspecs = input.paths && input.paths.length > 0 ? [...input.paths] : ["."];
  const excludeSpecs = autoExclude ? AT_EXCL_PATS.map((pattern) => `:(exclude)${pattern}`) : [];
  const diffArgs = ["diff", ...(input.nameOnly ? ["--name-only"] : []), ...(input.stat ? ["--stat"] : []), `--unified=${String(contextLines)}`, ...diffRange, "--", ...pathspecs, ...excludeSpecs];
  const diffResult = await rnGtCmd(diffArgs, { cwd });
  const nmstRes = await rnGtCmd(["diff", "--numstat", ...diffRange, "--", ...pathspecs, ...excludeSpecs], { cwd, allowFailure: true });
  const diffStats = sumNumstat(nmstRes.stdout);
  let diffText = diffResult.stdout;
  let untrFls: string[] = [];

  if (input.includeUntracked) {
    const untrRes = await rnGtCmd(["ls-files", "--others", "--exclude-standard"], { cwd, allowFailure: true });
    untrFls = splitLines(untrRes.stdout);
    if (untrFls.length > 0) {
      diffText = diffText.length > 0 ? `${diffText}\n\n# Untracked files\n${untrFls.join("\n")}` : `# Untracked files\n${untrFls.join("\n")}`;
    }
  }
  const nmOnlyRes = autoExclude ? await rnGtCmd(["diff", "--name-only", ...diffRange, "--", ...pathspecs], { cwd, allowFailure: true }) : null;
  const exclFls = autoExclude && nmOnlyRes ? dtcAtExFl(splitLines(nmOnlyRes.stdout), AT_EXCL_PATS) : [];

  return {
    success: true,
    diff: diffText,
    filesChanged: diffStats.filesChanged + untrFls.length,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    ...(exclFls.length > 0 ? { excludedFiles: exclFls } : {}),
  };
}

// 5. Run git show ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitShow(input: GitArgsMap["git_show"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const targetObject = input.filePath ? `${input.object}:${input.filePath}` : input.object;
  const showResult = await rnGtCmd(["show", ...(input.format ? [`--format=${input.format}`] : []), ...(input.stat ? ["--stat"] : []), targetObject], { cwd });
  const typeResult = input.filePath ? { stdout: "blob" } : await rnGtCmd(["cat-file", "-t", input.object], { cwd, allowFailure: true });

  return {
    success: true,
    object: input.object,
    type: typeResult.stdout.trim() || "commit",
    content: showResult.stdout,
  };
}
