# @jungho-dev/fs-mcp

## 개요

`@jungho-dev/fs-mcp`는 로컬 파일 작업, 배치 검색, exact block edit, essential git workflow를 제공하는
stdio 기반 Model Context Protocol 서버입니다.

이 패키지는 MCP 서버 런타임입니다. VS Code 확장 번들이 아니며 특정 AI client에 종속되지 않습니다.
stdio command를 실행할 수 있는 MCP client라면 Codex, Claude, Cline, Roo, Cursor, Windsurf,
VS Code MCP client, Gemini CLI, GitHub Copilot 등에서 사용할 수 있습니다.

현재 런타임에는 SQLite sidecar, context-index 저장소, MCP resource catalog가 없습니다. Resource 및
resource-template handler는 client 호환성을 위해 빈 목록을 반환합니다.

## 측정된 성능 및 토큰 절감

AI file 작업의 기본 경로는 반복 shell call이 되는 경우가 많고, 각 call마다 process 및 tool-call overhead가
발생합니다. 현재 benchmark는 `fs-mcp`가 full payload를 client에 보존하면서 이 overhead를 줄이는 지점을 보여줍니다.

| Scenario | `fs-mcp` 경로 | Baseline | 측정 효과 |
|----------|---------------|----------|-----------|
| 4 KB 파일 12개 읽기 | 단일 `file-read` batch: 평균 `3.11 ms`, median `1.86 ms` | 순차 PowerShell read: 평균 `2,617.42 ms`, median `2,579.75 ms` | 평균 기준 약 `842x`, median 기준 약 `1,387x` 빠름 |
| 4 KB 파일 20개 쓰기 | `args_path` reference: transport `140` chars, `35` token est | Inline JSON payload: transport `82,911` chars, `20,728` token est | transport chars `99.83%` 감소, estimated token `20,693`개 회피 |
| 128 KB text result 정규화 | 표시 display `498` chars, duplicated `content` slot `817` chars | Raw text body `131,072` chars | Full text는 `data.content`에 보존하고 반복 표시 text는 preview로 제한 |

위 수치는 현재 checkout에서 `2026-05-24`에 timed scenario별 7회 실행으로 생성했습니다.

```bash
bun tests/scripts/performance-benchmark.mjs
bun tests/scripts/write-files-args-path-benchmark.mjs
```

Token estimate는 프로젝트 기준인 token당 `4` chars heuristic을 사용합니다. 실제 model billing은 client가
`content[0].text`만 context에 전달하는지, `structuredContent`까지 model context에 주입하는지에 따라 달라집니다.

## 설치

npm 전역 설치:

```bash
npm install -g @jungho-dev/fs-mcp
```

Bun 전역 설치:

```bash
bun add -g @jungho-dev/fs-mcp
```

## MCP Client 설정

JSON 스타일 `mcpServers` 설정을 쓰는 client에는 아래 서버 명령을 사용합니다.

```json
{
  "mcpServers": {
    "fs-mcp": {
      "command": "fs-mcp",
      "args": []
    }
  }
}
```

Codex는 JSON 대신 TOML을 사용합니다. 전역 설치 후 `~/.codex/config.toml`에 추가합니다.

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

client가 전역 binary를 찾지 못하면 `command`를 절대 경로의 `fs-mcp` 실행 파일로 지정합니다.

## 현재 Public Tool Surface

현재 source와 compiled runtime은 rust-fs-mcp 표면과 동일한 24개 public tool을 노출합니다. Tool 이름은 짧은
hyphen 형식을 사용하고, client가 MCP catalog를 cache해도 안정적으로 동작하도록 public 이름을 고정합니다.

