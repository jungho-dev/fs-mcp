# fs-mcp 성능·토큰·프리징 개선 보고서

- 작성일: 2026-05-13
- 결론: 현재 코드 기준으로 가장 큰 즉시 효과는 `tool surface/list_tools payload 축소`, `응답 중복 직렬화 제거`, `search/process 세션 메모리 상한 도입`이다.
- 상태: 실제 코드 반영과 검증까지 완료했다.
- 적용 결과 요약:
  - tool description/schema payload와 저효율 tool surface를 줄여 `list_tools` payload를 `48,129 chars -> 31,775 chars -> 28,002 chars`로 축소했다.
  - `contextIndexReplaceLargeOutputs` 기본값을 `true`로 전환해 large output이 기본적으로 compact response로 내려가도록 바꿨다.
  - search는 기본 `maxResults=5000`, preview-only start response, 더 짧은 completed-session cleanup으로 메모리 상한을 넣었다.
  - process는 active line budget `4000`, completed session budget `25개`, poll interval `100ms`로 줄였다.

## 작업 범위

이번 분석은 다음 축을 대상으로 진행했다.

1. MCP 초기화와 `list_tools` 응답 크기
2. tool result 정규화와 context indexing 경로의 중복 직렬화
3. search 세션과 process 세션의 메모리 누적 구조
4. 프리징 방지용 기존 가이드와 실제 구현 간의 차이
5. 현재 테스트/타입체크 통과 여부

## 작업 결과

### 1. P0 - `list_tools` payload와 schema 생성 비용 축소

관찰:

- 현재 공개 tool 수는 1차 적용 뒤 `29개`였고, 추가 surface 축소 뒤 `25개`다.
- 실제 runtime tool payload는 `48,129 chars`다. 대략 토큰으로 환산하면 약 `12k` 수준이다.
- description 총합은 `23,121 chars`, input schema JSON 총합은 `20,334 chars`다.
- 상위 5개 무거운 tool은 `start_processes`, `edit_blocks`, `start_searches`, `write_files`, `get_configs`다.
- 상위 5개만 합쳐도 `11,741 chars`를 차지한다.

개선안:

1. 기본 `list_tools`는 짧은 description만 노출하고, 상세 가이드는 별도 help tool 또는 docs resource로 분리한다.
2. `zodToJsonSchema(...)`를 import 시점마다 계산하지 말고 build-time precomputed JSON으로 고정하거나 최소한 lazy cache로 전환한다.
3. heavy family를 capability flag로 분리한다. 예: `process`, `git`, `full search`를 client 옵션으로 opt-in.
4. 이전 rationalization 작업과 이어서 `rename_files`, `get_compressed_search`, `list_processes`, `list_searches` 같은 저효율 표면을 추가 제거했다.

기대효과:

- MCP 초기화 시 전달되는 토큰 감소
- agent spawn 시 반복되는 tool definition 비용 감소
- 서버 import 시 schema 변환 비용 감소

### 2. P0 - tool result 정규화에서 대형 응답이 중복 직렬화된다

관찰:

- `normalizeToolResult()`는 원본 `content`를 정규화한 뒤, 다시 `data.text`, `data.content`, `data.structuredContent`를 모두 유지한다.
- `compactStandardToolOutput()`는 그 뒤에 다시 큰 문자열과 큰 컬렉션을 순회하고 `JSON.stringify()`까지 수행한다.
- 기본 설정에서 `contextIndexReplaceLargeOutputs`는 `false`라서, 큰 출력은 SQLite에 색인되더라도 원본 payload는 그대로 남는다.
- 실제 분석 중 `get_full_search` 한 번의 응답에서 `content`는 `44,181 chars`, `structuredContent` 쪽은 `49,603 chars` 규모였고, 여기에 context index reference까지 추가 생성됐다.

개선안:

1. `StandardToolOutput`에서 `data.text`를 항상 유지하지 말고, text-only client가 실제로 필요할 때만 생성한다.
2. 큰 batch 응답은 `content`와 `structuredContent`를 둘 다 풀사이즈로 들고 가지 않게 한다. 한쪽은 summary, 다른 쪽만 full로 유지한다.
3. auto context index가 켜져 있으면 `replaceLargeOutputs=true`를 기본값으로 바꾸거나, 최소한 `search/process/read_files/edit_blocks` 같은 대형 응답 계열은 강제로 replace 모드로 태운다.
4. `createCombinedText()`와 collection `JSON.stringify()`는 lazy evaluation으로 바꿔서, 실제 표시가 필요할 때만 계산한다.

기대효과:

- 메모리 사용량 감소
- 응답 직렬화 시간 감소
- 토큰 소비 감소
- 대형 응답에서 UI 프리징 가능성 감소

### 3. P0 - search 세션이 결과 전체를 메모리에 보관한다

관찰:

- search 세션은 `results: SearchResult[]`를 계속 누적한다.
- 시작 응답에서도 `results: [...session.results]`로 배열 복사를 한 번 더 한다.
- 후속 pagination에서도 매번 `session.results.filter(...)`, `slice(...)`를 수행한다.
- cleanup은 기본 `5분` 동안 완료 세션을 유지한다.
- DOCX 검색은 ripgrep 경로와 별도로 비동기 병합되며, 결과도 동일 배열에 추가된다.

개선안:

1. large search는 in-memory array 대신 chunked temp file 또는 SQLite-backed cursor로 전환한다.
2. 시작 응답에서 전체 `results` 복사를 하지 말고, 최대 10개 preview만 별도로 유지한다.
3. pagination source를 `session.results` 전체 배열이 아니라 page store 기반으로 바꾼다.
4. `maxResults`가 없을 때는 메모리 상한을 두고, 초과분은 spill 또는 hard stop 한다.
5. DOCX 검색은 별도 옵션으로 분리하거나, ripgrep 경로가 끝난 뒤 opt-in 후처리로 내린다.

기대효과:

- 대형 코드베이스 검색 시 메모리 폭증 방지
- 긴 search session 유지 시 프리징 위험 감소
- page read 비용 감소

### 4. P1 - process 세션은 출력 전체를 active/completed 양쪽에서 오래 잡고 있고 poll 비용도 높다

관찰:

- active session은 `outputLines[]`를 계속 누적한다.
- process 종료 시 `completedSessions`에 `outputLines: [...session.outputLines]`를 복사한다.
- completed session은 `100개`까지 유지한다.
- `process-runner`는 새 출력 감지를 위해 `50ms` 간격 polling을 돌린다.
- `process-terminal-service`는 별도로 `100ms` periodic check에서 누적된 전체 `output` 문자열을 다시 분석한다.
- state 분석이나 snapshot 계산 시 `session.outputLines.join("\n")`이 반복된다.

개선안:

1. session당 최대 line/char 상한을 두고 오래된 출력은 ring buffer 또는 spill file로 밀어낸다.
2. completed session 100개 고정 보관 대신 total char budget 기반 eviction으로 바꾼다.
3. prompt detection은 polling 중심이 아니라 최근 tail window만 검사하거나 event-driven으로 축소한다.
4. `join("\n")` 전체 재구성 대신 incremental char count, tail cache, last N lines cache를 유지한다.
5. verbose timing/output event 기록은 opt-in일 때만 보관하고 기본은 축소한다.

기대효과:

- 장기 실행 세션에서 메모리 누적 억제
- polling CPU 소모 감소
- REPL/대형 빌드 로그에서 응답 지연 완화

### 5. P1 - auto context index 기본값이 현재 구조와 충돌한다

관찰:

- 기본 설정은 `contextIndexEnabled: true`다.
- 임계값은 `5000 chars`, `120 lines`다.
- 하지만 기본값 `contextIndexReplaceLargeOutputs: false` 때문에, index write 비용은 내면서 원본 응답 축소는 못 하고 있다.

