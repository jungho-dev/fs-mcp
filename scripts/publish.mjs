import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const pkgPath = resolve(rootDir, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
const registry = process.env.npm_config_registry ?? pkg.publishConfig?.registry ?? "https://registry.npmjs.org/";
const spec = `${pkg.name}@${pkg.version}`;

async function runNpm(args) {
    const proc = Bun.spawn(["npm", ...args], {
        env: process.env,
        stderr: "pipe",
        stdout: "pipe"
    });

    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited
    ]);

    return { code, stderr, stdout };
}

function hasPublished(text) {
    return text.includes("previously published versions") || text.includes("cannot publish over");
}

function hasMissing(text) {
    return text.includes("E404") || text.includes("404 Not Found") || text.includes("is not in this registry");
}

function cleanNpmText(text) {
    return text
        .split(/\r?\n/)
        .map((line) => line.replace(/^npm error\s*/, "").replace(/^npm notice\s*/, ""))
        .filter((line) => line.trim() !== "")
        .filter((line) => !line.includes("complete log of this run"))
        .join("\n")
        .trim();
}

const view = await runNpm(["view", spec, "version", "--json", "--registry", registry, "--silent"]);
const viewText = `${view.stdout}\n${view.stderr}`;

if (view.code === 0) {
    console.log(`${spec} already published; skipping.`);
    process.exit(0);
}

if (!hasMissing(viewText)) {
    console.error(`Publish precheck failed for ${spec}.`);

    const cleanText = cleanNpmText(viewText);

    if (cleanText !== "") {
        console.error(cleanText);
    }

    process.exit(view.code || 1);
}

const extraArgs = process.argv.slice(2);

if (extraArgs[0] === "--") {
    extraArgs.shift();
}

const pubArgs = [
    "publish",
    "--access",
    "public",
    "--registry",
    registry,
    "--silent",
    ...extraArgs
];
const pub = await runNpm(pubArgs);
const pubText = `${pub.stdout}\n${pub.stderr}`;

if (pub.code === 0) {
    const cleanText = cleanNpmText(pubText);

    if (cleanText !== "") {
        console.log(cleanText);
    }

    console.log(`${spec} published.`);
    process.exit(0);
}

if (hasPublished(pubText)) {
    console.log(`${spec} already published; skipping.`);
    process.exit(0);
}

console.error(`Publish failed for ${spec}.`);

const cleanText = cleanNpmText(pubText);

if (cleanText !== "") {
    console.error(cleanText);
}

process.exit(pub.code || 1);
