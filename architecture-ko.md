# fs-mcp 아키텍처

## 런타임 흐름

```text
MCP stdio client
-> fs-mcp binary
-> out/index.mjs
-> src/index.mts
-> src/cores/server/server-run-mcp-server.ts
-> src/cores/server/server-create-mcp-server.ts
-> src/tools/tools-*.ts for list_tools
-> src/tools/tools-dispatcher.ts for call_tool
-> src/schemas/* for argument contracts
-> src/controllers/* for MCP adapters
-> src/features/* for domain behavior
-> src/cores/responses/* for normalized tool output
```

배포 런타임은 compiled `out` tree입니다. 테스트는 TypeScript source를 직접 import하지 않고 compiled surface를
검증합니다.

## 계층 경계

- `src/cores`는 process bootstrap, stdio transport, server assembly, runtime guidance, client initialization,
  output filtering, response normalization을 담당합니다.
- `src/tools`는 public tool catalog entry, description, annotation, schema wiring을 담당합니다.
- `src/schemas`는 request argument contract와 `args_path` 확장을 담당합니다.
- `src/controllers`는 MCP handler adapter, batch result shaping, feature service 호출을 담당합니다.
- `src/features`는 filesystem, edit, search, process, config, git domain behavior를 담당합니다.
- `src/assets`는 shared reader, type declaration, cross-domain utility를 담당합니다.
- `tests`는 compiled package surface에 대한 contract, smoke, fixture, verification coverage를 담당합니다.

Feature module은 `features/filesystem/filesystem-path-resolver.ts` 같은 feature-level utility를 통해 동작을
공유할 수 있습니다. Controller는 MCP adapter이므로 재사용 가능한 domain service로 import하지 않습니다.

## 소스 트리

```text
src/
|-- index.mts
|-- assets/
|   |-- readers/
|   |-- type/
|   `-- utils/
|-- controllers/
|-- cores/
|   |-- responses/
|   |-- runtime/
|   |-- server/
|   `-- transport/
|-- features/
|   |-- config/
|   |-- edit/
|   |-- filesystem/
|   |-- git/
|   |-- process/
|   `-- search/
|-- schemas/
`-- tools/
```

## 의존성 규칙

```text
index -> cores/server
cores/server -> tools
cores/server -> cores/responses
cores/server -> features/config
cores/server -> features/git
tools -> schemas
tools -> controllers
controllers -> schemas
controllers -> features
controllers -> cores/responses
features -> assets
cores/responses -> assets
tests -> out
```

## Public Tool 조립

`server-create-mcp-server.ts`는 네 module의 catalog를 합쳐 public surface를 구성합니다.

| Module | Count | Public tools |
|--------|------:|--------------|
| `tools-config.ts` | 1 | `set_config_values` |
| `tools-filesystem.ts` | 14 | `file-read`, `file-lines`, `file-write`, `dir-mk`, `dir-list`, `file-copy`, `file-move`, `file-remove`, `search-start`, `search-regex`, `search-get`, `search-stop`, `file-infos`, `file-edit` |
| `tools-process.ts` | 1 | `interact_with_processes` |
| `tools-git.ts` | 6 | `git-cwd`, `git-status`, `git-diff`, `git-show`, `git-add`, `git-commit` |

전체 public catalog 크기는 `22`개 tool입니다.

`tools-dispatcher.ts`는 대응되는 `call_tool` registry를 담당합니다. Catalog와 dispatcher는 같은 이름을
노출해야 합니다. `tests/scripts/scripts-verify-tool-surface.mjs`는 name equality, uniqueness, essential git
filtering, shared `args_path` 지원을 확인합니다.

Git schema는 더 넓은 internal operation map을 정의하지만 `tools-git.ts`는 essential git name list로 public
surface를 필터링합니다. 현재 public surface에는 별도 context-index, SQLite, MCP resource, config-read,
process lifecycle tool family가 없습니다.

## 요청 및 Argument 흐름

- `InitializeRequestSchema`는 client metadata를 수집하고 protocol version을 협상하며 compatibility를 설정합니다.
- `ListToolsRequestSchema`는 config, filesystem/search/edit, process, git catalog를 합쳐 반환합니다.
- `CallToolRequestSchema`는 client metadata가 있으면 갱신하고 client git-session scope에 진입한 뒤 tool name으로
  dispatch합니다.
- `tools-dispatcher.ts`는 schema별 controller validation 전에 `args_path`, `args_offset`, `args_length`를 해석합니다.
- `args_path` 옆에 제공한 inline field는 참조 JSON object의 field를 override합니다.
- Controller는 해석된 argument를 검증하고 feature service를 호출합니다.
- Feature service는 `ServerResult`를 반환하고 dispatcher는 MCP client로 반환하기 전에 결과를 정규화합니다.

## Domain Behavior

### Filesystem And Edit

Filesystem tool은 batch-first와 path-oriented 구조를 따릅니다. Read는 단순 읽기용 `paths`와 offset, length,
URL, option을 지정하는 `items`를 모두 지원합니다. Write와 edit은 큰 content를 위해 path-backed payload field를
지원합니다. Directory listing, metadata, read tool은 탐색용 후보 경로를 위해 `allowMissing=true`를 사용할 수
있습니다.

Exact block replacement는 edit feature에 있으며 `file-edit`으로 노출됩니다.

### Search

Search는 bundled `@vscode/ripgrep`에 위임하고 system ripgrep을 fallback으로 사용합니다. `search-regex`는 direct
content scan을 실행합니다. `search-start`는 더 넓은 file/content search를 위한 paged session을 만들고,
`search-get`은 offset/length로 result slice를 반환합니다. `search-stop`은 active session을 중지합니다.

