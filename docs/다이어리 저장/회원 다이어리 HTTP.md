# 231·232·233 회원 다이어리 HTTP 연결

현재 연결 상태(2026-10-27): 231 생성·232 회원 목록·233 상세/수정과 회원 기본 앱 연결을 구현했다. 아래 단계별 검증 수치는 당시 기록이며 최신 통합 검증은 [develop 통합 검토](./회원%20다이어리%20develop%20통합%20검토.md)를 따른다.

관련 이슈: S15P31F106-231, S15P31F106-232, S15P31F106-233

## 경로와 인증

| 메서드 | 경로 | 성공 |
|---|---|---|
| GET | `/api/v1/member/diaries` | 200, 회원 목록·페이지 수·공유 여부·커서 |
| POST | `/api/v1/member/diaries` | 201, Location·첫 페이지·전체 페이지 ID |
| GET | `/api/v1/member/diaries/{diaryId}` | 200, 활성 멤버 상세 |
| PATCH | `/api/v1/member/diaries/{diaryId}` | 200, OWNER 메타데이터 수정 |

기존 비회원 API와 계약을 분리한 현재 구현 경로다. 229 팀 합의 자체를 완료한 것으로 취급하지 않는다. 232 회원 목록도 같은 컨트롤러에 연결했다. 검색·정렬·커서 계약은 [회원 서버 목록 기본 앱 연결](./회원%20서버%20목록%20기본%20앱%20연결.md)을 따른다. 휴지통·공유 설정·페이지 본문 조회는 별도 범위다.

전용 Spring Security 체인이 본문 파싱 전에 Bearer 토큰을 검증한다. 기존 로그인 JWT·DB 세션 검증기와 개발 전용 토큰 헤더 설정을 재사용한다. 세션 쿠키 인증을 만들지 않는다. 허용 CORS 출처는 기존 `AUTH_ALLOWED_ORIGINS`를 사용하며 GET·POST·PATCH·OPTIONS와 Location 노출을 설정했다.

**공개 API 우회 차단:** 기존 `/api/v1/diaries`의 목록·상세·수정·삭제는 `owner_user_id IS NULL` 자료로 한정했다. 회원 다이어리는 ID를 알아도 해당 경로에서 404이며 목록에도 나타나지 않는다. 비회원 수정·삭제 조회에는 행 잠금을 사용한다. 기존 비회원 생성 경로와 저장 데이터는 유지한다.

## 생성 요청·응답

```json
{
  "diaryTitle": "나의 기록",
  "coverColor": "#123456",
  "coverStyle": "PLAIN",
  "initialPages": [{
    "templateCode": "2026-cover-landscape",
    "templateVersion": "1.0.0",
    "templateConfig": {"width": 1024, "height": 768}
  }]
}
```

제목과 초기 페이지는 필수다. 색상·스타일 생략 시 기존 기본값을 사용하며 PRIVATE로 생성한다. `ownerUserId`, `visibility`, `templateId` 등 미지원 필드는 400이다. 페이지 코드·버전·설정은 V9 카탈로그 및 제품 JDBC 모듈로 검증한다. 기본 초기 페이지 상한은 512이며 서버 설정을 따른다.

응답은 `{ "diary": {...}, "firstPageId": "UUID", "pageIds": ["UUID"] }`다. diary에는 문자열 UUID·제목·표지색·스타일·공개 범위·createdAt·updatedAt·canEdit이 포함된다. 생성 응답의 canEdit은 true이며 전체 ID는 생성 순서다. 성공과 도메인/검증 오류 응답에 Cache-Control: no-store를 적용한다.

**Idempotency-Key는 필수다.** 동일 사용자·키·정규화 요청은 최초 201 본문과 Location을 재사용하고 Idempotency-Replayed 헤더를 제공한다. 다른 내용은 409다. 재시도에는 최초 키·본문을 유지한다. 자세한 트랜잭션·동시 요청·삭제 정책은 [회원 생성 중복 방지](./회원%20생성%20중복%20방지.md)를 참고한다.

동일 키 재응답은 **최초 생성 시점의 스냅샷**이며 현재 메타데이터 조회가 아니다. 생성 후 제목·표지 등을 수정했어도 재응답의 `diary.updatedAt`은 최초 값이다. 최신 수정 기준은 상세 GET으로 확인한다. 오래된 값을 `expectedUpdatedAt`으로 PATCH하면 `409 DIARY_METADATA_CONFLICT`가 발생할 수 있다. 이때 최신 상세를 확인하고 사용자가 다시 수정해야 하며 자동 덮어쓰기나 새 생성 키로 우회하지 않는다.

## 상세·수정

상세 응답은 `{ "diary": {...} }`다. 활성 멤버만 조회하며, 메타데이터 수정이 가능한 OWNER일 때만 canEdit=true다.

```json
{
  "diaryTitle": "바뀐 제목",
  "expectedUpdatedAt": "2026-10-27T00:00:00.123456Z"
}
```

