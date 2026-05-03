# fs-mcp Architecture

## Runtime Flow

```text
MCP stdio client
  -> out/index.js
  -> src/index.ts
  -> src/cores/server/server-run-mcp-server.ts
  -> src/cores/server/server-create-mcp-server.ts
  -> src/tools/tools-*.ts for list_tools
  -> src/tools/tools-dispatcher.ts for call_tool
  -> src/schemas/*
  -> src/controllers/*
  -> src/features/*
  -> src/cores/responses/*
```

## Layer Boundaries

* `src/cores` owns process bootstrap, stdio transport, global error handling, and server assembly.
* `src/tools`, `src/schemas`, `src/controllers`, and `src/cores/responses` own the MCP-facing catalog, validation, routing, and normalization surface.
* `src/features` owns domain behavior and must not import from `src/controllers`.
* `src/assets` owns shared readers, type declarations, and small cross-domain utilities.
* `tests` validates compiled `out` output instead of importing source files directly.

## Source Tree

```text
src/
|-- index.ts
|-- app/
|   |-- runtime/
|   |-- server/
|   `-- transport/
|-- assets/
|   |-- readers/
|   |-- type/
|   `-- utils/
|-- controllers/
|-- domains/
|   |-- config/
|   |-- edit/
|   |-- filesystem/
|   |-- process/
|   `-- search/
|-- responses/
|-- schemas/
`-- tools/
```

## Dependency Rules

```text
app -> tools
app -> responses
tools -> schemas
tools -> controllers
controllers -> schemas
controllers -> domains
domains -> assets
responses -> assets
tests -> out
```

Domain modules can share behavior through sibling domain utilities, such as `domains/filesystem/filesystem-path-resolver.ts`. They should not import controller modules, because controllers are MCP adapters and not reusable domain services.

## Performance and Safety Design

* File operations use explicit timeout boundaries from `domains/filesystem/filesystem-limits.ts`.
* Text reading uses size and offset thresholds to avoid full-file reads when a bounded slice is enough.
* Search execution is delegated to ripgrep through `domains/search/search-ripgrep-adapter.ts`.
* Stdio transport captures accidental stdout/stderr writes so MCP JSON output remains isolated.
* Tests exercise the compiled `out` tree, which is the same surface published to npm.
* `verify:tools` compares the compiled tool catalog and dispatcher registry.
* `verify:source` protects the optimized `src` and `tests` root boundaries and checks runtime text surfaces for removed platform helpers.
* Optimization reports are accumulated under `.docs` and checked by `verify:reports`.

## Packaging Boundary

The published package exposes `fs-mcp` through `out/index.js` and includes release documentation. Source files, tests, generated fixtures, and local build caches are not runtime package inputs.
