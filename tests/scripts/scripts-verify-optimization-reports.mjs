import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const docsPath = path.join(projectRoot, ".docs", "optimization");
const reportPattern = /^fs-mcp-optimization-(v\d+)-\d{4}-\d{2}-\d{2}\.md$/;

// 1. report discovery ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function collectOptimizationReports() {
  const entries = await readdir(docsPath, { withFileTypes: true });
  const reports = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const match = entry.name.match(reportPattern);
    if (!match) {
      continue;
    }

    const version = match[1];
    const existing = reports.get(version) ?? [];
    existing.push(entry.name);
    reports.set(version, existing);
  }

  return reports;
}

// 2. report accumulation check ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const reports = await collectOptimizationReports();
  const failures = [];

  for (const [version, matchingReports] of reports.entries()) {
    if (matchingReports.length > 1) {
      failures.push(`Duplicate optimization reports for ${version}: ${matchingReports.join(", ")}`);
    }
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
