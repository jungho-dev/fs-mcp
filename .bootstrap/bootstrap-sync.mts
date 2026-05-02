/**
 * @file bootstrap-sync.mts
 * @description ~/.bootstrap minimal bootstrap: load remote dev-ts sync engine and run
 * @author Jungho
 * @since 2026-03-15
 */

import {execFileSync, execSync, spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import {env} from "./bootstrap-env.mts";

// 1. 공통 설정 헬퍼 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
// 1-1. getErrorMessage
const getErrorMessage = (error=null) => (error instanceof Error ? error.message : String(error));

// 1-2. getRemoteConfig
const getRemoteConfig = (config=env) => {
  const remote = config?.remote ?? {};
  const rawCandidates = Array.isArray(remote.candidates) ? remote.candidates : [];
  const rawBundleRelativePaths = Array.isArray(remote.bundleRelativePaths) ? remote.bundleRelativePaths : [];
  const result = {
    apiBase: String(remote.apiBase || `https://api.github.com`),
    owner: String(remote.owner || ``),
    repo: String(remote.repo || ``),
    branch: String(remote.branch || ``),
    userAgent: String(remote.userAgent || `dev-ts-Sync-Bootstrap`),
    apiAccept: String(remote.apiAccept || `application/vnd.github+json`),
    apiVersion: String(remote.apiVersion || `2022-11-28`),
    candidates: normalizeCandidatePaths(rawCandidates),
    bundleRelativePaths: normalizeCandidatePaths(rawBundleRelativePaths),
  };

  return result;
};

// 1-3. getAuthConfig
const getAuthConfig = (config=env) => {
  const auth = config?.auth ?? {};
  const result = {
    configuredToken: String(auth.token || ``).trim(),
    tokenEnvKey: String(auth.tokenEnvKey || `GITHUB_TOKEN`).trim(),
    tokenType: String(auth.tokenType || `Bearer`).trim(),
  };

  return result;
};

// 1-4. getRuntimeConfig
const getRuntimeConfig = (config=env) => {
  const runtime = config?.runtime ?? {};
  const rawRunArgs = Array.isArray(runtime.runArgs) ? runtime.runArgs : [];
  const result = {
    remoteEntryRelativePath: String(runtime.remoteEntryRelativePath || `.lib/public-router.mts`).trim(),
    tempDirPrefix: String(runtime.tempDirPrefix || `dev-ts-sync-`).trim(),
    tempBaseDirPath: String(runtime.tempBaseDirPath || path.join(String(config?.devTsHomePath || `.`), `.tmp`)).trim(),
    defaultActionArg: String(runtime.defaultActionArg || `--sync`).trim(),
    runArgs: rawRunArgs.map((arg) => String(arg || ``)),
    projectRootPath: String(runtime.projectRootPath || process.cwd()).trim(),
  };

  return result;
};

// 1-5. getMetaConfig
const getMetaConfig = (config=env) => {
  const exitCode = config?.meta?.exitCode ?? {};
  const result = {
    successCode: Number(exitCode.success) || 0,
    failedCode: Number(exitCode.failed) || 1,
  };

  return result;
};

// 1-6. getMessageConfig
const getMessageConfig = (config=env) => {
  const messages = config?.messages ?? {};
  const result = {
    logPrefix: String(messages.logPrefix || `[dev-ts-sync]`),
    remoteFetchFailedPrefix: String(messages.remoteFetchFailedPrefix || `원격 조회 실패(HTTP `),
    remoteRunFailedPrefix: String(messages.remoteRunFailedPrefix || `원격 sync 실행 실패 (exit code: `),
    remoteNotFound: String(messages.remoteNotFound || `원격 public/.lib/public-router.mts를 찾지 못했습니다.`),
  };

  return result;
};

// 1-7. getRunArgs
const getRunArgs = (config=env) => {
  const runtimeConfig = getRuntimeConfig(config);
  const result = runtimeConfig.runArgs.length > 0 ? runtimeConfig.runArgs : [runtimeConfig.defaultActionArg];

  return result;
};

// 2. 인증 토큰 처리 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
// 2-1. readWindowsMachineEnv
const readWindowsMachineEnv = (envKey=``) => {
  const isWindowsPlatform = process.platform === `win32`;
  const hasEnvKey = typeof envKey === `string` && envKey.trim() !== ``;
  let machineEnvValue = ``;

  if (isWindowsPlatform && hasEnvKey) {
    const escapedEnvKey = envKey.replaceAll(`'`, `''`);
    const command = `[System.Environment]::GetEnvironmentVariable('${escapedEnvKey}', 'Machine')`;

    try {
      const machineEnvRaw = execFileSync(`pwsh`, [`-NoProfile`, `-NonInteractive`, `-Command`, command], {
        encoding: `utf8`,
        stdio: [`ignore`, `pipe`, `ignore`],
      });
      machineEnvValue = String(machineEnvRaw || ``).trim();
    }
    catch {
      machineEnvValue = ``;
    }
  }
  return machineEnvValue;
};

// 2-2. readGitCredentialToken
const readGitCredentialToken = () => {
  const credentialInput = [`protocol=https`, `host=github.com`, ``, ``].join(`\n`);
  let token = ``;

  try {
    const rawCredential = execSync(`git credential fill`, {
      encoding: `utf8`,
      input: credentialInput,
      stdio: [`pipe`, `pipe`, `ignore`],
    });
    const credentialLines = String(rawCredential || ``).split(/\r?\n/u);
    const passwordLine = credentialLines.find((line) => line.startsWith(`password=`)) || ``;
    token = passwordLine.replace(/^password=/u, ``).trim();
  }
  catch {
    token = ``;
  }
  return token;
};

// 2-3. resolveAuthToken
const resolveAuthToken = (config=env) => {
  const authConfig = getAuthConfig(config);

  if (authConfig.configuredToken !== ``) {
  	return authConfig.configuredToken;
  }
  const credentialToken = readGitCredentialToken();

  if (credentialToken !== ``) {
  	return credentialToken;
  }
  const machineToken = readWindowsMachineEnv(authConfig.tokenEnvKey);
  const processToken = String(process.env[authConfig.tokenEnvKey] || ``).trim();
  const result = machineToken || processToken;

  return result;
};

// 2-4. buildHeaders
const buildHeaders = (config=env) => {
  const remoteConfig = getRemoteConfig(config);
  const authConfig = getAuthConfig(config);
  const token = resolveAuthToken(config);
  const headers = {
    "User-Agent": remoteConfig.userAgent,
    Accept: remoteConfig.apiAccept,
    "X-GitHub-Api-Version": remoteConfig.apiVersion,
  };

  if (token !== ``) {
    headers.Authorization = `${authConfig.tokenType} ${token}`;
  }
  return headers;
};

// 3. 로컬 번들 처리 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
// 3-1. readLocalTextFileSafely
const readLocalTextFileSafely = (filePath=``, fallbackValue=``) => {
  const normalizedFilePath = String(filePath || ``).trim();

  if (normalizedFilePath === `` || !fs.existsSync(normalizedFilePath)) {
  	return fallbackValue;
  }
  try {
    return String(fs.readFileSync(normalizedFilePath, `utf8`) || ``);
  }
  catch {
    return fallbackValue;
  }
};

// 3-2. ensureParentDir
const ensureParentDir = (filePath=``) => {
  const parentDirPath = path.dirname(filePath);

  if (!fs.existsSync(parentDirPath)) {
    fs.mkdirSync(parentDirPath, {recursive: true});
  }
};

// 3-3. cleanupTempBundleDir
const cleanupTempBundleDir = (tempDirPath=``, tempBaseDirPath=``) => {
  const normalizedTempDirPath = String(tempDirPath || ``).trim();
  const normalizedTempBaseDirPath = String(tempBaseDirPath || ``).trim();

  try {
    if (normalizedTempDirPath !== `` && fs.existsSync(normalizedTempDirPath)) {
      fs.rmSync(normalizedTempDirPath, {
        recursive: true,
        force: true,
      });
    }
    if (normalizedTempBaseDirPath !== `` && fs.existsSync(normalizedTempBaseDirPath) && fs.readdirSync(normalizedTempBaseDirPath).length === 0) {
    	fs.rmdirSync(normalizedTempBaseDirPath);
    }
  }
  catch {
    // 임시 디렉터리 정리 실패는 본 실행 결과보다 우선하지 않는다.
  }
};

// 3-4. normalizeCandidatePaths
const normalizeCandidatePaths = (candidatePaths=[]) => {
  const result = [...new Set(candidatePaths.map((candidatePath) => String(candidatePath || ``).trim()).filter((candidatePath) => candidatePath !== ``))];

  return result;
};

// 3-5. resolveAncestorPaths
const resolveAncestorPaths = (startPath=``) => {
  const normalizedStartPath = String(startPath || process.cwd()).trim();

  if (normalizedStartPath === ``) {
  	return [];
  }
  const ancestorPaths = [];
  let currentPath = path.resolve(normalizedStartPath);

  for (;;) {
    ancestorPaths.push(currentPath);
    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
    	break;
    }
    currentPath = parentPath;
  }
  return ancestorPaths;
};

