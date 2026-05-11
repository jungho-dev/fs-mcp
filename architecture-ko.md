# fs-mcp 아키텍처

## 런타임 흐름

```text
MCP stdio client
  -> out/index.mjs
  -> src/index.mts
  -> src/cores/server/server-run-mcp-server.ts
  -> src/cores/server/server-create-mcp-server.ts
  -> src/tools/tools-*.ts (list_tools)
  -> src/tools/tools-dispatcher.ts (call_tool)
  -> src/schemas/*
  -> src/controllers/*
  -> src/features/*
  -> src/cores/responses/*
```

## 계층 경계

- `src/cores`는 process bootstrap, stdio transport, 전역 출력 capture, server assembly, runtime guidance,
  response normalization을 담당합니다.
- `src/tools`, `src/schemas`, `src/controllers`, `src/cores/responses`는 MCP-facing catalog, validation,
  routing, handler adapter, normalized tool result envelope를 담당합니다.
- `src/features`는 기능 동작을 담당하며 `src/controllers`를 import하지 않습니다.
- `src/assets`는 공용 reader, 타입 선언, 작은 교차 기능 유틸을 담당합니다.
- `tests`는 source 직접 import가 아니라 컴파일된 `out` 산출물을 검증합니다.

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
|   |-- context/
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
cores/server -> tools
cores/server -> cores/responses
tools -> schemas
tools -> controllers
controllers -> schemas
controllers -> features
controllers -> cores/responses
features -> assets
features/context -> features/config
cores/responses -> features/context
cores/responses -> assets
tests -> out
```

기능 모듈은 `features/filesystem/filesystem-path-resolver.ts`처럼 같은 기능 계층의 유틸을 통해 동작을
공유합니다. controller는 MCP adapter이므로 재사용 가능한 기능 service로 import하지 않습니다.

## 도구 표면

Tool catalog module은 runtime domain별로 나뉩니다.

- `tools-config.ts`: `get_configs`, `set_config_values`
- `tools-context.ts`: `index_contexts`, `search_contexts`, `list_contexts`, `clear_contexts`
- `tools-filesystem.ts`: file, directory, search-session, metadata, exact block edit 도구
- `tools-process.ts`: command session, process output, process listing, process termination 도구
- `tools-git.ts`: repository, history, branch, checkout, stash, tag, worktree, remote, integration 도구

`server-create-mcp-server.ts`는 이 catalog들을 합쳐 `list_tools`에 제공합니다. `tools-dispatcher.ts`는
대응되는 `call_tool` registry를 담당하며, `verify:tools`가 컴파일된 catalog와 dispatcher 이름 계약을
확인합니다.

## 도구 응답 계약

- 개별 handler는 `content`, 선택적 `structuredContent`, 선택적 `isError`, 선택적 `_meta`를 가진
  `ServerResult`를 반환합니다.
- `dispatchToolCall`은 정규화되지 않은 handler result를 `normalizeToolResult`로 한 번 정규화합니다.
- 표시용 `content[0].text`는 `createToolDisplayText`가 만들며 compact하게 유지됩니다.
- `structuredContent.data`는 원본 normalized content, 결합된 text, 원본 structured payload를 저장합니다.
- `_meta.fsMcpResult`는 status, duration, content type, error text, schema version, tool name을 저장합니다.
- 자동 context indexing은 normalized structured output에 `contextIndexes` 또는 `contextIndexError`를
  추가할 수 있습니다.

## Context Index 아키텍처

`features/context/context-index-service.ts`는 Bun SQLite 기반 large text index를 담당합니다.

- 기본 threshold는 5,000자 또는 120줄이고, 단일 indexed entry 최대 크기는 1,000,000자입니다.
- 기본 DB 경로는 `getDefaultContextIndexDbPath`로 계산하며, 공용 home 경로
  `~/.mcp/fs-mcp.sqlite`를 사용합니다.
- Text는 80줄 chunk와 20줄 overlap으로 나누고 SQLite FTS로 검색합니다.
- `context-output-compactor.ts`는 원본 structured payload를 대체하지 않고 큰 text field와 structured
  collection을 index합니다.
- 수동 context 도구는 같은 service를 사용해 명시적 index, search, list, clear 작업을 수행합니다.

## VS Code 및 Visual Studio 호환성

- `FilteredStdioServerTransport`는 의도치 않은 console 출력을 capture해 MCP JSON-RPC stdout을 보호합니다.
- Cline, VS Code, Claude Dev, Roo 계열 client에는 필요 시 notification을 억제합니다.
- resource와 resource-template list handler는 빈 목록을 반환해 Visual Studio 초기화를 완료시킵니다.
- 검색은 bundled `@vscode/ripgrep`를 우선 사용하고 필요할 때 system ripgrep로 fallback합니다.

## 성능 및 안전 설계

- 파일 작업은 filesystem feature layer의 timeout boundary와 path resolver를 사용합니다.
- 텍스트 읽기는 offset과 length 입력을 통해 전체 파일 대신 bounded slice 요청을 지원합니다.
- 큰 inline tool argument는 `content_path`, `old_string_path`, `new_string_path`, `pattern_path`,
  `input_path` 같은 path-backed field로 전달할 수 있습니다.
- 검색 실행은 `features/search/search-ripgrep-adapter.ts`를 통해 ripgrep에 위임합니다.
- stdio transport는 stdout/stderr 출력이 MCP JSON 출력과 섞이지 않도록 격리합니다.
- 테스트는 npm에 배포되는 표면과 동일한 컴파일 산출물 `out`를 검증합니다.

## 검증 경계

- `package.json`의 `bun run verify`는 `tsc --noEmit`으로 source type check를 실행합니다.
- `tests/run-all-tests.js`는 실행 시 `bun run swc`로 `out`를 갱신한 뒤 contract 및 smoke test suite를 실행합니다.
- `tests/scripts/scripts-verify-release-shape.mjs`는 release artifact shape와 generated artifact drift를 확인합니다.
- `tests/scripts/scripts-verify-source-boundaries.mjs`는 source 및 test root boundary를 보호합니다.
- `tests/scripts/scripts-verify-tool-surface.mjs`는 컴파일된 tool catalog와 dispatcher registry 이름 계약을 비교합니다.
- `tests/scripts/scripts-verify-optimization-reports.mjs`는 `.docs`에 누적된 optimization report를 확인합니다.

## 패키징 경계

배포 패키지는 `out/index.mjs`를 통해 `fs-mcp`를 노출하고 release documentation을 포함합니다. Source file,
test, generated fixture, local build cache는 runtime package input으로 사용하지 않습니다.
