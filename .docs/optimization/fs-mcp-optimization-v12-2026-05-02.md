# fs-mcp 최적화 보고서 v12

- 작업일: 2026-05-02
- 기준: v11 완료 상태
- 원칙: 이전 버전 보고서를 삭제하지 않고 새 버전 보고서를 누적한다.

## Analysis

`create-mcp-server.ts`에는 호출 이력 제외 조건이 문자열 비교로 직접 들어가 있었다.
이 조건은 툴 호출 수명주기 정책이므로 서버 요청 handler 내부에 고정되면 새 예외 정책을 추가할 때
서버 조립 코드가 계속 변경된다.

## Modification

| Version | Status | Change |
| --- | --- | --- |
| v12 | done | `src/mcp/tools/tool-history-policy.ts`를 추가하고 이력 기록 여부 판단을 분리했다. |

## Expected Effect

1. `get_recent_tool_calls` 제외 정책이 명시적인 함수로 고정된다.
2. 향후 이력 제외 툴을 추가할 때 서버 handler 수정 범위가 줄어든다.

## Verification

공통 검증 결과:

```text
bun run check: pass
bun run test:contract: pass
bun scripts/verify-optimization-reports.mjs: pass
bun run verify: pass, 28/28 tests
```
