# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for local file work, batched
search, exact block editing, runtime configuration updates, process stdin interaction, and essential
git workflows.

This package is the MCP server runtime. It is not a VS Code extension bundle, does not require a
specific AI client, and does not open a network listener. Any MCP-capable client that can launch a
stdio command can use it, including Codex, Claude, Cline, Roo, Cursor, Windsurf, VS Code MCP clients,
Gemini CLI, and GitHub Copilot.

The current runtime does not include a SQLite sidecar, context-index store, or MCP resource catalog.
Resource and resource-template handlers intentionally return empty lists for client compatibility.

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

The current source and compiled runtime expose 22 public tools. Tool names are intentionally short,
hyphenated for filesystem/search/git surfaces, and stable for clients that cache MCP catalogs.

| Domain | Tools | Purpose |
|--------|-------|---------|
| Config | `set_config_values` | Update mutable in-memory configuration values. |
| Filesystem | `file-read`, `file-lines`, `file-write`, `file-infos` | Read, line-read, write, and inspect files. |
| Directories | `dir-list`, `dir-mk` | List directory trees and create directories. |
| File operations | `file-copy`, `file-move`, `file-remove`, `file-edit` | Copy, move, remove, and exact-edit files or directories. |
| Search | `search-regex`, `search-start`, `search-get`, `search-stop` | Run direct regex scans or manage paged search sessions. |
| Process | `interact_with_processes` | Send stdin to known running process IDs. |
| Git | `git-cwd`, `git-status`, `git-diff`, `git-show`, `git-add`, `git-commit` | Pin repo state, inspect changes, stage, and commit. |

`src/schemas/schemas-git.ts` contains schemas for additional git operations, but `src/tools/tools-git.ts`
exports only the essential git set above in this version. Config read tools and process start/read/list/kill
controls are outside the current public catalog.

## Main Capabilities

- Batch-first filesystem reads, writes, listings, metadata checks, directory creation, copying, moving,
  deletion, and exact block replacement.
- Direct ripgrep-compatible regex search and asynchronous search sessions with pagination and stop controls.
- Optional DOCX text extraction for content searches when the target inputs or patterns include `.docx`.
- Runtime configuration updates for supported mutable keys.
- Process stdin interaction for existing running process IDs.
- Essential git session workflows for repository pinning, status, diff, show, staging, and commit.
- Normalized tool responses with a visible display block, machine-readable `structuredContent`, and compact
  `_meta.fsMcpResult` metadata.

## Batch-First Tool Use

`SERVER_INSTRUCTIONS` and batch-capable tool descriptions tell clients to collapse repeated same-kind work into
one multi-item call. This applies to:

- File reads through `paths` or `items`.
- Directory and file operations through `items` or `paths` arrays.
- Search work through `search-regex.items`, `search-start.items`, `search-get.items`, and `search-stop.sessionIds`.
- Process input through `interact_with_processes.items`.
- Configuration updates through `set_config_values.items`.

Large arguments can be moved into a UTF-8 JSON file and passed with `args_path`. Inline fields supplied beside
`args_path` override fields from the referenced JSON object. Large text payloads can also use path-backed fields
such as `content_path`, `old_string_path`, `new_string_path`, `pattern_path`, `input_path`, `messagePath`, and
`value_path`.

`file-read`, `file-lines`, `dir-list`, and `file-infos` accept `allowMissing=true` so exploratory candidate reads
can return missing local paths as non-error results.

## Runtime Notes

Current compiled catalog metrics from this checkout:

- Tool count: `22`.
- `list_tools` payload: `24,721` characters.
- Tool descriptions: `6,088` characters.
- Tool schemas: `17,266` characters.

Runtime behavior:

- Tool catalogs are assembled once during server creation.
- Zod-to-JSON-schema conversion is lazy-cached per tool entry.
- Tool calls resolve `args_path`, `args_offset`, and `args_length` before controller validation.
- Search sessions have no implicit `maxResults` cap. Set `maxResults` explicitly when a bounded scan is needed.
- Large duplicate text is not automatically compacted; normalized responses preserve handler output.
- Stdio filtering captures accidental console output before it can corrupt MCP JSON-RPC frames.

## Runtime Configuration

Runtime configuration is in memory only. The server does not create a first-run config file.

Mutable configuration keys are:

- `allowedDirectories`
- `blockedCommands`
- `defaultShell`

`FS_MCP_ALLOWED_DIRECTORIES` can seed allowed directories. On Windows, entries are separated by semicolons.

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
- `tokens` uses `gpt-tokenizer` over the visible combined text plus serialized structured content.
- `structuredContent` stores schema version, tool name, status, duration, error detail, original normalized content,
  combined text, and original structured payload.
- `_meta.fsMcpResult` stores compact status, duration, content type, error, schema, and tool metadata.
- Already normalized results are not wrapped again; the visible display text is regenerated.

## Development

Current package scripts use Bun:

```bash
bun run build
bun run verify
bun run test
```

Useful scoped checks:

```bash
bun run verify:source
bun run verify:shape
bun run verify:tools
bun run verify:reports
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
