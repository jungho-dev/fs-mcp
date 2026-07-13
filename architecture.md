# fs-mcp Architecture

## Runtime Flow

```text
MCP stdio client
-> fs-mcp binary
-> out/index.mjs
-> src/index.mts
-> src/cores/server/server-run-mcp-server.ts
-> src/cores/server/server-create-mcp-server.ts
-> src/tools/tools-*.ts for list_tools
-> src/tools/tools-dispatcher.ts for call_tool
-> src/schemas/* for argument contracts
-> src/controllers/* for MCP adapters
-> src/features/* for domain behavior
-> src/cores/responses/* for normalized tool output
```

The published runtime is the compiled `out` tree. Tests validate that compiled surface instead of importing
TypeScript source directly.

## Layer Boundaries

- `src/cores` owns process bootstrap, stdio transport, server assembly, runtime guidance, client initialization,
  output filtering, and response normalization.
- `src/tools` owns public tool catalog entries and their descriptions, annotations, and schema wiring.
- `src/schemas` owns request argument contracts and `args_path` augmentation.
- `src/controllers` owns MCP handler adaptation, batch result shaping, and calls into feature services.
- `src/features` owns filesystem, edit, search, process, config, and git domain behavior.
- `src/assets` owns shared readers, type declarations, and cross-domain utilities.
- `tests` owns contract, smoke, fixture, and verification coverage for the compiled package surface.

