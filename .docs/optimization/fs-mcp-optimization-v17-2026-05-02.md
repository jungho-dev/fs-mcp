# fs-mcp 최적화 보고서 v17

## 목표

`create-mcp-server.mts`에 집중되어 있던 툴 카탈로그 생성 책임을 MCP tool 계층으로 이동해 서버 조립과 툴 정의를 분리한다.

## 대규모 변경

* `src/mcp/tools/tool-catalog.mts`를 신설해 전체 tool metadata, schema 변환, 런타임 guidance 문구를 전담하도록 이동했다.
* `src/app/server/create-mcp-server.mts`는 `list_tools` 요청에서 `createToolCatalog()`만 호출하도록 축소했다.
* `src/mcp/tools/index.mts`에서 tool catalog를 공개해 서버, 검증 스크립트, 계약 테스트가 같은 source of truth를 사용할 수 있게 했다.

## 구조 영향

* 서버 파일은 MCP lifecycle과 요청 handler 조립에 집중한다.
* 툴 설명과 입력 schema는 `mcp/tools` 표면에서 관리된다.
* 후속 버전에서 catalog와 dispatcher를 자동 비교할 수 있는 기반을 만들었다.

## 검증 계획

* `bun run check`
* `bun run test:contract`
* `bun run verify:tools`
