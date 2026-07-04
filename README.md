# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for local file work, batched
search, exact block editing, and essential git workflows.

This package is the MCP server runtime. It is not a VS Code extension bundle, does not require a
specific AI client, and does not open a network listener. Any MCP-capable client that can launch a
stdio command can use it, including Codex, Claude, Cline, Roo, Cursor, Windsurf, VS Code MCP clients,
Gemini CLI, and GitHub Copilot.

The current runtime does not include a SQLite sidecar, context-index store, or MCP resource catalog.
Resource and resource-template handlers intentionally return empty lists for client compatibility.

## Measured Performance And Token Savings

The practical baseline for AI file work is often repeated shell calls that each pay process and tool-call overhead.
Current benchmarks show where `fs-mcp` reduces that overhead while keeping full payloads available to the client.

| Scenario | `fs-mcp` path | Baseline | Measured effect |
|----------|---------------|----------|-----------------|
| Read 12 files, 4 KB each | One `file-read` batch: `3.11 ms` avg, `1.86 ms` median | Sequential PowerShell reads: `2,617.42 ms` avg, `2,579.75 ms` median | About `842x` faster by average time and `1,387x` faster by median time |
| Write 20 files, 4 KB each | `args_path` reference: `140` transport chars, `35` token est | Inline JSON payload: `82,911` transport chars, `20,728` token est | `99.83%` fewer transport chars and `20,693` estimated tokens avoided |
| Normalize one 128 KB text result | Visible display: `498` chars; duplicated `content` slots: `817` chars | Raw text body: `131,072` chars | Full text stays in `data.text` while repeated visible text is kept to a preview |

Numbers above were generated on `2026-05-24` from this checkout with seven runs per timed scenario:

```bash
bun tests/scripts/performance-benchmark.mjs
bun tests/scripts/write-files-args-path-benchmark.mjs
```

Token estimates use the project heuristic of `4` characters per token. Actual model billing depends on the client and
whether it forwards only `content[0].text` or also injects `structuredContent` into model context.

## Installation

Install the package globally with npm:

```bash
npm install -g @jungho-dev/fs-mcp
```

Or install it globally with Bun:

```bash
bun add -g @jungho-dev/fs-mcp
```

## MCP Client Configuration

Use this server command for MCP clients that accept JSON-style `mcpServers` configuration:

```json
{
  "mcpServers": {
    "fs-mcp": {
      "command": "fs-mcp",
      "args": []
    }
  }
}
```

Codex uses TOML instead of JSON. Add the same command to `~/.codex/config.toml` after global install:

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

If a client cannot resolve global binaries, set `command` to the absolute `fs-mcp` executable path.

## Current Public Tool Surface

The current source and compiled runtime expose 24 public tools that mirror the rust-fs-mcp surface. Tool names
are intentionally short, hyphenated, and stable for clients that cache MCP catalogs.

| Domain | Tools | Purpose |
|--------|-------|---------|
| Filesystem | `file-read`, `file-read-line-range`, `file-write`, `path-stat` | Read, line-range-read, write, and inspect files. |
| Directories | `dir-list`, `dir-create` | List directory trees and create directories. |
| File operations | `path-copy`, `path-move`, `path-remove`, `file-edit`, `file-edit-lines` | Copy, move, remove, exact-edit, and line-range-edit files or directories. |
| Inspect | `fs-inspect` | Bundle count-files, search, json-pick, snippet, and git-status lookups into one read-only call. |
| Search | `fs-search` | Run direct ripgrep-compatible regex scans. |
| Web | `web-fetch`, `web-render`, `web-extract`, `download-to-file` | Fetch URLs, render JS/SPA pages through obscura, extract held HTML, and download files. |
| Git | `git-set-workdir`, `git-status`, `git-diff`, `git-show`, `git-add`, `git-commit`, `git-amend` | Pin repo state, inspect changes, stage, commit, and amend. |

`src/schemas/schemas-git.ts` contains schemas for additional git operations, but `src/tools/tools-git.ts`
exports only the essential git set above in this version. Config tools and process controls are outside the current
public catalog.

## Main Capabilities

- Batch-first filesystem reads, writes, listings, metadata checks, directory creation, copying, moving,
  deletion, exact block replacement, and 1-based line range edits.
- `fs-inspect` composite lookups that bundle count-files, search, json-pick, snippet, and git-status into one
  round-trip.
- Direct ripgrep-compatible regex search through `fs-search`.
- SSRF-guarded web tier: `web-fetch` for static pages, `web-render` for JS/SPA pages via the obscura headless
  browser, `web-extract` for offline HTML conversion, and `download-to-file` for sandboxed downloads.
- Optional DOCX text extraction for content searches when the target inputs or patterns include `.docx`.
- Essential git session workflows for repository pinning, status, diff, show, staging, and commit.
- Normalized tool responses with a visible display block, machine-readable `structuredContent`, and compact
  `_meta.fsMcpResult` metadata.

## Batch-First Tool Use

`SERVER_INSTRUCTIONS` and batch-capable tool descriptions tell clients to collapse repeated same-kind work into
one multi-item call. This applies to:

