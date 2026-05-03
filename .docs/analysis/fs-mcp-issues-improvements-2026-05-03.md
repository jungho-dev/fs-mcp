# fs-mcp 현재 문제점 및 개선사항 보고서

## 요약

현재 프로젝트는 기능 리팩터링/파일명 재구성 중간 상태로 보인다. 가장 큰 문제는 batch controller helper 파일명이 `controllers-batch-tool-support.ts`로 존재하는데, 여러 controller가 여전히 `@controllers/controllers-batch`를 import한다는 점이다. 이 문제 하나로 타입 체크, 런타임 import, 전체 테스트가 동시에 실패한다.

## 분석 범위

1. 설정: `package.json`, `tsconfig.json`, `biome.json`, `.github/workflows/publish-npm.yml`
2. 진입점: `src/index.ts`, `src/platform/server/server-run-mcp-server.ts`, `src/platform/server/server-create-mcp-server.ts`
3. 도구 표면: `src/tools/*`, `src/controllers/*`, `src/schemas/*`
4. 핵심 기능: filesystem, process, search, config, edit service
5. 테스트: `tests/run-all-tests.js`, `tests/scripts/scripts-verify-source-boundaries.mjs`, 기존 테스트 디렉터리 구조
6. 제외: `node_modules`, `out`, `.tmp` 같은 생성/캐시 경로

## 현재 상태

1. 브랜치: `private/main`
2. 워킹트리: clean 아님
3. 변경 규모: `git diff --stat` 기준 132개 추적 파일 변경, 344 insertions, 16582 deletions
4. 파일 이동 흔적: 기존 `src/app`, `src/mcp`, 일부 `src/features/*` 파일은 삭제 상태이고, 신규 `src/platform`, `src/controllers`, `src/tools`, `src/schemas` 파일은 untracked 상태
5. 테스트 파일도 기존 `test-*.js` 계열 삭제 + 신규 `*-test-*.js` 계열 untracked 상태가 섞여 있음

## 확인한 문제점

### 1. 런타임이 현재 깨짐

증거:

1. `src/controllers/controllers-batch-tool-support.ts:2` 파일 헤더는 `src/controllers/controllers-batch.ts`라고 되어 있으나 실제 파일명은 `controllers-batch-tool-support.ts`
2. `src/controllers/controllers-config.ts:9`, `src/controllers/controllers-edit.ts:8`, `src/controllers/controllers-filesystem.ts:9`, `src/controllers/controllers-process.ts:9`, `src/controllers/controllers-search.ts:9`, `src/controllers/controllers-terminal.ts:8`가 모두 `@controllers/controllers-batch`를 import
3. `bun tests/run-all-tests.js` 실행 결과 첫 테스트부터 `ERR_MODULE_NOT_FOUND: out/controllers/controllers-batch.mjs` 발생
4. 실패 영향 범위가 config/edit/filesystem/search/process controller 전부에 걸려 MCP tool 호출 대부분이 시작 전에 막힘

판정: 최우선 수정 대상. 파일명을 import에 맞추거나 import를 실제 파일명에 맞춰야 한다. 더 안전한 방향은 공개 내부 모듈명과 헤더를 `controllers-batch.ts`로 되돌려 경로를 안정화하는 것이다.

### 2. SWC 빌드가 실패를 숨김

증거:

1. `package.json:58`의 `build`는 `bun run .bootstrap/bootstrap-build.ts`
2. `.bootstrap/bootstrap-build.ts:104`는 SWC로 `src`를 `out`에 컴파일하고, 이후 import 문자열을 정규화
3. `bun run build`는 성공: `Successfully compiled: 59 files with swc`
4. 하지만 `bunx tsc --noEmit --pretty false`는 `TS2307`, `TS7006`, `TS2339` 다수 실패
5. CI는 `.github/workflows/publish-npm.yml:38`에서 build 후 `Type check`를 실행하므로 현재 상태는 publish 단계에서 실패

판정: 로컬 build 성공만으로 배포 가능 판단하면 안 된다. `package.json`에 `typecheck`, `test`, `verify` 스크립트를 명시하고, 최종 확인 명령을 하나로 묶어야 한다.

### 3. TypeScript 계약이 현재 불안정함

증거:

1. `tsconfig.json:65` `noUnusedLocals=false`
2. `tsconfig.json:67` `noImplicitReturns=false`
3. `tsconfig.json:96` `allowUnreachableCode=true`
4. `src/controllers/controllers-filesystem.ts:333`에서 `ReadFilesArgsSchema.parse(args)` 결과 union을 제대로 좁히지 않고 `parsed.items ?? parsed.paths` 형태로 접근해 `TS2339` 발생
5. batch import 실패 때문에 `runParallelBatch` 제네릭 타입이 소실되어 여러 `item`, `pid`, `sessionId` 콜백 파라미터가 `TS7006`로 번짐

판정: strict mode를 켜고 있지만 일부 중요한 안전 옵션이 꺼져 있고, schema union 처리도 타입 수준에서 안정적이지 않다. batch import 복구 후 남는 타입 오류를 기준으로 controller boundary를 정리해야 한다.

### 4. 파일명/경로 리팩터링이 atomic하지 않음

증거:

1. 기존 tracked 파일은 대량 삭제 상태
2. 신규 파일은 대량 untracked 상태
3. `tsconfig.json` paths는 신규 alias 구조를 가리키지만, 일부 import는 이전/가상 파일명으로 남아 있음
4. 테스트 파일도 old/new 이름이 동시에 git 상태에 남아 있음

