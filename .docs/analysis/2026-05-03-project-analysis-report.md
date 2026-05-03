# fs-mcp 프로젝트 분석 보고서

## 1. 개요

- 분석 대상: `C:/JUNGHO/9.Workspace/2.Project/2.Node/fs-mcp`
- 분석 일시: 2026-05-03
- 분석 범위: 소스 구조, 빌드 산출물, 런타임 진입점, 테스트 실행 경로, 문서 정합성, 기본 보안 설정
- 분석 방식:
  - 정적 검토: `package.json`, `tsconfig.json`, `readme*.md`, `architecture*.md`, `.bootstrap/bootstrap-build.ts`, `src/features/config/config-store.ts`, `tests/run-all-tests.js`
  - 구조 검토: `src/`, `tests/`, `out/` 디렉터리 표면 확인
  - 실행 검증: `bun run build`, `bun tests/run-all-tests.js`, `bunx tsc --noEmit`, `node out/index.mjs`, `bun out/index.mjs`

## 2. 요약 결론

이 프로젝트는 구조 분리와 테스트 자산 자체는 상당히 잘 갖춰져 있다. 실제로 `src` 기준 59개 TypeScript 소스와 41개 실행 대상 테스트 파일이 있고, `bun run build`와 `bunx tsc --noEmit`도 통과한다.

하지만 현재 공개 배포 표면은 신뢰하기 어렵다. 가장 큰 문제는 빌드 산출물 `out/` 안에 `@cores/*`, `@cores/responses/*` 별칭 import가 그대로 남아 Node 런타임에서 즉시 깨진다는 점이다. npm 전역 설치 후 `fs-mcp` 바이너리를 실행하는 실제 경로가 사실상 Node shim이라는 점을 감안하면, 이 문제는 테스트 실패 수준이 아니라 패키지 실행 불능 결함이다.

추가로 문서와 실제 구조가 크게 어긋나고, 기본 허용 디렉터리 범위가 과도하게 넓으며, 검증 스크립트 운영면도 package surface에 노출되지 않아 유지보수성과 신뢰도를 같이 깎고 있다.

## 3. 확인된 강점

- 계층 분리가 비교적 명확하다.
  - 실제 소스는 `src/assets`, `src/controllers`, `src/cores`, `src/features`, `src/schemas`, `src/tools` 로 구분돼 있다.
- 테스트 표면이 넓다.
  - 실행 대상 테스트 파일 41개가 `app`, `config`, `contracts`, `edit`, `filesystem`, `mcp`, `process`, `search`, `security` 영역에 분포한다.
- 최소한의 타입 안정성은 유지된다.
  - `bunx tsc --noEmit` 통과.
- 빌드 후 import 정규화 단계를 별도 스크립트로 둔 점은 방향 자체는 좋다.
  - 문제는 정규화 범위가 실제 alias 집합과 맞지 않는다는 데 있다.

## 4. 핵심 문제점

### 4.1 Critical. 배포 산출물이 Node 런타임에서 즉시 깨짐

- 관찰:
  - `package.json:8-22` 에서 메인 엔트리는 `./out/index.mjs`, 바이너리는 `out/index.mjs` 로 배포된다.
  - `.bootstrap/bootstrap-build.ts:9-18` 의 alias 정규화는 `@platform`, `@assets`, `@controllers`, `@features`, `@schemas`, `@tools`, `@type` 만 처리한다.
  - 반면 `tsconfig.json:6-14` 는 실제로 `@cores/*`, `@cores/responses/*` alias 를 정의한다.
  - 산출물에 미해결 alias 가 남아 있다.
    - `out/index.mjs` 에 `@cores/server`
    - `out/features/config/config-store.mjs` 에 `@cores/runtime/runtime-version`
    - `out/controllers/controllers-batch.mjs` 에 `@cores/responses/responses-error`
  - `node out/index.mjs` 실행 결과:
    - `ERR_MODULE_NOT_FOUND: Cannot find package '@cores/server'`
  - `out/` 전체 검색 결과:
    - `@cores/` 잔존 19건
    - `@cores/responses/` 잔존 6건
