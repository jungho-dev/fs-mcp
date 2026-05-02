# fs-mcp 프로젝트 분석 보고서 v04

- 대상 프로젝트: `C:\JUNGHO\9.Workspace\2.Project\2.Node\fs-mcp`
- 분석 일시: 2026-05-01
- 목적: 프로젝트 재분석, tree 구조 최적화, 고도화 및 리팩토링 청사진 재구성
- 산출 기준: 현재 파일명을 보존하는 이동안이 아니라, 목표 책임 기준의 파일 재구성 및 rename 예상안

## 1. v4 결론

기존 v4 tree는 현재 파일명을 너무 많이 유지해 실제 리팩토링 청사진으로는 부족했다. 수정된 v4는 현재 파일을
그대로 옮기는 구조가 아니라, 역할 기준으로 파일을 다시 나누고 이름도 바꾸는 목표 구조다.

핵심 판단은 다음과 같다.

1. `src/index.mts`는 npm `bin` 계약 때문에 얇은 compatibility entry로만 유지한다.
2. `server.mts`, `filesystem.mts`, `search-manager.mts`, `terminal-manager.mts` 같은 대형 파일은 유지하지 않고
   책임 단위 파일로 분해한다.
3. `handlers`는 `mcp/controllers`로, `tools/schemas.mts`는 domain별 `*.schema.mts`로 재구성한다.
4. `src/assets/type`, `src/assets/utils`는 실제 새 공용 계층으로 만들되 runtime side effect는 금지한다.
5. `tests`는 기존 파일명 보존이 아니라 `*.unit.test.js`, `*.contract.test.js`, `*.integration.test.js` 기준으로
   재명명한다.

## 2. 최신 프로젝트 상태

| 항목 | 현재 상태 | 판단 |
| --- | --- | --- |
| 패키지명 | `@jungho-dev/fs-mcp` | 최신 기준으로 문서 반영 |
| 버전 | `1.0.1` | 배포 메타데이터 유지 |
| 공개 실행 파일 | `fs-mcp: out/index.mjs` | `src/index.mts`는 얇은 entry로 유지 필요 |
| 현재 `src` 구조 | `config`, `core`, `handlers`, `tools`, `types`, `utils`, `tests` | 책임 기준이 섞여 있음 |
| `src/assets` | 존재하지 않음 | alias만 있고 실제 구조는 미구현 |
| TypeScript | `bun run check` 통과 | 타입 계약은 현재 정상 |
| 패키징 | `npm pack --dry-run` 통과 | npm 산출물 생성 가능 |
| Biome | 568 errors, 782 warnings, 10 infos | 현재 품질 게이트로 사용 불가 |
| 전체 테스트 | 이번 분석에서 재실행 안 함 | 실제 설정과 test output 변경 위험 |
| 워크트리 | `biome.json`, `package.json`, `readme.md`, `src/tests/test_output/node_repl_debug.txt` 수정됨 | 사용자 변경으로 보고 미수정 |

## 3. 현재 구조 문제

| 현재 영역 | 문제 | 개선 방향 |
| --- | --- | --- |
| `src/core` | 서버 실행, MCP tool registry, dispatcher, transport가 섞임 | `app`, `mcp`로 분리 |
| `src/handlers` | MCP handler지만 controller 책임과 feature 호출이 섞임 | `mcp/controllers`로 재명명 |
| `src/tools` | tool schema, service, manager가 한 폴더에 혼재 | `mcp/schemas`, `features/*`로 분리 |
| `src/utils` | 순수 유틸, runtime helper, feature helper가 혼재 | `assets`, `app/runtime`, `features/*`로 재배치 |
| `src/types` | 공용 타입 계층이 작고 사용 경계가 흐림 | `assets/type/*.types.mts`로 확장 |
| `src/config` | config 저장소와 사용자 경로 정책이 결합 | `features/config` 내부 service/store로 분해 |
| `src/tests` | 테스트 종류와 fixture/output이 섞임 | 목적별 테스트와 sandbox 분리 |

## 4. 대형 파일 기준 개선 포인트

| 현재 파일 | 문제 | 목표 분해 |
| --- | --- | --- |
| `src/core/server.mts` | 서버 생성, tool list, dispatcher, response가 결합 | `app/server/*`, `mcp/registry/*`, `mcp/router/*`, `mcp/responses/*` |
| `src/tools/filesystem.mts` | path 검증, read/write/list/edit 보조가 결합 | `features/filesystem/*Service.mts`, `features/filesystem/path-guard.mts` |
| `src/tools/search-manager.mts` | rg 실행, 세션, 결과 포맷, 캐시가 결합 | `search-service`, `ripgrep-adapter`, `result-session-store` |
| `src/tools/terminal-manager.mts` | session lifecycle, output buffer, interaction이 결합 | `terminal-session-store`, `process-output-buffer`, `terminal-service` |
| `src/tools/improved-process-tools.mts` | process 실행과 출력 정책이 결합 | `process-runner`, `process-service`, `command-policy` |
| `src/utils/system-info.mts` | 플랫폼 탐지와 guidance 생성이 큼 | `runtime-info`, `platform-detector` |
| `src/utils/files/docx.mts` | DOCX 파싱과 preview 정책이 큼 | `docx-reader`, `document-outline-reader` |

