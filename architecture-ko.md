# fs-mcp 아키텍처

## 런타임 흐름

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

배포 런타임은 compiled `out` tree입니다. 테스트는 TypeScript source를 직접 import하지 않고 compiled surface를
검증합니다.

## 계층 경계

- `src/cores`는 process bootstrap, stdio transport, server assembly, runtime guidance, client initialization,
  output filtering, response normalization을 담당합니다.
- `src/tools`는 public tool catalog entry, description, annotation, schema wiring을 담당합니다.
- `src/schemas`는 request argument contract와 `args_path` 확장을 담당합니다.
- `src/controllers`는 MCP handler adapter, batch result shaping, feature service 호출을 담당합니다.
- `src/features`는 filesystem, edit, search, process, config, git domain behavior를 담당합니다.
- `src/assets`는 shared reader, type declaration, cross-domain utility를 담당합니다.
- `tests`는 compiled package surface에 대한 contract, smoke, fixture, verification coverage를 담당합니다.

Feature module은 `features/filesystem/filesystem-path-resolver.ts` 같은 feature-level utility를 통해 동작을
공유할 수 있습니다. Controller는 MCP adapter이므로 재사용 가능한 domain service로 import하지 않습니다.

## 소스 트리

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

## 의존성 규칙

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

## Public Tool 조립

`server-create-mcp-server.ts`는 다섯 module의 catalog를 합쳤 public surface를 구성합니다. Config와 process catalog는 현재 비어 있습니다.

| Module | Count | Public tools |
|--------|------:|--------------|
| `tools-config.ts` | 0 | none |
| `tools-filesystem.ts` | 13 | `file-read`, `file-read-line-range`, `file-write`, `dir-create`, `dir-list`, `path-copy`, `path-move`, `path-remove`, `fs-search`, `path-stat`, `file-edit`, `file-edit-lines`, `fs-inspect` |
| `tools-process.ts` | 0 | none |
| `tools-git.ts` | 7 | `git-set-workdir`, `git-status`, `git-diff`, `git-show`, `git-add`, `git-commit`, `git-amend` |
| `tools-web.ts` | 4 | `web-fetch`, `web-render`, `web-extract`, `download-to-file` |

전체 public catalog 크기는 rust-fs-mcp 표면과 동일한 `24`개 tool입니다. `FS_MCP_TOOL_PROFILE=fast-coding`은
`tools/list`를 `fs-inspect` 하나로 좁히며 dispatch 호환성은 전체 surface를 유지합니다.

`tools-dispatcher.ts`는 대응되는 `call_tool` registry를 담당합니다. Catalog와 dispatcher는 같은 이름을
노출해야 합니다. `tests/scripts/scripts-verify-tool-surface.mjs`는 name equality, uniqueness, essential git
filtering, shared `args_path` 지원을 확인합니다.

Git schema는 더 넓은 internal operation map을 정의하지만 `tools-git.ts`는 essential git name list로 public
surface를 필터링합니다. 현재 public surface에는 별도 context-index, SQLite, MCP resource, config, process tool family가 없습니다.

## 요청 및 Argument 흐름

- `InitializeRequestSchema`는 client metadata를 수집하고 protocol version을 협상하며 compatibility를 설정합니다.
- `ListToolsRequestSchema`는 config, filesystem/search/edit, process, git catalog를 합쳐 반환합니다.
- `CallToolRequestSchema`는 client metadata가 있으면 갱신하고 client git-session scope에 진입한 뒤 tool name으로
  dispatch합니다.
- `tools-dispatcher.ts`는 schema별 controller validation 전에 `args_path`, `args_offset`, `args_length`를 해석합니다.
- `args_path` 옆에 제공한 inline field는 참조 JSON object의 field를 override합니다.
- Controller는 해석된 argument를 검증하고 feature service를 호출합니다.
- Feature service는 `ServerResult`를 반환하고 dispatcher는 MCP client로 반환하기 전에 결과를 정규화합니다.

