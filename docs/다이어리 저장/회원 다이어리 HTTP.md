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

전용 Spring Security 체인이 본문 파싱 전에 Bearer 토큰을 검증한다. 기존 로그인 JWT·DB 세션 검증기와 개발 전용 토큰 헤더 설정을 재사용한다. 세션 쿠키 인증을 만들지 않는다. 서비스의 사용자 식별은 현재 요청 토큰과 일치하는 인증 완료 `JwtAuthenticationToken`을 재사용해 JWT·DB 세션의 중복 검증을 줄인다. 인증 정보가 없거나 미인증·다른 토큰·일반 principal이면 기존 로그인 검증기로 직접 검증한다. 요청 간 사용자 ID 캐시는 만들지 않는다. 허용 CORS 출처는 기존 `AUTH_ALLOWED_ORIGINS`를 사용하며 GET·POST·PATCH·OPTIONS와 Location 노출을 설정했다.

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


### ICU 지원이 없는 PostgreSQL의 목록 응답 (2026-10-27)

Unicode 검색(q가 공백 제거 후 비어 있지 않음) 또는 sort=title 요청은 503 DIARY_LIST_UNAVAILABLE로 실패한다. 검색 없는 created/updated/pages 목록·생성·상세·수정·인증의 가용성을 이 조건으로 막지 않는다. 목록 예외는 안전한 Problem 응답이며 no-store다. 프런트는 503을 인증 만료로 처리하거나 자동 재시도하지 않고 기존 목록/문서를 유지한 채 재시도를 안내한다. PostgreSQL ICU root 확인은 요청 시점이며 지원을 복구하면 같은 앱에서 재시도할 수 있다. 기존 검색 의미·v2 커서 형식·저장 데이터는 바뀌지 않는다.


## 속지 식별자 충돌 처리 (2026-10-28)

프런트 templateId/backgroundAssetId는 에셋 문자열 ID이고 DB page_templates.template_id는 환경별 숫자 PK다. 회원 생성 HTTP는 templateCode+templateVersion만 받고 DB PK 입력은 거부한다. 서버가 코드·버전으로 유일한 활성 행을 확인하고 그 행의 실제 PK를 pages.template_id에 저장한다. 코드가 다른 행의 숫자 ID와 프런트 ID를 직접 대조하거나 DB 행을 덮어쓰지 않는다.

같은 코드·버전이 여러 행에 있으면 일부가 비활성이어도 INVALID_INITIAL_PAGES(400)로 거부한다. 다이어리·OWNER·페이지·생성 영수증을 남기지 않고 기존 카탈로그는 보존한다. 버전/규격 불일치도 기존 검증으로 거부한다. 기존 비활성 중복은 운영자가 원인을 확인해야 하며 앱에서 임의 선택·병합·삭제하지 않는다.

카탈로그 전체 분리 작업은 철회했다. V9 카탈로그와 서버 초기 페이지 생성·앱 서버 페이지 ID 연결을 유지하며 V10/V11은 변경하지 않는다. 기존 분리 변경은 로컬 stash mr166-catalog-split-before-id-conflict-scope-correction에 보존했다. 숫자 PK 시퀀스가 수동 ID 삽입으로 뒤처진 DB에서의 PK 중복 오류는 별도 DB 상태 문제이며, 이번 변경에서 ID/시퀀스/기존 FK를 자동 수정하지 않는다.

검증: 전체 backend test 266개 통과(조건부 DB 89개 제외), 실제 PostgreSQL 생성/카탈로그/목록 47개와 상세/권한 16개 총 63개 통과(실패·제외 0), 전체 프런트 875개 통과, 카탈로그 288개 생성물 일치 검사 통과. 원본 QA·공유 DB는 변경하지 않았고 작업 전용 테스트 클러스터만 사용했다. 검증 후 ID 충돌 방지 변경만 MR !166에 반영한다.