## 5. v4 목표 tree 청사진

아래 tree는 현재 파일명을 보존하는 tree가 아니다. 실제 리팩토링 후 목표 파일명, 폴더 재구조화, 대형 파일
분할을 전제로 한 최종 예상 구조다.

```text
src/
├─ index.mts
├─ app/
│  ├─ bootstrap.mts
│  ├─ server/
│  │  ├─ create-mcp-server.mts
│  │  ├─ server-context.mts
│  │  └─ server-lifecycle.mts
│  ├─ transport/
│  │  ├─ stdio-transport.mts
│  │  └─ stdio-message-channel.mts
│  └─ runtime/
│     ├─ app-logger.mts
│     ├─ output-capture.mts
│     ├─ platform-detector.mts
│     ├─ runtime-info.mts
│     └─ version.mts
├─ mcp/
│  ├─ registry/
│  │  ├─ tool-definition.mts
│  │  └─ tool-registry.mts
│  ├─ router/
│  │  ├─ request-context.mts
│  │  └─ tool-router.mts
│  ├─ schemas/
│  │  ├─ config.schema.mts
│  │  ├─ edit.schema.mts
│  │  ├─ filesystem.schema.mts
│  │  ├─ history.schema.mts
│  │  ├─ process.schema.mts
│  │  ├─ search.schema.mts
│  │  └─ terminal.schema.mts
│  ├─ controllers/
│  │  ├─ config.controller.mts
│  │  ├─ edit.controller.mts
│  │  ├─ filesystem.controller.mts
│  │  ├─ history.controller.mts
│  │  ├─ process.controller.mts
│  │  ├─ search.controller.mts
│  │  └─ terminal.controller.mts
│  └─ responses/
│     ├─ error-response.mts
│     └─ tool-response.mts
├─ features/
│  ├─ config/
│  │  ├─ config-metadata.mts
│  │  ├─ config-paths.mts
│  │  ├─ config-service.mts
│  │  └─ config-store.mts
│  ├─ filesystem/
│  │  ├─ directory-service.mts
│  │  ├─ file-move-service.mts
│  │  ├─ file-preview-service.mts
│  │  ├─ file-read-service.mts
│  │  ├─ file-write-service.mts
│  │  ├─ mime-registry.mts
│  │  ├─ path-guard.mts
│  │  └─ readers/
│  │     ├─ binary-reader.mts
│  │     ├─ docx-reader.mts
│  │     ├─ document-outline-reader.mts
│  │     ├─ image-reader.mts
│  │     ├─ reader-registry.mts
│  │     └─ text-reader.mts
│  ├─ edit/
│  │  ├─ block-editor.mts
│  │  ├─ edit-service.mts
│  │  ├─ line-ending-policy.mts
│  │  └─ occurrence-resolver.mts
│  ├─ search/
│  │  ├─ fuzzy-matcher.mts
│  │  ├─ result-session-store.mts
│  │  ├─ ripgrep-adapter.mts
│  │  ├─ search-log.mts
│  │  └─ search-service.mts
│  ├─ process/
│  │  ├─ command-policy.mts
│  │  ├─ process-output-buffer.mts
│  │  ├─ process-runner.mts
│  │  ├─ process-service.mts
│  │  ├─ process-session-store.mts
│  │  ├─ repl-detector.mts
│  │  ├─ shell-resolver.mts
│  │  └─ terminal-service.mts
│  └─ history/
│     ├─ history-service.mts
│     └─ tool-history-store.mts
├─ assets/
│  ├─ type/
│  │  ├─ common.types.mts
│  │  ├─ config.types.mts
│  │  ├─ edit.types.mts
│  │  ├─ filesystem.types.mts
│  │  ├─ history.types.mts
│  │  ├─ mcp-tool.types.mts
│  │  ├─ process.types.mts
│  │  ├─ search.types.mts
│  │  └─ terminal.types.mts
│  └─ utils/
│     ├─ concurrency-limit.mts
│     ├─ path-normalize.mts
│     ├─ result.mts
│     ├─ text-slice.mts
│     └─ timeout.mts
└─ tests/
   ├─ contract/
   │  ├─ config.contract.test.js
   │  ├─ filesystem.contract.test.js
   │  ├─ mcp-tools.contract.test.js
   │  ├─ process.contract.test.js
   │  └─ security.contract.test.js
   ├─ integration/
   │  ├─ mcp-server.integration.test.js
   │  ├─ repl.integration.test.js
   │  ├─ search.integration.test.js
   │  └─ terminal.integration.test.js
   ├─ unit/
   │  ├─ edit.unit.test.js
   │  ├─ filesystem.unit.test.js
   │  ├─ process.unit.test.js
   │  └─ search.unit.test.js
   ├─ fixtures/
   │  ├─ files/
   │  ├─ process/
   │  └─ search/
   └─ sandbox/
      ├─ config/
      └─ output/
```

