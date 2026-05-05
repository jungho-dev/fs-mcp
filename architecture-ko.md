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

* `src/cores`는 프로세스 bootstrap, stdio transport, 전역 출력 capture, 서버 조립, 응답 정규화를 담당합니다.
* `src/tools`, `src/schemas`, `src/controllers`, `src/cores/responses`는 MCP-facing catalog,
  검증, routing, handler adapter, normalized tool result envelope를 담당합니다.
* `src/features`는 기능 동작을 담당하며 `src/controllers`를 import하지 않습니다.
* `src/assets`는 공용 reader, 타입 선언, 작은 교차 기능 유틸을 담당합니다.
* `tests`는 source 직접 import가 아니라 컴파일된 `out` 산출물을 검증합니다.

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

기능 모듈은 `features/filesystem/filesystem-path-resolver.ts`처럼 같은 기능 계층의 유틸을 통해
동작을 공유합니다. controller는 MCP adapter이므로 재사용 가능한 기능 service로 import하지 않습니다.

## 도구 응답 계약

* 개별 handler는 `content`, 선택적 `structuredContent`, 선택적 `isError`, 선택적 `_meta`를 가진
  `ServerResult`를 반환합니다.
* `dispatchToolCall`은 정규화되지 않은 handler result를 `normalizeToolResult`로 한 번 정규화합니다.
* 표시용 `content[0].text` preview는 transcript 가독성을 위해 제한됩니다.
* `structuredContent.data`는 normalized text, content array, 원본 structured payload를 보관합니다.
* batch helper는 `content`, `old_string`, `new_string`, `textContent`, `imageData`, `listing` 같은
  큰 중첩 입력을 preview 중심으로 압축합니다.

## VS Code 및 Visual Studio 호환성

* `FilteredStdioServerTransport`는 의도치 않은 console 출력을 capture해 MCP JSON-RPC stdout을 보호합니다.
* Cline, VS Code, Claude Dev 계열 client에는 notification을 억제합니다.
* resource와 resource-template list handler는 빈 목록을 반환해 Visual Studio 초기화를 완료시킵니다.
* 검색은 bundled `@vscode/ripgrep`를 우선 사용하고 필요할 때 system ripgrep로 fallback합니다.

## 성능 및 안전 설계

* 파일 작업은 filesystem feature layer의 명시적 timeout 경계를 사용합니다.
* 텍스트 읽기는 offset과 length 입력을 통해 전체 파일 대신 bounded slice 요청을 지원합니다.
* 검색 실행은 `features/search/search-ripgrep-adapter.ts`를 통해 ripgrep에 위임합니다.
* stdio transport는 stdout/stderr 출력이 MCP JSON 출력과 섞이지 않도록 격리합니다.
* `allowedDirectories`가 빈 배열이면 모든 경로 접근을 허용합니다. 제한이 필요하면 허용 경로를 명시합니다.
* 테스트는 npm에 배포되는 표면과 동일한 컴파일 산출물 `out`를 검증합니다.

## 검증 경계

* `verify:tools`는 컴파일된 tool catalog와 dispatcher registry의 이름 계약을 비교합니다.
* `verify:source`는 최적화된 `src`와 `tests` 루트 경계, 제거된 플랫폼 helper 문구의 재유입 여부를 확인합니다.
* `verify:shape`는 릴리스 산출물 경계와 금지된 generated artifact를 확인합니다.
* 최적화 보고서는 `.docs`에 누적하고 `verify:reports`로 확인합니다.

## 패키징 경계

배포 패키지는 `out/index.mjs`를 통해 `fs-mcp`를 노출하고 릴리스 문서를 포함합니다. 소스 파일, 테스트,
생성 fixture, 로컬 빌드 캐시는 런타임 패키지 입력으로 사용하지 않습니다.
