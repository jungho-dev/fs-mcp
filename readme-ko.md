# @jungho-dev/fs-mcp

## 개요

`@jungho-dev/fs-mcp`는 로컬 파일시스템 작업, process session, ripgrep 기반 검색, 런타임 설정,
git session workflow, exact block edit를 제공하는 stdio 기반 Model Context Protocol 서버입니다.

이 패키지는 MCP 서버 런타임입니다. VS Code 확장 번들이 아니며 특정 AI client에 종속되지 않습니다.
Codex, Claude, Cline, Roo, Cursor, Windsurf, VS Code MCP client 및 MCP 지원 client가 stdio로 실행할 수
있습니다.

현재 런타임에는 SQLite sidecar, context-index 저장소, MCP resource catalog가 없습니다.

## 설치

npm 전역 설치:

```bash
npm install -g @jungho-dev/fs-mcp
```

Bun 전역 설치:

```bash
bun add -g @jungho-dev/fs-mcp
```

## MCP Client 설정

JSON 스타일 `mcpServers` 설정을 쓰는 client에는 같은 서버 명령을 사용합니다.

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

Codex는 JSON 대신 TOML을 사용합니다. 전역 설치 후 `~/.codex/config.toml`에 추가합니다.

```toml
[mcp_servers.fs-mcp]
enabled = true
startup_timeout_sec = 60.0
tool_timeout_sec = 120.0
command = "fs-mcp"
args = []
```

client가 전역 binary를 찾지 못하면 `command`를 절대 경로의 `fs-mcp` 실행 파일로 지정합니다. 서버는
stdio를 사용하며 network listener를 열지 않습니다.

## 주요 기능

- Batched read, write, listing, metadata, directory create, move, remove 파일시스템 도구.
- Path-backed large string input을 지원하는 one-or-many exact block edit 도구.
- Bundled `@vscode/ripgrep` 기반 검색, direct regex search, active search session, pagination, stop control,
  content search 시 선택적으로 병합되는 DOCX text extraction.
- Command session, process output, interactive input, session listing, process termination 도구.
- Pinned repository state, status, diff, show, staging, commit 중심의 git session 도구.
- Command policy, shell, allowed directory, client metadata, version, system 정보를 다루는 runtime configuration 도구.

## 도구 표면

현재 source와 compiled runtime은 27개 도구를 노출합니다. Batch-capable 도구는 batch-first surface로
문서화됩니다. 같은 종류의 filesystem, search, process, config 작업이 여러 개 필요하면 client는
같은 도구를 반복 호출하지 않고 하나의 multi-item call로 묶어야 합니다.

- Config: `get_configs`, `set_config_values`.
- Filesystem/search/edit: `read_files`, `read_files_with_linenumber`, `write_files`, `create_directories`,
  `list_directories`,
  `copy_files`, `move_files`, `remove_files`, `start_searches`, `regex_searches`, `get_full_search`,
  `stop_searches`, `get_file_infos`, `edit_blocks`.
- Process: `start_processes`, `read_process_outputs`, `interact_with_processes`, `list_sessions`,
  `kill_processes`.
- Git: `git_set_working_dir`, `git_status`, `git_diff`, `git_show`, `git_add`, `git_commit`.

`src/schemas/schemas-git.ts`에는 추가 git operation schema가 정의되어 있지만, 이번 버전의
`src/tools/tools-git.ts`는 `ESSENTIAL_GIT_TOOL_NAMES`만 catalog로 export합니다.

현재 public tool catalog는 config, filesystem, process, git module만 조합합니다.

## 런타임 참고

현재 compiled catalog metric입니다.

- Tool count: `27`.
- `list_tools` payload: tool-surface verification script에서 측정합니다.
- Tool description: tool-surface verification script에서 측정합니다.
- Tool schema: tool-surface verification script에서 측정합니다.

Runtime 동작은 handler output을 그대로 보존하는 방향입니다.

- Tool catalog는 한 번만 구성하고 schema conversion은 lazy cache합니다.
- 큰 중복 text를 자동으로 축약하지 않으며 client는 full normalized payload를 받습니다.
- Search session에는 암묵적 `maxResults` cap이 없습니다. 제한된 scan이 필요하면 `maxResults`를 명시합니다.
- Process session은 active/completed session output을 더 큰 in-memory window로 보관합니다.

## Runtime Configuration

- Runtime configuration은 in-memory only이며 현재 서버는 first-run config file을 만들지 않습니다.
- 수정 가능한 key는 `allowedDirectories`, `blockedCommands`, `defaultShell`입니다.
- `get_configs`로 조회되는 read-only key는 `availableShells`, `currentClient`, `systemInfo`,
  `version`입니다.