- 영향:
  - npm 전역 설치 후 실행되는 실사용 경로가 Node 기반이면 서버가 시작조차 안 된다.
  - Node 기반 테스트 러너도 동일 원인으로 연쇄 실패한다.
  - “빌드 성공”이 실제 배포 가능성을 보장하지 못한다.
- 개선:
  - `.bootstrap/bootstrap-build.ts` alias 정규화 대상에 `@cores/`, `@cores/responses/` 추가.
  - 빌드 후 `out/` 에 남은 `@[a-z]` alias import 를 스캔해 실패시키는 회귀 체크 추가.
  - 가능하면 alias 치환을 후처리 regex 대신 표준 경로 해석 체인으로 일원화.

### 4.2 High. 테스트 체계가 넓지만 현재는 배포 결함 때문에 전면 차단됨

- 관찰:
  - `tests/run-all-tests.js:74-80` 은 각 테스트를 `spawn("node", [testFile])` 로 실행한다.
  - 같은 파일 `106-112` 에서 빌드는 `spawn("bun", ["run", "build"])` 로 수행한다.
  - 실제 실행 `bun tests/run-all-tests.js` 는 `ERR_MODULE_NOT_FOUND` 를 반복 출력하며 `app`, `config`, `contracts`, `edit`, `filesystem`, `mcp`, `process`, `security` 그룹에서 실패를 확인했다.
  - 실행 대상 테스트 파일 수는 41개다.
- 영향:
  - 테스트 자산이 많아도 현재 릴리스 게이트 역할을 못 한다.
  - 빌드 성공과 런타임 성공 사이에 큰 허점이 남는다.
- 개선:
  - 우선 4.1 수정이 선행돼야 한다.
  - 그 다음 `package.json` 에 `test`, `typecheck`, `verify` 계열 스크립트를 노출해 CI와 로컬 검증 경로를 고정해야 한다.
  - Node 검증과 Bun 검증을 분리해서 둘 다 명시적으로 관리하는 편이 안전하다.

### 4.3 High. README/아키텍처 문서가 실제 구조와 배포 표면을 잘못 설명함

- 관찰:
  - `readme.md:23-25`, `readme-ko.md:23-25` 는 MCP command 를 `fs-mcp` 로 안내한다. 이 자체는 `package.json:21-22` 의 `bin` 정의와 맞는다.
  - 하지만 `readme.md:58-82`, `readme-ko.md:58-82` 는 여전히 `src/domains`, `src/responses`, `out/index.js` 를 기준으로 설명한다.
  - `architecture.md:21-23` 는 `src/cores`, `src/features` 를 설명하면서도, 바로 아래 `architecture.md:29+` source tree 는 다시 `index.ts`, `app/` 구조를 적고 있다.
  - `readme.md:84` 는 `verify:source`, `verify:shape`, `verify:tools` 를 언급하지만, `package.json:49-54` 의 실제 scripts 에는 존재하지 않는다.
- 영향:
  - 신규 기여자 온보딩 비용 증가.
  - 사용자 설정, 배포 경로, 검증 절차를 문서만 보고 따르면 실패 가능성 큼.
  - 코드 구조 리팩터링 이후 문서 회귀 검증이 없다는 신호다.
- 개선:
  - README/architecture EN·KO 문서를 현재 구조 기준으로 전면 동기화.
  - `out/index.js` 표기를 `out/index.mjs` 로 수정.
  - 존재하지 않는 검증 명령은 문서에서 제거하거나 실제 script 로 복구.
  - 문서 CI에 “문서 속 경로/명령 존재 여부” 검사를 추가.

### 4.4 Medium. 기본 허용 디렉터리 범위가 과도하게 넓음

- 관찰:
  - `src/features/config/config-store.ts:194-202` 는 환경변수가 없으면 기본 허용 디렉터리를 다음처럼 반환한다.
    - `C:\\JUNGHO`
    - `C:\\Windows`
    - `C:\\Users\\jungh`
    - `C:\\Users\\jungh\\.codex`
    - 현재 프로젝트 경로
