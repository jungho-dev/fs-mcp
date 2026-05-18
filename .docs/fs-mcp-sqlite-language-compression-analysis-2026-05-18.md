# fs-mcp SQLite 및 언어 압축 손실 분석

작성일: 2026-05-18
프로젝트: `C:/JUNGHO/9.Workspace/2.Project/2.Node/fs-mcp`
보고서 버전: v1
최종 업데이트: 2026-05-18

## 결론

현재 구현은 대용량 MCP tool output을 Bun 내장 SQLite FTS5 인덱스로 저장하고, 기본값에서는 원본 응답
payload를 유지한다. 같은 prefix를 가진 truncated payload 재사용, UTF-8 byte retention, opt-in reference
replacement 같은 주요 손실 방지는 이미 계약 테스트로 보호된다.

분석 당시 핵심 문제는 한국어, 일본어, 중국어처럼 공백이 약한 언어의 검색 회수율이었다. 이번 수정으로
CJK 보조 token index와 code point-safe 절단을 적용해 무공백 복합어 검색과 surrogate pair 절단 문제를
해소했다. Prefix-only 인덱싱의 뒤쪽 payload 미검색 가능성은 metadata 표시로 드러나게 했고, head-tail
indexing은 다음 구조 개선 후보로 남겼다.

## 적용 결과

- CJK 1/2/3-gram 보조 테이블 `context_chunks_cjk`를 추가했다.
- 기존 FTS 검색 결과가 부족하고 query에 CJK 문자가 있을 때 보조 검색을 병합한다.
- CJK가 없는 chunk도 sentinel token으로 처리 완료를 기록해 초기화 때 반복 재처리하지 않는다.
- `content.slice()` 기반 index/preview 절단을 code point-safe `sliceText()`로 교체했다.
- `search_context_index` 결과에 `originalLength`, `indexedLength`, `truncated` metadata를 포함한다.
- schema version은 `PRAGMA user_version = 4`로 올렸다.

## Before/After 확인

기존 격리 실험에서는 무공백 `한국어언어압축손실테스트` 저장 후 `압축`, `한국어`, `언어압축손실` 검색이
hit를 만들지 못했다.

수정 후 같은 실험 결과:

- `언어압축손실`: `ko-nospace` hit.
- `압축`: `ko-space`, `ko-nospace` hit.
- `한국어`: `ko-space`, `ko-nospace` hit.
- `코드`: `ko-space`, `ko-nospace` hit.
- `언어 압축`: `ko-space`, `ko-nospace` hit.

## 작업 범위

- 현재 SQLite 사용 방식 확인
- 대용량 응답 압축, 표시 압축, context-index reference replacement 경로 확인
- 언어 압축 및 손실 문제 파악
- 개선사항 종합
- 직접 실행한 검증 결과 포함

## 현재 SQLite 사용 방식

- `src/features/context/context-index-service.ts`가 `bun:sqlite`의 `Database`를 직접 사용한다.
- 외부 sqlite package는 `package.json` dependencies에 없다.
- 기본 DB 경로는 `~/.mcp/fs-mcp.sqlite`이며, custom `contextIndexDbPath`는 `~/.mcp` 또는
  `allowedDirectories` 내부만 허용한다.
- schema는 `context_documents`, `context_chunks`, `context_chunks_fts`, `context_chunks_cjk` 4개 축이다.
- `context_chunks_fts`는 `fts5(chunk_id UNINDEXED, index_id UNINDEXED, source, text)` 가상 테이블이다.
- `context_chunks_cjk`는 CJK 1/2/3-gram token을 저장해 무공백 복합어 검색을 보완한다.
- runtime pragma는 `busy_timeout=5000`, `foreign_keys=ON`, `journal_mode=WAL`,
  `synchronous=NORMAL`이다.
- schema version은 `PRAGMA user_version = 4`로 기록된다.
- document metadata는 `original_length`, `original_bytes`, `indexed_length`, `truncated`,
  `content_hash`를 저장한다.
