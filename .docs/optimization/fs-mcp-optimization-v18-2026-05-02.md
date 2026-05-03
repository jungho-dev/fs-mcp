# fs-mcp 최적화 보고서 v18

## 목표

툴 실행 라우팅을 switch 내부 구현에서 공개 가능한 dispatcher registry로 전환해 툴 표면을 검증 가능한 계약으로 만든다.

## 대규모 변경

* `src/mcp/tools/tool-call-dispatcher.ts`의 switch 라우팅을 `TOOL_DISPATCHERS` registry로 재구성했다.
* `getDispatchableToolNames()`를 추가해 실행 가능한 툴 이름 목록을 외부 검증 표면으로 공개했다.
* `src/mcp/tools/tool-history-policy.ts`에서 `HISTORY_EXCLUDED_TOOL_NAMES`를 공개해 history 정책도 툴 계약 비교 대상에 포함했다.

## 구조 영향

* catalog에 등록된 이름과 dispatcher에 등록된 이름을 같은 단위로 비교할 수 있다.
* unknown tool 처리와 capture 동작은 기존 behavior를 유지한다.
* no-argument handler와 argument handler를 같은 dispatcher signature 아래에서 통일했다.

## 검증 계획

* `bun run check`
* `bun run test:contract`
* `bun run verify:tools`
