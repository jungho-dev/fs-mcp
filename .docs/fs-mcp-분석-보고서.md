# fs-mcp 프로젝트 종합 분석 보고서

**작성일**: 2026-05-06  
**프로젝트**: @jungho-dev/fs-mcp v1.1.8  
**분석 범위**: 소스 코드, 설정, 의존성, 보안, 성능, 아키텍처 전반

---

## 1. 프로젝트 개요

**유형**: MCP(Model Context Protocol) 서버 — 파일시스템, Git, 프로세스, 검색 작업 지원  
**기술 스택**: TypeScript 6, Node.js, SWC, Biome, Bun

### 전체 디렉토리 구조

```
src/
├── index.mts                          # 메인 진입점
├── assets/                            # 공유 유틸리티 및 타입
│   ├── readers/                       # 파일 핸들러 (텍스트, 이미지, DOCX, 바이너리)
│   ├── type/                          # 공통 타입 정의
│   └── utils/                         # 유틸리티 함수
├── controllers/                       # MCP 요청 핸들러
│   ├── controllers-batch.ts
│   ├── controllers-config.ts
│   ├── controllers-edit.ts
│   ├── controllers-filesystem.ts
│   ├── controllers-git.ts
│   ├── controllers-process.ts
│   ├── controllers-search.ts
│   └── controllers-terminal.ts
├── cores/                             # 핵심 런타임 및 서버
│   ├── responses/                     # 응답 정규화
│   ├── runtime/                       # 로깅, 캡처, 버전
│   ├── server/                        # MCP 서버 생성 및 실행
│   └── transport/                     # stdio 트랜스포트
├── features/                          # 비즈니스 로직
│   ├── config/                        # 런타임 설정
│   ├── edit/                          # 파일 편집 서비스
│   ├── filesystem/                    # 파일시스템 작업
│   ├── git/                           # Git 명령
│   ├── process/                       # 프로세스 관리
│   └── search/                        # Ripgrep 기반 검색
├── schemas/                           # Zod 입력 검증
└── tools/                             # 도구 카탈로그 및 디스패처
```

---

## 2. 의존성 분석

### 핵심 의존성

| 패키지 | 버전 | 용도 | 상태 |
|--------|------|------|------|
| `@modelcontextprotocol/sdk` | ^1.29.0 | MCP 프로토콜 구현 | ✅ 최신 |
| `@vscode/ripgrep` | ^1.17.1 | 파일 검색 | ✅ 안정 |
| `fastest-levenshtein` | ^1.0.16 | 퍼지 매칭 | ✅ 안정 |
| `isbinaryfile` | ^6.0.0 | 바이너리 파일 감지 | ✅ 안정 |
| `pizzip` | ^3.2.0 | DOCX 파일 처리 | ⚠️ 유지보수 저조 |
| `zod` | 3.25.76 | 입력 검증 | ✅ 최신 |

### 빌드/개발 의존성

| 패키지 | 버전 | 상태 |
|--------|------|------|
| `typescript` | ^6.0.3 | ✅ 최신 버전 |
| `@swc/core` | 1.15.33 | ✅ 안정 |
| `@biomejs/biome` | ^2.4.14 | ⚠️ 설정 파일 없음 |

### 의존성 문제

- **`pizzip@3.2.0`**: 더 활발하게 유지되는 대안 라이브러리 검토 권장
- **빌드 스크립트 부재**: `package.json`에 `build`, `test`, `dev` 등 표준 스크립트 없음
- **외부 bootstrap 의존**: 빌드가 `~/.bootstrap/bootstrap-sync.ts`에 의존 → 팀 공유 불가

---

## 3. 소스 코드 상세 분석

### 3.1 진입점 및 서버 계층

#### `src/index.mts`

```typescript
import { startServer } from "@cores/server/server-run-mcp-server";
startServer();
```

단순하고 명확한 진입점. 문제 없음.

#### `src/cores/server/server-run-mcp-server.ts`

**문제 1: JSON 에러 발생 시 프로세스 계속 실행 (라인 62-92)**

```typescript
process.on("uncaughtException", async (error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes("JSON") && errorMessage.includes("Unexpected token")) {
    logger.error(`JSON parsing error: ${errorMessage}`);
    return;  // ⚠️ 에러 로깅 후 그냥 계속 실행 — 불완전한 상태
  }
  // ...
  process.exit(1);
});
```

