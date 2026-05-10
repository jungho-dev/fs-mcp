# fs-mcp 현재 구조 및 프로세스 플로우 분석 보고서

## 1. 분석 개요

- 대상: `C:/JUNGHO/9.Workspace/2.Project/2.Node/fs-mcp`
- 작성일: 2026-05-09
- 범위: 루트 설정, `src`, `tests`, `.docs`, GitHub publish workflow, MCP 도구 카탈로그와
  dispatcher 경계
- 제외: `node_modules`, `.git`, `out`의 구현 상세. 단, `out`을 import하는 테스트와 검증
  스크립트는 배포 표면 검증 근거로 확인했다.
- 방식: fs-mcp 기반 파일 목록, 읽기, 검색, Bun 기반 현재 도구 카탈로그 측정, 토큰 압축 벤치마크
  실행, 테스트 러너 실행 확인

## 2. 결론 요약

현재 프로젝트는 MCP 서버를 `cores -> tools/schemas -> controllers -> features`로 나눈 구조가
명확하고, 공개 도구 카탈로그와 dispatcher는 현재 소스 기준 53개 도구로 정렬되어 있다. 특히
`args_path` 계열 입력과 context index 기반 출력 압축이 들어가 있어, 장문 인자와 대형 결과를
줄이는 방향은 이미 구현되어 있다.

다만 운영과 배포 관점에서는 즉시 손볼 문제가 남아 있다. `tests/run-all-tests.js`는
`bun run build`를 전제로 하지만 현재 `package.json`에는 `build`, `test`, `verify`
스크립트가 없어서 전체 테스트 게이트가 시작 단계에서 실패한다. 또한
`tests/scripts/scripts-verify-tool-surface.mjs`는 context catalog를 검증 대상에 포함하지 않아
`tool-surface.contract.test.js`보다 검증 범위가 좁다.

성능 확장 측면에서는 배치 실행이 기본적으로 `Promise.all` 전체 병렬 실행이므로, 대량 파일,
프로세스, 검색 작업에서 I/O 폭주와 메모리 피크가 발생할 수 있다. 토큰 사용량 측면에서는
벤치마크상 98.18% 절감 효과가 확인됐지만, context index가 꺼져 있거나 실패할 때 원문이 그대로
반환되는 설계라 운영 기본값과 실패 모드 관리가 중요하다.

## 3. 현재 구조

### 3.1 루트

- `package.json`: 패키지 메타데이터, 공개 bin `fs-mcp -> out/index.mjs`, npm 포함 파일 정의
- `tsconfig.json`: TypeScript alias와 컴파일 대상 정의
- `biome.json`: 포맷과 린트 설정. 약 3,006줄로 프로젝트 내 가장 큰 설정 파일이다.
- `readme.md`, `readme-ko.md`, `architecture.md`, `architecture-ko.md`, `changelog.md`:
  공개 문서와 릴리스 문맥
- `.docs/analysis`, `.docs/optimization`: 분석 및 최적화 누적 보고서
- `tests`: contract, smoke, scripts, fixtures로 구성된 검증 표면

### 3.2 소스 계층

- `src/index.mts`: `startServer()`만 호출하는 bootstrap entrypoint
- `src/cores`: MCP server 생성, stdio transport, response normalization, runtime logging/info
- `src/tools`: MCP `list_tools`에 노출할 catalog와 `call_tool` dispatcher
- `src/schemas`: zod 기반 도구 인자 계약. `args_path`, `content_path`, `messagePath` 등
  장문 인자 참조 스키마 포함
- `src/controllers`: schema parse, batch response shaping, feature service 호출, `ServerResult`
  조립
- `src/features`: config, filesystem, edit, search, process, git, context index 실제 동작 구현
- `src/assets`: 파일 reader, 공통 타입, timeout 유틸리티

### 3.3 공개 도구 표면

현재 소스 import 기준 도구 수는 총 53개다.

| 그룹                   | 수  | 대표 도구                                                               |
| ---------------------- | --: | ----------------------------------------------------------------------- |
| config                 |   2 | `get_configs`, `set_config_values`                                    |
| context                |   4 | `index_contexts`, `search_contexts`, `list_contexts`, `clear_contexts` |
| filesystem/search/edit |  13 | `read_files`, `write_files`, `edit_blocks`, `start_searches`          |
| process                |   6 | `start_processes`, `read_process_outputs`, `interact_with_processes`    |
| git                    |  28 | `git_status`, `git_diff`, `git_commit`, `git_worktree`                |