개선안:

1. 운영 기본값을 `replaceLargeOutputs: true`로 바꾼다.
2. 또는 기본값을 `enabled: false`로 두고, 특정 client나 explicit config에서만 켠다.
3. 최소한 `structuredContent.results/items/output` 같은 대형 필드에 대해서는 강제 replace 규칙을 추가한다.
4. `get_configs`로 안내하는 설명도 현재 동작에 맞춰 더 명확히 조정한다.

기대효과:

- 불필요한 SQLite write 감소 또는 실제 토큰 절감 달성
- "색인만 하고 payload는 유지"하는 중복 비용 제거

### 6. P2 - 구현상 이미 가이드가 있는데 runtime 기본 동작은 아직 충분히 보수적이지 않다

관찰:

- `tools-const.ts`에는 이미 `BATCH_GUIDANCE`, `APPLY_PATCH_PERFORMANCE_GUIDANCE`, `CMD_PREFIX_DESCRIPTION`가 있다.
- 즉 문서상으로는 큰 입력을 `args_path`로 보내고 batch-first로 쓰라고 강하게 유도한다.
- 반면 server/runtime 쪽에는 여전히 heavy tool description, heavy schema, heavy normalized result가 그대로 실려 있다.

개선안:

1. guide는 유지하되, runtime 자체도 short/compact default를 강제해야 한다.
2. `resultMode: "summary" | "full"` 같은 명시적 플래그를 broad tool family에 도입한다.
3. client별 기본값을 둘 수 있으면 Codex/Claude 같은 agent client는 기본 compact 모드로 시작한다.

## 변경 파일

1. `.docs/fs-mcp-performance-optimization-report-2026-05-13.md` : 분석 보고서를 실제 적용 결과와 실측값 기준으로 갱신
2. `src/tools/tools-const.ts` : compact description/lazy schema catalog helper 추가, shared guidance 축소
3. `src/tools/tools-config.ts` : config tool description 축소, lazy schema catalog 적용
4. `src/tools/tools-filesystem.ts` : filesystem/search tool description 축소, lazy schema catalog 적용
5. `src/tools/tools-process.ts` : process tool description 축소, lazy schema catalog 적용
6. `src/tools/tools-git.ts` : git catalog lazy schema 적용, commit guidance 축소
7. `src/cores/server/server-create-mcp-server.ts` : list_tools catalog 재조합 비용 제거
8. `src/features/config/config-store.ts` : `contextIndexReplaceLargeOutputs` 기본값을 `true`로 변경
9. `src/features/config/config-metadata.ts` : context index 기본 동작 설명을 실제 기본값과 일치시킴
10. `src/features/search/search-service.ts` : default result cap, preview-only start response, shorter cleanup 적용
11. `src/controllers/controllers-search.ts` : result limit 노출 메시지/structuredContent 추가
12. `src/assets/type/common.ts` : process session budget 추적 필드 추가
13. `src/features/process/process-terminal-service.ts` : active/completed line budget, completed session budget, state-analysis tail window 적용
14. `src/features/process/process-runner.ts` : process poll interval 완화, tail-window state analysis, truncation notice 적용
15. `src/tools/tools-dispatcher.ts` : 저효율 public tool dispatcher 제거
16. `src/controllers/controllers-filesystem.ts` : 제거된 rename tool handler 정리
17. `src/controllers/controllers-process.ts` : 제거된 process listing tool handler 정리
18. `src/schemas/schemas-filesystem.ts` : 제거된 rename tool schema 정리
19. `src/schemas/schemas-search.ts` : 제거된 compressed/list search schema 정리
20. `src/schemas/schemas-process.ts` : 제거된 list process schema 정리
21. `README.md`, `readme-ko.md` : tool count와 public surface 문서 갱신
22. `tests/contracts/tool-catalog.contract.test.js`, `tests/contracts/batch-tool.contract.test.js`, `tests/smoke/search/search-code.test.js` : 제거된 tool surface 계약 반영

