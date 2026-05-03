# fs-mcp 아키텍처

## 런타임 흐름

```text
MCP stdio client
  -> out/index.js
  -> src/index.ts
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

* `src/cores`은 프로세스 bootstrap, stdio transport, 전역 오류 처리, 서버 조립을 담당합니다.
* `src/tools`, `src/schemas`, `src/controllers`, `src/cores/responses`는 MCP-facing catalog, 검증, routing, 응답 정규화를 담당합니다.
* `src/features`는 도메인 동작을 담당하며 `src/controllers`를 import하지 않습니다.
* `src/assets`는 공용 reader, 타입 선언, 작은 교차 도메인 유틸을 담당합니다.
* `tests`는 source 직접 import가 아니라 컴파일된 `out` 산출물을 검증합니다.

## 소스 트리

```text
src/
|-- index.ts
|-- app/
|   |-- runtime/
|   |-- server/
|   `-- transport/
|-- assets/
|   |-- readers/
|   |-- type/
|   `-- utils/
|-- controllers/
|-- domains/
|   |-- config/
|   |-- edit/
|   |-- filesystem/
|   |-- process/
|   `-- search/
|-- responses/
|-- schemas/
`-- tools/
```

## 의존성 규칙

```text
app -> tools
app -> responses
tools -> schemas
tools -> controllers
controllers -> schemas
controllers -> domains
domains -> assets
responses -> assets
tests -> out
```

도메인 모듈은 `domains/filesystem/filesystem-path-resolver.ts`처럼 같은 도메인 계층의 유틸을 통해 동작을 공유합니다. controller는 MCP adapter이므로 재사용 가능한 도메인 서비스로 import하지 않습니다.

## 성능 및 안전 설계

* 파일 작업은 `domains/filesystem/filesystem-limits.ts`의 명시적 timeout 경계를 사용합니다.
* 텍스트 읽기는 파일 크기와 offset 임계값을 기준으로 불필요한 전체 파일 읽기를 피합니다.
* 검색 실행은 `domains/search/search-ripgrep-adapter.ts`를 통해 ripgrep에 위임합니다.
* stdio transport는 의도치 않은 stdout/stderr 출력을 격리해 MCP JSON 출력이 섞이지 않도록 합니다.
* 테스트는 npm에 배포되는 표면과 동일한 컴파일 산출물 `out`를 검증합니다.
* `verify:tools`는 컴파일된 tool catalog와 dispatcher registry의 이름 계약을 비교합니다.
* `verify:source`는 최적화된 `src`와 `tests` 루트 경계, 제거된 플랫폼 helper 문구의 재유입 여부를 확인합니다.
* 최적화 보고서는 `.docs`에 누적하고 `verify:reports`로 확인합니다.

## 패키징 경계

배포 패키지는 `out/index.js`를 통해 `fs-mcp`를 노출하고 릴리스 문서를 포함합니다. 소스 파일, 테스트, 생성 fixture, 로컬 빌드 캐시는 런타임 패키지 입력으로 사용하지 않습니다.