// 3-6. resolveLocalBundleRootCandidates
const resolveLocalBundleRootCandidates = (config=env) => {
  const runtimeConfig = getRuntimeConfig(config);
  const remoteConfig = getRemoteConfig(config);
  const targetProjectName = remoteConfig.repo || `dev-ts`;
  const normalizedTargetProjectName = targetProjectName.toLowerCase();
  const ancestorPaths = resolveAncestorPaths(runtimeConfig.projectRootPath);
  const candidateRootPaths = [];

  for (const ancestorPath of ancestorPaths) {
    if (path.basename(ancestorPath).toLowerCase() === normalizedTargetProjectName) {
    	candidateRootPaths.push(path.join(ancestorPath, `public`));
    }
    candidateRootPaths.push(path.join(ancestorPath, targetProjectName, `public`));
  }
  return normalizeCandidatePaths(candidateRootPaths);
};

// 3-7. resolveLocalBundlePathCandidates
const resolveLocalBundlePathCandidates = (relativePath=``, config=env) => {
  const normalizedRelativePath = String(relativePath || ``).trim();
  const candidateRootPaths = resolveLocalBundleRootCandidates(config);
  const result = candidateRootPaths.map((candidateRootPath) => path.join(candidateRootPath, normalizedRelativePath));

  return result;
};

