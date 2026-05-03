# fs-mcp 프로젝트 분석 보고서

- 분석일: 2026-05-02
- 대상 경로: `C:\JUNGHO\9.Workspace\2.Project\2.Node\fs-mcp`
- 분석 범위: 패키지 설정, TypeScript 설정, `src` 구조, MCP 서버 등록부, 컨트롤러, feature service, 출력 규격화, 빌드 산출물, 테스트 실행 결과
- 기준: 현재 작업트리 기준의 실제 코드와 명령 실행 결과

## 1. Executive Summary

`fs-mcp`는 로컬 파일 시스템, 검색, 편집, 프로세스 실행, 세션, 설정, 히스토리 기능을 MCP 도구로 제공하는 stdio 기반 서버다. 현재 구조는 `src/app`, `src/mcp`, `src/features`, `src/assets`로 재편되어 있고, 빌드 산출물은 루트 `out` 아래 생성된다.

최근 구조 정리는 방향이 좋다. 엔트리포인트, MCP 계층, 기능 계층, 공용 타입/유틸 계층이 분리되었고, `read_file`과 `read_multiple_files` 같은 단건/다건 처리 툴도 컨트롤러 단에서 명확히 분리되어 있다. 모든 툴 결과는 `schemaVersion`, `toolName`, `status`, `data`, `durationMs`를 포함하는 표준 JSON envelope로 정규화된다.

다만 서버 등록부와 일부 feature service가 아직 너무 크다. 특히 `src/app/server/create-mcp-server.ts`, `src/features/filesystem/filesystem-service.ts`, `src/features/search/search-service.ts`, `src/features/process/process-runner.ts`, `src/features/process/terminal-service.ts`는 변경 영향이 집중되는 파일이다. 도구 정의, 스키마, 핸들러 dispatch, 출력 계약을 더 작게 나눠야 장기 유지보수성이 좋아진다.

검증 중 `bun run check`와 `bun run build`가 `terminal-service.ts`의 null-safety 오류로 실패했으며, 최소 수정 후 타입체크, 빌드, 전체 테스트가 통과했다. 또한 분석 중 운영 중인 `fs-mcp` 도구 서버에서 `get_file_info` 병렬 호출 후 `Transport closed`가 관찰되어 MCP 레벨 회귀 테스트가 필요하다.

## 2. Current Structure

```text
src/
  index.ts
  app/
    runtime/
    server/
    transport/
  assets/
    type/
    utils/
  features/
    config/
    edit/
    filesystem/
      readers/
    history/
    process/
    search/
  mcp/
    controllers/
    responses/
    schemas/
  tests/
out/
  index.mjs
  app/
  assets/
  features/
  mcp/
```

루트 `src`와 `out` 배치는 현재 정상이다. `package.json`의 `main`, `exports`, `bin`, 실행 스크립트도 `out/index.mjs`를 기준으로 맞춰져 있다. `tsconfig.json`도 `rootDir: ./src`, `outDir: ./out`으로 설정되어 있다.

빌드 후 확인 결과 프로젝트 내 비의존성 영역에서 `*.map` 파일은 0개, `*.d.ts` 파일도 0개다. 현재 설정은 `sourceMap: false`, `declaration: false`, `declarationMap: false`이므로 `.map` 및 colocated declaration 생성 요구사항은 충족한다.

## 3. Runtime Flow

```text
src/index.ts
  -> createServer()
  -> FilteredStdioServerTransport
  -> ListToolsRequestSchema handler
  -> CallToolRequestSchema handler
  -> mcp/controllers/*
  -> features/*
  -> mcp/responses/normalizeToolResult()
```

`src/index.ts`는 실제 프로세스 엔트리포인트다. 설정 로드, stdio transport 연결, 전역 예외 처리, MCP 초기화 전 로그 버퍼링을 담당한다.

`src/app/server/create-mcp-server.ts`는 MCP 서버 생성, 도구 목록 등록, 호출 dispatch, 히스토리 저장, 결과 정규화를 담당한다. 이 파일은 현재 서버의 가장 큰 변경 집중 지점이다.

컨트롤러 계층은 MCP 인자 파싱과 feature service 호출을 담당한다. feature 계층은 파일 처리, 검색, 편집, 프로세스, 설정 등 실제 도메인 동작을 담당한다. 이 경계는 유지할 가치가 있다.

## 4. Tool Surface

현재 도구군은 다음과 같이 분류된다.

| 영역 | 대표 툴 | 상태 |
| --- | --- | --- |
| config | `get_config`, `set_config_value` | 설정 조회/변경 |
| filesystem | `read_file`, `read_multiple_files`, `write_file`, `list_directory`, `get_file_info` | 단건/다건 분리 완료 |
| edit | `edit_block` | surgical edit 중심 |
| search | `start_search`, `get_more_search_results`, `stop_search`, `list_searches` | streaming search 구조 |
| terminal/session | `start_process`, `read_process_output`, `interact_with_process`, `force_terminate`, `list_sessions` | REPL/프로세스 세션 관리 |
| process | `list_processes`, `kill_process` | OS 프로세스 조회/종료 |
| history | `get_recent_tool_calls` | 호출 이력 조회 |

