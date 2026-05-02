# fs-mcp 최적화 보고서 v13

- 작업일: 2026-05-02
- 기준: v12 완료 상태
- 원칙: 버전별 보고서는 개별 파일로 누적한다.

## Analysis

v11과 v12에서 툴 호출 디스패처와 이력 정책이 분리되었다. 이 표면은 서버 런타임의 핵심
경로이므로 컴파일 확인만으로는 부족하고, 배포 산출물 `out` 기준 계약 테스트가 필요하다.

## Modification

| Version | Status | Change |
| --- | --- | --- |
| v13 | done | `src/tests/test-tool-routing-contract.js`를 추가해 이력 정책과 unknown tool 응답을 검증한다. |

## Expected Effect

1. `get_recent_tool_calls`가 이력에 다시 기록되는 회귀를 잡을 수 있다.
2. 알 수 없는 툴 이름이 표준 오류 응답으로 유지되는지 확인할 수 있다.

## Verification

공통 검증 결과:

```text
bun run check: pass
bun run test:contract: pass
bun scripts/verify-optimization-reports.mjs: pass
bun run verify: pass, 28/28 tests
```
