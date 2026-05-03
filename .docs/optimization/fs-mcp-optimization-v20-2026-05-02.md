# fs-mcp 최적화 보고서 v20

## 목표

앞선 구조 재편이 다시 무너지지 않도록 `src` 루트 경계와 제거된 runtime helper 문구를 자동 검증한다.

## 대규모 변경

* `scripts/verify-source-boundaries.mjs`를 추가해 `src` 루트의 필수 계층과 금지된 legacy 계층을 검사한다.
* 실행 텍스트 표면인 `package.json`, `tsconfig.json`, `scripts`, `src`에서 제거된 platform helper 문구가 재유입되는지 확인한다.
* `package.json`에 `verify:source`를 추가하고 `verify` 기본 체인에 포함했다.

## 구조 영향

* `src/platform`, `src/assets`, `src/features`, `src/mcp`, `src/tests`, `src/index.ts` 구조가 릴리스 조건이 되었다.
* 과거 `src/core`, `src/handlers`, `src/tools`, `src/types`, `src/config` 같은 루트 구조가 재생성되면 검증이 실패한다.
* 문서 보고서에 남은 과거 설명은 보존하되, 실행 표면에는 재유입되지 않도록 범위를 분리했다.

## 검증 계획

* `bun run verify:source`
* `bun run verify`
