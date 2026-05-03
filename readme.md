# @jungho-dev/fs-mcp

## Overview

`@jungho-dev/fs-mcp` is a stdio-based Model Context Protocol server for local command execution, filesystem access, code search, configuration management, and surgical file editing.

The current source layout is feature-oriented. MCP transport and tool registration live in `src/app` and `src/mcp`, while domain behavior lives under `src/features`.

## Install

```bash
npm install -g @jungho-dev/fs-mcp
```

```bash
bun add -g @jungho-dev/fs-mcp
```

## MCP Client Configuration

```json
{
  "mcpServers": {
    "fs-mcp": {
      "command": "fs-mcp"
    }
  }
}
```

### Codex Configuration

Add this server to `C:/Users/jungh/.codex/config.toml` when the package is installed globally with Bun.

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

## Main Capabilities

* Filesystem tools for reading, writing, listing, moving, and inspecting files.
* Process tools for starting commands, reading output, and managing sessions.
* Search tools backed by ripgrep with result pagination.
* Edit tools for exact and fuzzy search/replace operations.
* Runtime configuration tools for command policy and filesystem access boundaries.

## Development

```bash
bun install
bun run check
bun run build
bun run test:contract
bun run test
bun run verify:source
bun run verify:shape
bun run verify:tools
bun run verify
npm pack --dry-run
```

## Repository Structure

```text
src/
|-- app/        runtime bootstrap, MCP server factory, stdio transport
|-- assets/     shared type declarations and cross-feature utilities
|-- features/   config, edit, filesystem, history, process, and search behavior
|-- mcp/        tool catalog, dispatcher, controllers, request schemas, and response adapters
`-- tests/      build-backed smoke and integration tests
```

## Naming Contract

* Source and test filenames use kebab-case, for example `filesystem-controller.ts`.
* Shared type definitions live under `src/assets/type`.
* Korean companion documents use kebab-case names: `readme-ko.md` and `architecture-ko.md`.

## Documentation

* English README: `readme.md`
* Korean README: `readme-ko.md`
* English architecture: `architecture.md`
* Korean architecture: `architecture-ko.md`

## Packaging Notes

The npm package exposes the `fs-mcp` binary through `out/index.mjs`. Source files, tests, fixtures, and local runtime artifacts remain development-only surfaces.

`bun run verify:source` confirms the optimized source boundary and removed runtime helpers stay out of executable text surfaces. `bun run verify:shape` confirms that root `src` and `out` exist, `dist` is absent, and generated `.map` or `.d.ts` artifacts are not present outside dependencies. `bun run verify:tools` confirms that the compiled tool catalog and dispatcher registry expose the same tool names.
