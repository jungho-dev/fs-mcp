# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for local filesystem work,
process sessions, ripgrep-backed search, SQLite context indexing, runtime configuration, git workflows,
and exact block editing.

This package is the MCP server runtime. It is not a VS Code extension bundle. VS Code MCP clients such as
Cline, Claude Dev, Roo, or other MCP-capable extensions launch it through stdio.

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

Add the server to the MCP configuration used by your client:

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

If the client cannot resolve global binaries, set `command` to the absolute `fs-mcp` executable path.
The server uses stdio and does not open a network listener.

## Codex Configuration

Add this server to `~/.codex/config.toml` when the package is installed globally:

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

## Main Capabilities

- Filesystem tools for batched read, write, listing, metadata, directory creation, move, rename, and removal.
- Exact edit tools for one or many block replacements with optional path-backed large string inputs.
- Search tools backed by bundled `@vscode/ripgrep`, active search sessions, pagination, and stop controls.
- Process tools for starting commands, reading output, sending input, listing sessions, listing processes, and
  killing processes.
- Git tools for status, diff, history, branch, checkout, stash, tag, worktree, remote, fetch, pull, push,
  merge, rebase, cherry-pick, and repository setup workflows.
- Context index tools that store, search, list, and clear large text payloads in the shared SQLite context database.
- Runtime configuration tools for command policy, shell selection, allowed directories, context-index thresholds,
  client metadata, and system information.

## Context Indexing

Large tool outputs can be indexed into SQLite so clients can search or recall them without repeating the full
payload in every transcript.

- Automatic indexing is controlled by `contextIndexEnabled`, `contextIndexAutoMinChars`,
  `contextIndexAutoMinLines`, and `contextIndexMaxEntryChars`.
- The default database path is `~/.mcp/fs-mcp.sqlite`.
- Manual indexing is available through `index_contexts`, `search_contexts`, `list_contexts`, and
  `clear_contexts`.

## Client Compatibility

- Client metadata is captured during initialization for client compatibility behavior.
- Notifications are suppressed for Cline, VS Code, Claude Dev, Roo, and similar clients when needed to keep
  stdio JSON-RPC clean.
- Resource and resource-template list handlers return empty lists so Visual Studio-style initialization succeeds.
- File previews include structured metadata for text, markdown, HTML, image, and directory responses.

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
|-- tests/            compiled-output contract and smoke tests
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

```bash
bun run verify:source
bun run build
bun run test
bun run verify
```

`bun run verify` runs source type checking, release-shape checks, tool-surface checks, and optimization-report
checks. Run `bun run test` separately for the smoke and contract test suite.

## Documentation

- English README: `readme.md`
- Korean README: `readme-ko.md`
- English architecture: `architecture.md`
- Korean architecture: `architecture-ko.md`
- Changelog: `changelog.md`

## Packaging Notes

The npm package exposes the `fs-mcp` binary through `out/index.mjs`. Runtime version metadata is read from the
package root `package.json`, and source files, tests, fixtures, and local runtime artifacts remain
development-only surfaces.
