# fs-mcp 최적화 보고서 v21

## 목표

대규모 구조 변경을 프로젝트 문서와 누적 보고서 검증에 반영해 코드, 문서, 릴리스 조건이 같은 상태를 설명하도록 만든다.

## 대규모 변경

* `architecture.md`와 `architecture-ko.md`에 `tool-catalog`, dispatcher registry, `verify:source`, `verify:tools` 경계를 반영했다.
* `readme.md`와 `readme-ko.md`의 개발 명령과 저장소 구조 설명을 새 검증 체계에 맞게 업데이트했다.
* `scripts/verify-optimization-reports.mjs`의 필수 버전 목록을 v21까지 확장해 v17-v21 보고서가 누적 산출물로 유지되도록 했다.

## 구조 영향

* 사용자는 README만 보고도 source boundary, release shape, tool surface 검증 순서를 알 수 있다.
* 아키텍처 문서는 `list_tools`와 `call_tool` 경로를 분리해 설명한다.
* v12-v16 보고서는 삭제하지 않고 보존하며, v17-v21은 대규모 업데이트 기준의 후속 보고서로 누적한다.

## 검증 계획

* `bun run verify:reports`
* `bun run verify`
