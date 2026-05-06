# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for filesystem work, local process
sessions, ripgrep-backed search, runtime configuration, git workflows, and surgical file editing.

This package is not a VS Code extension bundle. It is the MCP server that VS Code MCP clients, such as Cline,
Claude Dev, or other MCP-capable extensions, launch through stdio.

## VS Code Extension Usage

Install the package globally:

```bash
npm install -g @jungho-dev/fs-mcp
```

Or install with Bun:

```bash
bun add -g @jungho-dev/fs-mcp
```

Add the server to the MCP configuration used by your VS Code extension:

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

If the extension cannot resolve global binaries, set `command` to the absolute `fs-mcp` executable path.
The server uses stdio only and does not open a network listener.

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

- Filesystem tools for reading, writing, listing, moving, renaming, and inspecting files.
- Batch filesystem tools with compact result previews to avoid duplicating large payloads in extension output.
- Process tools for starting commands, reading output, interacting with sessions, and killing processes.
- Search tools backed by `@vscode/ripgrep` with pagination, session listing, and stop controls.
- Edit tools for exact block edits, fuzzy diagnostics, and preview-oriented edit responses.
- Git tools for repository status, history, branch, stash, tag, worktree, and remote operations.
- Runtime configuration tools for command policy, shell selection, allowed directories, and system information.

## Client Compatibility

- VS Code-oriented clients are detected by client metadata or client name.
- Notifications are suppressed for Cline, VS Code, and Claude Dev style clients to keep stdio JSON-RPC clean.
- Resource and resource-template list handlers return empty lists so Visual Studio initialization succeeds.
- File previews include structured metadata for text, markdown, HTML, image, and directory responses.

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
`-- tests/            compiled-output contract and smoke tests
```

## Response Shape

Every dispatched tool result is normalized by `src/cores/responses/responses-tool-result.ts`.
The visible `content[0].text` is intentionally empty so chat and extension transcripts show only the tool call.
The structured payload keeps machine-readable data, while batch helpers compact large nested inputs and duplicate
text payloads before they are embedded in batch results.

## Development

```bash
bun run typecheck
bun run build
bun run test
```

`bun run verify` runs type checking, build, source-boundary checks, package-shape checks, tool-surface checks,
optimization-report checks, and the test suite.

## Documentation

- English README: `readme.md`
- Korean README: `readme-ko.md`
- English architecture: `architecture.md`
- Korean architecture: `architecture-ko.md`

## Packaging Notes

The npm package exposes the `fs-mcp` binary through `out/index.mjs`. Source files, tests, fixtures, and local
runtime artifacts remain development-only surfaces.
