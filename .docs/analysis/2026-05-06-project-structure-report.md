# fs-mcp 프로젝트 구조 분석 보고서

## 1. 분석 개요

- 대상: `C:/JUNGHO/9.Workspace/2.Project/2.Node/fs-mcp`
- 일시: 2026-05-06
- 범위: 루트 설정, `src`, `tests`, `.docs`, `.github/workflows`, 공개 패키지 표면
- 제외: `node_modules`, `.git`, `out`, `dist`, `coverage`, 캐시성 경로
- 방식: `fs-mcp` 기반 목록·읽기·검색, 빌드·검증 명령 실행, 미사용 export 점검

## 2. 요약 결론

현재 프로젝트는 MCP 서버 계층을 `cores`, `tools`, `schemas`, `controllers`, `features`로 나눈
구조가 대체로 명확하다. 빌드, 타입 체크, 구조 검증, 전체 테스트도 현재 통과한다.

다만 릴리스 신뢰성에는 문제 신호가 남아 있다. 런타임 버전이 패키지 버전과 다르고, 파일 접근
기본값이 전체 파일시스템 허용으로 동작한다. 또한 git 기능 분리 파일과 예전 `edit_block` 카탈로그가
실제 import 그래프 밖에 남아 있어 배포 산출물에 죽은 코드가 포함될 가능성이 높다.

## 3. 현재 구조 요약

- 루트 핵심 파일: `package.json`, `tsconfig.json`, `biome.json`, `.server.swcrc`, README/architecture 문서
- 소스 계층: `src/assets`, `src/controllers`, `src/cores`, `src/features`, `src/schemas`, `src/tools`
- 테스트 계층: `tests/contracts`, `tests/smoke`, `tests/scripts`, `tests/fixtures`
- 문서 계층: `.docs/analysis`, `.docs/optimization`
- 공개 도구 수: config 2개, filesystem/search/edit 13개, process 6개, git 28개, 총 49개
- 생성물 제외 기준 파일 수: 전체 133개, 텍스트 116개
- 소스 규모: `src` 71개 텍스트 파일, 약 14,315줄
- 테스트 규모: `tests` 21개 텍스트 파일, 약 3,245줄

## 4. 확인된 강점

- 계층 경계가 명확하다. MCP 표면은 `tools -> schemas -> controllers -> features` 흐름으로 읽힌다.
- 배포 산출물 기반 테스트가 있다. 테스트가 `out` 산출물을 import해 실제 패키지 표면을 일부 검증한다.
- `verify:source`, `verify:shape`, `verify:tools`, `verify:reports`가 존재한다.
- 전체 테스트가 현재 통과한다. 기존 alias 미해결로 런타임이 깨지던 상태는 해소된 것으로 보인다.
- `allowedDirectories` prefix 우회, symlink, command blocklist 같은 보안성 smoke 테스트가 존재한다.

## 5. 핵심 문제점

### 5.1 High. 패키지 버전과 런타임 버전 불일치

관찰:

- `package.json:7`은 `1.1.7`이다.
- `src/cores/runtime/runtime-version.ts:8`은 `VERSION = "1.0.8"`이다.
- `bun run test` 출력에서도 `get_configs(version)` 결과가 `1.0.8`로 나온다.
- 현재 테스트는 version 값을 조회하지만 `package.json`과 동기화되는지 검증하지 않는다.

영향:

- MCP initialize 응답과 `get_configs`가 실제 npm 패키지 버전을 잘못 알린다.
- 클라이언트 캐시, 버그 리포트, 릴리스 확인이 왜곡된다.
- publish workflow의 build/typecheck만으로는 이 불일치를 잡지 못한다.

개선:

- `VERSION`을 `package.json`에서 생성하거나 빌드 시 주입한다.
- 테스트에 `package.json.version === runtime VERSION` 계약을 추가한다.

### 5.2 High. 기본 파일 접근 정책이 전체 허용

관찰:

- `src/features/config/config-store.ts:48`은 env 설정이 없으면 `allowedDirectories: []`를 만든다.
- `src/features/filesystem/filesystem-service.ts:157-158`은 `allowedDirectories.length === 0`이면 허용한다.
- `tests/smoke/config/allowed-directories.test.js`도 빈 배열이면 홈, 임시 디렉터리, 루트 접근이 가능해야 한다고
  검증한다.

영향:

- 사용자가 별도 설정을 하지 않은 첫 실행 상태가 전체 파일시스템 허용이다.
- 파일 읽기·쓰기·삭제 도구가 있는 MCP 서버 특성상 기본값이 곧 가장 넓은 공격 표면이다.
- 문서나 도구 설명의 "allowed directories" 직관과 실제 빈 배열 의미가 다르다.

개선:

- 빈 배열을 "허용 없음"으로 바꾸거나, 현재 작업공간만 기본 허용한다.
- 전체 허용은 `"*"`, 드라이브 wildcard, 별도 `allowAll` 같은 명시적 opt-in으로 분리한다.
- 마이그레이션이 필요하면 `FS_MCP_ALLOWED_DIRECTORIES` 미설정 시 경고와 설정 안내를 반환한다.

### 5.3 High. 미사용 git 분리 모듈과 구형 edit 카탈로그가 남아 있음

관찰:

- `git-operations-` 검색 결과는 각 파일의 `@file` 주석뿐이다. 외부 import가 없다.
- `src/features/git/git-service.ts`가 git tool dispatch와 구현을 단일 파일에서 계속 처리한다.
- `src/features/git/git-operations-*.ts`, `git-runtime.ts`, `git-session.ts`, `git-status-support.ts`,
  `git-types.ts`는 합산 약 1,595줄이다.
- `src/tools/tools-edit.ts:13-15`는 구형 `EDIT_TOOL_CATALOG`와 `edit_block` 이름을 가진다.
- 실제 공개 catalog와 dispatcher는 `tools-filesystem.ts`, `tools-dispatcher.ts`의 `edit_blocks`를 사용한다.
- `ts-prune`도 위 export들을 미사용으로 보고했다.

영향:

- 빌드는 `src` 전체를 컴파일하므로 미사용 코드도 `out`에 생성될 수 있다.
- `package.json:24-25`가 `out` 전체를 npm 패키지에 포함하므로 배포 표면이 불필요하게 커진다.
- 같은 git 동작이 두 구현 경로처럼 보인다. 수정자가 어느 파일을 고쳐야 하는지 혼동하기 쉽다.
- 구형 `edit_block` 설명이 남아 도구 표면 계약을 오해하게 만든다.

개선:

- 둘 중 하나를 선택한다: git 분리 모듈을 실제 `git-service.ts`에서 사용하거나, 미사용 분리 모듈을 제거한다.
- `tools-edit.ts`는 `edit_blocks`로 통합하거나 삭제한다.
- `ts-prune` 또는 import graph 검사를 회귀 체크에 추가하되, 동적 dispatcher 예외 목록을 둔다.

### 5.4 Medium. publish workflow가 전체 검증을 실행하지 않음

관찰:

- `.github/workflows/publish-npm.yml:37-41`은 `bun run build`와 `bunx tsc --noEmit`만 실행한다.
- `package.json`에는 `verify`, `verify:source`, `verify:shape`, `verify:tools`, `verify:reports`, `test`가 있다.
- 현재 publish workflow는 `bun run verify` 또는 `bun run test`를 실행하지 않는다.

영향:

- tool surface, source boundary, report shape, smoke test 회귀가 npm publish 전에 차단되지 않는다.
- 런타임 version drift 같은 문제도 현 workflow에서 통과한다.

개선:

- publish 전에 `bun run verify`를 실행한다.
- 시간이 문제면 최소 `bun run verify:source && bun run verify:shape && bun run verify:tools && bun run test`를 넣는다.
- version 동기화 검사도 publish gate에 포함한다.

### 5.5 Medium. 한글 문서와 changelog가 현재 구조를 따라가지 못함

관찰:

- `readme.md`와 `architecture.md`는 현재 구조에 가깝다.
- `readme-ko.md:60`은 `domains/`, `readme-ko.md:82`는 `out/index.js`를 언급한다.
- `architecture-ko.md:7-8`은 `out/index.js -> src/index.ts`를 언급한다.
- `architecture-ko.md:41`, `66`, `70`, `72`에는 `domains/`가 남아 있다.
- `changelog.md`는 1.0.3 이후 상세 항목 없이 버전 스탬프만 누적되어 있다.
- `package.json:24-28`은 README, architecture, changelog를 릴리스 파일에 포함한다.

영향:

- 한국어 사용자가 문서대로 구조를 따라가면 없는 경로를 보게 된다.
- npm 배포 문서가 실제 코드보다 오래된 구조를 설명한다.
- changelog가 변경 영향, 마이그레이션, 검증 이력을 전달하지 못한다.

개선:

- `readme-ko.md`, `architecture-ko.md`를 영문 문서 기준으로 동기화한다.
- `out/index.js`는 `out/index.mjs`, `src/index.ts`는 `src/index.mts`, `domains`는 `features`로 고친다.
- changelog 형식을 하나로 정리하고 1.0.4부터 1.1.7까지 실제 변경 요약을 보강한다.

### 5.6 Medium. 설정 도구가 stderr에 상세 값을 상시 출력함

관찰:

- `src/features/config/config-service.ts`는 `getConfigValue`, `setConfigValue`에서 `console.error`를 직접 호출한다.
- `bun run test` 출력에 `systemInfo`, 홈 경로, temp 경로, runtime 세부 버전, 설정 값이 길게 출력됐다.

영향:

- MCP 클라이언트 로그에 로컬 경로와 환경 정보가 불필요하게 남을 수 있다.
- 테스트 출력이 커져 실제 실패 증상을 찾기 어렵다.
- transport가 stdout을 보호하더라도 stderr 로그 정책이 운영 수준으로 정리되어 있지 않다.

개선:

- debug flag 또는 log level이 켜진 경우에만 상세 값을 남긴다.
- system path, env, config value는 redaction 후 기록한다.
- 일반 성공 로그는 structured result로 충분하므로 stderr 직접 출력은 에러 중심으로 축소한다.

### 5.7 Low. 설정 파일과 대형 모듈에 유지보수 비용이 높음

관찰:

- `biome.json`은 약 83KB, 3,021줄이다.
- `tsconfig.json`에는 MCP 서버와 직접 관련성이 낮은 `DOM`, `jsx`, `jsxImportSource` 옵션이 남아 있다.
- 큰 소스 파일이 많다: `git-service.ts` 약 79KB, `filesystem-service.ts` 약 43KB,
  `readers-docx.ts` 약 35KB, `search-service.ts` 약 32KB.

영향:

- 구조 이해와 리뷰 비용이 높다.
- 설정이 진짜 계약인지 과거 템플릿 잔여물인지 판단하기 어렵다.
- 기능 변경 시 국소 수정이 어려워지고 충돌 가능성이 커진다.

개선:

- `tsconfig`는 서버 런타임에 필요한 옵션만 남기고 검증용 config와 분리한다.
- `biome.json`은 공통 base와 프로젝트 override로 나누는 방안을 검토한다.
- 대형 파일은 먼저 테스트와 import graph를 정리한 뒤 실제 중복이 확인된 축부터 쪼갠다.

## 6. 우선순위 개선안

### 즉시

1. `runtime-version.ts`와 `package.json` version 동기화.
2. version 동기화 테스트 추가.
3. publish workflow에 `bun run verify` 또는 최소 `bun run test` 추가.
4. `readme-ko.md`, `architecture-ko.md`의 잘못된 경로 수정.

### 단기

1. `allowedDirectories: []` 의미를 명확히 바꾸거나 문서·경고·설정 흐름을 분리.
2. 미사용 git 분리 모듈과 `tools-edit.ts` 처리 방향 결정.
3. `ts-prune` 기반 미사용 export 검사를 예외 목록과 함께 도입.
4. `config-service.ts`의 상세 stderr 로그를 debug 전용으로 축소.

### 중기

1. git 구현을 단일 소스 of truth로 정리.
2. `biome.json`, `tsconfig.json` 설정 표면 축소.
3. changelog를 실제 릴리스 노트 형식으로 복구.
4. 대형 service 파일 분할은 테스트 보강 후 단계적으로 수행.