JSON 파싱 에러는 MCP 프로토콜 손상을 의미할 수 있으므로 프로세스를 계속 실행하는 것은 위험하다. 반복 발생 시 프로토콜 상태가 불일치할 수 있음.

**문제 2: `unhandledRejection` 핸들러에 동일 패턴 중복 (라인 78-92)**

`uncaughtException`과 동일한 JSON 체크 로직이 `unhandledRejection`에도 복사되어 있음. DRY 위반.

#### `src/cores/server/server-create-mcp-server.ts`

**문제: 비표준 `_meta` 필드 의존 (라인 156-175)**

```typescript
const metadata = request.params._meta;
if (hasRequestMetadata(metadata) && metadata.clientInfo) {
  await updateCurrentClient(metadata.clientInfo);
}
```

`_meta` 필드는 표준 MCP 프로토콜에 없는 커스텀 필드다. 일부 클라이언트는 이 필드를 전송하지 않아 클라이언트 감지가 신뢰할 수 없음.

---

### 3.2 Transport 계층

#### `src/cores/transport/transport-stdio-transport.ts`

**문제: 콘솔 리다이렉션 5개 메서드 중복 (라인 154-220)**

```typescript
console.log = (...args: unknown[]) => {
  if (this.isInitialized) {
    this.sendLogNotification("info", args);
  } else {
    this.messageBuffer.push({...});
  }
};
// console.info, console.warn, console.error, console.debug 동일 패턴 반복
```

**리팩토링 제안**:
```typescript
private setupConsoleRedirection(): void {
  const methods: Array<[keyof typeof console, LogLevel]> = [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warning"],
    ["error", "error"],
    ["debug", "debug"],
  ];

  methods.forEach(([method, level]) => {
    (console as any)[method] = (...args: unknown[]) => {
      if (this.isInitialized) {
        this.sendLogNotification(level, args);
      } else {
        this.messageBuffer.push({ args, level, timestamp: Date.now() });
      }
    };
  });
}
```

---

### 3.3 Runtime 계층

#### `src/cores/runtime/runtime-app-logger.ts`

**문제: 로거 폴백 로직이 불안정 (라인 39-70)**

```typescript
export function log(level: LogLevel, message: string, data?: unknown): void {
  try {
    if (global.mcpTransport) {
      global.mcpTransport.sendLog(level, message, data);
    } else {
      // 수동으로 JSON-RPC 구성 (라인 47-56)
      const notification = { jsonrpc: "2.0", method: "notifications/message", ... };
      process.stdout.write(`${JSON.stringify(notification)}\n`);
    }
  } catch (_error) {
    // 폴백도 동일한 JSON-RPC 구성 시도 (라인 58-69)
  }
}
```

트랜스포트가 없는 상태에서 JSON-RPC를 수동으로 직접 stdout에 쓰는 방식은 실패 가능성이 높다. 폴백 역시 동일한 방식이라 근본 해결이 안 됨.

**개선안**: `process.stderr.write()`로 텍스트를 직접 출력하는 방식으로 폴백 변경.

---

### 3.4 Features 계층

#### `src/features/filesystem/filesystem-service.ts`

**문제 1: 기본 보안 정책이 허용적 (라인 154-192)**

```typescript
async function isPathAllowed(pathToCheck: string): Promise<boolean> {
  const allowedDirectories = await getAllowedDirs();
  if (allowedDirectories.includes("/") || allowedDirectories.length === 0) {
    return true;  // ⚠️ 빈 목록 = 모든 경로 허용
  }
  // ...
}
```

`allowedDirectories`가 비어 있으면 모든 경로가 허용된다. 기본값이 최소 권한 원칙에 위배됨.

**개선안**: 빈 목록일 때 기본 허용 경로(홈 디렉토리 등)를 설정하거나 접근 거부.

**문제 2: Windows 경로 처리 미흡 (라인 185-186)**

`C:` 드라이브만 특수 처리하고 있어 `D:`, `E:` 등 다른 드라이브 문자는 미지원.

**문제 3: 에러 메시지가 너무 장황함 (라인 68-99)**