| Domain | Tools | Purpose |
|--------|-------|---------|
| Filesystem | `file-read`, `file-read-line-range`, `file-write`, `path-stat` | 파일 읽기, line range read, 쓰기, metadata 확인. |
| Directories | `dir-list`, `dir-create` | directory tree 조회 및 directory 생성. |
| File operations | `path-copy`, `path-move`, `path-remove`, `file-edit`, `file-edit-lines` | copy, move, remove, exact edit, 1-based line range edit. |
| Inspect | `fs-inspect` | count-files, search, json-pick, snippet, git-status를 한 호출에 묶는 read-only 조회. |
| Search | `fs-search` | direct ripgrep-compatible regex scan. |
| Web | `web-fetch`, `web-render`, `web-extract`, `download-to-file` | URL fetch, obscura JS/SPA rendering, 보유 HTML 변환, sandbox download. |
| Git | `git-set-workdir`, `git-status`, `git-diff`, `git-show`, `git-add`, `git-commit`, `git-amend` | repo pinning, inspect, stage, commit, amend. |

`src/schemas/schemas-git.ts`에는 추가 git operation schema가 있지만, 이번 버전의
`src/tools/tools-git.ts`는 위 essential git set만 export합니다. Config tool과 process control은 현재 public catalog 밖에 있습니다.

## 주요 기능

- 파일 read, write, list, metadata, directory create, copy, move, remove, exact block replacement,
  1-based line range edit의 batch-first 처리.
- count-files, search, json-pick, snippet, git-status를 한 round-trip에 묶는 `fs-inspect` composite 조회.
- `fs-search`를 통한 ripgrep-compatible direct regex search.
- SSRF guard를 갖춘 web tier: static page용 `web-fetch`, obscura headless browser를 통한 JS/SPA rendering용
  `web-render`, 보유 HTML 변환용 `web-extract`, sandbox download용 `download-to-file`.
- `.docx` 입력 또는 pattern을 대상으로 할 때 선택적으로 병합되는 DOCX text extraction.
- Repository pinning, status, diff, show, staging, commit 중심의 essential git session workflow.
- 표시용 display block, machine-readable `structuredContent`, compact `_meta.fsMcpResult`를 포함하는
  normalized tool response.

## Batch-First 사용

`SERVER_INSTRUCTIONS`와 batch-capable tool description은 같은 종류의 작업을 반복 호출하지 말고 하나의
multi-item call로 묶도록 안내합니다. 적용 대상은 다음과 같습니다.

- `paths` 또는 `items`를 쓰는 file read.
- `items` 또는 `paths` 배열을 쓰는 directory/file operation.
- `fs-search.items`를 쓰는 search 작업.
- `web-fetch.items`, `web-extract.items`, `download-to-file.items`를 쓰는 web 작업.

큰 argument는 UTF-8 JSON 파일로 옮긴 뒤 `args_path`로 전달할 수 있습니다. `args_path` 옆에 제공한 inline
field는 참조 JSON object의 field를 override합니다. 큰 text payload는 `content_path`, `old_string_path`,
`new_string_path`, `pattern_path`, `messagePath` 같은 path-backed field도 사용할 수
있습니다.

`file-read`, `file-read-line-range`, `dir-list`, `path-stat`는 `allowMissing=true`를 받아 탐색용 후보 경로 중
누락된 local path를 실패가 아닌 missing 결과로 반환할 수 있습니다.

## 런타임 참고

전체 source catalog는 `24`개 public tool을 노출합니다. Serialized catalog 크기는 build에 따라 달라지므로 token 또는 latency 비교에는 compiled `out` catalog를 측정해 사용합니다.

Runtime 동작:

- Tool catalog는 server creation 시 한 번 조립합니다.
- Zod-to-JSON-schema 변환은 tool entry별 lazy cache로 수행합니다.
- Tool call은 controller validation 전에 `args_path`, `args_offset`, `args_length`를 해석합니다.
- `fs-search`에는 암묵적 `maxResults` cap이 없습니다. 제한된 scan이 필요하면 `maxResults`를 명시합니다.
- 고정 compact envelope에서 본문은 `data.content`에 한 번만 담기고 `data.text` 복제는 추가하지 않습니다.
- Stdio filtering은 우발적 console output이 MCP JSON-RPC frame을 오염시키기 전에 capture합니다.