## 7. 실행 검증 결과

```text
PASS bun run typecheck
PASS bun run build
PASS bun run verify:source
PASS bun run verify:shape
PASS bun run verify:tools
PASS bun run verify:reports
PASS bun run test
PASS bunx ts-prune --project tsconfig.json
```

비고:

- `bun run build`: SWC 71개 파일 컴파일 성공.
- `bun run test`: runnable suite 16/16 통과.
- `ts-prune`: 명령 자체는 성공했지만 미사용 export 후보를 다수 출력했다.
- 생성물 `out`은 분석 입력으로 직접 읽지 않았다. 빌드와 테스트 결과로만 배포 표면을 확인했다.

## 8. 결론

현재 구조는 이전보다 안정적이고 검증 스크립트도 잘 갖춰져 있다. 하지만 버전 단일 원천 부재,
기본 파일 접근 정책, 미사용 모듈 잔존, publish gate 누락은 실제 배포 품질에 직접 영향을 준다.

우선순위는 version 동기화와 publish gate 보강이 가장 높다. 그 다음 파일 접근 기본값과 죽은 코드 정리를
진행하면 구조 신뢰도가 크게 올라간다.

## 9. 사용자 정정 반영: 툴 호출 인자부 비대화

사용자 정정 후 원인을 다시 분류했다. 문제가 되는 출력은 MCP 도구의 실행 결과 본문이 아니라
fs-mcp.tool({...}) 형태로 클라이언트가 보여주는 툴 호출 인자부, 즉 괄호 안 JSON이다.

수정 지점은 두 가지다. 첫째, 장문 문자열 입력을 호출 인자에 직접 싣지 않는다. 둘째, items 배열 자체가
길어지는 배치 호출은 전체 인자를 JSON 파일로 넘겨 괄호 안 표시를 작은 파일 경로로 줄인다.

적용한 수정:

- write_files: 긴 content 대신 content_path, content_offset, content_length 지원.
- edit_blocks: 긴 old_string/new_string 대신 old_string_path/new_string_path와 offset/length 지원.
- start_searches: 긴 pattern 대신 pattern_path와 offset/length 지원.
- set_config_values: 긴 value 대신 value_path와 offset/length 지원.
- start_processes: 긴 command 대신 command_path와 offset/length 지원.
- interact_with_processes: 긴 input 대신 input_path와 offset/length 지원.
- git_commit, git_merge, git_stash, git_tag: 긴 message 대신 messagePath와 offset/length 지원.
- 모든 카탈로그 도구: 전체 도구 인자를 UTF-8 JSON 파일로 저장한 뒤 args_path, args_offset, args_length로 호출 지원.
- verify:tools 게이트: 모든 공개 도구 inputSchema가 args_path를 노출하는지 검사.
- 위 인라인 문자열 입력은 2,000자를 초과하면 거절되도록 제한.

검증 결과:

- edit_blocks 직접 검증: 10,174자 raw 인자는 거절, 330자 path-ref 인자는 성공, 5,004자 데이터 보존.
- git_commit 직접 검증: 5,143자 raw 인자는 거절, 199자 messagePath 인자는 실제 커밋 성공.
- args_path 직접 검증: edit_blocks raw 인자 4,037자를 args_path 101자로 축소하고 실행 성공.
- args_path 직접 검증: list_directories raw 인자 2,195자를 args_path 101자로 축소하고 실행 성공.
- bun run verify 통과: typecheck, build, source/shape/tools/reports 검증, runnable suite 16/16 통과.
- git diff --check 통과.

남은 한계:

- fs-mcp.list_directories({items:[...]})처럼 items 배열이 길어지는 호출은 args_path를 사용하면 괄호 안 표시를
  args_path 경로 수준으로 줄일 수 있다.
- 짧은 단일 경로 인자까지 화면에서 완전히 숨기는 정책은 클라이언트 표시 정책에 속한다.
- 파일 접근 전체 허용은 사용자 지시에 따라 현재 작업 범위에서는 유지했다.