수정할 제목·표지색·스타일 중 하나 이상과 직전 응답의 updatedAt을 전달한다. 시간 문자열을 밀리초로 변환하거나 반올림하지 않는다. 생략한 메타데이터는 유지하고 명시적 null·알 수 없는 필드·공개 범위 변경은 거부한다. 값이 오래됐으면 409다. VIEWER·EDITOR는 조회할 수 있지만 메타데이터 수정은 403이다. 비참여·탈퇴·삭제·없는 자료는 404다.

## 오류와 OpenAPI

회원 오류 본문은 application/problem+json의 `status`, `title`, `code`, `detail` 네 필드다.

| 상태 | 대표 code | 의미 |
|---|---|---|
| 400 | INVALID_MEMBER_DIARY_REQUEST / INVALID_DIARY_CREATION / INVALID_INITIAL_PAGES | JSON·입력·속지 검증 실패 |
| 400 | INVALID_DIARY_LIST_QUERY | 목록 검색어·정렬·개수·커서 오류 |
| 400 | MISSING_IDEMPOTENCY_KEY / INVALID_IDEMPOTENCY_KEY | 생성 키 누락·형식 오류 |
| 409 | IDEMPOTENCY_KEY_REUSED / IDEMPOTENCY_IN_PROGRESS / IDEMPOTENCY_RESULT_UNAVAILABLE | 키의 내용 충돌·처리 중·기존 결과 사용 불가 |
| 401 | INVALID_TOKEN | 토큰 부재·만료·변조·로그아웃·비활성 세션 |
| 403 | DIARY_METADATA_FORBIDDEN | OWNER 외 수정 |
| 404 | DIARY_NOT_FOUND | 없거나 접근할 수 없는 자료 |
| 409 | DIARY_METADATA_CONFLICT | 오래된 수정 기준 |
| 500 | DIARY_CREATION_STATE_INVALID / DIARY_PERSISTENCE_FAILED / DIARY_INTERNAL_ERROR | 생성 결과·저장·내부 오류 |
| 503 | DIARY_PERSISTENCE_UNAVAILABLE | 저장소 일시 사용 불가 |

서비스 단계의 재검증에서 인증 상태가 바뀌면 기존 DIARY_AUTHENTICATION_REQUIRED 또는 DIARY_CREATION_AUTHENTICATION_REQUIRED도 401로 응답한다. SQL·내부 예외 메시지·토큰은 응답에 포함하지 않는다. `/v3/api-docs`의 회원 태그에는 보안 요구, 성공 응답, 오류 모델·상태를 명시했다.

## 프런트 및 검증

`createMemberDiaryApi(transport)`는 회원용 list/create/get/update를 제공한다. baseUrl을 `/api/v1`로 둔 기존 `createHttpTransport`와 조합하며 create의 options.requestId에 생성 키를 전달한다. 코드·버전·설정을 HTTP DTO로 변환하고 생성 ID 목록, 응답 ID·수정 시각·canEdit을 검증한다. 인증된 회원의 기본 앱은 회원 API로 연결하며 게스트·체험 계정은 기존 로컬 흐름을 사용한다.

```powershell
# backend: 실제 JWT·보안 체인·컨트롤러·트랜잭션·오류·OpenAPI 확인
.\gradlew.bat test --console=plain --offline
# frontend: 단위 테스트 / 방금 Spring이 생성한 응답 계약 검증
pnpm test:member-diary
pnpm test:member-diary:contract
```

Spring 테스트는 `backend/build/contracts/member-diary-http.json`에 그 실행의 실제 응답·요청·OpenAPI를 기록한다. 수기 고정 응답이 아니며 토큰은 기록하지 않는다. 계약 검증 전에는 반드시 백엔드 테스트로 새 산출물을 만든다. MockMvc와 H2를 사용한 HTTP 통합이며 실제 운영 DB·기기 검증을 대신하지 않는다.

다른 세션의 펜 QA·알림 오류 작업과 범위를 확인한 뒤 별도 작업 폴더에서 진행했다. 이후 서버 페이지를 편집기로 여는 흐름과 기본 앱의 진행 중 생성 상태 연결은 [회원 기본 앱 연결](./회원%20기본%20앱%20연결.md)에서 진행했다. 커밋·푸시 전이며 실기기 QA·최종 팀 계약은 남아 있다.

2026-10-27 검증: 전체 백엔드 180개 통과(조건부 DB 46개 제외), 최종 OpenAPI 보완 후 회원 HTTP 10개 재검증 통과, 프런트 관련 102개 통과. 프런트에는 실제 Spring 응답 계약 2개가 포함된다. 실패·오류 0개, `git diff --check` 통과. 새 HTTP 기능은 MockMvc/H2로 검증했으며 이번 단계에서 실제 개발/운영 DB·기기에 배포하지 않았다.


### 회원 목록 커서 배포 호환성 (2026-10-27)

PostgreSQL 비ASCII 검색 정규화와 제목 정렬 수정으로 목록 커서 형식은 v2다. 이전 v1 커서는 400이며 첫 페이지부터 다시 조회해야 한다. 커서는 클라이언트가 해석하거나 버전을 바꾸지 않는 불투명 값이다. 데이터·기기 문서 변환은 없다. PostgreSQL ICU root 전제와 검색 범위는 [회원 서버 목록 연결](./회원%20서버%20목록%20기본%20앱%20연결.md)을 참조한다.