Search session response는 `sessionId`, `nextOffset`, `wasLimited`, `wasIncomplete`를 노출할 수 있습니다. Session은
caller가 `maxResults`를 제공한 경우에만 result cap을 적용합니다.

### Config

`config-store.ts`는 in-memory default와 mutable runtime value를 materialize합니다. Public config surface는
`set_config_values`를 통한 configuration update만 노출합니다. Read-only metadata는 runtime 내부에서 사용되지만
현재 catalog의 public MCP tool은 아닙니다.

### Process

현재 public process surface는 `interact_with_processes` 하나로 제한됩니다. 이 tool은 알려진 running process ID에
stdin을 보냅니다. Process service module에는 policy, session, terminal, virtual-node behavior가 남아 있지만,
process lifecycle control은 이번 catalog에서 public tool로 export되지 않습니다.

### Git

Git call은 client-scoped git session 안에서 실행됩니다. `git-cwd`는 working repository를 pin하고, `git-status`와
`git-diff`는 상태를 검사하며, `git-show`는 git object 또는 revision file을 읽습니다. `git-add`는 path를 stage하고
`git-commit`은 commit을 생성합니다. Commit description은 English multi-line Conventional Commit message를
권장합니다.

## Tool Response Contract

개별 handler는 `content`, 선택적 `structuredContent`, 선택적 `isError`, 선택적 `_meta`를 가진 `ServerResult`를
반환합니다.

`dispatchToolCall`은 정규화되지 않은 handler result를 `normalizeToolResult`로 한 번 정규화합니다.

정규화된 contract는 세 layer입니다.

- `createToolDisplayText`가 생성하는 표시용 `content[0].text`.
- Schema version, tool name, status, duration, error detail, 원본 normalized content, combined text, 원본
  structured payload를 담는 machine-readable `structuredContent`.
- Status, duration, content type, error text, schema version, tool name을 담는 compact `_meta.fsMcpResult`.

기본 display row는 `tool`, `items`, `status`, `duration`, `tokens`, `contents`, `structuredText`입니다. Gemini
client는 같은 display에서 ANSI escape sequence를 제거한 text를 받습니다.

## Runtime Configuration

- Runtime configuration은 in-memory only입니다.
- Mutable key는 `allowedDirectories`, `blockedCommands`, `defaultShell`입니다.
- `FS_MCP_ALLOWED_DIRECTORIES`로 allowed directory를 초기화할 수 있습니다. Windows entry는 semicolon으로 구분합니다.
- Windows 기본 shell 선택은 PowerShell 7, `ComSpec`, system `cmd.exe` 순서를 따릅니다. Non-Windows 기본값은
  `$SHELL`, macOS의 `/bin/zsh`, 또는 `/bin/sh`입니다.
- Current client state는 `config-client.ts`에서 추적하며 git-session scoping에 사용됩니다.

## MCP Client Compatibility

- `SERVER_INSTRUCTIONS`는 client에게 local filesystem, process, git, config 작업에 fs-mcp를 사용하고 같은 종류의
  작업은 batch-first로 호출하라고 안내합니다.
- `FilteredStdioServerTransport`는 우발적인 stdout/stderr write를 capture해 JSON-RPC를 격리합니다.
- Compatibility profile은 Claude, Codex, Gemini CLI, GitHub Copilot을 대상으로 합니다.
- Gemini CLI와 GitHub Copilot은 server-side JSON-RPC notification을 비활성화합니다.
- Claude와 Codex는 standard notification flow를 유지합니다.
- No-op resource/resource-template handler는 resource를 노출하지 않는 상태에서도 probing client 초기화를 허용합니다.

## Performance And Safety Design

- 현재 compiled catalog는 `22`개 tool을 노출합니다.
- 현재 checkout에서 측정한 `list_tools` payload는 `24,721` chars입니다.
- Tool description은 총 `6,088` chars, schema는 총 `17,266` chars입니다.
- Tool catalog는 한 번 조립하고 input schema JSON은 lazy cache로 생성합니다.
- Batch-capable tool은 `paths`, `items`, `sessionIds` 같은 array를 받습니다.
- 큰 inline argument는 `args_path` 또는 tool-specific path-backed field로 전달할 수 있습니다.
- File operation은 configured timeout boundary와 feature-layer path resolution을 사용합니다.
- Stdio transport는 MCP JSON output을 오염시키기 전에 우발적 output을 capture합니다.
- 테스트는 npm에 배포되는 런타임 표면과 같은 compiled `out` tree를 검증합니다.

## Verification Boundary

- `bun run verify`는 source, release-shape, tool-surface, optimization-report verification을 실행합니다.
- `bun run test`는 `tests/run-all-tests.js`를 통해 contract 및 smoke test를 실행합니다.
- `tests/run-all-tests.js`는 `FS_MCP_SKIP_BUILD=1`이 설정되지 않은 경우 `out`을 다시 build합니다.
- `tests/scripts/scripts-verify-release-shape.mjs`는 release artifact shape와 binary shebang을 확인합니다.
- `tests/scripts/scripts-verify-source-boundaries.mjs`는 source/test root boundary를 확인합니다.
- `tests/scripts/scripts-verify-tool-surface.mjs`는 compiled catalog와 dispatcher registry를 비교합니다.
- `tests/scripts/scripts-verify-optimization-reports.mjs`는 expected report artifact를 검증합니다.

## Packaging Boundary

Published package는 `out/index.mjs`를 통해 `fs-mcp`를 노출합니다. `package.json` file allowlist에는 `out`, release
documentation, changelog가 포함됩니다. Source file, test, generated fixture, local build cache, private runtime
artifact는 development-only surface입니다.
