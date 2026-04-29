# commander Architecture

## Structure Map

```text
commander
|-- src/
|   |-- config/          -> persisted config schema and loader
|   |-- core/            -> server bootstrap, stdio transport, runtime coordination
|   |-- handlers/        -> MCP request handlers
|   |-- tools/           -> filesystem, process, search, and edit tool logic
|   |-- types/           -> local type declarations
|   |-- utils/           -> shared helpers and file readers
|   `-- tests/           -> build-backed integration and smoke tests
|-- dist/                -> generated publish/runtime output
|-- tsconfig.paths.json  -> shared source and emit contract
`-- package.json         -> package metadata, release scripts, and CLI contract
```

## Flow Map

```text
MCP stdio client
  -> dist/index.mjs
  -> src/core/server.mts
  -> src/handlers/*
  -> src/tools/* or src/utils/*
  -> structured MCP tool result
```

## Packaging Boundary

* The npm package exposes `mcp-commander` through `dist/index.mjs`.
* Only compiled runtime output and release docs are included in the published tarball.
* Source files, tests, and local build caches remain development-only surfaces.
