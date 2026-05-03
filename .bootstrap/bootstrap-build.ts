import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputRoot = path.join(projectRoot, "out");
const swcConfigPath = path.join(projectRoot, ".server.swcrc");
const relativeSpecifierPattern = /(from\s*["']|import\s*\(\s*["']|import\s+["'])(\.{1,2}\/[^"'\n\r]+?)(["'])/g;
const aliasSpecifierPattern = /(from\s*["']|import\s*\(\s*["']|import\s+["'])(@(?:platform|assets|controllers|features|schemas|tools|type)\/[^"'\n\r]+?)(["'])/g;
const aliasOutputRoots: ReadonlyArray<{prefix: string; outputPath: string}> = [
  {prefix: "@platform/", outputPath: path.join(outputRoot, "platform")},
  {prefix: "@assets/", outputPath: path.join(outputRoot, "assets")},
  {prefix: "@controllers/", outputPath: path.join(outputRoot, "controllers")},
  {prefix: "@features/", outputPath: path.join(outputRoot, "features")},
  {prefix: "@schemas/", outputPath: path.join(outputRoot, "schemas")},
  {prefix: "@tools/", outputPath: path.join(outputRoot, "tools")},
  {prefix: "@type/", outputPath: path.join(outputRoot, "assets", "type")},
];

function hasKnownExtension(specifier: string): boolean {
  return /\.(?:[cm]?js|json|node)$/u.test(specifier);
}

function toRelativePosixSpecifier(specifierPath: string): string {
  const normalizedPath = specifierPath.split(path.sep).join("/");

  return normalizedPath.startsWith(".") ? normalizedPath : `./${normalizedPath}`;
}

function resolveAliasedOutputSpecifier(filePath: string, specifier: string): string {
  for (const aliasRoot of aliasOutputRoots) {
    if (!specifier.startsWith(aliasRoot.prefix)) {
      continue;
    }

    const subPath = specifier.slice(aliasRoot.prefix.length);
    const outputTargetPath = path.join(aliasRoot.outputPath, subPath);
    const relativeSpecifier = toRelativePosixSpecifier(path.relative(path.dirname(filePath), outputTargetPath));

    return hasKnownExtension(relativeSpecifier) ? relativeSpecifier : `${relativeSpecifier}.mjs`;
  }

  return specifier;
}

function resolveOutputSpecifier(filePath: string, specifier: string): string {
  if ((!specifier.startsWith("./") && !specifier.startsWith("../")) || hasKnownExtension(specifier)) {
    return specifier;
  }

  const resolvedBasePath = path.resolve(path.dirname(filePath), specifier);
  const moduleFilePath = `${resolvedBasePath}.mjs`;
  const moduleIndexPath = path.join(resolvedBasePath, "index.js");

  if (Bun.file(moduleFilePath).exists()) {
    return `${specifier}.mjs`;
  }
  if (Bun.file(moduleIndexPath).exists()) {
    return `${specifier}/index.js`;
  }

  return specifier;
}

async function normalizeOutputImports(directoryPath: string): Promise<number> {
  let updatedFileCount = 0;
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of directoryEntries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      updatedFileCount += await normalizeOutputImports(entryPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".mjs")) {
      continue;
    }

    const originalText = await readFile(entryPath, "utf8");
    const relativeNormalizedText = originalText.replace(
      relativeSpecifierPattern,
      (_match, prefix, specifier, suffix) => `${prefix}${resolveOutputSpecifier(entryPath, specifier)}${suffix}`,
    );
    const normalizedText = relativeNormalizedText.replace(
      aliasSpecifierPattern,
      (_match, prefix, specifier, suffix) => `${prefix}${resolveAliasedOutputSpecifier(entryPath, specifier)}${suffix}`,
    );

    if (normalizedText !== originalText) {
      await writeFile(entryPath, normalizedText, "utf8");
      updatedFileCount += 1;
    }
  }

  return updatedFileCount;
}

async function runBuild(): Promise<void> {
  await rm(outputRoot, { recursive: true, force: true });

  const buildProcess = Bun.spawn(
    ["bunx", "swc", "src", "-d", "out", "--config-file", swcConfigPath, "--out-file-extension", "mjs", "--strip-leading-paths"],
    {
      cwd: projectRoot,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await buildProcess.exited;

  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  const updatedFileCount = await normalizeOutputImports(outputRoot);
  process.stdout.write(`[build] normalized ${updatedFileCount} output files\n`);
}

await runBuild();
