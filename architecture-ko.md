# fs-mcp 아키텍처

## 런타임 흐름

```text
MCP stdio client
  -> out/index.mjs
  -> src/index.ts
  -> src/app/server/create-mcp-server.ts
  -> src/mcp/tools/tool-catalog.ts (list_tools)
  -> src/mcp/tools/tool-call-dispatcher.ts (call_tool)
  -> src/mcp/controllers/*
  -> src/features/*
  -> MCP content 및 structuredContent response
```

## 계층 경계

* `src/app`은 프로세스 bootstrap, stdio transport, 전역 오류 처리, 서버 조립을 담당합니다.
* `src/mcp`는 MCP-facing schema, tool routing, controller, response adapter를 담당합니다.
* `src/features`는 도메인 동작을 담당하며 `src/mcp/controllers`를 import하지 않습니다.
* `src/assets`는 공유 타입 선언과 작은 교차 기능 유틸을 담당합니다.
* `tests`는 source 직접 import가 아니라 컴파일된 `out` 산출물을 검증합니다.

## 최적화된 소스 트리

```text
src/
|-- index.ts
|-- app/
|   |-- runtime/
|   |   |-- app-logger.ts
|   |   |-- output-capture.ts
|   |   |-- runtime-info.ts
|   |   `-- version.ts
|   |-- server/
|   |   `-- create-mcp-server.ts
|   `-- transport/
|       `-- stdio-transport.ts
|-- assets/
|   |-- type/
|   |   `-- common-types.ts
|   `-- utils/
|       `-- timeout.ts
|-- features/
|   |-- config/
|   |   |-- config-metadata.ts
|   |   |-- config-paths.ts
|   |   |-- config-service.ts
|   |   `-- config-store.ts
|   |-- edit/
|   |   |-- edit-service.ts
|   |   `-- line-ending-policy.ts
|   |-- filesystem/
|   |   |-- filesystem-limits.ts
|   |   |-- filesystem-service.ts
|   |   |-- mime-registry.ts
|   |   |-- path-resolver.ts
|   |   `-- readers/
|   |       |-- base.ts
|   |       |-- binary-reader.ts
|   |       |-- docx-reader.ts
|   |       |-- image-reader.ts
|   |       |-- index.ts
|   |       |-- preview-file-types.ts
|   |       |-- reader-factory.ts
|   |       `-- text-reader.ts
|   |-- process/
|   |   |-- command-policy.ts
|   |   |-- process-runner.ts
|   |   |-- process-service.ts
|   |   |-- repl-detector.ts
|   |   `-- terminal-service.ts
|   `-- search/
|       |-- fuzzy-matcher.ts
|       |-- ripgrep-adapter.ts
|       |-- search-log.ts
|       `-- search-service.ts
|-- mcp/
|   |-- controllers/
|   |   |-- edit-controller.ts
|   |   |-- filesystem-controller.ts
|   |   |-- index.ts
|   |   |-- process-controller.ts
|   |   |-- search-controller.ts
|   |   `-- terminal-controller.ts
|   |-- responses/
|   |   |-- error-response.ts
|   |   `-- tool-result-response.ts
|   |-- schemas/
|   |   |-- config-schema.ts
|   |   |-- edit-schema.ts
|   |   |-- filesystem-schema.ts
|   |   |-- index.ts
|   |   |-- process-schema.ts
|   |   `-- search-schema.ts
|   `-- tools/
|       |-- index.ts
|       |-- tool-catalog.ts
|       `-- tool-call-dispatcher.ts
tests/
|-- run-all-tests.js
|-- config/
|-- contracts/
|-- edit/
|-- examples/
|-- filesystem/
|-- fixtures/
|   |-- edit/
|   |-- output/
|   `-- search/
|-- process/
|-- scripts/
|   |-- verify-optimization-reports.mjs
|   |-- verify-release-shape.mjs
|   |-- verify-source-boundaries.mjs
|   `-- verify-tool-surface.mjs
|-- search/
`-- security/
```

## 의존성 규칙

```text
app -> mcp/tools -> mcp/controllers -> features -> assets
app -> features
mcp -> assets
tests -> out
```

기능 모듈은 `features/filesystem/path-resolver.ts`처럼 같은 feature 계층의 유틸을 통해 동작을 공유합니다. controller는 MCP adapter이므로 재사용 가능한 도메인 서비스로 import하지 않습니다.

## 성능 및 안전 설계

* 파일 작업은 `features/filesystem/filesystem-limits.ts`의 명시적 timeout 경계를 사용합니다.
* 텍스트 읽기는 파일 크기와 offset 임계값을 기준으로 불필요한 전체 파일 읽기를 피합니다.
* 검색 실행은 `features/search/ripgrep-adapter.ts`를 통해 ripgrep에 위임합니다.
* stdio transport는 의도치 않은 stdout/stderr 출력을 격리해 MCP JSON 출력이 섞이지 않도록 합니다.
* 테스트는 npm에 배포되는 표면과 동일한 컴파일 산출물 `out`를 검증합니다.
* `verify:tools`는 컴파일된 tool catalog와 dispatcher registry의 이름 계약을 비교합니다.
* `verify:source`는 최적화된 `src`와 `tests` 루트 경계, 제거된 플랫폼 helper 문구의 재유입 여부를 확인합니다.
* 최적화 보고서는 `.docs`에 누적하고 `verify:reports`로 확인합니다.

## 패키징 경계

배포 패키지는 `out/index.mjs`를 통해 `fs-mcp`를 노출하고 릴리스 문서를 포함합니다. 소스 파일, 테스트, 생성 fixture, 로컬 빌드 캐시는 런타임 패키지 입력으로 사용하지 않습니다.