## Runtime Configuration

Runtime configuration은 in-memory only입니다. 서버는 first-run config file을 만들지 않습니다.

내부 runtime configuration key는 다음과 같습니다.

- `allowedDirectories`
- `blockedCommands`
- `defaultShell`

Allowed directory, blocked command, default shell은 runtime-only 값이며 환경변수로 동작을 바꾸지 않습니다.

## Client 호환성

- 초기화 시 client metadata를 수집하고 call metadata로도 갱신할 수 있습니다.
- Git call은 client-scoped git session key 안에서 실행됩니다.
- Claude와 Codex는 standard server-side notification behavior를 유지합니다.
- Gemini CLI와 GitHub Copilot은 호환성을 위해 server-side JSON-RPC notification을 억제합니다.
- Resource 및 resource-template list handler는 빈 목록을 반환해 probing client 초기화를 완료시킵니다.

## Repository 구조

```text
project root/
|-- src/
|   |-- assets/        공용 reader, type declaration, cross-domain utility
|   |-- controllers/   MCP request handler와 batch response helper
|   |-- cores/         runtime, stdio transport, server assembly, response normalization
|   |-- features/      config, edit, filesystem, git, process, search behavior
|   |-- schemas/       request argument validation schema
|   `-- tools/         tool catalog entry와 dispatcher
|-- tests/             contract test, smoke test, fixture, verification script
`-- out/               npm에 배포되는 compiled runtime
```

## 응답 형태

모든 dispatched tool result는 `src/cores/responses/responses-tool-result.ts`에서 정규화됩니다.

- 표시용 `content[0].text`는 `src/cores/responses/responses-tool-display.ts`에서 생성합니다.
- 기본 표시 row는 `tool`, `items`, `status`, `duration`, `tokens`, `contents`, `structuredText`입니다.
- `tokens`는 content text와 serialized structured content를 문자 수 기반 경량 추정치로 표시합니다.
- `structuredContent`는 schema version, tool name, status, duration, error detail, 원본 normalized content,
  원본 structured payload를 저장합니다.
- 고정 compact envelope에서 본문은 `data.content`에 한 번만 담깁니다. Batch per-item result는
  `structuredContent`와 `isError`만 담고 256 byte 초과 input 문자열은 `<N bytes elided>`로 echo됩니다.
- `_meta.fsMcpResult`는 status, duration, content type, error, schema, tool metadata를 compact하게 저장합니다.
- 이미 정규화된 result는 다시 감싸지 않고 표시 text만 재생성합니다.

## 개발

현재 개발 검사는 Bun을 사용합니다.

```bash
bun x tsc --noEmit
bun tests/run-all-tests.js
bun tests/scripts/performance-benchmark.mjs
bun tests/scripts/write-files-args-path-benchmark.mjs
```

유용한 scoped check:

```bash
bun tests/scripts/scripts-verify-release-shape.mjs
bun tests/scripts/scripts-verify-tool-surface.mjs
bun tests/scripts/scripts-verify-optimization-reports.mjs
bun tests/scripts/scripts-verify-doc-sync.mjs
```

`tests/run-all-tests.js`는 `out`을 다시 build한 뒤 contract 및 smoke test를 실행합니다. `tests/scripts/`의 verification script는 release shape, source boundary,
optimization report, compiled tool surface를 확인합니다.

## 문서

- English README: `README.md`
- Korean README: `readme-ko.md`
- English architecture: `architecture.md`
- Korean architecture: `architecture-ko.md`
- Changelog: `changelog.md`

## 패키징 참고

npm 패키지는 `out/index.mjs`를 통해 `fs-mcp` 실행 파일을 노출합니다. 런타임 version metadata는 package
root의 `package.json`에서 읽습니다. Package file allowlist에는 `out`, release documentation, changelog가
포함되며 source file, test, fixture, local runtime artifact는 development-only surface로 유지됩니다.
