# fs-mcp 아키텍처

## 런타임 흐름

```text
MCP stdio client
  -> fs-mcp binary
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
  client initialization handling, response normalization을 담당합니다.
- `src/tools`, `src/schemas`, `src/controllers`, `src/cores/responses`는 MCP-facing catalog, validation, routing,
  handler adapter, normalized tool result envelope를 담당합니다.
- `src/features`는 domain behavior를 담당하며 `src/controllers`를 import하지 않습니다.
- `src/assets`는 공용 reader, type declaration, 작은 cross-domain utility를 담당합니다.
- `tests`는 TypeScript source를 직접 import하지 않고 compiled `out` output을 검증합니다.

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

기능 모듈은 `features/filesystem/filesystem-path-resolver.ts`처럼 같은 feature 계층의 utility를 통해 동작을
공유할 수 있습니다. Controller는 MCP adapter이므로 재사용 가능한 domain service로 import하지 않습니다.

## 도구 표면

Tool catalog module은 runtime domain별로 나뉩니다. 현재 catalog는 27개 도구를 export합니다.

- `tools-config.ts`: configuration 도구 2개.
- `tools-filesystem.ts`: filesystem, search-session, direct regex search, metadata, exact block edit 도구 14개.
- `tools-process.ts`: process 및 terminal-session 도구 5개.
- `tools-git.ts`: essential git session 도구 6개.

`server-create-mcp-server.ts`는 config, filesystem, process, git catalog를 합쳐 `list_tools`에 제공합니다. `tools-dispatcher.ts`는
대응되는 `call_tool` registry를 담당합니다. Git schema는 더 넓은 operation contract를 정의하지만,
`tools-git.ts`는 `ESSENTIAL_GIT_TOOL_NAMES`로 public catalog를 필터링합니다.

현재 public surface에는 별도의 context-index, SQLite, resource-backed tool family가 없습니다.

`tests/scripts/scripts-verify-tool-surface.mjs`는 compiled catalog 이름과 dispatcher 이름의 일치, catalog
중복, essential git set, 모든 tool의 `args_path` schema 지원을 확인합니다.

## 요청 및 Argument 흐름

- `InitializeRequestSchema`는 client metadata를 수집하고 notification 동작을 설정하며 protocol version을
  협상합니다.
- `ListToolsRequestSchema`는 config, filesystem, process, git module의 catalog를 합쳐 반환합니다.
- `CallToolRequestSchema`는 각 call을 current client git-session scope 안에서 dispatch합니다.
- `tools-dispatcher.ts`는 schema별 controller validation 전에 선택적 `args_path`, `args_offset`,
  `args_length`를 해석합니다.
- `args_path` 옆에 제공된 inline field는 참조 JSON object의 field를 override합니다.
- Search session handler는 `sessionId`, `nextOffset`, `wasLimited`, `wasIncomplete`를 함께 노출해
  client가 긴 scan을 이어 읽거나 진단할 수 있게 합니다.

## 도구 응답 계약

- 개별 handler는 `content`, 선택적 `structuredContent`, 선택적 `isError`, 선택적 `_meta`를 가진
  `ServerResult`를 반환합니다.
- `dispatchToolCall`은 정규화되지 않은 handler result를 `normalizeToolResult`로 한 번 정규화합니다.
- 표시용 `content[0].text`는 `createToolDisplayText`가 만들며 configurable display template을 사용합니다.
- `structuredContent.data`는 원본 normalized content, combined text, 원본 structured payload를 저장합니다.
- `_meta.fsMcpResult`는 status, duration, content type, error text, schema version, tool name을 저장합니다.
- 큰 중복 text content를 자동으로 축약하지 않으며 `structuredContent.data.content`와 `structuredContent.data.text`는 normalized handler output을 보존합니다.

## Runtime Configuration

- `config-store.ts`는 in-memory configuration default를 materialize하고 mutable runtime value를 제공합니다.
- 현재 runtime config surface는 작게 유지됩니다. 수정 가능한 key는 `allowedDirectories`,
  `blockedCommands`, `defaultShell`이고 조회 전용 key는 `availableShells`, `currentClient`,
  `systemInfo`, `version`입니다.
- `FS_MCP_ALLOWED_DIRECTORIES`는 allowed directory를 초기화할 수 있습니다. Windows에서는 semicolon으로
  entry를 구분합니다.
- Windows 기본 shell은 PowerShell 7, `ComSpec`, system `cmd.exe` 순서로 선택합니다. Non-Windows는 `$SHELL`,
  macOS의 `/bin/zsh`, 그 외 `/bin/sh`를 사용합니다.
- `config-metadata.ts`는 editable/read-only config key의 user-facing metadata source입니다.
- Current client state는 `config-client.ts`에서 추적하며 git-session scoping에 사용됩니다.
- 현재 구현은 configuration을 메모리에만 유지하며 first-run config file을 만들지 않습니다.

## MCP Client 호환성

- `SERVER_INSTRUCTIONS`는 client-neutral guidance를 제공합니다. fs-mcp를 local filesystem, process, git,
  config 작업에 사용하고 같은 종류의 작업은 하나의 batch call로 묶도록 안내합니다.
- 초기화 시 client metadata를 수집하고 configuration tool에서 `currentClient`로 노출합니다.
- `FilteredStdioServerTransport`는 우발적 console output을 capture해 MCP JSON-RPC가 stdio에서 격리되게
  합니다.
- Compatibility profile은 Claude, Codex, Gemini CLI, GitHub Copilot 4개만 대상으로 합니다. Gemini CLI와
  Copilot은 server-side JSON-RPC notification을 비활성화하고 Claude와 Codex는 standard notification flow를
  사용합니다.
- 서버는 no-op resource/resource-template handler를 등록해 MCP resource가 없어도 resource probe client가
  초기화를 완료하게 합니다.

## 성능 및 안전 설계

- 현재 compiled catalog는 `26`개 도구를 노출합니다.
- 현재 `list_tools` payload는 tool-surface verification script에서 측정합니다.
- 현재 tool description 총량은 tool-surface verification script에서 측정합니다.
- 현재 tool schema 총량은 tool-surface verification script에서 측정합니다.
- Tool catalog는 한 번만 조립하고 input schema JSON은 lazy cache로 생성합니다.
- 파일 작업은 filesystem feature layer의 timeout boundary와 path resolver를 사용합니다.
- Text read는 offset/length 입력을 사용해 전체 파일 대신 bounded slice 요청을 지원합니다.
- Batch-capable 도구는 `paths`, `items`, `sessionIds`, `pids` 같은 array를 받아 반복 호출을
  하나의 request로 줄입니다.
- 큰 inline tool argument는 `content_path`, `old_string_path`, `new_string_path`, `pattern_path`,
  `input_path`, 공통 `args_path` field로 전달할 수 있습니다.
- 검색 실행은 bundled `@vscode/ripgrep`에 위임하고 필요 시 system ripgrep로 fallback합니다.
  `regex_searches`는 direct regex content scan을 노출하고, search session은 caller가 `maxResults`를
  제공할 때만 result cap을 적용합니다.
- Content search는 요청이 `.docx` 입력이나 pattern을 가리킬 때 DOCX text match도 병합할 수 있습니다.
- Process 실행은 command policy blocklist, configured shell selection, explicit session tracking, 더 큰 active
  output window, completed-session retention limit을 사용합니다.
- Stdio transport는 stdout/stderr write가 MCP JSON output을 손상하기 전에 capture합니다.
- 테스트는 npm에 배포되는 표면과 같은 compiled `out` tree를 검증합니다.

## 검증 경계

- `package.json`은 `bun run swc`, `bun run sync`, `bun run tools` 같은 bootstrap-backed script를 제공합니다.
- `tests/run-all-tests.js`는 `FS_MCP_SKIP_BUILD=1`이 없으면 `out`을 rebuild한 뒤 contract/smoke test를
  실행합니다.
- `tests/scripts/scripts-verify-release-shape.mjs`는 release artifact shape와 binary shebang을 확인합니다.
- `tests/scripts/scripts-verify-source-boundaries.mjs`는 source/test root boundary 확인에 사용할 수 있습니다.
- `tests/scripts/scripts-verify-tool-surface.mjs`는 compiled tool catalog와 dispatcher registry를 비교합니다.

## 패키징 경계

배포 패키지는 `out/index.mjs`를 통해 `fs-mcp`를 노출합니다. `package.json` file allowlist에는 `out`,
release documentation, changelog가 포함됩니다. Source file, test, generated fixture, local build cache, private
runtime artifact는 runtime package input으로 사용하지 않습니다.