## 검증

1. `bunx tsc --noEmit` : 실행했고 통과했다.
2. `bun tests/run-all-tests.js` : 실행했고 `18/18 passed` 확인했다.
3. post-change 계측:
   - `toolCount=25`
   - `descriptionChars=6,173`
   - `schemaChars=18,128`
   - `payloadChars=28,002`
4. default compaction 실측:
   - `contextIndexReplaceLargeOutputs=true`
   - large text content와 large structured text가 기본 설정에서 context-index reference로 대체되는 것 확인
5. search limit 실측:
   - synthetic 6000-match file 기준 `totalResults=5000`, `wasLimited=true` 확인
6. process budget 실측:
   - synthetic 7000-line command 기준 completed session이 `completedOutputLines=4000`, `discardedLineCount=3001`로 budget을 적용한 것 확인
7. 보고서 write 후 read-back 확인을 수행했다.

## 문제

1. `schemaChars`도 surface 축소로 `20,334 -> 18,128`까지 줄었다. 남은 schema 절감은 build-time precomputed schema나 capability flag가 필요하다.
2. `resultMode`/capability flag 같은 추가 compact surface는 더 줄일 여지가 있지만, 현재 보고서의 핵심 병목 항목은 실제 코드에 반영됐다.
3. client별 UI 렌더링 토큰 차이는 별도 실사용 로그 계측이 있어야 더 정확히 산출할 수 있다.

## 후속 작업

1. 필요하면 다음 단계로 `resultMode` 분리 또는 capability flag surface 축소를 추가 적용한다.
2. client별 실사용 로그 기준으로 large response 토큰 절감량을 후속 계측한다.
3. search/process를 disk-backed cursor까지 더 밀어붙일지 여부는 실제 메모리 프로파일을 보고 결정한다.

## 근거

- [확인됨] before/after tool surface 정량 측정:
  - before: `29 tools / 23,121 description chars / 20,334 schema chars / 48,129 payload chars`
  - after 1차: `29 tools / 7,150 description chars / 20,334 schema chars / 31,775 payload chars`
  - after 추가: `25 tools / 6,173 description chars / 18,128 schema chars / 28,002 payload chars`
- [확인됨] `src/cores/server/server-create-mcp-server.ts` : `ListToolsRequestSchema`에서 config/filesystem/process/git catalog 전체를 합쳐 반환한다.
- [확인됨] `src/cores/responses/responses-tool-result.ts` : `createCombinedText()`, `createStandardOutput()`, `normalizeToolResult()`가 `content + text + structuredContent`를 함께 유지한다.
- [확인됨] `src/features/context/context-output-compactor.ts` : 큰 문자열과 큰 컬렉션에 대해 `JSON.stringify()` 기반 auto indexing을 수행하고, 기본 replace 여부는 runtime config에 의존한다.
- [확인됨] `src/features/config/config-store.ts` : 기본값이 `contextIndexEnabled: true`, `contextIndexReplaceLargeOutputs: true`, `contextIndexAutoMinChars: 5000`, `contextIndexAutoMinLines: 120`로 변경됐다.
- [확인됨] `src/features/search/search-service.ts` : search 세션은 기본 `maxResults=5000`, preview-only start response, `60s` cleanup을 사용한다.
- [확인됨] `src/features/process/process-terminal-service.ts` : active output line budget `4000`, completed session budget `25개`, completed line copy trim이 적용됐다.
- [확인됨] `src/features/process/process-runner.ts` : poll interval이 `100ms`로 완화됐고, 상태 분석은 tail window 기준으로 수행된다.
- [확인됨] `src/tools/tools-const.ts` : 이미 batch-first / args_path / freezing 방지 가이드가 포함돼 있다.
- [추론] 현재 가장 큰 토큰 절감은 tool definition 자체의 compact화와 대형 결과의 single-source 응답화에서 나온다.