- chunk는 80 line 단위, 20 line overlap으로 생성된다.
- retention은 `contextIndexMaxDocuments`와 `contextIndexMaxBytes`를 넘으면 오래된 row와 chunk를
  삭제한다.

## 현재 압축 및 보존 경로

- 자동 인덱싱 threshold는 기본 `5000` chars 또는 `120` lines다.
- `contextIndexMaxEntryChars` 기본값은 `1_000_000` chars다.
- `context-output-compactor.ts`는 큰 text field와 structured collection을 SQLite에 index한다.
- 기본 `contextIndexReplaceLargeOutputs=false`에서는 원본 `data.text`와 `structuredContent`를 유지한다.
- `contextIndexReplaceLargeOutputs=true`일 때만 large payload가 `[context-index:<id>]` 또는
  `{ omitted: true, contextIndex: ... }`로 치환된다.
- `read_files`, `list_directories`, `regex_searches`, `get_full_search`는 marker replacement를 우회한다.
- `responses-tool-result.ts`의 duplicate text compaction은 visible `content[0].text`만 preview로 줄이고,
  machine-readable `data.text`와 `structuredContent`는 보존한다.
- batch helper는 summary visible text를 줄이되, 기본값으로 큰 `textContent`와 `listing` payload를 보존한다.

## 확인된 강점

- 전체 원본 payload hash를 사용하므로 같은 prefix를 가진 truncated payload가 잘못 재사용되지 않는다.
- `originalBytes`가 UTF-8 byte 기준으로 저장되어 retention이 한글 byte 크기를 반영한다.
- 기본 설정은 원본 응답 payload를 보존하므로 client가 `structuredContent`를 읽으면 데이터 손실이 없다.
- context-index 관리 도구 `list_context_index`, `search_context_index`, `clear_context_index`가 노출되어
  수동 회수와 정리가 가능하다.
- 계약 테스트가 hash, retention, UTF-8 byte, replacement opt-in, tracked tool bypass를 직접 검증한다.

## 문제점

1. 한국어 무공백 복합어 검색 회수율 낮음

   격리 DB 실험에서 `한국어언어압축손실테스트`를 저장한 뒤 `압축`, `한국어`, `언어압축손실`로
   검색하면 hit가 없었다. 공백이 있는 `한국어 언어 압축 손실 테스트`는 같은 query에서 hit가 있었다.
   원인은 FTS5 기본 tokenizer가 무공백 CJK 내부 substring을 토큰으로 만들지 않는 점이다.

2. prefix-only 인덱싱 손실

   `contextIndexMaxEntryChars`를 넘는 payload는 앞부분만 `indexedText`로 저장된다. 문서 metadata에는
   `truncated=true`가 남지만, 뒤쪽 내용은 `search_context_index`로 검색되지 않는다.

3. UTF-16 code unit 기준 절단

   `content.slice(0, config.maxEntryChars)`와 preview `slice(0, 160)`은 grapheme 또는 UTF-8 byte 경계가
   아니다. emoji, 결합문자, 일부 확장 문자에서 preview 또는 indexed slice가 문자 중간에서 끊길 수 있다.

4. query token 제한 및 AND 결합

   `createFtsQuery()`는 query token을 최대 12개로 자르고 `AND`로 결합한다. 긴 자연어 query는 뒤쪽
   핵심어가 버려질 수 있고, 불필요한 단어 하나가 result recall을 낮출 수 있다.

5. visible-only client 손실

   표준 envelope를 읽는 client는 원본을 보존하지만, `content[0].text`만 보는 client는 duplicate preview,
   batch summary, display template 때문에 축약된 내용만 본다. 이는 데이터 손실이 아니라 client 소비 경로의
   손실이다.

## 개선안

1. CJK 검색용 보조 인덱스 추가

   `context_chunks_fts`와 별도로 normalized n-gram column 또는 trigram-like 보조 테이블을 둔다.
   대상은 Hangul, Hiragana, Katakana, CJK Unified Ideographs가 포함된 chunk다. 공백 언어는 기존 FTS를 유지하고,
   CJK query만 보조 검색을 병합하면 blast radius가 작다.