판정: 현재 변경은 "대규모 rename + namespace 재배치"로 보이지만 Git에는 rename으로 안정적으로 인식되지 않는다. 리뷰와 배포 전에 파일 이동을 한 번에 정리하고, 이름 규칙을 고정해야 한다.

### 5. 테스트 러너와 프로젝트 실행 규칙이 어긋남

증거:

1. `tests/run-all-tests.js:75`는 각 테스트 파일을 `spawn("node", [testFile])`로 실행
2. 프로젝트 규칙은 Bun 실행을 우선시하고, `package.json`도 build/inspector만 있고 test script가 없음
3. 현재 runner 자체는 `bun tests/run-all-tests.js`로 시작해도 내부 테스트는 Node로 실행됨

판정: npm 패키지 런타임이 Node 호환이어야 한다면 의도일 수 있다. 다만 프로젝트 운영 규칙과 다르므로 명시가 필요하다. 의도된 Node 호환성 검증이면 README/스크립트명에 반영하고, 그렇지 않으면 Bun 기반 실행으로 맞춰야 한다.

### 6. 공개 도구 표면 검증은 일부 존재하지만 기본 스크립트에 묶이지 않음

증거:

1. `tests/scripts/scripts-verify-source-boundaries.mjs`는 실행 시 출력 없이 성공
2. `tests/scripts/scripts-verify-tool-surface.mjs`, `scripts-verify-release-shape.mjs`, `scripts-verify-optimization-reports.mjs`가 존재
3. `package.json` scripts에는 이 검증들이 없음

판정: 좋은 검증 자산이 있지만 실행 경로가 분산되어 있다. `bun run verify` 같은 단일 진입점으로 묶는 것이 낫다.

## 개선 방향

### 즉시 수정

1. `controllers-batch-tool-support.ts`와 import 경로를 일치시킨다.
2. `bunx tsc --noEmit --pretty false`를 통과시킨다.
3. `bun tests/run-all-tests.js`에서 `ERR_MODULE_NOT_FOUND`가 사라지는지 확인한다.
4. 대량 rename 상태를 Git에서 명확히 정리한다. 삭제 파일과 신규 파일이 같은 역할이면 rename으로 보이도록 경로/파일명을 다시 맞춘다.

### 단기 개선

1. `package.json`에 `typecheck`, `test`, `verify` 스크립트를 추가한다.
2. `verify`는 최소 `bun run build`, `bunx tsc --noEmit`, `bun tests/run-all-tests.js`, source boundary script를 포함한다.
3. `ReadFilesArgsSchema` union은 `"items" in parsed` 또는 discriminated 구조로 좁힌다.
4. batch controller helper는 파일명, `@file` 헤더, import alias, output 모듈명이 모두 같은 이름을 쓰게 한다.

### 중기 개선

1. controller 계층의 batch 패턴을 공통 helper로 유지하되, 각 controller의 public handler 반환 타입을 `Promise<ServerResult>`로 명시한다.
2. `tsconfig.json`에서 `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`를 단계적으로 켠다.
3. SWC build 전에 타입 체크를 먼저 실행하거나, build script가 typecheck 실패를 감지하게 한다.
4. 테스트 파일명 규칙을 하나로 고정한다. 예: `<domain>-test-<case>.js` 또는 `test-<case>.js` 중 하나만 사용.

### 운영 개선

1. CI와 로컬 검증 명령을 동일하게 만든다.
2. publish workflow는 이미 typecheck를 수행하므로 로컬에서도 같은 실패를 빠르게 볼 수 있어야 한다.
3. 생성물 `out`은 검증 산출물로만 취급하고, source of truth는 `src`로 유지한다.
4. 문서에는 현재 실제 도구명, batch 입력 형식, 절대경로 정책, Windows shell 동작을 최신 코드 기준으로 자동 검증하는 문서 테스트를 붙인다.

## 우선순위

1. P0: `@controllers/controllers-batch` 모듈 해석 실패 수정
2. P0: `bunx tsc --noEmit` 실패 제거
3. P0: 전체 테스트 runner의 첫 실패 제거
4. P1: rename/untracked 대량 변경 정리
5. P1: `package.json` 검증 스크립트 추가
6. P2: tsconfig 안전 옵션 강화
7. P2: 테스트 런타임 Bun/Node 정책 명시

## 실행한 확인

1. `bun run build`: 성공. SWC 59 files compiled, output imports normalized.
2. `bunx tsc --noEmit --pretty false`: 실패. `TS2307`, `TS7006`, `TS2339`.
3. `bun tests/run-all-tests.js`: 실패. `ERR_MODULE_NOT_FOUND: out/controllers/controllers-batch.mjs`로 다수 테스트 실패.
4. `bun tests/scripts/scripts-verify-source-boundaries.mjs`: 성공. 출력 없음.
5. `git diff --stat`: 132 tracked files changed, 344 insertions, 16582 deletions.
6. `git status`: 기존 변경 다수 존재. 보고서 외 기존 변경은 수정하지 않음.

## 추천 수정 순서

1. batch helper 파일명과 import 경로 정합성 복구
2. `tsc --noEmit` 재실행 후 남은 타입 오류만 처리
3. 전체 테스트 runner 재실행
4. rename/untracked 파일 상태 정리
5. `package.json`에 `typecheck`, `test`, `verify` 추가
6. CI와 로컬 verify 명령 일치