macOS 전용 상세 지침이 포함된 에러 메시지가 클라이언트 UI에 그대로 노출됨. Linux/Windows 구분도 없음.

#### `src/features/process/process-service.ts`

**심각한 버그: Windows에서 프로세스 목록 파싱 실패 (라인 15, 27-33)**

```typescript
// 라인 15 — 이스케이프 오류
const PROCESS_COLUMN_SPLIT_PATTERN = /\\s+/;  // ⚠️ \s+ 가 아닌 \\s+ 로 정의됨

// 라인 30-33 — Windows tasklist 포맷 가정 오류
return {
  command: parts.at(-1),
  cpu: parts[2],       // ⚠️ tasklist 포맷에서 2번 인덱스는 CPU가 아님
  memory: parts[3],
  pid: Number.parseInt(parts[1], 10),
};
```

Linux `ps aux` 포맷 기준의 파싱 로직이 Windows `tasklist` 출력에도 그대로 적용되고 있음. 정규식 이스케이프 버그도 있어 Windows에서 `listProcesses()`가 정상 작동하지 않음.

**수정안**:
```typescript
const PROCESS_COLUMN_SPLIT_PATTERN = /\s+/;

// Windows와 Linux를 분기 처리
function parseProcessLine(line: string, platform: string): ProcessInfo {
  if (platform === "win32") {
    // tasklist 포맷: 이미지명  PID  세션명  세션#  메모리
    const parts = line.trim().split(/\s{2,}/);
    return {
      command: parts[0],
      pid: Number.parseInt(parts[1], 10),
      memory: parts[4],
      cpu: "N/A",
    };
  }
  // Linux ps aux 포맷
  const parts = line.trim().split(/\s+/);
  return {
    command: parts.slice(10).join(" "),
    pid: Number.parseInt(parts[1], 10),
    cpu: parts[2],
    memory: parts[3],
  };
}
```

#### `src/features/git/git-service.ts`

**문제 1: 전역 상태로 동시성 취약 (라인 100)**

```typescript
let currentGitWorkingDirectory: string | null = null;
```

동시에 여러 요청이 들어오면 이 전역 변수가 경쟁 상태(race condition)를 유발한다.

**개선안**: 함수 파라미터로 working directory를 전달하는 방식으로 변경.

**문제 2: 28개 케이스의 거대한 switch 문 (라인 103-150)**

```typescript
export async function executeGitTool(...) {
  switch (name) {
    case "git_add":
      response = createJsonResponse(await runGitAdd(args));
      break;
    // ... 27개 케이스 반복
  }
}
```

**리팩토링 제안**:
```typescript
const GIT_HANDLERS: Record<GitToolName, (args: unknown) => Promise<unknown>> = {
  git_add: (args) => runGitAdd(args as GitArgsMap["git_add"]),
  git_blame: (args) => runGitBlame(args as GitArgsMap["git_blame"]),
  // ...
};

export async function executeGitTool<TName extends GitToolName>(
  name: TName,
  args: GitArgsMap[TName]
): Promise<ServerResult> {
  const handler = GIT_HANDLERS[name];
  if (!handler) throw new Error(`Unknown git tool: ${name}`);
  return createJsonResponse(await handler(args));
}
```

#### `src/features/config/config-store.ts`

**문제: Windows 기본 쉘 경로 미검증 (라인 52-62)**

```typescript
function getDefaultShell(): string {
  if (os.platform() === "win32") {
    return "pwsh.exe";  // ⚠️ 절대 경로 미지정, PATH에 없으면 실패
  }
  // ...
}
```

`pwsh.exe`가 PATH에 없는 환경에서 실패한다. `where.exe pwsh` 또는 레지스트리를 통해 경로를 확인해야 함.

#### `src/features/edit/edit-service.ts`

**문제 1: 매직 넘버 (라인 29)**

```typescript
const FUZZY_THRESHOLD = 0.7;
```

0.7의 근거가 없음. 설정 가능한 값으로 변경 권장.

**문제 2: 대용량 파일에서 성능 저하**

일치 개수를 세기 위해 전체 파일을 순회하는 방식으로 구현되어 있어 대용량 파일에서 느림. `String.prototype.matchAll()`을 사용하는 것이 더 효율적.

