# fs-mcp 최적화 보고서 v10

- 작업일: 2026-05-02
- 방식: 각 단계는 `분석/보고 -> 실제 수정 -> 다음 단계 기준 갱신` 순서로 진행한다.
- 기준: 현재 작업트리의 실제 코드, 빌드 설정, 테스트 결과
- 제약: `fs-mcp` 도구 서버가 `Transport closed` 상태라 파일 작업은 좁은 PowerShell 조회와 `apply_patch`로 대체한다.

## Baseline

현재 프로젝트는 `src`와 `out`을 루트 기준으로 사용한다. 런타임 흐름은 `src/index.mts`에서 시작해 `src/app/server/create-mcp-server.mts`, `src/mcp/controllers`, `src/features`로 이어진다.

확인된 우선 개선점은 다음과 같다.

1. 문서의 `src/app/bootstrap.mts` 표기가 실제 구조와 다르다.
2. 검색 도구 설명에 예시성 marker 문자열이 남아 기술부채 검색을 오염시킨다.
3. 표준 출력 envelope는 구현되어 있지만 contract test가 부족하다.
4. `.map`, `.d.mts`, root `out` 상태를 자동 확인하는 release-shape 검증이 없다.
5. README 개발 절차가 새 검증 명령을 안내하지 않는다.

## Iteration Plan

| Version | Report | Modification |
| --- | --- | --- |
| v1 | 기준 상태와 10단계 계획 기록 | 이 로그 파일 생성 |
| v2 | 문서-코드 구조 불일치 기록 | architecture 문서의 runtime tree 정정 |
| v3 | 검색 설명 노이즈 기록 | marker 예시 문구 정리 |
| v4 | 출력 계약 타입 표면 기록 | 표준 출력 타입 export |
| v5 | 출력 계약 테스트 부족 기록 | `test-tool-result-response.js` 추가 |
| v6 | release shape 검증 공백 기록 | `verify-release-shape.mjs` 추가 |
| v7 | package script 공백 기록 | contract/shape/verify scripts 추가 |
| v8 | README 개발 절차 공백 기록 | README 개발 명령 갱신 |
| v9 | 한글 README 동기화 공백 기록 | README-KO 개발 명령 갱신 |
| v10 | 최종 검증 결과 기록 | 로그에 완료 상태 반영 |

## Stage Results

| Version | Status | Notes |
| --- | --- | --- |
| v1 | done | 기준 분석과 순차 계획을 기록했다. |
| v2 | done | architecture 문서에서 실제 없는 `src/app/bootstrap.mts` 표기를 제거했다. |
| v3 | done | 검색 도구 설명의 marker 노이즈를 제거했다. |
| v4 | done | 표준 출력 envelope 타입을 export했다. |
| v5 | done | 배포 표면 기준 출력 contract 테스트를 추가했다. |
| v6 | done | release shape 검증 스크립트를 추가했다. |
| v7 | done | package script에 contract/shape/verify 명령을 연결하고 publish gate를 `verify` 기준으로 맞췄다. |
| v8 | done | 영문 README 개발 절차를 갱신했다. |
| v9 | done | 한글 README 개발 절차를 갱신했다. |
| v10 | done | 최종 검증 결과와 잔여 이슈를 기록했다. |

## Verification Results

실행한 검증은 다음과 같다.

```text
bun run test:contract
bun run verify
npm pack --dry-run
bun run verify:shape
technical-debt marker search across source and docs
```

결과:

```text
bun run test:contract: pass
bun run verify: pass, 27/27 tests
npm pack --dry-run: pass, 60 files
bun run verify:shape: pass
marker search: 0 matches
```

## Final State

1. 루트 `src`와 `out` 구조는 유지된다.
2. `.map`과 `.d.mts` 산출물은 생성되지 않는다.
3. 표준 툴 출력 envelope는 테스트로 고정된다.
4. 문서는 실제 runtime flow와 일치한다.
5. 개발자와 publish gate는 `bun run verify`로 타입체크, 전체 테스트, release-shape 검증을 한 번에 실행할 수 있다.