`read_file`과 `read_multiple_files`는 컨트롤러 함수가 별도로 존재하고, 단건은 파일 타입별 reader 결과를 그대로 정리하며, 다건은 파일별 결과와 실패를 함께 묶는다. 사용자의 단건 처리 툴/다건 처리 툴 분리 요구는 현재 코드 구조에 반영되어 있다.

## 5. Output Contract

`src/mcp/responses/tool-result-response.ts`가 모든 툴 결과를 표준 envelope로 감싼다.

```json
{
  "schemaVersion": 1,
  "toolName": "read_file",
  "status": "success",
  "durationMs": 12,
  "data": {
    "content": [],
    "structuredContent": null
  }
}
```

장점은 모든 툴의 성공/실패, 이름, 소요 시간, 원본 content, structuredContent 위치가 같아진다는 점이다. 오류 응답도 `createToolErrorResponse`와 `normalizeToolResult`를 거치므로 같은 구조를 유지한다.

주의할 점은 호환성이다. MCP 클라이언트가 기존처럼 `content[0].text`를 사람이 읽는 평문으로 기대했다면 이제 JSON 문자열을 받는다. 표준화 방향은 맞지만, 모든 툴별 golden test와 클라이언트 호환성 문서가 필요하다.

## 6. Findings

### P0. Build failure was present

분석 시작 시 `bun run check`와 `bun run build`가 실패했다.

```text
src/features/process/terminal-service.ts:284
TS2532: Object is possibly 'undefined'.
```

`outputEvents.at(-1)` 결과를 바로 수정하고 있어 strict null check에서 실패했다. 최소 null guard 수정 후 타입체크와 빌드는 통과했다.

### P0. Live MCP transport instability observed

분석 중 `fs-mcp` 도구 서버에서 `get_file_info` 병렬 호출 후 `Transport closed`가 발생했다. 서비스 레벨 테스트와 전체 테스트는 통과했지만, 실제 MCP transport 경로에서 관찰된 문제이므로 별도 e2e 회귀 테스트가 필요하다.

권장 확인:

```text
MCP client -> get_file_info 단건 호출
MCP client -> get_file_info 병렬 호출
MCP client -> read_file/read_multiple_files/get_file_info 혼합 호출
```

### P1. Server registry file is too large

`src/app/server/create-mcp-server.ts`는 도구 설명, JSON schema 변환, list_tools 응답, call_tool switch, 히스토리 저장, 결과 정규화를 한 파일에서 처리한다. 파일 크기와 책임이 모두 커서 새 도구 추가 시 누락 위험이 높다.

권장 구조:

```text
src/mcp/tools/
  config-tools.ts
  filesystem-tools.ts
  edit-tools.ts
  search-tools.ts
  process-tools.ts
  history-tools.ts
  registry.ts
```

`registry.ts`에서 `{ name, definition, handler }` 형태로 조합하면 `list_tools`와 `call_tool`이 같은 source of truth를 사용하게 된다.

### P1. Feature service files are still overloaded

가장 큰 소스 파일들은 기능별 세부 책임을 많이 품고 있다.

| 파일 | 주요 책임 |
| --- | --- |
| `src/features/filesystem/filesystem-service.ts` | path 검증, allowlist, 읽기/쓰기, 디렉터리, metadata |
| `src/features/search/search-service.ts` | streaming search, result formatting, pagination |
| `src/features/process/process-runner.ts` | 프로세스 시작, Node fallback, 세션 연결 |
| `src/features/process/terminal-service.ts` | session buffer, prompt detection, pagination, timing |
| `src/features/filesystem/readers/docx-reader.ts` | DOCX outline/XML 처리 |

권장 분리는 기능 추가가 필요한 지점부터 작은 단위로 진행한다. 대규모 일괄 이동보다 `filesystem/path-policy`, `filesystem/file-info`, `process/session-buffer`, `mcp/tools/registry`처럼 변경 압력이 높은 책임부터 분리하는 편이 안전하다.

### P1. Output contract tests are insufficient

표준 출력 구조는 핵심 계약이 되었지만, 현재 테스트는 주로 feature service와 런타임 동작 중심이다. 다음 케이스의 snapshot 또는 structural test가 필요하다.

```text
success result
error result
structuredContent 포함 result
text/image/directory result
read_file vs read_multiple_files
unknown tool
history exclusion for get_recent_tool_calls
```

### P2. Documentation is stale