## Domain Behavior

### Filesystem And Edit

Filesystem tool은 batch-first와 path-oriented 구조를 따릅니다. Read는 단순 읽기용 `paths`와 offset, length,
URL, option을 지정하는 `items`를 모두 지원합니다. Write와 edit은 큰 content를 위해 path-backed payload field를
지원합니다. Directory listing, metadata, read tool은 탐색용 후보 경로를 위해 `allowMissing=true`를 사용할 수
있습니다.

Exact block replacement는 edit feature에 있으며 `file-edit`으로 노출됩니다. `file-edit-lines`는 1-based
inclusive line range를 교체, 삽입(`after: true`), 삭제(빈 replacement)하며, 파일의 dominant EOL(CRLF/LF)을
감지해 보존하고 `expected_lines`로 파일 길이를 검증할 수 있습니다. 같은 파일을 다루는 item이 섞일 수 있어
batch는 순차로 실행됩니다.

### Inspect

`fs-inspect`는 코딩 작업용 read-only composite 조회 tool입니다. 한 번의 호출이 `root`와 request 목록을 받고,
각 request는 `op`(`count-files`, `search`, `json-pick`, `snippet`, `git-status`)에 따라 dispatch됩니다.
`git-status` op은 git feature의 `git-status` 실행에 위임해 filesystem 조회와 git 상태를 한 round-trip에
해결합니다. per-call `maxSnippetChars` budget(기본 6000)이 evidence text 총량을 제한하고 초과 시 `truncated`
flag를 설정합니다. 각 answer는 `id`, `op`, `status`, `value`, `confidence`, `evidence`, `warnings`를 담으며,
호출 결과에는 `scannedFiles`, `bytesRead`, `snippetChars`, `truncated` metric이 포함됩니다.

### Search

Search는 bundled `@vscode/ripgrep`에 위임하고 system ripgrep을 fallback으로 사용합니다. `fs-search`는 direct
ripgrep-compatible content scan을 실행하고 호출 안에서 완료까지 대기하므로 session tool은 노출하지 않습니다.

`fs-search` response는 `wasLimited`와 `wasIncomplete`를 노출할 수 있습니다. Result cap은 caller가
`maxResults`를 제공한 경우에만 적용됩니다.

### Config

`config-store.ts`는 in-memory default와 runtime value를 materialize합니다. Config state는 runtime 내부에 남아 있지만
현재 catalog에서 config operation은 public MCP tool로 export하지 않습니다.

### Process

현재 catalog에서 process operation은 public MCP tool로 export하지 않습니다. Process service module에는 runtime boundary에 필요한 policy, session, terminal, virtual-node behavior가 남을 수 있습니다.

### Git

Git call은 client-scoped git session 안에서 실행됩니다. `git-set-workdir`는 working repository를 pin하고,
`git-status`와 `git-diff`는 상태를 검사하며(`git-diff`는 whitespace/conflict-marker를 검사하는 `check`를
지원하고 option 형태의 revision을 거부합니다), `git-show`는 `objects[]`와 선택적 `stat`으로 여러 revision을 한
번에 읽습니다. `git-add`는 명시적 path를 stage하고(전체 staging은 `all`/`update` 필요), `git-commit`은
commit을 생성하며, `git-amend`는 HEAD를 재작성합니다(`--no-edit` message 재사용, `resetAuthor`, HEAD 사전검증).
Commit description은 English Conventional Commit message를 권장합니다. `git-commit`과 `git-amend`는 local git
config 없이도 동작하도록 `-c user.name=fs-mcp`와 `-c user.email=fs-mcp@example.invalid`를 항상 주입하며,
`author` object가 주어지면 `--author`로 author만 override합니다.

### Web

