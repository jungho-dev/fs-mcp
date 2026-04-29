# @jungho/mcp-commander

## Overview

`@jungho/mcp-commander` is a stdio-based MCP server for filesystem access, process execution, search,
configuration management, and surgical file editing.

## Install

```bash
npm install -g @jungho/mcp-commander
```

## Usage

Use the published CLI name in your MCP client configuration.

```json
{
  "mcpServers": {
    "desktop-commander": {
      "command": "mcp-commander"
    }
  }
}
```

## Local Development

* `bun run build` compiles the TypeScript server to `dist/`.
* `bun run check` runs the TypeScript contract check without emitting files.
* `bun run test` rebuilds the project and runs the integration-style test runner.
* `npm pack --dry-run` validates the publish tarball surface.

## Repository Structure

* `src/config/` contains persisted configuration contracts and loaders.
* `src/core/` contains server bootstrap, stdio transport, and shared command coordination.
* `src/handlers/` maps MCP tool requests onto runtime tool implementations.
* `src/tools/` contains the main filesystem, process, search, and edit tool behavior.
* `src/utils/` contains shared helpers, including file format readers and process utilities.
* `src/tests/` contains the build-backed integration and smoke tests used before release.

## Packaging Notes

* The published package ships the compiled `dist/` runtime plus release docs.
* Source files, test fixtures, and local runtime artifacts stay outside the npm tarball.
