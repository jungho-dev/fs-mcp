/**
 * @file tests/scripts/scripts-verify-doc-sync.mjs
 * @description Verify that Korean and English documentation stay structurally in sync.
 *              Compares the markdown heading sequence of paired files so divergent
 *              sections (added in one language and missed in the other) fail CI.
 * @author JUNGHO
 * @since 2026-05-22
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const PAIRS = [
  { en: "README.md", ko: "readme-ko.md" },
  { en: "architecture.md", ko: "architecture-ko.md" },
];

// Strip language-specific decoration so the structural shape is comparable.
// Removes markdown emphasis, inline code, raw code blocks, and lowercases.
function normalizeHeading(rawHeading) {
  return rawHeading
    .replace(/`[^`]*`/g, "")
    .replace(/[*_~]/g, "")
    .replace(/[‘’“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Extract heading levels from a markdown file. Skips fenced code blocks so
// commented `#` markers inside snippets do not pollute the structural shape.
function extractHeadingLevels(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = [];
  let inFence = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      headings.push({ level: match[1].length, text: normalizeHeading(match[2]) });
    }
  }
  return headings;
}

async function loadHeadings(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const text = await readFile(fullPath, "utf8");
  return extractHeadingLevels(text);
}

function shapeOf(headings) {
  return headings.map((entry) => entry.level).join(",");
}

async function verifyPair(pair) {
  const [enHeadings, koHeadings] = await Promise.all([
    loadHeadings(pair.en),
    loadHeadings(pair.ko),
  ]);

  const failures = [];

  if (enHeadings.length !== koHeadings.length) {
    failures.push(
      `Heading count mismatch between ${pair.en} (${enHeadings.length}) and ${pair.ko} (${koHeadings.length}).`,
    );
  }

  const enShape = shapeOf(enHeadings);
  const koShape = shapeOf(koHeadings);
  if (enShape !== koShape) {
    failures.push(`Heading level shape differs:\n  ${pair.en}: ${enShape}\n  ${pair.ko}: ${koShape}`);
  }
  return failures;
}

async function main() {
  const allFailures = [];
  for (const pair of PAIRS) {
    // eslint-disable-next-line no-await-in-loop
    const failures = await verifyPair(pair);
    for (const failure of failures) {
      allFailures.push(`[${pair.en} <-> ${pair.ko}] ${failure}`);
    }
  }

  if (allFailures.length > 0) {
    console.error(allFailures.join("\n\n"));
    process.exitCode = 1;
    return;
  }
  console.log("doc-sync: all language pairs match.");
}

await main();