Web tier는 rust-fs-mcp를 미러링합니다. `web-fetch`는 per-hop SSRF guard, 수동 redirect 검사, body-size cap을
갖춘 TIER-1 native fetch 경로입니다. `web-render`는 JS/SPA page를 위해 obscura headless browser를 호출합니다
(`FS_MCP_OBSCURA_BIN`으로 binary override, `evalScript`는 `FS_MCP_ALLOW_PRIVATE_URLS=1` 필요).
`web-extract`는 보유 HTML을 offline으로 text, markdown, links, readability로 변환하고, `download-to-file`은
fetch한 body를 `allowedDirectories` 안에 기록합니다. `isUrl`을 쓰는 `file-read`도 동일한 guarded fetch tier를
경유합니다.

## Tool Response Contract

개별 handler는 `content`, 선택적 `structuredContent`, 선택적 `isError`, 선택적 `_meta`를 가진 `ServerResult`를
반환합니다.

`dispatchToolCall`은 정규화되지 않은 handler result를 `normalizeToolResult`로 한 번 정규화합니다.

정규화된 contract는 세 layer입니다.

- `createToolDisplayText`가 생성하는 표시용 `content[0].text`.
- Schema version, tool name, status, duration, error detail, normalized content, 원본 structured payload를 담는
  machine-readable `structuredContent`.
- Status, duration, content type, error text, schema version, tool name을 담는 compact `_meta.fsMcpResult`.

기본값인 compact envelope에서 `data.content`는 전체 본문을 담는 단일 source이고 `data.text` 복제는 생략됩니다.
`FS_MCP_COMPACT=0`(또는 `false`)으로 끄면 `data.text`에 combined text가 복원됩니다. Batch 응답도 같은 flag를
따릅니다. compact에서 per-item `result`는 `structuredContent`와 `isError`만 담고 content 복제와
`textContent`/`listing` 같은 본문 복제 key를 제거하며, echo되는 `input`의 256 byte 초과 문자열 값은
`<N bytes elided>`로 대체됩니다. 본문은 full mode tool(`file-read`, `file-read-line-range`, `dir-list`,
`fs-search`, `web-fetch`, `web-extract`, `download-to-file`)의 batch text에 한 번만 담깁니다.

기본 display row는 `tool`, `items`, `status`, `duration`, `tokens`, `contents`, `structuredText`입니다. `tokens` row는
큰 결과에서 tokenizer vocabulary를 load하지 않도록 문자 수 기반 추정치를 사용합니다. Gemini client는 같은
display에서 ANSI escape sequence를 제거한 text를 받습니다.

## Runtime Configuration

- Runtime configuration은 in-memory only입니다.
- Mutable key는 `allowedDirectories`, `blockedCommands`, `defaultShell`입니다.
- `FS_MCP_ALLOWED_DIRECTORIES`로 allowed directory를 초기화할 수 있습니다. Windows entry는 semicolon으로 구분합니다.
- `FS_MCP_COMPACT=0`은 compact envelope를 끄고 `data.text` 복제와 batch per-item content를 복원합니다.
- `FS_MCP_TOOL_PROFILE=fast-coding`은 `tools/list`를 `fs-inspect`로만 좁힙니다.
- Windows 기본 shell 선택은 PowerShell 7, `ComSpec`, system `cmd.exe` 순서를 따릅니다. Non-Windows 기본값은
  `$SHELL`, macOS의 `/bin/zsh`, 또는 `/bin/sh`입니다.
- Current client state는 `config-client.ts`에서 추적하며 git-session scoping에 사용됩니다.

## MCP Client Compatibility

- `SERVER_INSTRUCTIONS`는 client에게 local filesystem, process, git, config 작업에 fs-mcp를 사용하고 같은 종류의
  작업은 batch-first로 호출하라고 안내합니다.
- `FilteredStdioServerTransport`는 우발적인 stdout/stderr write를 capture해 JSON-RPC를 격리합니다.
- Compatibility profile은 Claude, Codex, Gemini CLI, GitHub Copilot을 대상으로 합니다.
- Gemini CLI와 GitHub Copilot은 server-side JSON-RPC notification을 비활성화합니다.
- Claude와 Codex는 standard notification flow를 유지합니다.
- No-op resource/resource-template handler는 resource를 노출하지 않는 상태에서도 probing client 초기화를 허용합니다.