## Batch-First 사용

`SERVER_INSTRUCTIONS`와 batch-capable tool description은 반복 호출 대신 하나의 multi-item call을 권장합니다.
적용 대상:

- `paths` 또는 `items` 배열을 쓰는 file/directory 작업.
- `regex_searches.items`, `start_searches.items`, `get_full_search.items`,
  `stop_searches.sessionIds`를 쓰는 search 작업.
- `items` 또는 `pids`를 쓰는 process 작업.
- `items`를 쓰는 config 작업.

큰 multi-item argument는 UTF-8 JSON 파일로 옮긴 뒤 `args_path`로 전달할 수 있습니다. 이렇게 하면 tool-call
preview가 작게 유지되며 batch request는 그대로 보존됩니다. Inline override는 JSON object 위에 merge됩니다.

`read_files`, `read_files_with_linenumber`, `list_directories`, `get_file_infos`는 `allowMissing=true`도 받아
탐색용 후보 경로 중 누락된
local path를 실패가 아닌 missing 결과로 반환할 수 있습니다.

## Client 호환성

- 초기화 시 client metadata를 수집하고 `get_configs`의 `currentClient`로 노출합니다.
- Console/stdout filtering은 MCP JSON-RPC stdio가 우발적 process output과 섞이지 않도록 보호합니다.
- Compatibility profile은 Claude, Codex, Gemini CLI, GitHub Copilot을 대상으로 합니다. Gemini CLI와
  Copilot은 server-side JSON-RPC notification을 억제하고 Claude와 Codex는 standard notification flow를
  유지합니다.
- Resource와 resource-template list handler는 빈 목록을 반환해 resource probe를 수행하는 client 초기화를
  완료시킵니다.

## Repository 구조

```text
project root/
|-- src/
|   |-- assets/       공용 reader, type declaration, 교차 기능 utility
|   |-- controllers/  MCP request handler와 batch response helper
|   |-- cores/        runtime, transport, server assembly, response normalization
|   |-- features/     config, edit, filesystem, git, process, search 동작
|   |-- schemas/      request argument validation schema
|   `-- tools/        tool catalog entry와 dispatcher
|-- tests/            contract test, smoke test, fixture, verification script
`-- out/              npm에 배포되는 compiled runtime
```

## 응답 형태

모든 dispatched tool result는 `src/cores/responses/responses-tool-result.ts`에서 정규화됩니다.

- 표시용 `content[0].text`는 `src/cores/responses/responses-tool-display.ts`의 template을 사용하며
  기본 row는 `tool`, `items`, `status`, `tokens`, `duration`, `contents`, `structuredText`입니다.
  `tokens`는 visible combined text와 serialized structured content를 `o200k_base` tokenizer로 계산하고
  `token` 단위를 함께 출력합니다.
- `structuredContent`는 원본 content, combined text, 원본 structured payload, status, duration, error detail,
  schema version, tool name을 포함하는 machine-readable envelope입니다.
- `_meta.fsMcpResult`는 status, duration, content type, error text 중심의 compact metadata를 보관합니다.
- 이미 정규화된 result는 다시 감싸지 않고 표시 text만 재생성합니다.

Search session 응답은 pagination과 scan 상태를 위해 `nextOffset`, `wasLimited`, `wasIncomplete`
같은 field도 함께 돌려줄 수 있습니다.

## 개발

현재 package script는 local bootstrap helper를 호출합니다.

```bash
bun run swc
bun run sync
bun run tools
```

Contract 및 smoke test suite는 Bun으로 직접 실행합니다.

```bash
bun tests/run-all-tests.js
```

`tests/run-all-tests.js`는 `FS_MCP_SKIP_BUILD=1`이 설정되지 않은 경우 `out`을 다시 build합니다.
`tests/scripts/`의 helper script는 release shape, source boundary, tool surface를 직접 실행할 때 확인합니다.

## 문서

- 영문 README: `README.md`
- 한글 README: `readme-ko.md`
- 영문 아키텍처: `architecture.md`
- 한글 아키텍처: `architecture-ko.md`
- 변경 로그: `changelog.md`

## 패키징 참고

npm 패키지는 `out/index.mjs`를 통해 `fs-mcp` 실행 파일을 노출합니다. 런타임 version metadata는 package
root의 `package.json`에서 읽습니다. Package file allowlist에는 `out`, release documentation, changelog가
포함되며 source file, test, fixture, local runtime artifact는 development-only surface로 유지됩니다.
