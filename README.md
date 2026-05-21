# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for local filesystem work,
process sessions, ripgrep-backed search, runtime configuration, git session workflows, and exact block editing.

This package is the MCP server runtime. It is not a VS Code extension bundle and does not depend on one
specific AI client. Codex, Claude, Cline, Roo, Cursor, Windsurf, VS Code MCP clients, and other MCP-capable
clients can launch it through stdio.

The current runtime does not include a SQLite sidecar, context-index store, or MCP resource catalog.

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

- Filesystem tools for batched read, write, listing, metadata, directory creation, move, and removal.
- Exact edit tools for one or many block replacements with optional path-backed large string inputs.
- Search tools backed by bundled `@vscode/ripgrep`, direct regex searches, active search sessions, pagination,
  stop controls, and optional DOCX text extraction for content searches.
- Process tools for command sessions, process output, interactive input, session listing, and process termination.
- Git session tools for pinned repository state, status, diff, show, staging, and commit.
- Runtime configuration tools for command policy, shell selection, allowed directories, client metadata, version data,
  and system information.

## Tool Surface

The current source and compiled runtime expose 27 tools. Batch-capable tools are documented as batch-first
surfaces: when a task needs multiple same-kind filesystem, search, process, or config operations,
clients should put all items into one tool call instead of repeatedly calling the same tool.

- Config: `get_configs`, `set_config_values`.
- Filesystem/search/edit: `read_files`, `read_files_with_linenumber`, `write_files`, `create_directories`,
  `list_directories`,
  `copy_files`, `move_files`, `remove_files`, `start_searches`, `regex_searches`, `get_full_search`,
  `stop_searches`, `get_file_infos`, `edit_blocks`.
- Process: `start_processes`, `read_process_outputs`, `interact_with_processes`, `list_sessions`,
  `kill_processes`.
- Git: `git_set_working_dir`, `git_status`, `git_diff`, `git_show`, `git_add`, `git_commit`.

`src/schemas/schemas-git.ts` defines schemas for additional git operations, but `src/tools/tools-git.ts`
exports only `ESSENTIAL_GIT_TOOL_NAMES` in this version.

The public tool catalog is assembled from config, filesystem, process, and git modules only.

## Runtime Notes

Current compiled catalog metrics:

- Tool count: `27`.
- `list_tools` payload: measured by the tool-surface verification script.
- Tool descriptions: measured by the tool-surface verification script.
- Tool schemas: measured by the tool-surface verification script.

Runtime behavior keeps tool results faithful to handler output:

- Tool catalogs are built once and schema conversion is lazy-cached.
- Large duplicate text is no longer automatically compacted; clients receive the full normalized payload.
- Search sessions have no implicit `maxResults` cap. Set `maxResults` explicitly when a bounded scan is required.
- Process sessions keep larger in-memory output windows for active and completed sessions.

## Runtime Configuration

- Runtime configuration is in-memory only; the current server does not create a first-run config file.
- Editable keys are `allowedDirectories`, `blockedCommands`, and `defaultShell`.
- Read-only query keys exposed by `get_configs` are `availableShells`, `currentClient`, `systemInfo`,
  and `version`.

## Batch-First Tool Use

`SERVER_INSTRUCTIONS` and batch-capable tool descriptions both tell clients to prefer one multi-item call over
repeated same-tool calls. This applies to:

- File and directory operations through `paths` or `items` arrays.
- Search work through `regex_searches.items`, `start_searches.items`, `get_full_search.items`, or
  `stop_searches.sessionIds`.
- Process operations through `items` or `pids`.
- Configuration operations through `items`.

Large multi-item arguments can be moved into a UTF-8 JSON file and passed with `args_path`, keeping the tool-call
preview compact while preserving one batch request. Inline overrides are merged on top of the JSON object.

`read_files`, `read_files_with_linenumber`, `list_directories`, and `get_file_infos` also accept
`allowMissing=true` to return missing local paths
as non-error missing results during exploratory candidate reads.

## Client Compatibility

- Client metadata is captured during initialization and exposed through `get_configs` as `currentClient`.
- Console and stdout filtering protect MCP JSON-RPC stdio from accidental process output.
- Agent compatibility is scoped to Claude, Codex, Gemini CLI, and GitHub Copilot. Gemini CLI and Copilot suppress
  server-side JSON-RPC notifications; Claude and Codex keep the standard notification flow.
- Resource and resource-template list handlers return empty lists so clients that probe resources during
  initialization can complete cleanly.

## Repository Structure

```text
project root/
|-- src/
|   |-- assets/       shared readers, type declarations, and cross-domain utilities
|   |-- controllers/  MCP request handlers and batch response helpers
|   |-- cores/        runtime, transport, server assembly, and response normalization
|   |-- features/     config, edit, filesystem, git, process, and search behavior
|   |-- schemas/      request argument validation schemas
|   `-- tools/        tool catalog entries and dispatcher
|-- tests/            contract tests, smoke tests, fixtures, and verification scripts
`-- out/              compiled runtime published to npm
```

## Response Shape

Every dispatched tool result is normalized by `src/cores/responses/responses-tool-result.ts`.

- Visible `content[0].text` uses the display template from
  `src/cores/responses/responses-tool-display.ts`. The default rows are `tool`, `items`, `status`,
  `tokens`, `duration`, `contents`, and `structuredText`. `tokens` uses the `o200k_base` tokenizer for
  the visible combined text plus serialized structured content and includes a `token` unit.
- `structuredContent` stores the standard machine-readable envelope: original content, combined text, original
  structured payload, status, duration, error details, schema version, and tool name.
- `_meta.fsMcpResult` stores compact metadata for clients that only need status, duration, content types, and
  error text.
- Already normalized results are not wrapped again; only the visible display text is regenerated.

Search session responses can also report pagination and scan state such as `nextOffset`, `wasLimited`, and
`wasIncomplete` when the underlying scan hit access restrictions.

## Development

Current package scripts route through the local bootstrap helper:

```bash
bun run swc
bun run sync
bun run tools
```

Contract and smoke tests live under `tests/` and can be run directly with Bun:

```bash
bun tests/run-all-tests.js
```

`tests/run-all-tests.js` rebuilds `out` unless `FS_MCP_SKIP_BUILD=1` is set. Verification helper scripts under
`tests/scripts/` check release shape, source boundaries, and tool surface when invoked directly.

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
