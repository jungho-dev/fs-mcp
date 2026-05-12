# fs-mcp 프로젝트 개선사항 분석 보고서

작성일: 2026-05-12
대상 프로젝트: `C:/JUNGHO/9.Workspace/2.Project/2.Node/fs-mcp`
근거 보고서: `.docs/fs-mcp-tool-usage-report-2026-05-12.md`

## 작업 범위

[확인됨] 저장된 Codex 로그 사용량 보고서를 기준으로 현재 프로젝트의 툴 표면, 스키마, 출력 처리, 테스트 가드를 대조했다.

확인한 근거:

| 구분 | 근거 |
| --- | --- |
| 실제 사용량 | `.docs/fs-mcp-tool-usage-report-2026-05-12.md` |
| 툴 표면 검증 | `tests/contracts/tool-surface.contract.test.js`, `tests/scripts/scripts-verify-tool-surface.mjs` |
| 파일 툴 스키마 | `src/schemas/schemas-filesystem.ts` |
| 검색 툴 스키마 | `src/schemas/schemas-search.ts` |
| 파일 서비스 | `src/features/filesystem/filesystem-service.ts` |
| 출력 압축 | `src/features/context/context-output-compactor.ts` |
| 프로세스 툴 설명 | `src/tools/tools-process.ts` |

## 결론

[확인됨] 실제 사용은 `read_files`, `start_searches`, `list_directories`, `get_search_results`에 집중되어 있다.

[확인됨] git 툴은 이미 9개로 축소된 방향이 로그 근거와 맞다. 추가 축소는 가능하지만, 기본 git 작업 흐름을 잃을 수 있어 즉시 권장하지 않는다.

[확인됨] 가장 먼저 고칠 항목은 테스트 가드 누락이다. `EXPECTED_GIT_TOOL_NAMES` 상수는 존재하지만 실제 assertion에 연결되지 않아, git 툴 표면이 다시 늘어도 현재 검증이 실패하지 않는다.

## 우선순위

| 우선순위 | 개선사항 | 근거 | 권장 조치 |
| --- | --- | --- | --- |
| P0 | git 표면 검증 가드 연결 | `EXPECTED_GIT_TOOL_NAMES`가 contract/script 양쪽에 있지만 실행 경로에서 사용되지 않음 | `GIT_TOOL_CATALOG` 이름과 `EXPECTED_GIT_TOOL_NAMES`를 deepEqual로 검증 |
| P1 | `list_directories` 출력량 제어 | 실제 53회 사용, 현재 스키마는 `path`, `depth` 중심 | `maxEntries`, `excludePatterns`, `includeFiles` 같은 후방 호환 옵션 추가 검토 |
| P1 | 검색 후속 호출 감소 | `start_searches` 82회, `get_search_results` 45회 | 초기 결과에 `hasMoreResults`, 다음 offset 안내, `filePattern`/literal 사용 가이드를 더 명확히 노출 |
| P1 | 대형 출력 압축 정책 개선 | `context-output-compactor.ts`가 색인만 추가하고 원본 structured data는 유지 | opt-in slim mode 또는 threshold 기반 reference-only 응답 옵션 검토 |
| P2 | legacy 단수형 이름 제거 | 보고서에 `read_file`, `list_directory`, `get_more_search_results` 사용 흔적 존재 | 서비스 메시지와 문서의 구형 이름을 현재 복수형/batch 이름으로 정리 |
| P2 | 프로세스 툴 설명 완화 | `start_processes`, `interact_with_processes` 설명에 local file work 상시 사용 문구 존재 | 파일 작업은 fs-mcp 우선, 프로세스는 계산/검증/런타임 용도로 문구 조정 |
| P3 | config 툴 개선 보류 | config 호출 22회로 존재하지만 병목 증거 약함 | 사용량 추가 누적 후 판단 |

## 상세 분석

### P0. git 표면 검증 가드 누락

[확인됨] `tests/contracts/tool-surface.contract.test.js`와 `tests/scripts/scripts-verify-tool-surface.mjs`에는 동일한 `EXPECTED_GIT_TOOL_NAMES` 상수가 있다.

[확인됨] 현재 실행 함수는 catalog/dispatcher alignment와 `args_path` 노출만 검증한다. git 툴 목록이 기대 목록과 같은지는 직접 검증하지 않는다.

영향:

- git 노출 툴이 9개에서 다시 증가해도 catalog와 dispatcher가 같이 증가하면 검증 통과 가능.
- 최근 git 축소 작업의 핵심 계약이 회귀 방지 테스트로 고정되지 않음.

권장 수정:

1. contract test에 `testEssentialGitSurface()` 추가.
2. verify script에도 동일 검증 추가.
3. `GIT_TOOL_CATALOG.map((tool) => tool.name).sort()`와 `EXPECTED_GIT_TOOL_NAMES.toSorted()` 비교.
4. git dispatcher에 숨겨진 툴이 남는지 기존 alignment 검증으로 계속 확인.

### P1. 고빈도 파일 탐색 툴 개선

[확인됨] 로그 기준 `read_files` 244회, `list_directories` 53회다.

[확인됨] `ReadFilesArgsSchema`는 단일 `paths`와 상세 `items` 양쪽을 지원한다. 이 방향은 실제 사용량과 맞다.

[확인됨] `ListDirectoryArgsSchema`는 주로 `path`, `depth` 중심이다. 서비스 내부에는 nested item 제한이 있지만 호출자가 원하는 제외/포함 규칙을 명시하기 어렵다.

권장 수정:

- `list_directories`에 후방 호환 옵션 추가 검토:
  - `maxEntries`: 디렉터리별 또는 전체 표시 제한.
  - `excludePatterns`: `node_modules`, `out`, `.git` 같은 고비용 경로 제외.
  - `includeFiles`: 구조만 볼 때 파일 표시 생략.
- 기본값은 기존 동작 유지.
- 테스트는 depth, 제한, 제외 패턴, 기존 호출 호환성을 함께 검증.

### P1. 검색 워크플로 개선

[확인됨] `start_searches` 82회와 `get_search_results` 45회가 같이 높다.

[추론] 검색 결과 후속 조회가 자연스러운 구조지만, 초기 응답이 다음 조회 기준을 더 강하게 안내하면 반복 호출을 줄일 수 있다.

권장 수정:

- `start_searches` 응답에 다음 조회용 offset/length 안내를 명시.
- `get_search_results` 설명에 negative offset tail 조회, length 사용법, 대형 결과 처리 기준을 강화.
- literal 검색과 `filePattern` 사용 설명을 고빈도 경로 중심으로 개선.
- 실제 스키마 변경 없이 설명 개선부터 진행 가능.

### P1. 대형 출력 압축 정책

[확인됨] `context-output-compactor.ts` 설명은 "indexing without data replacement"다.

[확인됨] 현재 구현은 큰 text/structured payload를 context index에 등록하지만, 원본 structured payload를 응답에서 제거하지 않는다.

영향:

- 데이터 보존 계약은 강함.
- 대형 `read_files`, 검색 결과, 프로세스 출력에서 토큰/컨텍스트 비용 절감은 제한적일 수 있음.

권장 수정:

- 기본 동작은 유지.
- 별도 opt-in 응답 모드 검토:
  - `compactResponse: true`
  - `maxInlineChars`
  - reference-only structured field
- 기존 클라이언트 호환성을 깨지 않도록 새 옵션으로만 제공.
- 검증은 read/search/process 대형 출력 fixture로 수행.

### P2. legacy 이름 정리

[확인됨] 사용량 보고서 원본 로그에는 `read_file`, `read_multiple_files`, `list_directory`, `get_more_search_results` 같은 구형 이름이 남아 있다.

[확인됨] 현재 파일 서비스의 디렉터리 fallback 안내에는 legacy 계열 표현이 남아 있을 가능성이 있다.

권장 수정:

- 사용자 노출 메시지와 문서에서 현재 툴명만 사용:
  - `read_files`
  - `list_directories`
  - `get_search_results`
- legacy 이름은 로그 분석/호환성 설명에만 유지.

### P2. process 툴 설명 조정

[확인됨] `src/tools/tools-process.ts`의 `start_processes`, `interact_with_processes` 설명은 local file analysis 또는 any local file work에 강한 사용 지시를 포함한다.

[추론] 프로젝트 루트 정책은 파일 읽기/쓰기/검색은 fs-mcp 우선이다. 프로세스 툴 설명이 너무 강하면 실제 사용이 불필요하게 shell/Bun 쪽으로 흐를 수 있다.

권장 수정:

- `start_processes`: build/test/runtime/package/system command 중심으로 설명.
- `interact_with_processes`: 실행 중 REPL, 장기 프로세스, stdin 상호작용 중심으로 설명.
- 파일 통계나 CSV/JSON 분석은 fs-mcp로 불충분할 때의 fallback으로 표현.

## Git 표면 판단

[확인됨] 로그상 실제 git 호출은 3개뿐이다.

| git 툴 | 호출 횟수 |
| --- | ---: |
| `git_status` | 22 |
| `git_diff` | 7 |
| `git_set_working_dir` | 3 |

[추론] 현재 9개 유지가 균형점이다.

유지 이유:

- `git_add`, `git_commit`은 실제 변경 완료 흐름에 필요.
- `git_log`, `git_show`는 이력 검토에 필요.
- `git_clear_working_dir`, `git_wrapup_instructions`는 세션 관리 흐름에 필요.
- 3개만 남기면 로그 사용량에는 맞지만 작업 완결성이 낮아진다.

## 권장 실행 순서

1. P0 테스트 가드 보강.
2. legacy 노출 문구 정리.
3. `list_directories` 출력량 제어 옵션 설계 및 테스트.
4. 검색 툴 설명과 초기 응답 안내 개선.
5. 대형 출력 compact option을 별도 설계로 검토.
6. process 툴 설명을 fs-mcp-first 정책과 맞춤.

## 검증 계획

구현 시 권장 검증:

| 변경 | 검증 |
| --- | --- |
| git 표면 가드 | `bun tests/contracts/tool-surface.contract.test.js`, `bun tests/scripts/scripts-verify-tool-surface.mjs` |
| 스키마 변경 | `bun x tsc -p tsconfig.json --noEmit` |
| list/search 동작 | filesystem/search smoke 또는 신규 contract test |
| 출력 압축 옵션 | 대형 text/structured fixture 기반 unit test |
| 설명 문구 변경 | catalog snapshot 또는 surface verify |

## 변경 파일

- `.docs/fs-mcp-improvement-analysis-2026-05-12.md`

## 남은 리스크

[확인됨] 이번 작업은 분석 보고서 작성이다. 코드 변경은 하지 않았다.

[미검증] 실제 개선 구현 전까지 P0~P2 항목은 권장사항 상태다.

[미검증] 저장 로그는 2026-05-12 현재 저장분 기준이다. 이후 사용 패턴은 다시 집계해야 한다.