## Performance And Safety Design

- 현재 compiled catalog는 `20`개 tool을 노출합니다.
- 현재 checkout에서 측정한 `list_tools` payload는 `24,003` chars입니다.
- Tool description은 총 `5,613` chars, schema는 총 `15,568` chars입니다.
- Tool catalog는 한 번 조립하고 input schema JSON은 lazy cache로 생성합니다.
- Batch-capable tool은 `paths`, `items`, `sessionIds` 같은 array를 받습니다.
- 큰 inline argument는 `args_path` 또는 tool-specific path-backed field로 전달할 수 있습니다.
- Batch summary와 duplicated normalized `content` slot은 큰 text를 preview로 줄이고 full text는 `data.text` 또는
  중첩 `structuredContent.textContent`에 보존합니다.
- File operation은 configured timeout boundary와 feature-layer path resolution을 사용합니다.
- Stdio transport는 MCP JSON output을 오염시키기 전에 우발적 output을 capture합니다.
- 테스트는 npm에 배포되는 런타임 표면과 같은 compiled `out` tree를 검증합니다.

`2026-05-24` 기준 측정된 optimization data입니다.

| Measurement | Current result | Compared baseline | Design implication |
|-------------|----------------|-------------------|--------------------|
| 4 KB 파일 12개 `file-read` | 평균 `3.11 ms`, median `1.86 ms` | 순차 PowerShell read 평균 `2,617.42 ms`, median `2,579.75 ms` | Batch dispatch가 반복 process 및 tool-call overhead를 제거합니다. |
| 4 KB 파일 20개 `args_path` `file-write` | transport `140` chars, `35` token est | Inline JSON payload `82,911` chars, `20,728` token est | Path-backed argument가 큰 payload를 prompt 크기 call argument 밖에 둡니다. |
| 128 KB text result 정규화 | visible `498` chars, duplicated content `817` chars | Raw text body `131,072` chars | 표시 display는 compact하게 유지하고 full text는 machine-readable payload에 보존합니다. |

Benchmark command는 `bun tests/scripts/performance-benchmark.mjs`와
`bun tests/scripts/write-files-args-path-benchmark.mjs`입니다. Token estimate는 local `4` chars per token
heuristic을 사용하므로 client-visible saving은 MCP host가 `content`와 `structuredContent`를 전달하는 방식에 따라
달라집니다.

## Verification Boundary

- `bun x tsc --noEmit`는 source TypeScript contract를 검증합니다.
- `bun tests/run-all-tests.js`는 contract 및 smoke test를 실행합니다.
- `tests/run-all-tests.js`는 `FS_MCP_SKIP_BUILD=1`이 설정되지 않은 경우 `out`을 다시 build합니다.
- `tests/scripts/performance-benchmark.mjs`는 pure Bun read, sequential shell read, fs-mcp batch read,
  list-tools payload size, large-result normalization을 비교합니다.
- `tests/scripts/write-files-args-path-benchmark.mjs`는 inline payload transport와 `args_path` reference를 비교합니다.
- `tests/scripts/scripts-verify-release-shape.mjs`는 release artifact shape와 binary shebang을 확인합니다.
- `tests/scripts/scripts-verify-source-boundaries.mjs`는 source/test root boundary를 확인합니다.
- `tests/scripts/scripts-verify-tool-surface.mjs`는 compiled catalog와 dispatcher registry를 비교합니다.
- `tests/scripts/scripts-verify-optimization-reports.mjs`는 expected report artifact를 검증합니다.

## Packaging Boundary

Published package는 `out/index.mjs`를 통해 `fs-mcp`를 노출합니다. `package.json` file allowlist에는 `out`, release
documentation, changelog가 포함됩니다. Source file, test, generated fixture, local build cache, private runtime
artifact는 development-only surface입니다.
