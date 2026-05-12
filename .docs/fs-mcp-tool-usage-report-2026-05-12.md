# fs-mcp 툴 사용 로그 분석 보고서

작성일: 2026-05-12
대상 프로젝트: `C:/JUNGHO/9.Workspace/2.Project/2.Node/fs-mcp`
로그 범위: `C:/Users/jungh/.codex/sessions`, `C:/Users/jungh/.codex/logs`

## 작업 범위

[확인됨] 저장된 Codex 세션 로그와 Codex 로그 파일 전체를 대상으로 fs-mcp 계열 툴 호출 횟수를 집계했다.

분석 대상:

| 항목 | 값 |
| --- | ---: |
| 세션 JSONL 파일 | 403 |
| Codex 로그 파일 | 2 |
| 세션 로그 라인 | 85,222 |
| Codex 로그 라인 | 350,222 |
| JSON 파싱 오류 | 0 |
| 세션 기간 | 2026-05-01 ~ 2026-05-12 |
| 전체 function_call | 4,240 |
| fs-mcp 계열 매칭 호출 | 532 |
| fs-mcp 계열 호출 포함 세션 | 9 |

집계 기준:

- [확인됨] 세션 JSONL의 `response_item.payload.type == "function_call"`을 실제 툴 호출로 집계했다.
- [확인됨] 현재 fs-mcp 툴명과 과거 단수형/legacy 툴명을 현재 이름으로 정규화했다.
- [확인됨] git 호출은 당시 `mcp__git__` 네임스페이스로 저장되어 있어 별도 출처로 표시했다.
- [확인됨] `codex-tui.log`의 `ToolRegistry.registerTool`은 실제 호출이 아니라 등록 이벤트로 분리했다.

## 작업 결과

[확인됨] 실제 사용은 파일 읽기, 검색, 디렉터리 목록, 검색 결과 조회에 집중되어 있다.

상위 호출:

| 순위 | 정규화 툴 | 호출 횟수 | 분류 |
| ---: | --- | ---: | --- |
| 1 | `read_files` | 244 | filesystem |
| 2 | `start_searches` | 82 | search |
| 3 | `list_directories` | 53 | filesystem |
| 4 | `get_search_results` | 45 | search |
| 5 | `start_processes` | 23 | process |
| 6 | `git_status` | 22 | git |
| 7 | `get_configs` | 17 | config |
| 8 | `get_file_infos` | 17 | filesystem |
| 9 | `git_diff` | 7 | git |
| 10 | `read_process_outputs` | 7 | process |
| 11 | `set_config_values` | 5 | config |
| 12 | `edit_blocks` | 3 | filesystem |
| 13 | `git_set_working_dir` | 3 | git |
| 14 | `move_files` | 2 | filesystem |
| 15 | `create_directories` | 1 | filesystem |
| 16 | `list_processes` | 1 | process |

분류별 호출:

| 분류 | 호출 횟수 |
| --- | ---: |
| filesystem | 320 |
| search | 127 |
| git | 32 |
| process | 31 |
| config | 22 |

## 툴 호출 상세

### 현재 이름 기준

| 툴 | 호출 횟수 |
| --- | ---: |
| `read_files` | 244 |
| `start_searches` | 82 |
| `list_directories` | 53 |
| `get_search_results` | 45 |
| `start_processes` | 23 |
| `git_status` | 22 |
| `get_configs` | 17 |
| `get_file_infos` | 17 |
| `git_diff` | 7 |
| `read_process_outputs` | 7 |
| `set_config_values` | 5 |
| `edit_blocks` | 3 |
| `git_set_working_dir` | 3 |
| `move_files` | 2 |
| `create_directories` | 1 |
| `list_processes` | 1 |

### 원본 로그 이름 기준

| 원본 툴명 | 호출 횟수 |
| --- | ---: |
| `read_file` | 174 |
| `start_search` | 82 |
| `read_multiple_files` | 70 |
| `list_directory` | 53 |
| `get_more_search_results` | 45 |
| `start_process` | 23 |
| `git_status` | 22 |
| `get_config` | 17 |
| `get_file_info` | 17 |
| `git_diff` | 7 |
| `read_process_output` | 7 |
| `set_config_value` | 5 |
| `edit_block` | 3 |
| `git_set_working_dir` | 3 |
| `move_file` | 2 |
| `create_directory` | 1 |
| `list_processes` | 1 |