// 3-8. readLocalBundleSource
const readLocalBundleSource = (relativePath=``, config=env) => {
  const localBundlePathCandidates = resolveLocalBundlePathCandidates(relativePath, config);
  let sourceCode = ``;

  for (const localBundlePath of localBundlePathCandidates) {
    const localBundleSource = readLocalTextFileSafely(localBundlePath);

    if (localBundleSource !== ``) {
    	sourceCode = localBundleSource;
      break;
    }
  }
  return sourceCode;
};

// 3-9. collectLocalBundleSources
const collectLocalBundleSources = (relativePaths=[], config=env) => {
  const bundleSources = {};

  for (const relativePath of relativePaths) {
    const normalizedRelativePath = String(relativePath || ``).trim();

    if (normalizedRelativePath === ``) {
    	continue;
    }
    const localBundleSource = readLocalBundleSource(normalizedRelativePath, config);

    if (localBundleSource !== ``) {
    	bundleSources[normalizedRelativePath] = localBundleSource;
    }
  }
  return bundleSources;
};

// 4. 원격 번들 조회 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
// 4-1. buildEncodedPath
const buildEncodedPath = (candidatePath=``) => {
  const result = String(candidatePath || ``)
    .split(`/`)
    .filter((segment) => segment !== ``)
    .map((segment) => encodeURIComponent(segment))
    .join(`/`);

  return result;
};

