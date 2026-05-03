# fs-mcp Architecture

## Runtime Flow

```text
MCP stdio client
  -> out/index.mjs
  -> src/index.ts
  -> src/app/server/create-mcp-server.ts
  -> src/mcp/tools/tool-catalog.ts for list_tools
  -> src/mcp/tools/tool-call-dispatcher.ts for call_tool
  -> src/mcp/controllers/*
  -> src/features/*
  -> MCP content and structuredContent response
```

## Layer Boundaries

* `src/app` owns process bootstrap, stdio transport, global error handling, and server assembly.
* `src/mcp` owns MCP-facing schemas, tool routing, controllers, and response adapters.
* `src/features` owns domain behavior and must not import from `src/mcp/controllers`.
* `src/assets` owns shared type declarations and small cross-feature utilities.
* `tests` validates compiled `out` output instead of importing source files directly.

## Optimized Source Tree

```text
src/
|-- index.ts
|-- app/
|   |-- runtime/
|   |   |-- app-logger.ts
|   |   |-- output-capture.ts
|   |   |-- runtime-info.ts
|   |   `-- version.ts
|   |-- server/
|   |   `-- create-mcp-server.ts
|   `-- transport/
|       `-- stdio-transport.ts
|-- assets/
|   |-- type/
|   |   `-- common-types.ts
|   `-- utils/
|       `-- timeout.ts
|-- features/
|   |-- config/
|   |   |-- config-metadata.ts
|   |   |-- config-paths.ts
|   |   |-- config-service.ts
|   |   `-- config-store.ts
|   |-- edit/
|   |   |-- edit-service.ts
|   |   `-- line-ending-policy.ts
|   |-- filesystem/
|   |   |-- filesystem-limits.ts
|   |   |-- filesystem-service.ts
|   |   |-- mime-registry.ts
|   |   |-- path-resolver.ts
|   |   `-- readers/
|   |       |-- base.ts
|   |       |-- binary-reader.ts
|   |       |-- docx-reader.ts
|   |       |-- image-reader.ts
|   |       |-- index.ts
|   |       |-- preview-file-types.ts
|   |       |-- reader-factory.ts
|   |       `-- text-reader.ts
|   |-- process/
|   |   |-- command-policy.ts
|   |   |-- process-runner.ts
|   |   |-- process-service.ts
|   |   |-- repl-detector.ts
|   |   `-- terminal-service.ts
|   `-- search/
|       |-- fuzzy-matcher.ts
|       |-- ripgrep-adapter.ts
|       |-- search-log.ts
|       `-- search-service.ts
|-- mcp/
|   |-- controllers/
|   |   |-- edit-controller.ts
|   |   |-- filesystem-controller.ts
|   |   |-- index.ts
|   |   |-- process-controller.ts
|   |   |-- search-controller.ts
|   |   `-- terminal-controller.ts
|   |-- responses/
|   |   |-- error-response.ts
|   |   `-- tool-result-response.ts
|   |-- schemas/
|   |   |-- config-schema.ts
|   |   |-- edit-schema.ts
|   |   |-- filesystem-schema.ts
|   |   |-- index.ts
|   |   |-- process-schema.ts
|   |   `-- search-schema.ts
|   `-- tools/
|       |-- index.ts
|       |-- tool-catalog.ts
|       `-- tool-call-dispatcher.ts
tests/
|-- run-all-tests.js
|-- config/
|-- contracts/
|-- edit/
|-- examples/
|-- filesystem/
|-- fixtures/
|   |-- edit/
|   |-- output/
|   `-- search/
|-- process/
|-- scripts/
|   |-- verify-optimization-reports.mjs
|   |-- verify-release-shape.mjs
|   |-- verify-source-boundaries.mjs
|   `-- verify-tool-surface.mjs
|-- search/
`-- security/
```

## Dependency Rules

```text
app -> mcp/tools -> mcp/controllers -> features -> assets
app -> features
mcp -> assets
tests -> out
```

Feature modules can share behavior through sibling feature utilities, such as `features/filesystem/path-resolver.ts`. They should not import controller modules, because controllers are MCP adapters and not reusable domain services.

## Performance and Safety Design

* File operations use explicit timeout boundaries from `features/filesystem/filesystem-limits.ts`.
* Text reading uses size and offset thresholds to avoid full-file reads when a bounded slice is enough.
* Search execution is delegated to ripgrep through `features/search/ripgrep-adapter.ts`.
* Stdio transport captures accidental stdout/stderr writes so MCP JSON output remains isolated.
* Tests exercise the compiled `out` tree, which is the same surface published to npm.
* `verify:tools` compares the compiled tool catalog and dispatcher registry.
* `verify:source` protects the optimized `src` and `tests` root boundaries and checks runtime text surfaces for removed platform helpers.
* Optimization reports are accumulated under `.docs` and checked by `verify:reports`.

## Packaging Boundary

The published package exposes `fs-mcp` through `out/index.mjs` and includes release documentation. Source files, tests, generated fixtures, and local build caches are not runtime package inputs.