### Legacy 이름 정규화

| 원본 | 현재 기준 | 호출 횟수 |
| --- | --- | ---: |
| `read_file` | `read_files` | 174 |
| `read_multiple_files` | `read_files` | 70 |
| `start_search` | `start_searches` | 82 |
| `list_directory` | `list_directories` | 53 |
| `get_more_search_results` | `get_search_results` | 45 |
| `start_process` | `start_processes` | 23 |
| `get_config` | `get_configs` | 17 |
| `get_file_info` | `get_file_infos` | 17 |
| `read_process_output` | `read_process_outputs` | 7 |
| `set_config_value` | `set_config_values` | 5 |
| `edit_block` | `edit_blocks` | 3 |
| `move_file` | `move_files` | 2 |
| `create_directory` | `create_directories` | 1 |

## Git 툴 관찰

[확인됨] 저장 로그에서 실제 git 호출은 3개뿐이다.

| git 툴 | 호출 횟수 |
| --- | ---: |
| `git_status` | 22 |
| `git_diff` | 7 |
| `git_set_working_dir` | 3 |

[추론] 이전 변경으로 git 노출 툴을 9개로 줄인 방향은 로그 근거와 맞다. 실제 호출만 기준으로 하면 3개가 핵심이다.
다만 `git_add`, `git_commit`, `git_log`, `git_show`, `git_clear_working_dir`,
`git_wrapup_instructions`는 기본 작업 흐름 보존용으로 유지할 수 있다.

## 등록 이벤트

[확인됨] `codex-tui.log`에는 구형 git MCP 서버가 `28 tool(s)`를 등록한 이벤트가 185회 있다.
이는 실제 호출 수가 아니라 서버 기동/등록 이벤트다.

| 등록 이벤트 | 횟수 |
| --- | ---: |
| `Registering 28 tool(s)` | 185 |

git 등록 이벤트 상위:

| 툴 | 등록 이벤트 횟수 |
| --- | ---: |
| `git_status` | 760 |
| `git_diff` | 629 |
| `git_set_working_dir` | 503 |
| `git_add` | 370 |
| `git_clear_working_dir` | 370 |
| `git_commit` | 370 |
| `git_log` | 370 |
| `git_show` | 370 |
| `git_wrapup_instructions` | 370 |

## 변경 파일

- `.docs/fs-mcp-tool-usage-report-2026-05-12.md`

## 검증

[확인됨] 집계 스크립트를 `bun -e`로 실행했다.

검증 결과:

| 검증 항목 | 결과 |
| --- | --- |
| 세션 JSONL 재귀 스캔 | 통과 |
| Codex 로그 파일 스캔 | 통과 |
| JSONL 파싱 | 파싱 오류 0 |
| function_call 필터링 | 4,240건 확인 |
| fs-mcp 계열 툴 정규화 | 532건 확인 |
| 등록 이벤트와 호출 이벤트 분리 | 완료 |

## 문제

[확인됨] 저장 로그의 일부 과거 호출은 현재 fs-mcp 이름과 다르게 단수형/legacy 이름으로 기록되어 있다.
보고서에서는 현재 이름 기준으로 정규화했고, 원본 이름 표를 별도로 남겼다.

[확인됨] git 호출은 당시 `mcp__git__` 네임스페이스로 저장되어 있다.
현재 fs-mcp에 포함된 git 표면과 비교하기 위해 git 분류로 함께 표시했다.

## 후속 작업

1. `read_files`, `start_searches`, `list_directories`, `get_search_results` 중심으로 설명과 schema 최적화를 우선 검토한다.
2. git 표면은 현재 9개 유지가 실용적이다. 더 줄일 경우 `git_status`, `git_diff`, `git_set_working_dir` 3개만 남기는 극단 옵션이 가능하다.
3. legacy 단수형 이름을 쓰는 오래된 로그/문서가 있으면 현재 복수형 이름으로 문서 정리를 권장한다.

## 근거

- [확인됨] `C:/Users/jungh/.codex/sessions`: 403개 JSONL 파일 분석.
- [확인됨] `C:/Users/jungh/.codex/logs`: `codex-tui.log`, `notify.log` 분석.
- [확인됨] 세션 JSONL의 `function_call` 이벤트에서 툴명 집계.
- [확인됨] `codex-tui.log`의 `ToolRegistry.registerTool`과 `Registering 28 tool(s)`는 등록 이벤트로 분리.