// 4-2. buildRemoteUrl
const buildRemoteUrl = (candidatePath=``, config=env) => {
  const remoteConfig = getRemoteConfig(config);
  const encodedPath = buildEncodedPath(candidatePath);
  const owner = encodeURIComponent(remoteConfig.owner);
  const repo = encodeURIComponent(remoteConfig.repo);
  const branch = encodeURIComponent(remoteConfig.branch);
  const result = `${remoteConfig.apiBase}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;

  return result;
};

// 4-3. decodeGithubContent
const decodeGithubContent = (payload={}) => {
  const encodedContent = typeof payload?.content === `string` ? payload.content : ``;

  if (encodedContent === ``) {
  	return ``;
  }
  const normalizedBase64 = encodedContent.replaceAll(`\n`, ``);
  const result = Buffer.from(normalizedBase64, `base64`).toString(`utf8`);

  return result;
};

// 4-4. resolveCandidatePublicRoot
const resolveCandidatePublicRoot = (candidatePath=``, config=env) => {
  const normalizedCandidatePath = String(candidatePath || ``).trim();
  const runtimeConfig = getRuntimeConfig(config);
  let publicRoot = ``;

  if (normalizedCandidatePath.endsWith(runtimeConfig.remoteEntryRelativePath)) {
  	publicRoot = normalizedCandidatePath.slice(0, normalizedCandidatePath.length - runtimeConfig.remoteEntryRelativePath.length).replace(/\/$/u, ``);
  }
  return publicRoot;
};

// 4-5. createRemoteFetchFailure
const createRemoteFetchFailure = (status=0, relativePath=``, config=env) => {
  const messageConfig = getMessageConfig(config);
  const normalizedRelativePath = String(relativePath || ``).trim();
  const baseMessage = `${messageConfig.remoteFetchFailedPrefix}${status})`;
  const result = normalizedRelativePath === `` ? new Error(baseMessage) : new Error(`${baseMessage}: ${normalizedRelativePath}`);

  return result;
};

// 4-6. fetchRemoteFileSource
const fetchRemoteFileSource = async (remotePath=``, config=env) => {
  const url = buildRemoteUrl(remotePath, config);
  const headers = buildHeaders(config);
  let response = await fetch(url, {headers: headers});

  if (response.status === 401 && Object.hasOwn(headers, `Authorization`)) {
    const publicHeaders = {...headers};
    publicHeaders.Authorization = undefined;
    response = await fetch(url, {headers: publicHeaders});
  }
  if (!response.ok) {
    return {ok: false, status: response.status, sourceCode: ``};
  }
  const payload = await response.json();
  const sourceCode = decodeGithubContent(payload);
  const result = {
    ok: sourceCode !== ``,
    status: response.status,
    sourceCode: sourceCode,
  };

  return result;
};

// 4-7. createBundleFetchContext
const createBundleFetchContext = (config=env) => {
  const remoteConfig = getRemoteConfig(config);
  const runtimeConfig = getRuntimeConfig(config);
  const localBundleSources = collectLocalBundleSources(remoteConfig.bundleRelativePaths, config);
  const localEntrySource = String(localBundleSources[runtimeConfig.remoteEntryRelativePath] || ``);
  const result = {
    remoteCandidates: remoteConfig.candidates,
    bundleRelativePaths: remoteConfig.bundleRelativePaths,
    remoteEntryRelativePath: runtimeConfig.remoteEntryRelativePath,
    localBundleSources: localBundleSources,
    localEntrySource: localEntrySource,
  };

  return result;
};

// 4-8. fetchMissingBundleSources
const fetchMissingBundleSources = async ({bundleSources={}, bundleRelativePaths=[], candidatePublicRoot=``, config=env} = {}) => {
  for (const relativePath of bundleRelativePaths) {
    if (Object.hasOwn(bundleSources, relativePath)) {
    	continue;
    }
    const companionPath = candidatePublicRoot === `` ? relativePath : `${candidatePublicRoot}/${relativePath}`;
    const companionResult = await fetchRemoteFileSource(companionPath, config);

    if (!companionResult.ok) {
    	throw createRemoteFetchFailure(companionResult.status, relativePath, config);
    }
    bundleSources[relativePath] = companionResult.sourceCode;
  }
  return bundleSources;
};

// 4-9. fetchRemoteSharedSource
const fetchRemoteSharedSource = async (config=env) => {
  const bundleFetchContext = createBundleFetchContext(config);

  for (const candidate of bundleFetchContext.remoteCandidates) {
    const entryResult = bundleFetchContext.localEntrySource === `` ? await fetchRemoteFileSource(candidate, config) : {
            ok: true,
            status: 200,
            sourceCode: bundleFetchContext.localEntrySource,
          };

    if (entryResult.status === 404) {
    	continue;
    }
    if (!entryResult.ok) {
    	throw createRemoteFetchFailure(entryResult.status, ``, config);
    }
    const candidatePublicRoot = resolveCandidatePublicRoot(candidate, config);
    const bundleSources = {
      ...bundleFetchContext.localBundleSources,
      [bundleFetchContext.remoteEntryRelativePath]: entryResult.sourceCode,
    };

    await fetchMissingBundleSources({
      bundleSources: bundleSources,
      bundleRelativePaths: bundleFetchContext.bundleRelativePaths,
      candidatePublicRoot: candidatePublicRoot,
      config: config,
    });

    return {
      entryRelativePath: bundleFetchContext.remoteEntryRelativePath,
      bundleSources: bundleSources,
    };
  }
  throw new Error(getMessageConfig(config).remoteNotFound);
};

// 5. 터미널 제어 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
// 5-1. waitForTerminalAction
const waitForTerminalAction = async () => {
  const hasInteractiveTerminal = process.stdin.isTTY && process.stdout.isTTY;
  let action = `exit`;

  if (!hasInteractiveTerminal) {
  	return action;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    let hasResolvedAction = false;

    while (!hasResolvedAction) {
      const answer = await new Promise((resolve) => {
        rl.question(`종료하려면 'exit', 계속하려면 Enter를 누르세요... `, (input) => {
          resolve(input);
        });
      });
      const normalizedAnswer = String(answer || ``)
        .trim()
        .toLowerCase();

      if (normalizedAnswer === ``) {
      	action = `rerun`;
        hasResolvedAction = true;
      }
      else if (normalizedAnswer === `exit`) {
      	action = `exit`;
        hasResolvedAction = true;
      }
      else {
      	console.log(`입력이 올바르지 않습니다. Enter 또는 'exit'만 입력해주세요.`);
      }
    }
  }
  finally {
    rl.close();
  }
  return action;
};

// 6. 원격 엔트리 실행 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// 6-1. writeTempBundleFiles
const writeTempBundleFiles = (tempDirPath=``, bundleSources={}) => {
  for (const [relativePath, fileContent] of Object.entries(bundleSources)) {
    const bundleFilePath = path.join(tempDirPath, relativePath);

    ensureParentDir(bundleFilePath);
    fs.writeFileSync(bundleFilePath, fileContent, `utf8`);
  }
};

// 6-2. executeRemoteEntry
const executeRemoteEntry = (entryRelativePath=``, bundleSources={}, config=env) =>
  new Promise((resolve, reject) => {
    const runtimeConfig = getRuntimeConfig(config);
    const metaConfig = getMetaConfig(config);
    const messageConfig = getMessageConfig(config);
    const normalizedEntryRelativePath = String(entryRelativePath || runtimeConfig.remoteEntryRelativePath).trim();

    fs.mkdirSync(runtimeConfig.tempBaseDirPath, {recursive: true});

    const tempDirPath = fs.mkdtempSync(path.join(runtimeConfig.tempBaseDirPath, runtimeConfig.tempDirPrefix));

    writeTempBundleFiles(tempDirPath, bundleSources);

    const tempEntryPath = path.join(tempDirPath, normalizedEntryRelativePath);
    const child = spawn(process.execPath, [tempEntryPath, ...getRunArgs(config)], {
      cwd: runtimeConfig.projectRootPath,
      stdio: `inherit`,
    });

    child.once(`error`, (error) => {
      cleanupTempBundleDir(tempDirPath, runtimeConfig.tempBaseDirPath);
      reject(error);
    });

    child.once(`close`, (code) => {
      cleanupTempBundleDir(tempDirPath, runtimeConfig.tempBaseDirPath);
      const exitCode = typeof code === `number` ? code : metaConfig.failedCode;

      if (exitCode === metaConfig.successCode) {
      	resolve();
        return;
      }
      reject(new Error(`${messageConfig.remoteRunFailedPrefix}${exitCode})`));
    });
  });

// 6-3. runRemoteSync
const runRemoteSync = async (config=env) => {
  const {entryRelativePath, bundleSources} = await fetchRemoteSharedSource(config);

  await executeRemoteEntry(entryRelativePath, bundleSources, config);
};

// 7. 실행 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// 7-1. run
const run = async () => {
  let exitCode = getMetaConfig(env).successCode;
  let shouldRerun = true;

  while (shouldRerun) {
    try {
      await runRemoteSync(env);
      exitCode = getMetaConfig(env).successCode;
    }
    catch (error) {
      const metaConfig = getMetaConfig(env);
      const messageConfig = getMessageConfig(env);

      console.error(`${messageConfig.logPrefix} ${getErrorMessage(error)}`);
      exitCode = metaConfig.failedCode;
    }
    const terminalAction = await waitForTerminalAction();
    shouldRerun = terminalAction === `rerun`;
  }
  process.exit(exitCode);
};

void run();