#### `src/features/search/search-service.ts`

**문제: 검색 세션 타임아웃 관리 불안정 (라인 129-150)**

각 세션마다 개별 `setTimeout`을 생성하는 방식으로, 대량 검색 실행 시 타이머가 누적됨. `startCleanupIfNeeded()`가 전역 상태를 관리하여 메모리 누수 위험이 있음.

---

### 3.5 Tools/Dispatcher 계층

#### `src/tools/tools-dispatcher.ts`

**보안 취약점: `args_path` 경로 검증 없음 (라인 62)**

```typescript
async function resolveToolArgsReference(args: unknown): Promise<unknown> {
  // ...
  const argsText = await readFileInternal(reference.args_path, offset, length);
  // ⚠️ validatePath() 호출 없음 → 임의 파일 경로 접근 가능
}
```

`args_path`에 절대 경로나 경로 트래버설(`../`)을 전달하면 허용 범위 밖의 파일을 읽을 수 있다.

**수정안**:
```typescript
const validArgsPath = await validatePath(reference.args_path);
const argsText = await readFileInternal(validArgsPath, offset, length);
```

**문제: 도구 호출 타임아웃 없음 (라인 154-175)**

일부 도구가 무한 대기 상태에 빠져도 중단되지 않음.

---

## 4. 설정 파일 분석

### `tsconfig.json`

**문제 1: 불필요한 React JSX 설정 (라인 54-55)**

```json
{
  "jsx": "react-jsx",
  "jsxImportSource": "react"
}
```

MCP 서버 프로젝트에 React 관련 설정이 포함되어 있음. 제거 권장.

**문제 2: 느슨한 타입 체크 옵션 (라인 66)**

```json
{
  "noUnusedLocals": false,
  "noUnusedParameters": false,
  "noImplicitReturns": false
}
```

미사용 변수와 파라미터가 감지되지 않아 코드 품질이 저하됨.

### `biome.json`

Biome이 devDependencies에 등록되어 있지만 설정 파일이 없음. 기본값으로만 동작 중.

---

## 5. 테스트 현황

**현황**: 프로젝트 전체에 테스트 파일 없음 (node_modules 제외).

테스트가 전혀 없으면 다음과 같은 버그가 출시될 때까지 발견되지 않는다:
- Windows 프로세스 파싱 버그 (현재 미발견)
- Git 전역 상태 경쟁 조건
- 경로 검증 우회 시나리오

**필요한 테스트 우선순위**:

1. `process-service.ts` — Windows/Linux 포맷 파싱 단위 테스트
2. `filesystem-service.ts` — 경로 검증 보안 테스트 (경로 트래버설 시도 포함)
3. `edit-service.ts` — 라인 끝 처리 (CRLF/LF)
4. `git-service.ts` — 전역 상태 격리 테스트

---

## 6. 문서 분석

### `README.md`

- ✅ 설치 방법 명확
- ✅ 주요 기능 나열
- ⚠️ 설정 옵션(환경 변수) 문서 없음
- ⚠️ 경로 보안 정책 미명시
- ⚠️ 에러 처리 전략 설명 없음

### `architecture.md`

- ✅ 레이어 경계 명확
- ✅ 의존성 규칙 정의
- ⚠️ 전역 상태 관리 전략 없음
- ⚠️ 동시성 보장 관련 내용 없음

---

## 7. 핵심 문제 요약

### 🔴 P0 — 즉시 수정 필요

| # | 문제 | 파일 | 라인 | 영향 |
|---|------|------|------|------|
| 1 | Windows에서 프로세스 목록 파싱 실패 (정규식 버그 + 포맷 불일치) | `features/process/process-service.ts` | 15, 27-33 | 기능 불동작 |
| 2 | Git 전역 상태 관리로 동시 요청 시 데이터 손상 | `features/git/git-service.ts` | 100 | 데이터 손상 위험 |
| 3 | `args_path` 경로 검증 없어 임의 파일 접근 가능 | `tools/tools-dispatcher.ts` | 62 | 보안 취약점 |
| 4 | 빈 allowedDirectories = 모든 경로 허용 (기본값 위험) | `features/filesystem/filesystem-service.ts` | 157 | 보안 취약점 |

### 🟡 P1 — 단기 수정 권장