## 6. tree 설계 기준

### 6.1 `app`

`app`는 실행 조립 계층이다. MCP server 생성, stdio 연결, runtime logging, platform 탐지만 둔다. 파일,
검색, 프로세스 같은 domain 기능을 직접 구현하지 않는다.

### 6.2 `mcp`

`mcp`는 외부 MCP 계약 계층이다. schema, controller, registry, router, response formatter만 둔다. 실제
작업은 `features` service를 호출한다.

### 6.3 `features`

`features`는 기능 구현 계층이다. 기존 `tools`라는 포괄 이름을 제거하고 `config`, `filesystem`, `edit`,
`search`, `process`, `history`로 나눈다. 파일명은 `service`, `store`, `adapter`, `policy`, `reader`처럼
책임을 드러내는 이름으로 바꾼다.

### 6.4 `assets`

`assets/type`은 공용 타입만 둔다. `assets/utils`는 timeout, concurrency, 문자열 slicing 같은 순수 유틸만
둔다. MCP SDK, filesystem, process, config store에 의존하는 코드는 금지한다.

### 6.5 `tests`

`tests`는 현재 테스트 파일명을 유지하지 않는다. 테스트 목적을 파일명에 드러내도록 `*.unit.test.js`,
`*.contract.test.js`, `*.integration.test.js`로 재명명한다.

## 7. 현재 구조에서 목표 구조로 변경 예상

| 현재 위치 | 변경 방식 | 목표 위치 |
| --- | --- | --- |
| `src/index.mts` | entry만 남기고 bootstrap 호출로 축소 | `src/index.mts`, `src/app/bootstrap.mts` |
| `src/core/server.mts` | 서버 생성, tool registry, router, response로 분할 | `app/server/*`, `mcp/registry/*`, `mcp/router/*`, `mcp/responses/*` |
| `src/core/custom-stdio.mts` | stdio transport와 message channel로 분할 | `app/transport/stdio-transport.mts`, `app/transport/stdio-message-channel.mts` |
| `src/core/error-handlers.mts` | MCP response formatter로 재명명 | `mcp/responses/error-response.mts` |
| `src/core/version.mts` | runtime metadata로 이동 | `app/runtime/version.mts` |
| `src/handlers/*` | handler 명칭 제거, controller로 재명명 | `mcp/controllers/*.controller.mts` |
| `src/tools/schemas.mts` | domain별 schema 파일로 분할 | `mcp/schemas/*.schema.mts` |
| `src/tools/config.mts`, `src/config/*` | config service/store/metadata/path로 분해 | `features/config/*` |
| `src/tools/filesystem.mts` | 파일 작업별 service와 path guard로 분해 | `features/filesystem/*Service.mts`, `features/filesystem/path-guard.mts` |
| `src/utils/files/*` | reader 명칭으로 재정리 | `features/filesystem/readers/*-reader.mts` |
| `src/tools/mime-types.mts` | 파일 feature 내부 registry로 재명명 | `features/filesystem/mime-registry.mts` |
| `src/tools/edit.mts`, `src/utils/lineEndingHandler.mts` | editor service와 policy로 분해 | `features/edit/*` |
| `src/tools/search-manager.mts` | service, adapter, session store로 분해 | `features/search/search-service.mts`, `ripgrep-adapter.mts`, `result-session-store.mts` |
| `src/tools/fuzzySearch.mts`, `src/utils/fuzzySearchLogger.mts` | matcher와 log로 재명명 | `features/search/fuzzy-matcher.mts`, `search-log.mts` |
| `src/utils/ripgrep-resolver.mts` | rg 실행 adapter로 흡수 | `features/search/ripgrep-adapter.mts` |
| `src/tools/process.mts`, `src/tools/improved-process-tools.mts` | process service와 runner로 분해 | `features/process/process-service.mts`, `process-runner.mts` |
| `src/tools/terminal-manager.mts` | terminal service, session store, output buffer로 분해 | `features/process/terminal-service.mts`, `process-session-store.mts`, `process-output-buffer.mts` |
| `src/core/command-manager.mts` | command policy로 재명명 | `features/process/command-policy.mts` |
| `src/utils/process-detection.mts` | repl/shell 탐지 책임으로 분리 | `features/process/repl-detector.mts`, `shell-resolver.mts` |
| `src/utils/toolHistory.mts` | history store/service로 분해 | `features/history/tool-history-store.mts`, `history-service.mts` |
| `src/utils/system-info.mts` | platform/runtime 정보로 분해 | `app/runtime/platform-detector.mts`, `app/runtime/runtime-info.mts` |
| `src/utils/logger.mts`, `src/utils/capture.mts` | app runtime 명칭으로 이동 | `app/runtime/app-logger.mts`, `app/runtime/output-capture.mts` |
| `src/types/*` | domain별 공용 타입으로 확장 | `assets/type/*.types.mts` |
| `src/utils/withTimeout.mts` | 순수 timeout 유틸로 rename | `assets/utils/timeout.mts` |
| `src/tests/*` | 목적 기반 테스트명으로 재명명 | `tests/{unit,contract,integration,fixtures,sandbox}/*` |

