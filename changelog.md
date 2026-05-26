# Changelog

## [Unreleased]

* graceful SIGINT/SIGTERM shutdown that terminates active ripgrep sessions and closes the MCP server before exit
* surface git tool validation failures with structured `Validation error for <tool>: ...` messages and tag transport failures with the tool name
* clear early-termination timers when a search session closes, errors out, or is terminated explicitly so no orphaned timers remain
* replace the ad-hoc `__ERROR__:` string rejection in `withTimeout` with a `TimeoutError` carrying `code = "ETIMEDOUT"` for consistent error branching
* allow overriding the edit fuzzy match threshold through the `FS_MCP_EDIT_FUZZY_THRESHOLD` environment variable
* replace exact `gpt-tokenizer` result token counts with lightweight estimates to remove cold large-payload stalls
* preview duplicate large text in batch and normalized envelopes while preserving full text in structured payloads
* add `tests/scripts/performance-benchmark.mjs` for repeatable pure-shell, pure-Bun, fs-mcp, catalog, and normalization benchmarks

## [1.7.1] - 2026-05-22

* republish a clean prepared project state after the 1.7.0 release pipeline

## [1.7.0] - 2026-05-21

* harden the npm publish preflight: enforce exact package version match and reject duplicate release uploads
* tighten the publish workflow with stricter build and verification stages before npm release
* extract release publishing into a dedicated reusable workflow stage

## [1.6.9] - 2026-05-20

* prepare the 1.6.9 release with refreshed verify scripts and tooling metadata

## [1.6.8] - 2026-05-19

* release version 1.6.8 with the npm publish preflight hardening series

## [1.6.0] - 2026-05-18

* remove the SQLite-backed context-index tools, schemas, controllers, services, tests, and catalog routing
* drop automatic duplicate text compaction and implicit search result caps so callers keep `maxResults` control
* remove the package self-dependency from runtime dependency metadata
* compact tool output payloads so large MCP responses stay inline by default

## [1.5.1] - 2026-05-16

* preserve large filesystem payloads safely when responses approach transport limits
* add token counts to tool result summaries so callers can budget context use
* expose manual context index maintenance tools (later removed in 1.6.0)
* keep large MCP responses inline by default for clients that cannot follow streamed chunks

## [1.4.2] - 2026-05-12

* publish the npm README under the conventional `README.md` filename
* include `README.md` explicitly in the npm package file list

## [1.3.6] - 2026-05-12

* fix npm binary startup by running the published entrypoint with Bun
* validate the published binary entrypoint shebang during release checks

## [1.2.6] - 2026-05-10

* refresh README and architecture documentation for context indexing, response display, and current tool groups
* correct development command documentation to match the current package scripts
* publish the documentation refresh as a patch release after 1.2.5

## [1.2.5] - 2026-05-10

* sync runtime version metadata with package version
* run the full verify suite before npm publish
* refresh Korean README and architecture paths for the current source layout

## [1.0.3] - 2026-05-02

* pin `zod` to the v3 line used by `zod-to-json-schema` so published tool schemas stay valid

## [1.0.2] - 2026-05-02

* add empty resource list support so Codex resource discovery does not stop server startup
* document Bun global install and Codex MCP configuration

## [1.0.1] - 2026-04-30

* add publish validation scripts and public scoped-package metadata
* include architecture and changelog documents in the npm release surface
* refresh README and architecture docs to match the actual repository layout

## [1.0.0] - 2026-04-29

* initial fs-mcp release

## \[ 1.0.1 \]

- 2026-04-30 (00:51:54)

## \[ 1.0.2 \]

- 2026-05-03 (01:56:45)

## \[ 1.0.3 \]

- 2026-05-03 (02:07:40)

## \[ 1.0.4 \]

- 2026-05-03 (02:18:37)

## \[ 1.0.5 \]

- 2026-05-03 (02:23:11)

## \[ 1.0.6 \]

- 2026-05-03 (13:06:12)

## \[ 1.0.7 \]

- 2026-05-03 (15:09:52)

## \[ 1.0.8 \]

- 2026-05-03 (17:33:43)

## \[ 1.0.9 \]

- 2026-05-03 (17:40:19)

## \[ 1.1.0 \]

- 2026-05-04 (00:16:54)

## \[ 1.1.1 \]

- 2026-05-04 (00:19:04)

## \[ 1.1.2 \]

- 2026-05-04 (00:26:50)

## \[ 1.1.3 \]

- 2026-05-04 (00:54:02)

## \[ 1.1.4 \]

- 2026-05-04 (18:04:01)

## \[ 1.1.5 \]

- 2026-05-04 (18:10:25)

## \[ 1.1.6 \]

