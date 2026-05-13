/**
 * @file src/features/git/git-operations-working-tree.ts
 * @description Working tree and commit git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { AUTO_EXCLUDE_PATTERNS, normalizeCommitMessage, requireGitTextArgument, runGitCommand, splitLines } from "@features/git/git-runtime";
import { getHeadCommit, resolveRepositoryPath } from "@features/git/git-session";
import { detectAutoExcludedFiles, getStatusSummary, sumNumstat, toSnakeStatus } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput } from "@features/git/git-types";

const GPG_SIGN_PATTERN = /gpg|sign/i;
const HANGUL_PATTERN = /[ㄱ-ㅎㅏ-ㅣ가-힣]/u;
const CONVENTIONAL_COMMIT_PATTERN = /^(?:feat|fix|chore|docs|refactor|test|style|perf|build|ci)(?:\([^)]+\))?:\s+\S/im;
const MULTILINE_BULLET_PATTERN = /\n\s*\n[\s\S]*^\s*-\s+\S/m;
// biome-ignore lint/security/noSecrets: Git pretty-format token string, not credential material.
const COMMIT_SUMMARY_FORMAT = "%H%x1f%an <%ae>%x1f%ct%x1f%s%x1f%G?";

// 1. Run git add ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitAdd(input: GitArgsMap["git_add"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);

  await runGitCommand(
    [
      "add",
      ...(input.all ? ["--all"] : []),
      ...(input.update ? ["--update"] : []),
      ...(input.force ? ["--force"] : []),
      ...(input.paths && input.paths.length > 0 ? input.paths : input.all ? [] : ["."]),
    ],
    { cwd },
  );

  const status = await getStatusSummary(cwd, true);
  const stagedFiles = Object.values(status.stagedChanges).flatMap((value) => value ?? []);

  return {
    success: true,
    stagedFiles,
    totalFiles: stagedFiles.length,
    status: toSnakeStatus(status),
  };
}

// 2. Run git commit ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitCommit(input: GitArgsMap["git_commit"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const commitMessage = await requireGitTextArgument(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");
  const normalizedCommitMessage = normalizeCommitMessage(commitMessage);

  if (HANGUL_PATTERN.test(normalizedCommitMessage)) {
    throw new Error("Commit messages must be written in English. Korean text is not allowed.");
  }
  if (!CONVENTIONAL_COMMIT_PATTERN.test(normalizedCommitMessage)) {
    throw new Error("Commit messages must start with an English Conventional Commit subject, for example: fix: update git commit handling.");
  }
  if (!MULTILINE_BULLET_PATTERN.test(normalizedCommitMessage)) {
    throw new Error("Commit messages must use a subject line, a blank line, and at least one bullet point.");
  }

  if (input.filesToStage && input.filesToStage.length > 0) {
    await runGitCommand(["add", ...input.filesToStage], { cwd });
  }
  const commitArgs = ["commit", "-m", normalizedCommitMessage, ...(input.amend ? ["--amend"] : []), ...(input.allowEmpty ? ["--allow-empty"] : []), ...(input.noVerify ? ["--no-verify"] : []), ...(input.author ? ["--author", `${input.author.name} <${input.author.email}>`] : [])];
  let signingWarning: string | undefined;
  let commitResult = await runGitCommand(commitArgs, { cwd, allowFailure: true });

  if (commitResult.exitCode !== 0) {
    const combinedFailure = [commitResult.stderr, commitResult.stdout].join("\n");

    if (GPG_SIGN_PATTERN.test(combinedFailure)) {
      signingWarning = combinedFailure.trim();
      commitResult = await runGitCommand([...commitArgs, "--no-gpg-sign"], { cwd, allowFailure: true });
    }
  }
  if (commitResult.exitCode !== 0) {
    throw new Error([commitResult.stderr.trim(), commitResult.stdout.trim()].filter((value) => value.length > 0).join("\n"));
  }
  const headCommit = await getHeadCommit(cwd);

  if (!headCommit) {
    throw new Error("Commit completed but HEAD is unavailable.");
  }
  const summaryResult = await runGitCommand(["show", "--numstat", `--format=${COMMIT_SUMMARY_FORMAT}`, "-1", headCommit], { cwd });
  const summaryLines = splitLines(summaryResult.stdout);
  const headerParts = summaryLines[0].split("\x1f");
  const numstatText = summaryLines.slice(1).join("\n");
  const status = await getStatusSummary(cwd, true);
  const diffStats = sumNumstat(numstatText);
  const committedFiles = summaryLines.slice(1).map((line) => line.split("\t").slice(2).join("\t").trim()).filter((value) => value.length > 0);

  return {
    success: true,
    commitHash: headerParts[0],
    author: headerParts[1],
    timestamp: Number.parseInt(headerParts[2], 10),
    message: headerParts[3],
    filesChanged: committedFiles.length,
    committedFiles,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    signed: (headerParts[4] ?? "").trim().length > 0 && (headerParts[4] ?? "").trim() !== "N",
    ...(signingWarning ? { signingWarning } : {}),
    status: toSnakeStatus(status),
  };
}

// 3. Run git diff ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitDiff(input: GitArgsMap["git_diff"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const contextLines = input.contextLines ?? 3;
  const autoExclude = input.autoExclude ?? true;
  const diffRange = [...(input.staged ? ["--cached"] : []), ...(input.source ? [input.source] : []), ...(!input.source && input.target ? [input.target] : []), ...(input.source && input.target ? [input.target] : [])];
  const pathspecs = input.paths && input.paths.length > 0 ? [...input.paths] : ["."];
  const excludeSpecs = autoExclude ? AUTO_EXCLUDE_PATTERNS.map((pattern) => `:(exclude)${pattern}`) : [];
  const diffArgs = ["diff", ...(input.nameOnly ? ["--name-only"] : []), ...(input.stat ? ["--stat"] : []), `--unified=${String(contextLines)}`, ...diffRange, "--", ...pathspecs, ...excludeSpecs];
  const diffResult = await runGitCommand(diffArgs, { cwd });
  const numstatResult = await runGitCommand(["diff", "--numstat", ...diffRange, "--", ...pathspecs, ...excludeSpecs], { cwd, allowFailure: true });
  const diffStats = sumNumstat(numstatResult.stdout);
  let diffText = diffResult.stdout;
  let untrackedFiles: string[] = [];

  if (input.includeUntracked) {
    const untrackedResult = await runGitCommand(["ls-files", "--others", "--exclude-standard"], { cwd, allowFailure: true });
    untrackedFiles = splitLines(untrackedResult.stdout);
    if (untrackedFiles.length > 0) {
      diffText = diffText.length > 0 ? `${diffText}\n\n# Untracked files\n${untrackedFiles.join("\n")}` : `# Untracked files\n${untrackedFiles.join("\n")}`;
    }
  }
  const nameOnlyResult = autoExclude ? await runGitCommand(["diff", "--name-only", ...diffRange, "--", ...pathspecs], { cwd, allowFailure: true }) : null;
  const excludedFiles = autoExclude && nameOnlyResult ? detectAutoExcludedFiles(splitLines(nameOnlyResult.stdout), AUTO_EXCLUDE_PATTERNS) : [];

  return {
    success: true,
    diff: diffText,
    filesChanged: diffStats.filesChanged + untrackedFiles.length,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    ...(excludedFiles.length > 0 ? { excludedFiles } : {}),
  };
}

// 5. Run git show ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitShow(input: GitArgsMap["git_show"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const targetObject = input.filePath ? `${input.object}:${input.filePath}` : input.object;
  const showResult = await runGitCommand(["show", ...(input.format ? [`--format=${input.format}`] : []), ...(input.stat ? ["--stat"] : []), targetObject], { cwd });
  const typeResult = input.filePath ? { stdout: "blob" } : await runGitCommand(["cat-file", "-t", input.object], { cwd, allowFailure: true });

  return {
    success: true,
    object: input.object,
    type: typeResult.stdout.trim() || "commit",
    content: showResult.stdout,
  };
}
