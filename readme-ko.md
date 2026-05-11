# @jungho-dev/fs-mcp

## 개요

`@jungho-dev/fs-mcp`는 로컬 파일시스템 작업, 프로세스 세션, ripgrep 기반 검색, SQLite context index,
런타임 설정, Git workflow, 정확한 block edit를 제공하는 stdio 기반 Model Context Protocol 서버입니다.

이 패키지는 MCP 서버 런타임입니다. VS Code extension bundle이 아니며 Cline, Claude Dev, Roo 같은
MCP 지원 클라이언트가 stdio로 실행합니다.

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
      "command": "fs-mcp",
      "args": []
    }
  }
}
```

클라이언트가 전역 binary를 찾지 못하면 `command`를 `fs-mcp` 실행 파일의 절대 경로로 지정합니다.
서버는 stdio만 사용하며 network listener를 열지 않습니다.

## Codex 설정

전역 설치본을 사용할 때 `~/.codex/config.toml`에 다음 서버를 추가합니다.

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

## 주요 기능

- 파일 읽기, 쓰기, 목록 조회, metadata 조회, 디렉터리 생성, 이동, 이름 변경, 삭제 도구
- 큰 문자열을 path로 넘길 수 있는 정확 일치 기반 batch edit 도구
- bundled `@vscode/ripgrep` 기반 검색, active search session, pagination, stop control
- 명령 시작, 출력 조회, 세션 입력, 세션 목록, 프로세스 목록, 프로세스 종료 도구
- Git status, diff, history, branch, checkout, stash, tag, worktree, remote, fetch, pull, push,
  merge, rebase, cherry-pick, repository setup 도구
- 큰 텍스트 payload를 공용 SQLite context DB에 저장, 검색, 조회, 삭제하는 context index 도구
- 명령 정책, shell 선택, 허용 디렉터리, context-index threshold, client metadata, system information 설정 도구

## Context Indexing

큰 tool output은 transcript에 반복해서 싣지 않고 SQLite에 index할 수 있습니다.

- 자동 indexing은 `contextIndexEnabled`, `contextIndexAutoMinChars`, `contextIndexAutoMinLines`,
  `contextIndexMaxEntryChars`로 제어합니다.
- 기본 DB 경로는 `~/.mcp/fs-mcp.sqlite`입니다.
- 수동 indexing 도구는 `index_contexts`, `search_contexts`, `list_contexts`, `clear_contexts`입니다.

## 권한 참고

`allowedDirectories`가 빈 배열이면 모든 경로 접근을 허용합니다. 제한 모드가 필요하면
`FS_MCP_ALLOWED_DIRECTORIES` 또는 `set_config_values`로 허용 경로를 명시합니다.

## 저장소 구조

```text
project root/
|-- src/
|   |-- assets/       공용 reader, 타입 선언, 교차 기능 유틸
|   |-- controllers/  MCP 요청 handler와 batch response helper
|   |-- cores/        런타임, stdio transport, 서버 조립, 응답 정규화
|   |-- features/     config, context, edit, filesystem, git, process, search 기능 동작
|   |-- schemas/      요청 인자 검증 schema
|   `-- tools/        tool catalog와 dispatcher
|-- tests/            빌드 산출물 기반 contract 및 smoke 테스트
`-- out/              npm에 배포되는 컴파일된 런타임
```

## 응답 형태

모든 dispatched tool result는 `src/cores/responses/responses-tool-result.ts`에서 정규화됩니다.

- 표시용 `content[0].text`는 `src/cores/responses/responses-tool-display.ts`의 template을 사용해
  tool 이름, status, item 수, context-index 수, text/structured payload 크기를 보여줍니다.
- `structuredContent`는 원본 content, 원본 structured payload, status, duration, optional context-index
  reference를 포함하는 machine-readable envelope를 유지합니다.
- `_meta.fsMcpResult`는 status, duration, content type, error text 중심의 compact metadata를 보관합니다.
- 큰 output indexing은 원본 structured payload를 대체하지 않고 `contextIndexes` reference를 추가합니다.

## 개발

현재 package script는 의도적으로 작게 유지합니다.

```bash
bun run verify
```

`bun run verify`는 `tsc --noEmit`으로 TypeScript를 검사합니다. Contract 및 smoke test suite는 필요할 때
Bun으로 직접 실행합니다.

```bash
bun tests/run-all-tests.js
```

## 문서

- 영문 README: `readme.md`
- 한글 README: `readme-ko.md`
- 영문 아키텍처: `architecture.md`
- 한글 아키텍처: `architecture-ko.md`
- 변경 로그: `changelog.md`

## 패키징 참고

npm 패키지는 `out/index.mjs`를 통해 `fs-mcp` 실행 파일을 노출합니다. 런타임 version metadata는
패키지 root의 `package.json`에서 읽으며, source file, test, fixture, local runtime artifact는
개발 전용 표면으로 유지됩니다.