2. query 전략을 OR fallback으로 확장

   현재 `AND` 검색이 0건이면 token별 `OR` 또는 LIKE fallback을 수행한다. 즉시 구현 가능하지만 대용량 DB에서는
   성능 비용이 있으므로 limit, source filter, CJK 감지 조건을 함께 둔다.

3. prefix-only 인덱싱을 head-tail 또는 full-chunk budget으로 변경

   `maxEntryChars`를 단순 prefix가 아니라 head/middle/tail sampling 또는 chunk budget으로 나눈다. 로그와 diff는
   끝부분에 원인 정보가 많으므로 tail 보존 가치가 높다.

4. Unicode 안전 절단 도입

   `Intl.Segmenter`가 있으면 grapheme 기준으로 preview와 index slice를 자른다. fallback은 code point iterator
   `Array.from(value)`를 사용한다. byte budget이 필요하면 `TextEncoder` 기준으로 valid boundary를 찾는다.

5. 검색 결과에 truncation 경고 노출

   `search_context_index` 결과 또는 `list_context_index`에 `truncated=true`인 문서의 "검색 가능 범위는
   indexedLength까지"라는 명시를 추가한다. 사용자 혼동을 줄인다.

6. visible-only client 대응 강화

   display text에 context-index id와 "full payload in structuredContent.data" 위치를 짧게 넣는다. 현재 template은
   token, contents, structuredText만 보여 주므로 visible-only client가 원본 위치를 놓칠 수 있다.

## 우선순위

1. CJK n-gram 또는 OR fallback: 언어 손실의 실제 검색 실패를 직접 줄인다.
2. Unicode 안전 절단: 문자 깨짐과 preview 품질 문제를 줄인다.
3. head-tail indexing: prefix-only 손실을 줄인다.
4. truncation 경고: 동작을 바꾸지 않고 혼동을 줄인다.
5. display guidance: client별 소비 차이를 줄인다.

## 검증

- `bun tests/contracts/context-index.contract.test.js`: exit code 0.
- `bun tests/contracts/tool-result-response.contract.test.js`: exit code 0.
- `bun x tsc --noEmit -p tsconfig.json`: exit code 0.
- `bun tests/run-all-tests.js`: exit code 0, runnable suite 20/20 passed.
- `bun -e ...` 격리 SQLite 언어 검색 실험: 검색 결과 출력 후 Windows SQLite lock cleanup에서 exit code 1.
  출력 자체는 확보했고 temp directory는 후속 `remove_files`로 삭제했다.
- 수정 후 `bun -e ...` 격리 SQLite 언어 검색 실험: exit code 0, 무공백 CJK query hit 확인.
- `git_diff --stat --includeUntracked`: 현재 작업트리에 기존 변경 6개 파일 확인. 본 분석은 기존 변경을 되돌리지 않았다.

## 변경 파일

- `.docs/fs-mcp-sqlite-language-compression-analysis-2026-05-18.md`: 본 분석 보고서 생성.
- `src/features/context/context-index-service.ts`: CJK 보조 인덱스, Unicode-safe 절단, 검색 metadata 추가.
- `tests/contracts/context-index.contract.test.js`: CJK 무공백 검색과 Unicode truncation 계약 추가.

## 근거

- 확인됨: `src/features/context/context-index-service.ts` schema, chunking, hash, retention, search 구현.
- 확인됨: `src/features/context/context-output-compactor.ts` replacement opt-in 및 bypass tool 구현.
- 확인됨: `src/cores/responses/responses-tool-result.ts` duplicate preview와 structured payload 보존.
- 확인됨: `tests/contracts/context-index.contract.test.js` hash, UTF-8 byte retention, maintenance tool 계약.
- 확인됨: `tests/contracts/tool-result-response.contract.test.js` 원본 보존, replacement opt-in, bypass 계약.
- 확인됨: 격리 DB 실험에서 공백 없는 한국어 복합어 내부 검색 실패.
- 추론: 일본어, 중국어도 공백이 약한 경우 동일 계열 문제가 발생할 가능성이 높다.
- 미검증: 대규모 실제 DB에서 n-gram fallback의 성능 비용.
