# fs-mcp 최적화 보고서 v11

- 작업일: 2026-05-02
- 기준: v1-v10 완료 상태
- 목적: `create-mcp-server.mts`의 호출 분기 책임을 분리해 서버 생성 파일의 변경 위험을 낮춘다.
- 파일 작업: 현재 `fs-mcp` 파일 도구가 정상 응답하므로 분석은 `fs-mcp`로 수행하고, 실제 코드는 `apply_patch`로 수정했다.

## Analysis

`src/app/server/create-mcp-server.mts`는 다음 책임을 동시에 가진다.

1. MCP 서버 인스턴스 생성
2. 초기화 요청 처리
3. 툴 목록 생성
4. 툴 호출 분기
5. 결과 정규화와 호출 이력 저장
6. resource no-op handler 등록

가장 안전한 다음 단계는 툴 목록이나 schema 구조를 바꾸지 않고 호출 분기만 별도 모듈로 분리하는 것이다.

## Modification

| Version | Status | Change |
| --- | --- | --- |
| v11 | done | `src/mcp/tools/tool-call-dispatcher.mts`를 추가하고 기존 switch 기반 호출 분기를 이동했다. |

## Expected Effect

1. 서버 파일은 요청 수명주기와 응답 정규화에 집중한다.
2. 툴별 handler 연결은 `src/mcp/tools/tool-call-dispatcher.mts`에서 관리한다.
3. 새 툴 추가 시 등록 목록과 호출 분기 변경 위치가 더 명확해진다.

## Verification

실행한 검증은 다음과 같다.

```text
bun run check
bun run test:contract
bun run verify:shape
bun run verify
```

결과:

```text
bun run check: pass
bun run test:contract: pass
bun run verify:shape: pass
bun run verify: pass, 27/27 tests
```
