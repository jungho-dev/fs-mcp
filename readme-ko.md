# @jungho-dev/fs-mcp

## 개요

`@jungho-dev/fs-mcp`는 로컬 명령 실행, 파일시스템 접근, 코드 검색, 설정 관리, 정밀 파일 편집을 제공하는 stdio 기반 Model Context Protocol 서버입니다.

현재 소스 구조는 도메인 중심으로 정리되어 있습니다. 런타임 bootstrap은 `src/cores`, 재사용 reader와 타입은 `src/assets`, MCP adapter 계층은 `src/controllers`, `src/schemas`, `src/tools`, `src/cores/responses`, 실제 도메인 동작은 `src/features` 아래에 배치됩니다.

## 설치

```bash
npm install -g @jungho-dev/fs-mcp
```

```bash
bun add -g @jungho-dev/fs-mcp
```

## MCP 클라이언트 설정

```json
{
  "mcpServers": {
    "fs-mcp": {
      "command": "fs-mcp"
    }
  }
}
```

### Codex 설정

Bun 전역 설치본을 사용할 때 `~/.codex/config.toml`에 다음 서버를 추가합니다.

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

## 주요 기능

* 파일 읽기, 쓰기, 목록 조회, 이동, 정보 조회 도구
* 명령 시작, 출력 조회, 세션 관리를 위한 프로세스 도구
* ripgrep 기반 검색과 페이지네이션
* 정확 일치 및 fuzzy 기반 search/replace 편집 도구
* 명령 정책과 파일 접근 경계를 관리하는 런타임 설정 도구

## 저장소 구조

```text
project root/
|-- src/
|   |-- app/          런타임 bootstrap, stdio transport, 서버 조립
|   |-- assets/       공용 reader, 타입 선언, 작은 유틸
|   |-- controllers/  MCP 요청 handler와 batch helper
|   |-- domains/      config, edit, filesystem, process, search 도메인 동작
|   |-- responses/    tool error/result 정규화
|   |-- schemas/      요청 인자 검증 schema
|   `-- tools/        tool catalog와 dispatcher
`-- tests/            빌드 산출물 기반 smoke 및 통합 테스트
```

## 이름 규칙

* 소스와 테스트 파일명은 `tools-filesystem.ts`, `controllers-search.ts`처럼 kebab-case를 사용합니다.
* 공유 타입 정의는 `src/assets/type` 아래에 둡니다.
* 한글 문서는 `readme-ko.md`, `architecture-ko.md`처럼 kebab-case를 사용합니다.

## 문서

* 영문 README: `readme.md`
* 한글 README: `readme-ko.md`
* 영문 아키텍처: `architecture.md`
* 한글 아키텍처: `architecture-ko.md`

## 패키징 참고

npm 패키지는 `out/index.js`를 통해 `fs-mcp` 실행 파일을 노출합니다. 소스 파일, 테스트, fixture, 로컬 런타임 산출물은 개발 전용 표면으로 유지됩니다.

`bun run verify:source`는 최적화된 소스 경계와 제거된 런타임 helper가 실행 텍스트 표면에 재유입되지 않았는지 확인합니다. `bun run verify:shape`는 루트 `src`와 `out` 존재, `dist` 부재, 의존성 외부의 `.map` 또는 `.d.ts` 산출물 부재를 확인합니다. `bun run verify:tools`는 컴파일된 tool catalog와 dispatcher registry의 툴 이름이 같은지 확인합니다.