측정 근거: Bun으로 `src/tools/*` catalog와 `getDispatchableToolNames()`를 직접 import했으며
`totalCatalog = 53`, `dispatchable = 53`이었다.

## 4. 프로세스 플로우

### 4.1 서버 시작

1. `src/index.mts`가 `startServer()` 호출
2. `server-run-mcp-server.ts`가 `FilteredStdioServerTransport` 생성
3. `configManager.loadConfig()`로 설정 로드
4. `server.connect(transport)`로 MCP stdio 연결
5. client initialized 이후 notification 허용 및 startup log flush

### 4.2 도구 목록 조회

1. MCP client가 `list_tools` 요청
2. `server-create-mcp-server.ts`가 config, context, filesystem, process, git catalog를 합쳐 반환
3. 각 catalog entry는 zod-to-json-schema로 변환된 inputSchema와 설명을 포함

### 4.3 도구 호출

1. MCP client가 `call_tool` 요청
2. `server-create-mcp-server.ts`가 client metadata를 갱신하고 git session scope를 설정
3. `dispatchToolCall(name, args)`가 도구명을 dispatcher registry에서 조회
4. `args_path`가 있으면 `readFileInternal()`로 JSON 파일을 읽고 inline override를 병합
5. controller가 zod schema를 parse하고 feature service를 호출
6. controller가 `ServerResult`를 반환
7. `normalizeToolResult()`가 표준 `structuredContent`, `_meta.fsMcpResult`, 표시용 text 생성
8. context index가 활성화되어 있고 payload가 크면 `compactStandardToolOutput()`이 원문을
   SQLite context index로 옮기고 참조 요약만 반환

### 4.4 파일 처리

1. `handleReadFile()`, `handleWriteFile()`, `handleListDirectory()` 등 controller 진입
2. `resolveAbsolutePath()`, `validatePath()`를 거쳐 경로 정규화와 허용 디렉터리 검사
3. reader factory가 text, image, docx, binary 등 파일 유형별로 content/metadata 생성
4. batch 도구는 `runParallelBatch()`와 `createBatchToolResponse()`로 다건 결과를 요약

### 4.5 검색 처리

1. `start_searches`가 검색 세션을 생성
2. content 검색은 ripgrep adapter를 사용하고, file 검색은 파일 목록 기반으로 동작
3. `get_search_results`가 sessionId, offset, length를 기준으로 결과를 페이지 단위로 반환
4. 대형 검색 결과는 output compactor가 `results` collection을 context index 참조로 줄일 수 있음

### 4.6 프로세스 처리

1. `start_processes`가 command 또는 command_path를 받아 프로세스 세션을 생성
2. `read_process_outputs`와 `interact_with_processes`가 pid 기반으로 stdout/stderr와 stdin 처리
3. REPL 감지, blocked 상태, timeout, shell 선택이 process feature layer에서 관리됨

### 4.7 Git 처리

1. `tools-dispatcher.ts`가 28개 git 도구명을 `handleGitTool(toolName, args)`로 라우팅
2. schema는 `schemas-git.ts`의 `GIT_INPUT_SCHEMAS`에서 도구별로 분리
3. git session은 current client key 기준으로 scope 처리됨

## 5. 확인된 문제점

### 5.1 High. 전체 테스트 러너와 package scripts 불일치

관찰:

- `tests/run-all-tests.js`는 빌드 단계에서 `bun run build`를 실행한다.
- 현재 `package.json`의 scripts에는 `git`, `swc`, `sync`, `tools`만 있고 `build`,
  `test`, `verify`가 없다.
- 실제 실행 결과 `bun tests/run-all-tests.js`는 `error: Script not found "build"`로 실패했다.

영향:

- 전체 contract/smoke suite가 시작 전에 중단된다.
- 이전 보고서나 문서의 `bun run verify`, `bun run test` 기준을 현재 워크트리가 만족하지 못한다.
- publish 전에 회귀를 막는 게이트가 약해진다.

수정 제안:

- `package.json`에 최소 `build`, `test`, `verify:source`, `verify:shape`,
  `verify:tools`, `verify:reports`, `verify`를 복구한다.
- `tests/run-all-tests.js`의 build 호출은 package script와 같은 단일 원천을 쓰게 유지한다.
- 임시 우회가 필요하면 `FS_MCP_SKIP_BUILD=1`은 로컬 디버깅 전용으로 문서화하고 CI에서는 금지한다.

### 5.2 High. tool surface 검증 스크립트가 context 도구를 누락

관찰:

- `tests/contracts/tool-surface.contract.test.js`는 `CONTEXT_TOOL_CATALOG`를 포함한다.
- `tests/scripts/scripts-verify-tool-surface.mjs`는 config, filesystem, git, process만 import하고
  context catalog를 제외한다.
- 현재 공개 도구 53개 중 context 도구 4개가 검증 스크립트의 catalog/dispatcher alignment 및
  `args_path` 확인에서 빠질 수 있다.

영향:

- `verify:tools`가 복구되더라도 context 도구의 schema 노출, dispatcher alignment 회귀를 놓칠 수 있다.
- contract test와 script gate가 서로 다른 표면을 검증해 신뢰도가 낮아진다.

수정 제안:

- `scripts-verify-tool-surface.mjs`에 `CONTEXT_TOOL_CATALOG` import와 합산을 추가한다.
- contract test와 verify script가 같은 `ALL_TOOL_CATALOGS` helper를 공유하도록 단일 원천을 만들거나,
  최소한 두 파일의 그룹 목록을 동기화한다.

### 5.3 High. 기본 파일 접근 정책이 여전히 전체 허용

관찰:

- `filesystem-service.ts`의 `isPathAllowed()`는 `allowedDirectories.includes("/") ||
  allowedDirectories.length === 0`이면 true를 반환한다.
- `getAllowedDirs()`는 설정 로드 실패 시에도 빈 배열을 반환하며 주석상 permissive path를 유지한다.

영향:

- 기본 설정 또는 설정 로드 실패가 전체 파일시스템 허용으로 해석된다.
- 읽기, 쓰기, 삭제, 이동, 프로세스 실행, git 조작 도구를 제공하므로 기본 허용 범위가 곧 보안 표면이다.

수정 제안:

- 빈 배열 의미를 "허용 없음" 또는 "현재 workspace만 허용"으로 바꾼다.
- 전체 허용은 `"*"`, `allowAll: true`, 또는 명시적 root wildcard로만 가능하게 분리한다.
- 호환성 유지가 필요하면 최초 실행 경고와 migration flag를 둔다.

### 5.4 Medium. batch 실행이 무제한 병렬

관찰:

- `controllers-batch.ts`의 `runParallelBatch()`는 `items.map(...)` 전체를 `Promise.all`로 실행한다.
- 파일 읽기, 쓰기, 삭제, 검색, 프로세스 상호작용처럼 I/O 비용이 큰 도구가 batch helper를 공유한다.

영향:

- 수백~수천 item 입력에서 file descriptor, process, CPU, 메모리 사용량이 순간적으로 치솟을 수 있다.
- 결과 compacting은 응답 토큰에는 도움이 되지만 실행 중 peak resource를 낮추지는 못한다.

수정 제안:

- `maxConcurrency` 기본값을 도구별로 둔다. 예: read/list/info는 16~32, write/edit/remove는 4~8.
- 입력 schema에 선택적 `max_concurrency`를 추가하되 상한을 강제한다.
- batch response에는 처리 순서를 유지하되 내부 실행은 bounded queue로 바꾼다.

### 5.5 Medium. context index 압축은 강하지만 실패 모드가 원문 반환

관찰:

- `normalizeToolResult()`는 원본 output을 만든 뒤 `compactStandardToolOutput()`을 호출한다.
- `compactStandardToolOutput()`는 context index가 꺼져 있으면 output을 그대로 반환한다.
- compact 중 예외가 나면 `contextIndexError`를 붙이고 원 output을 반환한다.

영향:

- 정상 활성화 상태에서는 토큰 절감이 크지만, 설정 비활성화, DB 실패, 권한 문제 때 대형 payload가
  그대로 응답될 수 있다.
- 토큰 예산이 빡빡한 클라이언트에서는 실패 모드가 곧 컨텍스트 폭증으로 이어진다.

수정 제안:

- context index 실패 시에도 최소 preview truncation fallback을 적용한다.
- `contextIndexEnabled` 기본값과 host별 권장값을 문서와 server instructions에 명확히 노출한다.
- `contextIndexError`가 발생한 응답에는 원문 크기와 fallback 적용 여부를 별도 metadata로 남긴다.

### 5.6 Medium. 표시용 text가 원본 structuredContent를 다시 직렬화할 수 있음

관찰:

- `normalizeToolResult()`는 content text를 `createDisplayText(toolName, originalOutput)`으로 만든다.
- 표준 structuredContent에는 compacted output을 넣지만, 표시용 text는 originalOutput 기준으로 생성된다.
- batch controller가 일부 preview를 줄이지만, 일반 도구의 대형 structuredContent는 text 표시 경로에서
  다시 커질 수 있다.

