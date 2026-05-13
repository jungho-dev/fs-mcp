# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for local filesystem work,
process sessions, ripgrep-backed search, SQLite context indexing, runtime configuration, git session workflows,
and exact block editing.

This package is the MCP server runtime. It is not a VS Code extension bundle and does not depend on one
specific AI client. Codex, Claude, Cline, Roo, Cursor, Windsurf, VS Code MCP clients, and other MCP-capable
clients can launch it through stdio.

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

Use the same server command for MCP clients that accept JSON-style `mcpServers` configuration:

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

Codex uses TOML instead of JSON. Add the same server command to `~/.codex/config.toml` when the package is
installed globally:

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

If a client cannot resolve global binaries, set `command` to the absolute `fs-mcp` executable path. The server
uses stdio and does not open a network listener.

## Main Capabilities

- Filesystem tools for batched read, write, listing, metadata, directory creation, move, rename, and removal.
- Exact edit tools for one or many block replacements with optional path-backed large string inputs.
- Search tools backed by bundled `@vscode/ripgrep`, active search sessions, pagination, and stop controls.
- Process tools for command sessions, process output, interactive input, session listing, process listing, and
  process termination.
- Git session tools for pinned repository state, status, diff, log, show, staging, commit, and wrap-up guidance.
- Context index tools that store, search, list, and clear large text payloads in the shared SQLite context database.
- Runtime configuration tools for command policy, shell selection, allowed directories, context-index thresholds,
  client metadata, version data, and system information.

## Tool Surface

The current source and compiled runtime expose 34 tools. Batch-capable tools are documented as batch-first
surfaces: when a task needs multiple same-kind filesystem, search, process, config, or context operations,
clients should put all items into one tool call instead of repeatedly calling the same tool.

- Config: `get_configs`, `set_config_values`.
- Context: `index_contexts`, `search_contexts`, `list_contexts`, `clear_contexts`.
- Filesystem/search/edit: `read_files`, `write_files`, `create_directories`, `list_directories`,
  `move_files`, `rename_files`, `remove_files`, `start_searches`, `get_compressed_search`,
  `get_full_search`,
  `stop_searches`, `list_searches`, `get_file_infos`, `edit_blocks`.
- Process: `start_processes`, `read_process_outputs`, `interact_with_processes`, `list_sessions`,
  `list_processes`, `kill_processes`.
- Git: `git_set_working_dir`, `git_clear_working_dir`, `git_status`, `git_diff`, `git_log`,
  `git_show`, `git_add`, `git_commit`, `git_wrapup_instructions`.

`src/schemas/schemas-git.ts` defines schemas for additional git operations, but `src/tools/tools-git.ts`
exports only `ESSENTIAL_GIT_TOOL_NAMES` in this version.

## Batch-First Tool Use

`SERVER_INSTRUCTIONS` and batch-capable tool descriptions both tell clients to prefer one multi-item call over
repeated same-tool calls. This applies to:

- File and directory operations through `paths` or `items` arrays.
- Search session operations through `items` or `sessionIds`.
- Process operations through `items` or `pids`.
- Configuration and context-index operations through `items` or `queries`.

Large multi-item arguments can be moved into a UTF-8 JSON file and passed with `args_path`, keeping the tool-call
preview compact while preserving one batch request. Inline overrides are merged on top of the JSON object.

## Context Indexing

Large tool outputs can be indexed into SQLite so clients can search or recall them without repeating the full
payload in every transcript.

- Automatic indexing is controlled by `contextIndexEnabled`, `contextIndexAutoMinChars`,
  `contextIndexAutoMinLines`, `contextIndexMaxEntryChars`, and `contextIndexReplaceLargeOutputs`.
- The default database path is `~/.mcp/fs-mcp.sqlite`.
- Text is chunked into 80-line chunks with 20-line overlap and searched through SQLite FTS.
- Manual indexing is available through `index_contexts`, `search_contexts`, `list_contexts`, and
  `clear_contexts`.
- Output compaction stores index references without replacing the original structured payload unless
  `contextIndexReplaceLargeOutputs` is enabled.

## Client Compatibility

- Client metadata is captured during initialization and exposed through `get_configs` as `currentClient`.
- Console and stdout filtering protect MCP JSON-RPC stdio from accidental process output.
- Notifications are suppressed for clients known to be sensitive to server-side JSON-RPC notifications, including
  Cline, VS Code, and Claude Dev.
- Resource and resource-template list handlers return empty lists so clients that probe resources during
  initialization can complete cleanly.

## Repository Structure

```text
project root/
|-- src/
|   |-- assets/       shared readers, type declarations, and cross-domain utilities
|   |-- controllers/  MCP request handlers and batch response helpers
|   |-- cores/        runtime, transport, server assembly, and response normalization
|   |-- features/     config, context, edit, filesystem, git, process, and search behavior
|   |-- schemas/      request argument validation schemas
|   `-- tools/        tool catalog entries and dispatcher
|-- tests/            contract tests, smoke tests, fixtures, and verification scripts
`-- out/              compiled runtime published to npm
```

## Response Shape

Every dispatched tool result is normalized by `src/cores/responses/responses-tool-result.ts`.

- Visible `content[0].text` uses the display template from
  `src/cores/responses/responses-tool-display.ts`, with `tool`, `count`, `status`, `duration`,
  `contents`, and `structuredText` labels.
- `structuredContent` stores the standard machine-readable envelope: original content, combined text, original
  structured payload, status, duration, error details, schema version, tool name, and optional context-index
  references.
- `_meta.fsMcpResult` stores compact metadata for clients that only need status, duration, content types, and
  error text.
- Already normalized results are not wrapped again; only the visible display text is regenerated.

## Development

Current package scripts are intentionally small:

```bash
bun run swc
```

`bun run swc` builds `src` into `out`, rewrites aliases with `tsc-alias`, and renames `out/index.js` to
`out/index.mjs`. There is no top-level `verify` script in `package.json` in this version.

Contract and smoke tests live under `tests/` and can be run directly with Bun:

```bash
bun tests/run-all-tests.js
```

`tests/run-all-tests.js` rebuilds `out` unless `FS_MCP_SKIP_BUILD=1` is set. Verification helper scripts under
`tests/scripts/` check release shape, source boundaries, tool surface, and optimization reports when invoked
directly.

## Documentation

- English README: `README.md`
- Korean README: `readme-ko.md`
- English architecture: `architecture.md`
- Korean architecture: `architecture-ko.md`
- Changelog: `changelog.md`

## Packaging Notes

The npm package exposes the `fs-mcp` binary through `out/index.mjs`. Runtime version metadata is read from the
package root `package.json`. The package file allowlist includes `out`, release documentation, and changelog
files; source files, tests, fixtures, and local runtime artifacts remain development-only surfaces.
