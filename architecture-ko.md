# fs-mcp 아키텍처

## 런타임 흐름

```text
MCP stdio client
  -> out/index.mjs
  -> src/index.mts
  -> src/app/server/create-mcp-server.mts
  -> src/mcp/tools/tool-catalog.mts (list_tools)
  -> src/mcp/tools/tool-call-dispatcher.mts (call_tool)
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
|-- index.mts
|-- app/
|   |-- runtime/
|   |   |-- app-logger.mts
|   |   |-- output-capture.mts
|   |   |-- runtime-info.mts
|   |   `-- version.mts
|   |-- server/
|   |   `-- create-mcp-server.mts
|   `-- transport/
|       `-- stdio-transport.mts
|-- assets/
|   |-- type/
|   |   `-- common-types.mts
|   `-- utils/
|       `-- timeout.mts
|-- features/
|   |-- config/
|   |   |-- config-metadata.mts
|   |   |-- config-paths.mts
|   |   |-- config-service.mts
|   |   `-- config-store.mts
|   |-- edit/
|   |   |-- edit-service.mts
|   |   `-- line-ending-policy.mts
|   |-- filesystem/
|   |   |-- filesystem-limits.mts
|   |   |-- filesystem-service.mts
|   |   |-- mime-registry.mts
|   |   |-- path-resolver.mts
|   |   `-- readers/
|   |       |-- base.mts
|   |       |-- binary-reader.mts
|   |       |-- docx-reader.mts
|   |       |-- image-reader.mts
|   |       |-- index.mts
|   |       |-- preview-file-types.mts
|   |       |-- reader-factory.mts
|   |       `-- text-reader.mts
|   |-- history/
|   |   `-- tool-history-store.mts
|   |-- process/
|   |   |-- command-policy.mts
|   |   |-- process-runner.mts
|   |   |-- process-service.mts
|   |   |-- repl-detector.mts
|   |   `-- terminal-service.mts
|   `-- search/
|       |-- fuzzy-matcher.mts
|       |-- ripgrep-adapter.mts
|       |-- search-log.mts
|       `-- search-service.mts
|-- mcp/
|   |-- controllers/
|   |   |-- edit-controller.mts
|   |   |-- filesystem-controller.mts
|   |   |-- history-controller.mts
|   |   |-- index.mts
|   |   |-- process-controller.mts
|   |   |-- search-controller.mts
|   |   `-- terminal-controller.mts
|   |-- responses/
|   |   |-- error-response.mts
|   |   `-- tool-result-response.mts
|   |-- schemas/
|   |   |-- config-schema.mts
|   |   |-- edit-schema.mts
|   |   |-- filesystem-schema.mts
|   |   |-- history-schema.mts
|   |   |-- index.mts
|   |   |-- process-schema.mts
|   |   `-- search-schema.mts
|   `-- tools/
|       |-- index.mts
|       |-- tool-catalog.mts
|       |-- tool-call-dispatcher.mts
|       `-- tool-history-policy.mts
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

기능 모듈은 `features/filesystem/path-resolver.mts`처럼 같은 feature 계층의 유틸을 통해 동작을 공유합니다. controller는 MCP adapter이므로 재사용 가능한 도메인 서비스로 import하지 않습니다.

## 성능 및 안전 설계

* 파일 작업은 `features/filesystem/filesystem-limits.mts`의 명시적 timeout 경계를 사용합니다.
* 텍스트 읽기는 파일 크기와 offset 임계값을 기준으로 불필요한 전체 파일 읽기를 피합니다.
* 검색 실행은 `features/search/ripgrep-adapter.mts`를 통해 ripgrep에 위임합니다.
* stdio transport는 의도치 않은 stdout/stderr 출력을 격리해 MCP JSON 출력이 섞이지 않도록 합니다.
* 테스트는 npm에 배포되는 표면과 동일한 컴파일 산출물 `out`를 검증합니다.
* `verify:tools`는 컴파일된 tool catalog, dispatcher registry, history exclusion의 이름 계약을 비교합니다.
* `verify:source`는 최적화된 `src`와 `tests` 루트 경계, 제거된 플랫폼 helper 문구의 재유입 여부를 확인합니다.
* 최적화 보고서는 `.docs`에 누적하고 `verify:reports`로 확인합니다.

## 패키징 경계

배포 패키지는 `out/index.mjs`를 통해 `fs-mcp`를 노출하고 릴리스 문서를 포함합니다. 소스 파일, 테스트, 생성 fixture, 로컬 빌드 캐시는 런타임 패키지 입력으로 사용하지 않습니다.