- File reads through `paths` or `items`.
- Directory and file operations through `items` or `paths` arrays.
- Search work through `fs-search.items`.
- Web work through `web-fetch.items`, `web-extract.items`, and `download-to-file.items`.

Large arguments can be moved into a UTF-8 JSON file and passed with `args_path`. Inline fields supplied beside
`args_path` override fields from the referenced JSON object. Large text payloads can also use path-backed fields
such as `content_path`, `old_string_path`, `new_string_path`, `pattern_path`, and `messagePath`.

`file-read`, `file-read-line-range`, `dir-list`, and `path-stat` accept `allowMissing=true` so exploratory
candidate reads can return missing local paths as non-error results.

## Runtime Notes

Current compiled catalog metrics from this checkout:

- Tool count: `24`.
- `list_tools` payload: `32,048` characters.
- Tool descriptions: `8,544` characters.
- Tool schemas: `20,097` characters.

Runtime behavior:

- Tool catalogs are assembled once during server creation.
- Zod-to-JSON-schema conversion is lazy-cached per tool entry.
- Tool calls resolve `args_path`, `args_offset`, and `args_length` before controller validation.
- `fs-search` has no implicit `maxResults` cap. Set `maxResults` explicitly when a bounded scan is needed.
- With the default-on compact envelope the body lives once in `data.content` and the `data.text` copy is omitted;
  `FS_MCP_COMPACT=0` restores it.
- Stdio filtering captures accidental console output before it can corrupt MCP JSON-RPC frames.

## Runtime Configuration

Runtime configuration is in memory only. The server does not create a first-run config file.

Internal runtime configuration keys are:

- `allowedDirectories`
- `blockedCommands`
- `defaultShell`

`FS_MCP_ALLOWED_DIRECTORIES` can seed allowed directories. On Windows, entries are separated by semicolons.
`FS_MCP_COMPACT=0` disables the compact envelope and restores the `data.text` copy.
`FS_MCP_TOOL_PROFILE=fast-coding` narrows `tools/list` to `fs-inspect` only.

## Client Compatibility

- Client metadata is captured during initialization and can also be refreshed from call metadata.
- Git calls run inside a client-scoped git session key.
- Claude and Codex keep standard server-side notification behavior.
- Gemini CLI and GitHub Copilot suppress server-side JSON-RPC notifications for compatibility.
- Resource and resource-template list handlers return empty lists so probing clients initialize cleanly.

## Repository Structure

```text
project root/
|-- src/
|   |-- assets/        shared readers, type declarations, and cross-domain utilities
|   |-- controllers/   MCP request handlers and batch response helpers
|   |-- cores/         runtime, stdio transport, server assembly, and response normalization
|   |-- features/      config, edit, filesystem, git, process, and search behavior
|   |-- schemas/       request argument validation schemas
|   `-- tools/         tool catalog entries and dispatcher
|-- tests/             contract tests, smoke tests, fixtures, and verification scripts
`-- out/               compiled runtime published to npm
```

## Response Shape

Every dispatched tool result is normalized by `src/cores/responses/responses-tool-result.ts`.

- Visible `content[0].text` is generated by `src/cores/responses/responses-tool-display.ts`.
- The default visible rows are `tool`, `items`, `status`, `duration`, `tokens`, `contents`, and `structuredText`.
- `tokens` uses a lightweight character-based estimate over content text plus serialized structured content.
- `structuredContent` stores schema version, tool name, status, duration, error detail, original normalized content,
  and original structured payload.
- With the default-on compact envelope the body lives once in `data.content` and the `data.text` copy is omitted.
  Batch per-item results carry only `structuredContent` and `isError`, and echoed input strings above 256 bytes
  become `<N bytes elided>`. `FS_MCP_COMPACT=0` restores the previous shape.
- `_meta.fsMcpResult` stores compact status, duration, content type, error, schema, and tool metadata.
- Already normalized results are not wrapped again; the visible display text is regenerated.

## Development

Current development checks use Bun:

```bash
bun x tsc --noEmit
bun tests/run-all-tests.js
bun tests/scripts/performance-benchmark.mjs
bun tests/scripts/write-files-args-path-benchmark.mjs
```

Useful scoped checks:

```bash
bun tests/scripts/scripts-verify-release-shape.mjs
bun tests/scripts/scripts-verify-tool-surface.mjs
bun tests/scripts/scripts-verify-optimization-reports.mjs
bun tests/scripts/scripts-verify-doc-sync.mjs
```

`tests/run-all-tests.js` rebuilds `out` unless `FS_MCP_SKIP_BUILD=1` is set, then runs contract and smoke tests.
Verification scripts under `tests/scripts/` check release shape, source boundaries, optimization reports, and the
compiled tool surface.

## Documentation

- English README: `README.md`
- Korean README: `readme-ko.md`
- English architecture: `architecture.md`
- Korean architecture: `architecture-ko.md`
- Changelog: `changelog.md`

## Packaging Notes

The npm package exposes the `fs-mcp` binary through `out/index.mjs`. Runtime version metadata is read from the
package root `package.json`. The package file allowlist includes `out`, release documentation, and changelog files.
Source files, tests, fixtures, and local runtime artifacts remain development-only surfaces.