영향:

- structuredContent는 줄어도 `content[0].text`가 커지면 클라이언트가 transcript에 대량 토큰을
  보존할 수 있다.
- "구조화 데이터는 압축됐지만 text가 비대함"이라는 이중 경로 문제가 생긴다.

수정 제안:

- display text도 `standardOutput` 또는 별도 preview-only output 기준으로 생성한다.
- text 본문은 사람이 읽는 요약, 원문 접근은 context index reference로 분리한다.
- 회귀 테스트에 `content[0].text` 길이 상한 시나리오를 추가한다.

### 5.7 Medium. 문서와 검증 명령이 현재 package scripts와 어긋남

관찰:

- 기존 분석 보고서와 최적화 보고서는 `bun run verify`, `bun run test`, `bun run build`를
  검증 명령으로 언급한다.
- 현재 `package.json`에는 해당 scripts가 없다.

영향:

- 사용자와 CI가 문서대로 검증할 수 없다.
- 작업 결과 보고서의 PASS 기록이 현재 상태의 재현 가능한 검증이 아니다.

수정 제안:

- scripts 복구 후 문서의 검증 명령을 실제 scripts와 다시 맞춘다.
- 보고서 검증 스크립트가 "필수 명령이 package.json에 존재하는지"도 확인하게 한다.

### 5.8 Low. 대형 파일과 대형 설정이 유지보수 비용을 높임

관찰:

- 현재 측정에서 `biome.json`은 약 3,006줄이다.
- 큰 소스 파일로 `readers-docx.ts`, `search-service.ts`, `filesystem-service.ts`,
  `runtime-info.ts`, `process-terminal-service.ts`, `process-runner.ts` 등이 확인됐다.

영향:

- 리뷰와 변경 영향 분석 비용이 높다.
- 기능 경계는 폴더로 나뉘어 있지만 일부 feature 내부에서는 단일 파일 집중도가 높다.

수정 제안:

- 즉시 분할보다 먼저 테스트와 public contract를 고정한다.
- 실제 변경 빈도가 높은 파일부터 입출력 계약, 플랫폼별 구현, 포맷팅/요약 정도의 자연 경계로만 분리한다.
- `biome.json`은 생성/동기화 원천이 있다면 보고서나 README에 명시하고, 없다면 base config와 project
  override로 축소를 검토한다.

## 6. 성능 확장 제안

### 6.1 batch concurrency 제어

- 현상: `Promise.all` 무제한 병렬은 작은 배치에서는 빠르지만 큰 배치에서 불안정하다.
- 제안: bounded worker queue를 도입하고 도구별 기본 concurrency를 설정한다.
- 기대 효과: I/O burst 감소, 메모리 peak 완화, Windows 파일 잠금과 프로세스 생성 실패 감소.

### 6.2 검색 결과 페이지네이션 강화

- 현상: 검색 session은 offset/length로 읽을 수 있지만 initial result와 structured results가 클 수 있다.
- 제안: `start_searches`는 기본 initial preview 수를 더 낮추고, 전체 결과는 `get_search_results`로만
  확장하게 한다.
- 기대 효과: 첫 응답 latency와 토큰 사용량 감소.

### 6.3 context index DB 운영 한계 설정

- 현상: context index는 대형 output을 SQLite에 저장한다.
- 제안: per-client 또는 per-source TTL, 최대 document 수, 자동 cleanup 정책을 둔다.
- 기대 효과: 장기 실행 세션에서 DB 크기와 검색 latency가 누적되는 문제 완화.

### 6.4 process/session lifecycle 강화

- 현상: process 도구는 장기 세션과 상호작용을 지원한다.
- 제안: idle timeout, output ring buffer 크기, session별 최대 누적 output을 설정화한다.
- 기대 효과: 대형 stdout 또는 방치된 프로세스가 메모리와 토큰 표면을 키우는 문제 감소.

### 6.5 git 작업 출력 크기 정책

- 현상: git diff/log/show는 원천적으로 큰 출력을 만들기 쉽다.
- 제안: 기본 `stat` 또는 `nameOnly` 우선 모드, 대형 diff 자동 context index화, path filter 권고를 강화한다.
- 기대 효과: 코드 리뷰와 분석 중 불필요한 diff 전문 유입 감소.

## 7. 토큰 사용량 최소화 제안

### 7.1 이미 효과가 확인된 최적화