## 8. 리팩토링 순서

1. `src/index.mts`를 얇은 entry로 축소하고 `src/app/bootstrap.mts`를 만든다.
2. `src/assets/type`, `src/assets/utils`를 만들고 side effect 없는 타입과 유틸부터 이동한다.
3. `src/mcp/schemas`를 domain별 schema로 분리하고 controller가 schema만 참조하게 만든다.
4. `src/core/server.mts`를 `app/server`, `mcp/registry`, `mcp/router`, `mcp/responses`로 분해한다.
5. `src/handlers`를 `mcp/controllers`로 rename하고 feature service 호출만 남긴다.
6. `features/config`를 먼저 분해해 테스트 sandbox config 주입 기반을 만든다.
7. `features/filesystem`, `features/edit`, `features/search`, `features/process`, `features/history` 순서로 분해한다.
8. 테스트 파일을 목적별 이름으로 재명명하고 `sandbox/config`, `sandbox/output`을 사용하게 바꾼다.
9. `architecture.md`, `readme.md`, `tsconfig.paths.json`을 새 구조 기준으로 갱신한다.
10. 모든 단계는 `bun run check`, focused test, `npm pack --dry-run` 순서로 검증한다.

## 9. 성능 최적화 기준

| 영역 | 최적화 |
| --- | --- |
| 파일 다중 읽기 | `assets/utils/concurrency-limit.mts` 기반 동시성 제한 |
| 파일 preview | reader registry에서 type별 reader lazy load |
| 검색 | `result-session-store`에 TTL, max result cap, ring buffer 적용 |
| rg 실행 | `ripgrep-adapter`에서 binary resolution cache 적용 |
| 프로세스 출력 | `process-output-buffer`에 line/byte cap 적용 |
| 프로세스 세션 | session store에 idle TTL과 cleanup interval 적용 |
| 시스템 정보 | `runtime-info` 결과 lazy cache 처리 |
| path 검증 | `path-guard`에서 allowed directory normalize cache 적용 |

## 10. 수용 기준

1. `src/core`, `src/tools`, `src/handlers`, `src/utils`, `src/types`, `src/config`는 최종 목표 구조에서 제거한다.
2. `src/index.mts`는 npm `bin` 호환용 entry만 담당하고 business logic을 갖지 않는다.
3. MCP schema는 단일 `schemas.mts`가 아니라 domain별 `*.schema.mts`로 나뉜다.
4. controller는 schema validation과 service 호출만 담당한다.
5. feature service는 MCP SDK를 직접 import하지 않는다.
6. `assets/type`은 runtime side effect가 없어야 한다.
7. `assets/utils`는 filesystem, process, config store에 의존하지 않아야 한다.
8. 테스트는 실제 사용자 config와 추적 중인 output 파일을 변경하지 않아야 한다.
9. 리팩토링 후 `bun run check`와 `npm pack --dry-run`은 계속 통과해야 한다.

## 11. v4 최종 판단

수정된 v4 청사진은 현재 파일명을 보존하는 이동표가 아니라, 실제 리팩토링 후 도달해야 할 목표 구조다.

우선순위는 `entry/bootstrap`, `assets`, `mcp contract`, `features/config`, `filesystem`, `search`,
`process`, `tests sandbox` 순서다. 이 순서가 안전한 이유는 외부 실행 계약과 공용 타입을 먼저 안정화한 뒤,
대형 기능 파일을 service/store/adapter/policy 단위로 쪼갤 수 있기 때문이다.