현재 문서 일부는 실제 구조와 다르다. `architecture.md`, `architecture-ko.md`, 기존 `.docs` 보고서에는 `src/app/bootstrap.ts`가 등장하지만 실제 파일은 없다. `src/index.ts`가 bootstrap 역할을 직접 수행한다.

문서에서 선택할 수 있는 방향은 둘 중 하나다.

1. `src/index.ts`가 bootstrap이라고 명시하고 문서에서 `bootstrap.ts` 제거
2. 실제로 `src/app/bootstrap.ts`를 만들고 `index.ts`를 얇은 entry로 축소

현재 코드 변경량을 줄이려면 1번이 더 안전하다.

### P2. Marker search noise exists in tool description

`create-mcp-server.ts`의 검색 도구 설명 안에 기술부채 marker 예시 텍스트가 남아 있었다. 실제 기술부채 표식이 아니더라도 marker 검색 결과를 오염시킬 수 있다. 예시 문구는 일반적인 `task markers` 표현으로 바꾸는 편이 좋다.

### P2. Config write robustness can improve

`ConfigManager`는 singleton으로 설정을 메모리에 보관하고 JSON 파일에 저장한다. 기본 구조는 단순하고 좋지만, 설정 파일 쓰기는 atomic write가 아니다. 동시 호출이나 프로세스 종료 타이밍까지 고려하면 temp file write 후 rename 방식이 더 안전하다.

## 7. Improvement Roadmap

### Phase 1. Contract and stability

1. MCP e2e 테스트 추가: `get_file_info`, `read_file`, `read_multiple_files`, 오류 응답.
2. `normalizeToolResult` 출력 schema를 테스트 고정.
3. `Transport closed` 재현 경로 확인.
4. 문서에서 현재 실제 구조와 다른 bootstrap 표기 정리.

### Phase 2. Tool registry extraction

1. 도구 정의와 핸들러를 `src/mcp/tools/*`로 이동.
2. `list_tools`와 `call_tool`이 하나의 registry를 공유하도록 변경.
3. tool name union type을 registry에서 파생.
4. unknown tool, handler error, schema parse error를 공통 경로로 통일.

### Phase 3. Service boundary cleanup

1. filesystem path policy와 metadata 조회 분리.
2. terminal session buffer와 process spawning 분리.
3. search result formatting과 search execution 분리.
4. DOCX reader는 outline/XML/editing workflow 기준으로 테스트 보강.

### Phase 4. Release hygiene

1. `bun run check`, `bun run build`, `bun run test`, `npm pack --dry-run`을 release gate로 고정.
2. `.map`, `.d.ts`, root `src/out` 산출물 상태 확인을 체크리스트화.
3. README/architecture/changelog 동기화.
4. CLI-only 패키지인지 library export까지 제공할지 명확히 결정.

## 8. Recommended Target Structure

```text
src/
  index.ts
  app/
    runtime/
    server/
    transport/
  mcp/
    tools/
      registry.ts
      filesystem-tools.ts
      process-tools.ts
      search-tools.ts
      edit-tools.ts
      config-tools.ts
      history-tools.ts
    controllers/
    responses/
    schemas/
  features/
    filesystem/
      path-policy.ts
      file-info.ts
      readers/
    process/
      process-runner.ts
      session-buffer.ts
      terminal-service.ts
    search/
    edit/
    config/
    history/
  assets/
    type/
    utils/
out/
```

이 구조는 현재 방향을 유지하면서 서버 등록부의 비대화만 줄인다. 기존 import boundary도 크게 흔들지 않는다.

## 9. Verification

실행한 검증:

```text
bun run check
bun run build
bun run test
generated file check: *.map = 0, *.d.ts = 0
out directory check: root out exists
```

결과:

```text
bun run check: pass
bun run build: pass
bun run test: pass, 26/26 tests, 24.4s
*.map: 0
*.d.ts: 0
out: exists
```

검증 제한:

```text
분석 중 fs-mcp 도구 서버 transport가 닫혀 이후 파일 생성은 apply_patch로 진행했다.
MCP client 레벨의 get_file_info transport 안정성은 별도 재현 테스트가 필요하다.
```

## 10. Final Recommendation

현재 프로젝트는 구조 개편 방향이 맞고, 빌드 산출물 정책도 `src`와 `out` 중심으로 정리되었다. 단기적으로는 `Transport closed` 재현과 출력 계약 테스트가 가장 중요하다. 그 다음 `create-mcp-server.ts`의 tool registry를 분리하면 도구 추가, 출력 규격 유지, 문서 동기화 비용이 크게 줄어든다.

우선순위는 다음 순서가 적절하다.

1. MCP e2e 출력 계약 테스트 추가
2. `get_file_info` transport 종료 원인 확인
3. 문서의 `bootstrap.ts` 불일치 정리
4. `src/mcp/tools/registry.ts` 도입
5. 큰 feature service를 변경 압력 기준으로 점진 분리
