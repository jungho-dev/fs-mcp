# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for local filesystem work,
process sessions, ripgrep-backed search, SQLite context indexing, runtime configuration, git workflows,
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
- Git tools for repository setup, status, diff, history, branch, checkout, stash, tag, worktree, remotes,
  changelog analysis, fetch, pull, push, merge, rebase, and cherry-pick workflows.
- Context index tools that store, search, list, and clear large text payloads in the shared SQLite context database.
- Runtime configuration tools for command policy, shell selection, allowed directories, context-index thresholds,
  client metadata, version data, and system information.

## Tool Surface

The current tool catalog exposes 53 tools.

- Config: `get_configs`, `set_config_values`.
- Context: `index_contexts`, `search_contexts`, `list_contexts`, `clear_contexts`.
- Filesystem/search/edit: `read_files`, `write_files`, `create_directories`, `list_directories`,
  `move_files`, `rename_files`, `remove_files`, `start_searches`, `get_search_results`,
  `stop_searches`, `list_searches`, `get_file_infos`, `edit_blocks`.
- Process: `start_processes`, `read_process_outputs`, `interact_with_processes`, `list_sessions`,
  `list_processes`, `kill_processes`.
- Git: `git_add`, `git_blame`, `git_branch`, `git_changelog_analyze`, `git_checkout`,
  `git_cherry_pick`, `git_clean`, `git_clear_working_dir`, `git_clone`, `git_commit`, `git_diff`,
  `git_fetch`, `git_init`, `git_log`, `git_merge`, `git_pull`, `git_push`, `git_rebase`,
  `git_reflog`, `git_remote`, `git_reset`, `git_set_working_dir`, `git_show`, `git_stash`,
  `git_status`, `git_tag`, `git_worktree`, `git_wrapup_instructions`.

## Context Indexing

Large tool outputs can be indexed into SQLite so clients can search or recall them without repeating the full
payload in every transcript.

- Automatic indexing is controlled by `contextIndexEnabled`, `contextIndexAutoMinChars`,
  `contextIndexAutoMinLines`, and `contextIndexMaxEntryChars`.
- The default database path is `~/.mcp/fs-mcp.sqlite`.
- Manual indexing is available through `index_contexts`, `search_contexts`, `list_contexts`, and
  `clear_contexts`.
- Output compaction stores index references without replacing the original structured payload.

## Client Compatibility

- Client metadata is captured during initialization and exposed through `get_configs` as `currentClient`.
- Known client home names include Codex, Claude, Cline, Cursor, Windsurf, Roo, and VS Code.
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
  `src/cores/responses/responses-tool-display.ts`, showing tool name, status, item count, context-index count,
  and text or structured payload sizes.
- `structuredContent` keeps the normalized machine-readable envelope with original content, original structured
  payload, status, duration, and optional context-index references.
- `_meta.fsMcpResult` stores compact metadata for clients that only need status, duration, content types, and
  error text.
- Large output indexing adds `contextIndexes` references instead of replacing the original structured payload.

## Development

Current package scripts are intentionally small:

```bash
bun run verify
```

`bun run verify` runs TypeScript checking with `tsc --noEmit`. Contract and smoke tests live under `tests/`
and can be run directly with Bun when needed:

```bash
bun tests/run-all-tests.js
```

Verification helper scripts under `tests/scripts/` check release shape, source boundaries, tool surface, and
optimization reports when invoked directly.

## Documentation

- English README: `readme.md`
- Korean README: `readme-ko.md`
- English architecture: `architecture.md`
- Korean architecture: `architecture-ko.md`
- Changelog: `changelog.md`

## Packaging Notes

The npm package exposes the `fs-mcp` binary through `out/index.mjs`. Runtime version metadata is read from the
package root `package.json`. The package file allowlist includes `out`, release documentation, and changelog
files; source files, tests, fixtures, and local runtime artifacts remain development-only surfaces.