| # | 문제 | 파일 | 영향 |
|---|------|------|------|
| 5 | JSON 에러 시 프로세스 계속 실행 → 프로토콜 손상 위험 | `cores/server/server-run-mcp-server.ts` | 안정성 |
| 6 | 콘솔 리다이렉션 5개 메서드 코드 중복 | `cores/transport/transport-stdio-transport.ts` | 유지보수성 |
| 7 | 28개 케이스 switch 문 — 복잡도 및 버그 위험 | `features/git/git-service.ts` | 코드 품질 |
| 8 | 검색 세션 타임아웃 전역 관리로 메모리 누수 위험 | `features/search/search-service.ts` | 장기 안정성 |
| 9 | 로거 폴백 — stderr 대신 JSON-RPC 수동 구성 | `cores/runtime/runtime-app-logger.ts` | 안정성 |

### 🟠 P2 — 중기 개선 권장

| # | 문제 | 파일 |
|---|------|------|
| 10 | 테스트 전무 | 전체 |
| 11 | 표준 빌드/테스트 스크립트 없음 | `package.json` |
| 12 | 불필요한 React JSX 설정 | `tsconfig.json` |
| 13 | 느슨한 타입 체크 설정 | `tsconfig.json` |
| 14 | Windows 다른 드라이브 문자 미지원 | `features/filesystem/filesystem-service.ts` |
| 15 | macOS 전용 에러 메시지 | `features/filesystem/filesystem-service.ts` |
| 16 | `biome.json` 설정 파일 없음 | 루트 |
| 17 | DOCX 처리 라이브러리 노후화 | `package.json` |

---

## 8. 보안 취약점 요약

| 심각도 | 이슈 | 위치 | 권장 조치 |
|--------|------|------|-----------|
| 🔴 높음 | `args_path` 경로 검증 없이 파일 읽기 | `tools-dispatcher.ts:62` | `validatePath()` 추가 |
| 🔴 높음 | 빈 allowedDirectories 시 모든 경로 허용 | `filesystem-service.ts:157` | 기본값 강화 또는 오류 처리 |
| 🟡 중간 | Windows 경로 트래버설 — 다른 드라이브 미지원 | `filesystem-service.ts` | 드라이브 문자 정규화 강화 |
| 🟡 중간 | 프로세스 종료 시 PID 제한 없음 | `process-service.ts` | 허용 PID 범위 제한 |

---

## 9. 성능 문제

1. **파일 편집 시 전체 파일 스캔**: 일치 개수를 세기 위해 O(n) 반복 스캔. 대용량 파일에서 느림. `matchAll()`로 개선 가능.
2. **검색 타임아웃 너무 짧음**: 정확한 파일명 검색 타임아웃 1500ms. 대형 디렉토리에서 실패 가능.
3. **도구 호출 타임아웃 없음**: 일부 도구가 무한 대기 가능.

---

## 10. 최종 평가

| 항목 | 점수 | 비고 |
|------|------|------|
| 아키텍처 설계 | 8/10 | 레이어 분리 명확, 단방향 의존성 |
| 코드 품질 | 6/10 | 코드 중복, 전역 상태 관리 문제 |
| 보안 | 5/10 | 경로 검증 미흡, 기본값 위험 |
| 안정성 | 6/10 | 예외 처리 일부 미흡 |
| 테스트 | 1/10 | 테스트 전무 |
| 문서화 | 6/10 | 구조 문서는 있으나 설정 설명 부족 |
| **종합** | **5.3/10** | |

### 장점
- MCP 프로토콜 구현이 견고하고 표준 준수
- 다중 파일 형식 지원 (텍스트, 이미지, DOCX, 바이너리)
- 계층화된 모듈 구조로 각 레이어 책임 명확
- Zod 기반 입력 검증으로 타입 안전성 확보

### 핵심 약점
- 테스트 전무 — 회귀 탐지 불가
- Windows 호환성 버그 존재 (프로세스 파싱)
- 보안 검증 미흡 (경로 검증, 기본 허용 정책)
- 전역 상태 관리로 동시성 취약
- 코드 중복으로 유지보수 부담

---

*보고서 자동 생성: Claude Code (claude-sonnet-4-6) — 2026-05-06*
