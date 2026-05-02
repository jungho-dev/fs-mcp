# fs-mcp 최적화 보고서 v19

## 목표

툴 카탈로그, dispatcher, history 정책을 빌드 산출물 기준으로 검증하는 계약 테스트와 릴리스 게이트를 추가한다.

## 대규모 변경

* `scripts/verify-tool-surface.mjs`를 추가해 compiled `out`의 catalog 이름과 dispatcher registry 이름을 비교한다.
* `src/tests/test-tool-surface-contract.js`를 추가해 계약 테스트에서 catalog, dispatcher, history exclusion 정합성을 확인한다.
* `package.json`의 `test:contract`, `verify:tools`, `verify`를 확장해 새 검증 경로가 기본 릴리스 확인에 포함되도록 했다.

## 구조 영향

* 새 tool을 catalog에만 추가하거나 dispatcher에만 추가하는 회귀를 자동으로 잡는다.
* history 제외 목록에 존재하지 않는 tool 이름이 들어가는 문제를 차단한다.
* 검증은 source가 아니라 npm 배포와 같은 compiled output 기준으로 실행된다.

## 검증 계획

* `bun run test:contract`
* `bun run verify:tools`
* `bun run verify`