- 영향:
  - 파일시스템 MCP 서버 특성상 기본 권한 범위가 곧 공격 표면이다.
  - `C:\\Windows` 와 사용자 홈 전체 허용은 최소권한 원칙과 거리가 멀다.
  - 사용자가 별도 설정을 안 한 첫 실행 상태가 가장 위험한 상태가 된다.
- 개선:
  - 기본값을 “현재 작업공간만 허용” 또는 “빈 배열 + 초기 설정 유도”로 축소.
  - `C:\\Windows`, 사용자 홈 전체 허용은 명시적 opt-in 으로 전환.
  - 첫 실행 시 보안 경고와 승인 흐름 추가.

### 4.5 Medium. 설정 파일에 드리프트와 잡음이 누적돼 있음

- 관찰:
  - `tsconfig.json` 는 백엔드 MCP 서버 기준으로 불필요하거나 느슨한 옵션이 섞여 있다.
    - `jsx: "react-jsx"`
    - `jsxImportSource: "react"`
    - `allowUnreachableCode: true`
    - `allowUnusedLabels: true`
    - `noImplicitReturns: false`
    - `noFallthroughCasesInSwitch: false`
    - `noUncheckedIndexedAccess: false`
  - `.server.swcrc` 에는 `@platform/*`, `@platform/responses/*` alias 가 남아 있는데 실제 현재 소스 구조와 맞지 않는다.
- 영향:
  - 설정 해석 비용 증가.
  - 미래 리팩터링 시 “어떤 옵션이 실제 필요 조건인지” 판단이 어려워진다.
  - 정적 분석이 잡아줄 수 있는 결함을 일부 놓칠 수 있다.
- 개선:
  - 빌드용 tsconfig 와 검증용 tsconfig 를 분리.
  - 사용하지 않는 JSX/legacy 옵션 제거.
  - SWC alias 와 실제 소스 alias 집합을 단일 원천에서 생성하도록 정리.

## 5. 우선순위 개선 로드맵

### 즉시 조치

1. `.bootstrap/bootstrap-build.ts` 의 alias 치환 범위를 `@cores`, `@cores/responses` 까지 확장.
2. `node out/index.mjs` 를 CI 필수 체크로 추가.
3. `bun tests/run-all-tests.js` 재실행해서 런타임 결함이 제거됐는지 확인.

### 단기 조치

1. `package.json` 에 `test`, `typecheck`, `verify` 스크립트 정식 등록.
2. README/architecture EN·KO 문서 동기화.
3. 빌드 산출물에 alias 잔존 여부를 스캔하는 post-build 검증 추가.

### 중기 조치

1. 기본 허용 디렉터리 정책 축소.
2. tsconfig/swc 설정 단순화.
3. 문서와 설정의 회귀를 막는 자동 검증 추가.

## 6. 실제 검증 결과

```text
[PASS] bun run build
- SWC 59 files compile
- output import normalization step executed

[PASS] bunx tsc --noEmit
- no type errors observed

[FAIL] node out/index.mjs
- ERR_MODULE_NOT_FOUND: Cannot find package '@cores/server'

[FAIL] bun tests/run-all-tests.js
- repeated ERR_MODULE_NOT_FOUND from out/* imports
- failures observed across app/config/contracts/edit/filesystem/mcp/process/security groups

[INFO] bun out/index.mjs
- immediate import error not reproduced in short run
- indicates Bun/Node runtime behavior gap, but published npm execution path still requires Node safety
```

## 7. 최종 판단

현재 상태는 “소스 품질 잠재력은 높지만 배포 신뢰성은 낮은 상태”다.

핵심 원인은 코드량 부족이 아니라 경계면 관리 실패다. 구체적으로는:
- TypeScript alias 체계와 빌드 후 산출물 정규화 체계가 분리돼 있고
- 문서가 현재 구조를 따라오지 못했으며
- 보안 기본값이 보수적이지 않고
- 검증 명령이 사용자 표면에 충분히 노출되지 않았다.

우선순위는 명확하다. 먼저 Node 배포 경로를 복구하고, 그 다음 테스트/문서/보안 기본값을 정리해야 한다. 이 순서로 가면 가장 작은 수정으로 신뢰도를 가장 크게 올릴 수 있다.
