# fs-mcp Architecture

## Runtime Flow

```text
MCP stdio client
  -> out/index.mjs
  -> src/index.mts
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

- `src/cores` owns process bootstrap, stdio transport, global output capture, server assembly, and response
  normalization.
- `src/tools`, `src/schemas`, `src/controllers`, and `src/cores/responses` own the MCP-facing catalog,
  validation, routing, handler adaptation, and normalized tool result envelope.
- `src/features` owns domain behavior and must not import from `src/controllers`.
- `src/assets` owns shared readers, type declarations, and small cross-domain utilities.
- `tests` validates compiled `out` output instead of importing TypeScript source directly.

## Source Tree

```text
src/
|-- index.mts
|-- assets/
|   |-- readers/
|   |-- type/
|   `-- utils/
|-- controllers/
|-- cores/
|   |-- responses/
|   |-- runtime/
|   |-- server/
|   `-- transport/
|-- features/
|   |-- config/
|   |-- edit/
|   |-- filesystem/
|   |-- git/
|   |-- process/
|   `-- search/
|-- schemas/
`-- tools/
```

## Dependency Rules

```text
cores/server -> tools
cores/server -> cores/responses
tools -> schemas
tools -> controllers
controllers -> schemas
controllers -> features
controllers -> cores/responses
features -> assets
cores/responses -> assets
tests -> out
```

Feature modules can share behavior through sibling feature utilities, such as
`features/filesystem/filesystem-path-resolver.ts`. They should not import controller modules, because controllers
are MCP adapters and not reusable domain services.

## Tool Response Contract

- Individual handlers return `ServerResult` values with `content`, optional `structuredContent`, optional
  `isError`, and optional `_meta`.
- `dispatchToolCall` normalizes every non-normalized handler result exactly once through
  `normalizeToolResult`.
- The visible `content[0].text` is intentionally empty so transcripts show only the tool call.
- `structuredContent.data` stores the normalized text, content array, and original structured payload for clients
  that need machine-readable result data.
- `createBatchToolResponse` summarizes each batch item and compacts large nested input fields such as `content`,
  `old_string`, `new_string`, `textContent`, `imageData`, and `listing`.
- Batch item results with large structured text or image payloads keep the original structured payload, but their
  nested display text is reduced to a short preview.

## VS Code and Visual Studio Compatibility

- `FilteredStdioServerTransport` captures accidental console output so MCP JSON-RPC stays isolated on stdio.
- Client-specific configuration suppresses notifications for Cline, VS Code, and Claude Dev style clients.
- The server registers no-op resource and resource-template handlers so Visual Studio initialization can complete
  even when the package has no MCP resources to expose.
- Search uses bundled `@vscode/ripgrep` first and falls back to system ripgrep when needed.

## Performance and Safety Design

- File operations use configured line limits and timeout boundaries from the filesystem feature layer.
- Text reading uses offset and length inputs so clients can request bounded slices instead of whole files.
- Search execution is delegated to ripgrep through `features/search/search-ripgrep-adapter.ts`.
- Stdio transport captures accidental stdout and stderr writes before they can corrupt MCP JSON output.
- Batch responses reduce repeated large payloads before they enter normalized tool output.
- Tests exercise the compiled `out` tree, which is the same surface published to npm.
- `verify:tools` compares the compiled tool catalog and dispatcher registry.
- `verify:source` protects the optimized `src` and `tests` root boundaries.
- Optimization reports are accumulated under `.docs` and checked by `verify:reports`.

## Packaging Boundary

The published package exposes `fs-mcp` through `out/index.mjs` and includes release documentation. Source files,
tests, generated fixtures, and local build caches are not runtime package inputs.
