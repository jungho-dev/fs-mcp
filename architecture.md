# fs-mcp Architecture

## Runtime Flow

```text
MCP stdio client
  -> out/index.mjs
  -> src/index.mts
  -> src/app/server/create-mcp-server.mts
  -> src/mcp/tools/tool-catalog.mts for list_tools
  -> src/mcp/tools/tool-call-dispatcher.mts for call_tool
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
|-- index.mts
|-- app/
|   |-- runtime/
|   |   |-- app-logger.mts
|   |   |-- output-capture.mts
|   |   |-- runtime-info.mts
|   |   `-- version.mts
|   |-- server/
|   |   `-- create-mcp-server.mts
|   `-- transport/
|       `-- stdio-transport.mts
|-- assets/
|   |-- type/
|   |   `-- common-types.mts
|   `-- utils/
|       `-- timeout.mts
|-- features/
|   |-- config/
|   |   |-- config-metadata.mts
|   |   |-- config-paths.mts
|   |   |-- config-service.mts
|   |   `-- config-store.mts
|   |-- edit/
|   |   |-- edit-service.mts
|   |   `-- line-ending-policy.mts
|   |-- filesystem/
|   |   |-- filesystem-limits.mts
|   |   |-- filesystem-service.mts
|   |   |-- mime-registry.mts
|   |   |-- path-resolver.mts
|   |   `-- readers/
|   |       |-- base.mts
|   |       |-- binary-reader.mts
|   |       |-- docx-reader.mts
|   |       |-- image-reader.mts
|   |       |-- index.mts
|   |       |-- preview-file-types.mts
|   |       |-- reader-factory.mts
|   |       `-- text-reader.mts
|   |-- process/
|   |   |-- command-policy.mts
|   |   |-- process-runner.mts
|   |   |-- process-service.mts
|   |   |-- repl-detector.mts
|   |   `-- terminal-service.mts
|   `-- search/
|       |-- fuzzy-matcher.mts
|       |-- ripgrep-adapter.mts
|       |-- search-log.mts
|       `-- search-service.mts
|-- mcp/
|   |-- controllers/
|   |   |-- edit-controller.mts
|   |   |-- filesystem-controller.mts
|   |   |-- index.mts
|   |   |-- process-controller.mts
|   |   |-- search-controller.mts
|   |   `-- terminal-controller.mts
|   |-- responses/
|   |   |-- error-response.mts
|   |   `-- tool-result-response.mts
|   |-- schemas/
|   |   |-- config-schema.mts
|   |   |-- edit-schema.mts
|   |   |-- filesystem-schema.mts
|   |   |-- index.mts
|   |   |-- process-schema.mts
|   |   `-- search-schema.mts
|   `-- tools/
|       |-- index.mts
|       |-- tool-catalog.mts
|       `-- tool-call-dispatcher.mts
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

Feature modules can share behavior through sibling feature utilities, such as `features/filesystem/path-resolver.mts`. They should not import controller modules, because controllers are MCP adapters and not reusable domain services.

## Performance and Safety Design

* File operations use explicit timeout boundaries from `features/filesystem/filesystem-limits.mts`.
* Text reading uses size and offset thresholds to avoid full-file reads when a bounded slice is enough.
* Search execution is delegated to ripgrep through `features/search/ripgrep-adapter.mts`.
* Stdio transport captures accidental stdout/stderr writes so MCP JSON output remains isolated.
* Tests exercise the compiled `out` tree, which is the same surface published to npm.
* `verify:tools` compares the compiled tool catalog and dispatcher registry.
* `verify:source` protects the optimized `src` and `tests` root boundaries and checks runtime text surfaces for removed platform helpers.
* Optimization reports are accumulated under `.docs` and checked by `verify:reports`.

## Packaging Boundary

The published package exposes `fs-mcp` through `out/index.mjs` and includes release documentation. Source files, tests, generated fixtures, and local build caches are not runtime package inputs.
