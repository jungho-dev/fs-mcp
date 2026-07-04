# FS.md

## Purpose

* Use `rust-fs-mcp` first for local filesystem, search, git, and config work.
* Use shell only for build, test, runtime, package, network, or CLI behavior outside `rust-fs-mcp`.

## Rules

* Use absolute paths.
* Batch same-kind operations into one call.
* Use `allowMissing: true` when missing paths are expected.
* Prefer source files over generated, cached, vendor, build, log, backup, or temp artifacts.
* Commit only when the user asks.

## Tool Routing

| Trigger                   | Operation                                                                |
|---------------------------|--------------------------------------------------------------------------|
| Directory list/create     | `dir-list`, `dir-create`                                                 |
| File read/lines/metadata  | `file-read`, `file-read-line-range`, `path-stat`                         |
| File write/edit           | `file-write`, `file-edit`, `file-edit-lines`                             |
| File copy/move/remove     | `path-copy`, `path-move`, `path-remove`                                  |
| Regex or broad search     | `fs-search`                                                              |
| Compact fs inspection     | `fs-inspect` (count-files, search, json-pick, snippet)                   |
| Git status/diff/show      | `git-status`, `git-diff`, `git-show`                                     |
| Git log/history search    | shell `git log` only when no MCP equivalent exists                       |
| Git add/commit/amend      | `git-add`, `git-commit`, `git-amend`                                     |
| Pin git working dir       | `git-set-workdir`                                                        |
| URL fetch/render/extract  | `web-fetch`, `web-render`, `web-extract`, `download-to-file`             |
|---------------------------|--------------------------------------------------------------------------|