실행 명령:

```text
bun tests/scripts/token-optimization-benchmark.mjs
```

결과:

| 시나리오       | before tokens | after tokens | 절감   |
| -------------- | ------------: | -----------: | ------ |
| large text     |        76,212 |          391 | 99.49% |
| search results |        29,867 |          491 | 98.36% |
| batch results  |        32,961 |        1,646 | 95.01% |
| 합계           |       139,040 |        2,528 | 98.18% |

해석:

- context index 기반 output compaction은 대형 파일, 검색, 배치 응답에서 매우 강한 절감 효과를 보인다.
- 총 4개 context index reference로 원문을 대체했다.

### 7.2 추가 최적화 제안

- display text도 compacted output 기준으로 생성해 `content[0].text` 비대를 막는다.
- 모든 대형 입력 설명에 `args_path`, `content_path`, `messagePath`, `command_path`, `input_path`
  우선 사용을 더 앞에 배치한다.
- batch input 자체가 긴 경우에는 items inline 대신 `args_path`를 기본 권장한다.
- `read_files`의 기본 응답은 text 전문보다 file metadata, preview, `length` 기반 추가 읽기 흐름을 우선한다.
- search/list/process output은 "첫 응답 preview, 후속 pagination" 원칙을 기본값으로 고정한다.
- `SERVER_INSTRUCTIONS`에 "대형 로컬 파일/출력은 context index와 args_path를 우선 사용" 지침을 추가한다.

## 8. 우선순위 로드맵

### 8.1 즉시

1. `package.json` scripts 복구: `build`, `test`, `verify:*`, `verify`.
2. `scripts-verify-tool-surface.mjs`에 context catalog 포함.
3. `bun tests/run-all-tests.js`가 정상 시작되는지 확인.
4. display text가 원본 대형 structuredContent를 재확장하지 않도록 조정.

### 8.2 단기

1. batch helper에 bounded concurrency 도입.
2. context index 실패 시 truncation fallback 추가.
3. `allowedDirectories: []` 기본 정책을 명시적 opt-in 방식으로 변경.
4. report verifier에 package script 존재 검사 추가.

### 8.3 중기

1. search/process/git 대형 출력의 기본 preview 정책 강화.
2. context index TTL, 최대 문서 수, cleanup 정책 추가.
3. 대형 feature 파일은 테스트 보강 후 실제 경계 기준으로 단계적 분리.
4. publish workflow에 복구된 `bun run verify`를 게이트로 추가.

## 9. 실행 확인 결과

### 9.1 성공

```text
PASS bun tests/scripts/token-optimization-benchmark.mjs
```

핵심 결과:

```text
beforeTokens: 139040
afterTokens: 2528
savedTokens: 136512
savedPercent: 98.18
contextIndexes: 4
```

### 9.2 실패

```text
FAIL bun tests/run-all-tests.js
error: Script not found "build"
```

원인:

- 테스트 러너가 `bun run build`를 호출하지만 현재 `package.json`에 `build` script가 없다.

### 9.3 정적 확인

- `src/index.mts`, server create/run, dispatcher, batch controller, filesystem service, context compactor,
  tool surface tests를 직접 읽었다.
- 현재 소스 기준 catalog와 dispatcher 수는 각각 53개로 일치한다.
- 기존 `.docs/optimization/fs-mcp-optimization-v21-2026-05-02.md`와
  `.docs/analysis/2026-05-06-project-structure-report.md`를 참고했지만, 현재 상태와 다른 부분은
  재측정 결과를 우선했다.

## 10. 완료 감사 체크리스트

| 요구사항             | 산출 근거                                                   | 상태 |
| -------------------- | ----------------------------------------------------------- | ---- |
| 현재 구조 정리       | 3장 현재 구조, 3.3 공개 도구 표면                           | 완료 |
| 프로세스 플로우 정리 | 4장 서버 시작, list_tools, call_tool, 파일/검색/프로세스/git | 완료 |
| 문제점 확인          | 5장 8개 항목, 심각도와 영향 포함                            | 완료 |
| 성능 확장 제안       | 6장 batch/search/context/process/git 확장안                  | 완료 |
| 토큰 최소화 제안     | 7장 벤치마크와 추가 제안                                    | 완료 |
| 실제 검증 근거       | 9장 벤치마크 성공, 테스트 러너 실패, 정적 확인              | 완료 |
| 보고서 파일 생성     | `.docs/analysis/2026-05-09-current-structure-flow-optimization-report.md` | 완료 |