- 2026-05-04 (23:42:06)

## \[ 1.1.7 \]

- 2026-05-05 (00:16:23)

## \[ 1.1.8 \]

- 2026-05-06 (01:40:23)

## \[ 1.1.9 \]

- 2026-05-06 (18:00:03)

## \[ 1.2.0 \]

- 2026-05-07 (00:01:27)

## \[ 1.2.1 \]

- 2026-05-07 (18:24:03)

## \[ 1.2.2 \]

- 2026-05-07 (23:19:47)

## \[ 1.2.3 \]

- 2026-05-07 (23:28:43)

## \[ 1.2.4 \]

- 2026-05-08 (18:01:54)

## \[ 1.2.5 \]

- 2026-05-10 (12:27:56)

## \[ 1.2.6 \]

- 2026-05-10 (21:53:00)

## \[ 1.2.7 \]

- 2026-05-10 (22:01:00)

## \[ 1.2.8 \]

- 2026-05-10 (23:00:00)

## \[ 1.2.9 \]

- 2026-05-10 (23:51:52)

## \[ 1.3.0 \]

- 2026-05-11 (18:32:53)

## \[ 1.3.1 \]

- 2026-05-11 (21:47:12)

## \[ 1.3.2 \]

- 2026-05-11 (21:51:55)

## \[ 1.3.3 \]

- 2026-05-11 (22:16:40)

## \[ 1.3.4 \]

- 2026-05-11 (22:24:24)

## \[ 1.3.5 \]

- 2026-05-11 (23:48:10)

## \[ 1.3.6 \]

- 2026-05-12 (09:33:08)

## \[ 1.3.7 \]

- 2026-05-12 (18:08:08)

## \[ 1.3.8 \]

- 2026-05-12 (21:34:56)

## \[ 1.3.9 \]

- 2026-05-12 (21:50:12)

## \[ 1.4.0 \]

- 2026-05-12 (21:57:16)

## \[ 1.4.1 \]

- 2026-05-12 (22:01:58)


## \[ 1.4.2 \]

- 2026-05-12 (22:07:00)

## \[ 1.4.3 \]

- 2026-05-12 (22:13:24)

## \[ 1.4.4 \]

- 2026-05-13 (18:25:11)

## \[ 1.4.5 \]

- 2026-05-13 (23:41:56)

## \[ 1.4.6 \]

- 2026-05-13 (23:44:59)

## \[ 1.4.7 \]

- 2026-05-14 (18:32:17)

## \[ 1.4.8 \]

- 2026-05-15 (10:06:22)

## \[ 1.4.9 \]

- 2026-05-15 (10:45:52)

## \[ 1.5.0 \]

- 2026-05-15 (11:02:17)

## \[ 1.5.1 \]

- 2026-05-15 (12:30:46)

## \[ 1.5.2 \]

- 2026-05-15 (12:43:54)

## \[ 1.5.3 \]

- 2026-05-15 (12:53:21)

## \[ 1.5.4 \]

- 2026-05-15 (18:17:39)
## \[ 1.5.5 \]

- 2026-05-16 (21:19:43)

## \[ 1.5.6 \]

- 2026-05-17 (12:31:13)

## \[ 1.5.7 \]

- 2026-05-17 (15:44:45)

## \[ 1.5.8 \]

- 2026-05-18 (00:57:54)

## \[ 1.5.9 \]

- 2026-05-18 (18:14:23)

## \[ 1.6.0 \]

- 2026-05-18 (23:14:27)

## \[ 1.6.1 \]

- 2026-05-18 (23:22:26)

## \[ 1.6.2 \]

- 2026-05-19 (18:18:35)

## \[ 1.6.3 \]

- 2026-05-20 (00:14:13)

## \[ 1.6.4 \]

- 2026-05-20 (00:21:23)

## \[ 1.6.5 \]

- 2026-05-20 (00:26:13)

## \[ 1.6.6 \]

- 2026-05-21 (18:58:49)

## \[ 1.6.7 \]

- 2026-05-21 (23:23:37)

## \[ 1.6.8 \]

- 2026-05-21 (23:39:04)

## \[ 1.6.9 \]

- 2026-05-22 (00:00:19)

## \[ 1.7.0 \]

- 2026-05-22 (14:50:35)

## \[ 1.7.1 \]

- 2026-05-22 (15:38:25)

## \[ 1.7.2 \]

- 2026-05-22 (18:05:04)

## \[ 1.7.3 \]

- 2026-05-22 (18:06:05)

## \[ 1.7.4 \]

- 2026-05-25 (21:02:59)

## \[ 1.7.5 \]

- 2026-05-26 (17:59:05)