Feature modules can share behavior through feature-level utilities, such as
`features/filesystem/filesystem-path-resolver.ts`. They should not import controller modules because controllers
are MCP adapters, not reusable domain services.

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
index -> cores/server
cores/server -> tools
cores/server -> cores/responses
cores/server -> features/config
cores/server -> features/git
tools -> schemas
tools -> controllers
controllers -> schemas
controllers -> features
controllers -> cores/responses
features -> assets
cores/responses -> assets
tests -> out
```

## Public Tool Assembly

`server-create-mcp-server.ts` builds one catalog from five modules. Config and process catalogs are currently empty:

| Module | Count | Public tools |
|--------|------:|--------------|
| `tools-config.ts` | 0 | none |
| `tools-filesystem.ts` | 13 | `file-read`, `file-read-line-range`, `file-write`, `dir-create`, `dir-list`, `path-copy`, `path-move`, `path-remove`, `fs-search`, `path-stat`, `file-edit`, `file-edit-lines`, `fs-inspect` |
| `tools-process.ts` | 0 | none |
| `tools-git.ts` | 7 | `git-set-workdir`, `git-status`, `git-diff`, `git-show`, `git-add`, `git-commit`, `git-amend` |
| `tools-web.ts` | 4 | `web-fetch`, `web-render`, `web-extract`, `download-to-file` |

Total public catalog size is `24` tools, matching the rust-fs-mcp surface. `tools/list` always returns the full catalog.

`tools-dispatcher.ts` owns the matching `call_tool` registry. The catalog and dispatcher must expose the same
names. `tests/scripts/scripts-verify-tool-surface.mjs` checks name equality, uniqueness, essential git filtering,
and shared `args_path` support.

Git schemas define a broader internal operation map, but `tools-git.ts` filters the public surface through the
essential git name list. The current public surface has no separate context-index, SQLite, MCP resource, config,
or process tool family.

## Request And Argument Flow

- `InitializeRequestSchema` captures client metadata, negotiates protocol version, and configures compatibility.
- `ListToolsRequestSchema` returns the concatenated catalog from config, filesystem/search/edit, process, and git.
- `CallToolRequestSchema` updates client metadata when present, enters the client git-session scope, and dispatches
  by tool name.
- `tools-dispatcher.ts` resolves `args_path`, `args_offset`, and `args_length` before schema-specific controller
  validation.
- Inline fields supplied beside `args_path` override fields from the referenced JSON object.
- Controllers validate the resolved arguments and call feature services.
- Feature services return `ServerResult` values, which the dispatcher normalizes before returning to the MCP client.

## Domain Behavior

### Filesystem And Edit

Filesystem tools are batch-first and path-oriented. Reads support `paths` for simple reads and `items` for offset,
length, URL, and options. Writes and edits support path-backed payload fields for large content. Directory listing,
metadata, and read tools can use `allowMissing=true` for exploratory candidate paths.

Exact block replacement lives in the edit feature and is exposed through `file-edit`. `file-edit-lines` replaces,
inserts (`after: true`), or deletes (empty replacement) an inclusive 1-based line range, detects and preserves the
file's dominant EOL (CRLF/LF), and can assert the file length through `expected_lines`. Items may target the same
file, so the batch runs sequentially.

### Inspect

`fs-inspect` is a read-only composite lookup tool for coding workflows. One call carries a `root` and a list of
requests, and each request dispatches on `op` (`count-files`, `search`, `json-pick`, `snippet`, `git-status`).
The `git-status` op delegates to the git feature's `git-status` execution so filesystem lookups and a git state
resolve in one round-trip. A per-call `maxSnippetChars` budget (default 6000) caps total evidence text and sets a
`truncated` flag on overflow. Each answer carries `id`, `op`, `status`, `value`, `confidence`, `evidence`, and
`warnings`, and the call result includes `scannedFiles`, `bytesRead`, `snippetChars`, and `truncated` metrics.

### Search

Search behavior is delegated to bundled `@vscode/ripgrep`, with system ripgrep as a fallback. `fs-search` runs
direct ripgrep-compatible content scans and waits for completion inside the call, so no session tools are exposed.

`fs-search` responses can expose `wasLimited` and `wasIncomplete`. A result cap applies only when callers provide
`maxResults`.

### Config

`config-store.ts` materializes in-memory defaults and runtime values. Config state still exists inside the runtime,
but no config operation is exported as a public MCP tool in this catalog.

### Process

No process operation is exported as a public MCP tool in this catalog. Process service modules can still contain
policy, session, terminal, and virtual-node behavior used by runtime boundaries.

### Git

Git calls run inside a client-scoped git session. `git-set-workdir` pins the working repository, `git-status` and
`git-diff` inspect state (`git-diff` supports `check` for whitespace/conflict-marker scans and rejects option-like
revisions), `git-show` reads one or many revisions through `objects[]` with optional `stat`, `git-add` stages
explicit paths (staging everything requires `all` or `update`), `git-commit` creates commits, and `git-amend`
rewrites HEAD (`--no-edit` message reuse, `resetAuthor`, HEAD precheck). Commit descriptions guide clients toward
English Conventional Commit messages. `git-commit` and `git-amend` always inject `-c user.name=fs-mcp` and
`-c user.email=fs-mcp@example.invalid` so commits work without local git config; a provided `author` object
overrides only the author through `--author`.

### Web

The web tier mirrors rust-fs-mcp: `web-fetch` is the TIER-1 native fetch path with a per-hop SSRF guard, manual
redirect checks, and a body-size cap; `web-render` shells out to the obscura headless browser for JS/SPA pages.
`evalScript` is disabled because it can bypass the SSRF guard.
`web-extract` converts already-held HTML into text, markdown, links, or readability main-content offline; and
`download-to-file` writes fetched bodies inside `allowedDirectories`. `file-read` with `isUrl` routes through the
same guarded fetch tier.

## Tool Response Contract

Individual handlers return `ServerResult` values with `content`, optional `structuredContent`, optional `isError`,
and optional `_meta`.

`dispatchToolCall` normalizes every non-normalized handler result exactly once through `normalizeToolResult`.

The normalized contract has three layers:

- Visible `content[0].text` from `createToolDisplayText`.
- Machine-readable `structuredContent` with schema version, tool name, status, duration, error detail, normalized
  content, and original structured payload.
- Compact `_meta.fsMcpResult` with status, duration, content types, error text, schema version, and tool name.

The fixed compact envelope keeps `data.content` as the single full-text source and omits the `data.text` copy.
Each per-item `result` carries only `structuredContent` and `isError`; body-copy keys
such as `textContent`/`listing` are dropped, and echoed `input` string values above 256 bytes are replaced with
`<N bytes elided>`. The body lives once in the batch text of full-mode tools (`file-read`,
`file-read-line-range`, `dir-list`, `fs-search`, `web-fetch`, `web-extract`, `download-to-file`).

The default display rows are `tool`, `items`, `status`, `duration`, `tokens`, `contents`, and `structuredText`.
The `tokens` row is a character-based estimate so large results do not load tokenizer vocabularies during response
normalization. Gemini clients receive the same display without ANSI escape sequences.

## Runtime Configuration

- Runtime configuration is in-memory only.
- Mutable keys are `allowedDirectories`, `blockedCommands`, and `defaultShell`.
- Runtime values are not seeded or overridden through project environment variables.
- Default shell selection prefers PowerShell 7 on Windows, then `ComSpec`, then system `cmd.exe`; non-Windows
  defaults use `$SHELL`, `/bin/zsh` on macOS, or `/bin/sh`.
- Current client state is tracked in `config-client.ts` and contributes to git-session scoping.

## MCP Client Compatibility

- `SERVER_INSTRUCTIONS` tells clients to use fs-mcp for local filesystem, process, git, and config work, with a
  batch-first rule for same-kind operations.
- `FilteredStdioServerTransport` captures accidental stdout and stderr writes so JSON-RPC remains isolated.
- Compatibility profiles cover Claude, Codex, Gemini CLI, and GitHub Copilot.
- Gemini CLI and GitHub Copilot disable server-side JSON-RPC notifications.
- Claude and Codex keep the standard notification flow.
- No-op resource and resource-template handlers let probing clients initialize even though no resources are exposed.

## Performance And Safety Design

- The full source catalog exposes `24` public tools; verify the compiled release surface after a build.
- Serialized catalog size is build-dependent, so measure the compiled `out` catalog before using it for token or latency comparisons.
- Tool catalogs are assembled once and input schema JSON is generated through lazy cache.
- Batch-capable tools accept arrays such as `paths` and `items`.
- Large inline arguments can be passed through `args_path` or specific path-backed fields.
- Batch summaries and duplicated normalized `content` slots preview large text while retaining the full body once in `data.content`.
- File operations use configured timeout boundaries and feature-layer path resolution.
- Stdio transport captures accidental output before it can corrupt MCP JSON output.
- Tests exercise the compiled `out` tree, which is the runtime surface published to npm.

Measured optimization data from `2026-05-24`:

| Measurement | Current result | Compared baseline | Design implication |
|-------------|----------------|-------------------|--------------------|
| `file-read` over 12 files, 4 KB each | `3.11 ms` average, `1.86 ms` median | Sequential PowerShell reads at `2,617.42 ms` average, `2,579.75 ms` median | Batch dispatch removes repeated process and tool-call overhead. |
| `file-write` 20 files, 4 KB each through `args_path` | `140` transport chars, `35` token est | Inline JSON payload at `82,911` chars, `20,728` token est | Path-backed arguments keep large payloads outside prompt-sized call arguments. |
| Normalizing one 128 KB text result | `498` visible chars and `817` duplicated content chars | Raw text body at `131,072` chars | The visible display stays compact while full text remains machine-readable. |

The benchmark commands are `bun tests/scripts/performance-benchmark.mjs` and
`bun tests/scripts/write-files-args-path-benchmark.mjs`. Token estimates use the local `4` characters per token
heuristic, so client-visible savings depend on how the MCP host forwards `content` and `structuredContent`.

## Verification Boundary

- `bun x tsc --noEmit` validates the source TypeScript contract.
- `bun tests/run-all-tests.js` runs contract and smoke tests.
- `tests/run-all-tests.js` rebuilds `out` before running contract and smoke tests.
- `tests/scripts/performance-benchmark.mjs` compares pure Bun reads, sequential shell reads, fs-mcp batch reads,
  list-tools payload size, and large-result normalization.
- `tests/scripts/write-files-args-path-benchmark.mjs` compares inline payload transport with `args_path` references.
- `tests/scripts/scripts-verify-release-shape.mjs` checks release artifact shape and binary shebang.
- `tests/scripts/scripts-verify-source-boundaries.mjs` checks source and test root boundaries.
- `tests/scripts/scripts-verify-tool-surface.mjs` compares the compiled catalog and dispatcher registry.
- `tests/scripts/scripts-verify-optimization-reports.mjs` validates expected report artifacts.

## Packaging Boundary

The published package exposes `fs-mcp` through `out/index.mjs`. The `package.json` file allowlist includes `out`,
release documentation, and changelog files. Source files, tests, generated fixtures, local build caches, and private
runtime artifacts are development-only surfaces.
