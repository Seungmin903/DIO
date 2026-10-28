# 다이어리 P0·P1 계약과 인증 조회 구현

기준: 2026-10-27 원격 develop `b7a626ca740a840f5d5178db091b6fdfc039083c`.
작업 브랜치: `feature/common/diary-auth-read`. 담당 Veloci의 다이어리 API 7개 중 인증·목록·상세와 [계정 생성](./diary-create-contract.md), [메타데이터 수정](./diary-update-contract.md), [휴지통 이동·복원](./diary-trash-contract.md), [영구 삭제](./diary-permanent-delete-contract.md)를 구현했다.
이 문서는 합의한 최종 계약과 현재 구현을 구분한다. 기존 목 어댑터의 제안 DTO를 서버 계약으로 사용하지 않는다.

2026-10-28 갱신: develop `2de27fd` 반영 및 P2 두 건 수정·CI 연결 결과는 [최종 리뷰 수정·CI 검증](./diary-review-fixes-ci.md)을 참조한다. 아래 기준과 이전 검증 기록은 최초 구현 이력이다.

## 확정한 P0·P1

| 항목 | 확정 정책 | 이번 적용 |
|---|---|---|
| 역할 | OWNER·EDITOR만 사용. 활성 멤버는 내용 편집 가능 | 조회 권한 및 정책 permissions 계산 |
| 소유자 권한 | 제목·표지 변경, 휴지통·복원·영구 삭제는 소유자만 | 조회 DTO·OWNER 수정·휴지통·복원 적용; 영구 삭제 적용 |
| 접근 불가 | 비참여·탈퇴·강퇴는 404, 참여 편집자의 소유자 작업은 403 | 목록 제외·상세 404 |
| 공유 휴지통 | 모든 멤버에게 활성 목록·편집·초대 수락 중단, 멤버십 보존 | 활성 목록·상세 제외, 소유자만 휴지통 목록 |
| 생성 | 소유자·다이어리·첫 페이지를 하나의 트랜잭션으로 생성, 실패 시 전체 롤백 | 계정 생성에 적용 |
| 생성 재시도 | 사용자별 Idempotency-Key, 동일 입력 재사용, 다른 입력 409 | 24시간 재사용·만료 키 409 확정 및 적용 |
| 메타데이터 | coverStyle로 통일, version/expectedVersion으로 충돌 확인 | coverStyle·문자열 version·OWNER 쓰기 CAS 적용 |
| 즐겨찾기 | 사용자별 membership 상태, 다이어리 PATCH에서 분리 | myMembership.isFavorite 읽기만; 변경 API는 공유 담당 |
| 휴지통 기한 | 최초 삭제부터 서버 시각 30×24시간, 반복 삭제는 기한 연장 금지 | 최초 삭제 시각·반복 요청 보존 및 서버 기한 적용 |
| 복원 | 서버 now < expiresAt일 때만 허용 | OWNER 복원·정확한 기한 경계·반복 요청 처리 적용 |
| 영구 삭제 | 페이지·요소 정리, 다른 자료가 참조하는 미디어 보존 | 하위 원자 정리·공용 미디어 원본 보존·OWNER 완료 기록 재시도 적용 |

공유 담당과의 경계: 소유자 포함 최대 4명, 초대 링크 1시간, 재발급 제한 안내, 초대 수락 시 인원 제한의 원자적 검사, 강퇴해도 작업 보존, 소유권 이전 후 나가기, 개인/공유 다이어리의 개인 사본 생성. 이번 변경은 공유 이벤트 248·초대·다른 멤버의 가입/수정을 구현하거나 가져오지 않는다. 계정 생성 시 자신의 OWNER membership만 함께 만든다. 초과 인원 결제 유도는 제품 안내 정책이며 이번 조회 API가 결제를 실행하거나 인원을 늘리지 않는다.

## 이번 서버 계약

기존 로그인·갱신·로그아웃 및 활성 세션 JWT 검증을 재사용한다. `Authorization: Bearer <accessToken>` 또는 기존 개발 연결용 `X-DIO-Access-Token`을 지원한다. userId 쿼리나 X-User-Id로 조회 주체를 바꿀 수 없다. 새 인증 방식·헤더 우회는 추가하지 않는다.

### GET /api/v1/diaries

| 쿼리 | 기본값·제약 |
|---|---|
| status | active / trashed, 기본 active. trashed는 소유자만 |
| filter | all / personal / shared, 기본 all. PRIVATE는 personal, MEMBERS/LINK는 shared |
| favorite | boolean, 기본 false. true일 때 본인의 즐겨찾기만 |
| q | 기본 빈 문자열, 최대 100자, 제어문자 금지. 앞뒤 공백 제거, 대소문자 무시 부분 검색. `%`·`_`는 문자로 검색 |
| sort | updatedAtDesc(기본) / createdAtDesc / titleAsc / pageCountDesc |
| limit | 기본 20, 1~100 |
| cursor | 서버가 반환한 불투명 문자열. 사용자·status·filter·q·sort·favorite에 귀속 |

200 응답: `{ items: DiaryReadItem[], nextCursor: string|null, hasNext: boolean }`.
마지막 페이지는 hasNext=false, nextCursor=null. 동률은 diaryId 내림차순으로 정렬한다. titleAsc는 DB lower(title) 순서다. 정렬키가 변하는 동시 편집 중에는 스냅샷 일관성을 보장하지 않는다. FE는 중복 ID를 합치고 새로고침할 수 있다. 커서는 권한 증명이 아니며 모든 요청에서 권한을 다시 조회한다.

### GET /api/v1/diaries/{diaryId}

canonical UUID 경로. 200 `{ diary: DiaryReadItem }`. 삭제·비참여·탈퇴·강퇴는 404 `DIARY_NOT_FOUND`.

```json
{
  "version": "1",
  "diaryId": "00000000-0000-0000-0000-000000000002",
  "diaryTitle": "여행 기록",
  "coverColor": "#CED9EE",
  "coverStyle": "PLAIN",
  "visibility": "MEMBERS",
  "myRole": "EDITOR",
  "myMembership": { "isFavorite": true },
  "permissions": {
    "canEditMetadata": false,
    "canEditCanvas": true,
    "canTrash": false,
    "canRestore": false,
    "canPermanentlyDelete": false
  },
  "pageCount": 2,
  "firstPageId": "00000000-0000-0000-0000-000000000102",
  "createdAt": "2026-01-01T00:00:00.123456Z",
  "updatedAt": "2026-01-02T00:00:00.123456Z",
  "deletedAt": null,
  "expiresAt": null
}
```

모든 필드는 응답에 포함한다. firstPageId는 활성 페이지가 없으면 null, deletedAt/expiresAt은 활성 다이어리에서 null이다. pageCount는 삭제되지 않은 실제 페이지 수이며 첫 페이지는 sort_key·page_id 순이다. ID는 UUID 문자열, 시간은 UTC ISO-8601이다. V10부터 메타데이터 version은 양의 BIGINT 문자열이며 목록·상세·생성·수정 응답의 필수 필드다.

permissions는 합의된 도메인 권한이다. FE는 OWNER 메타데이터 수정·개별 휴지통 이동·복원만 제공하고 canManage=false로 일괄 관리는 막는다. 영구 삭제(permanent=true)는 OWNER의 휴지통 상태에서만 제공한다. 원격 캔버스 편집은 후속이다. POST 생성·PATCH 수정·DELETE 휴지통·POST 복원은 각 계약 문서를 따른다. **담당 7개 API의 BE·FE 기본 구현은 연결했으며 팀 통합·실기기·배포 검증은 별도다.**

### 오류·레거시 데이터

- 인증 실패·만료·로그아웃된 세션: 401 `AUTHENTICATION_REQUIRED`. 응답은 no-store.
- 지원하지 않는 쿼리·범위: 400 `INVALID_QUERY`; 커서: 400 `INVALID_CURSOR`; UUID: 400 `INVALID_DIARY_ID`.
- Spring 쿼리 타입 변환 실패도 400 ProblemDetail이다.
- 404 상세는 존재 여부를 노출하지 않는다. 정상 읽기 응답은 no-store.
- diaries.owner_user_id가 없는 레거시 행은 계정에 자동 귀속하지 않고 제외한다. 소유자가 명확하고 자신의 membership 행이 없는 과거 데이터는 OWNER로 조회한다. membership이 존재하면서 탈퇴했거나 지원하지 않는 역할이면 제외한다. 다른 사용자의 잘못된 OWNER 행, VIEWER 행은 권한을 주지 않는다.
- 기존 migrations는 변경하지 않는다. 역할/소유자 정합성 정비와 레거시 정비는 후속에서 처리한다. 신규 생성은 owner와 OWNER membership을 함께 보장한다.

## FE 연결

실제 로그인 성공 후 계정 보관함에서 목록·검색·4개 정렬·즐겨찾기 필터·공유 필터·추가 페이지·상세를 조회한다. UI의 기존 personal 탭 표기는 '모든 다이어리'이므로 서버 filter=all로 보낸다. 상세 진입마다 서버에 다시 확인한다.

이 기기 보관함은 기존 로컬 저장·편집 흐름을 유지하며 계정 보관함과 별도로 진입한다. 원격 행을 로컬에 복제하거나 기기 자료를 계정으로 업로드하지 않는다. 기존 목 API도 유지한다. 공통 알림 Provider·알림 창은 그대로 재사용한다.

요청은 기존 authService의 토큰 갱신을 사용한다. 세션 키를 전후 확인하고 취소·지연 응답이 다른 계정 화면에 반영되지 않게 한다. 앱 복귀 시 상세를 닫고 목록을 갱신한다. 로딩·빈 목록·오류·네트워크 재시도를 표시하며 401은 재로그인 안내, 404는 존재하지 않음 안내다. 초기 서버 데이터가 없으면 빈 목록이 정상이다. 계정 생성 카드에서 무지 첫 페이지 1장을 가진 개인 다이어리를 만들 수 있다.

## 7개 API의 단계별 구현

| 단계 | API·작업 | 완료 기준 |
|---|---|---|
| 1 (완료) | 기존 인증 연결, GET 목록·GET 상세 | 활성 세션, 소유권·참여 필터, 서버 DTO·페이지네이션, FE 읽기 화면 |
| 2 (완료) | POST /diaries | 무지 1장 입력 확정; owner+diary+page 원자 생성; Idempotency-Key 24시간·만료/충돌 409; 생성 및 앱 재시작 복구 |
| 3 (완료) | PATCH /diaries/{id} | coverStyle/제목, OWNER 검사, version/expectedVersion CAS·409, 즐겨찾기 제거, FE 재조회 |
| 4 (완료) | DELETE /diaries/{id}, POST /diaries/{id}/restore | 최초 삭제 시각 보존, 공유 전체 비활성·멤버 보존, 기한·권한·중복 요청, 휴지통 화면 연결 |
| 5 (완료) | DELETE /diaries/{id}?permanent=true | 참조 보존·종속 삭제·재시도, FE 제거 및 실패 복구 |
| 6 | 팀 연동·최종 QA | 초대/멤버십 담당 계약, 동시 수정·권한 상실, 실제 PostgreSQL/Flyway, 기기 QA, CI |

첫 페이지는 BLANK·landscape/portrait, 응답 재사용 TTL은 24시간으로 추가 확정했다. 달력 등 서식 확장은 후속이다. 영구 삭제는 공용 미디어 원본을 보존하고 다이어리 참조만 정리하는 것으로 추가 확정했다. 이미 확정된 P0·P1 권한·기한 정책을 다시 합의할 항목은 아니다.

## 검증 기록

아래는 인증·조회 단계의 기존 검증 이력이다. 생성 단계의 최신 검증은 [생성 계약](./diary-create-contract.md)에 기록한다.

2026-10-27 로컬 검증 결과:

| 검증 | 결과 |
|---|---|
| 전체 BE 회귀 | 총 214개, 187 통과·조건부 27 제외·실패 0 |
| 최종 DTO/OpenAPI 변경 후 영향 범위 재검증 | 인증 HTTP 8 + Swagger 3 = 11 통과 |
| 독립 PostgreSQL 17 + Flyway V1~V8 | 새 조회 1 + 기존 저장 3 = 4 통과. UUID·microsecond 시간·제목 개행 커서·NUMERIC 페이지 순서·참여/탈퇴·휴지통 검증 |
| FE 인증·다이어리·알림 회귀 | 273 통과 |
| 최종 타임아웃 방어 수정 후 재검증 | 새 어댑터·실제 Spring 응답 소비·앱 라우팅 14 통과 |
| Expo 웹 번들 | 최종 코드로 생성 성공 |
| 독립 Edge, HTTP fixture + 실제 Spring DTO | 1280×800, 412×892 통과. 각 pageerror 0. 로그인·추가 페이지·공유 필터·상세·404·500 재시도·알림·계정 전환·로컬 자료 보존 |
| 원격 develop 재확인 | b7a626c로 동일 |

최초 회귀에서 이전 무인증 Swagger/CORS 기대값을 새 계약으로 갱신했다. PostgreSQL에서는 기존 저장 테스트의 Instant JDBC 바인딩 오류를 Timestamp로 수정했다. 네트워크가 제한된 셸에서 실패한 FE 로컬 HTTP 테스트는 통신 가능한 실행 환경에서 재검증해 통과했다. QA fixture의 반복 커서를 실제 페이지 진행 형태로 수정했고 최종 QA는 통과했다. 성공 수치에 최초 실패 실행은 포함하지 않는다.

실행 예시(저장소 기준, PowerShell):

```powershell
# 실제 Spring 응답을 FE에 전달할 경로. 부모 폴더는 미리 준비한다.
$env:DIO_DIARY_CONTRACT_OUTPUT = Join-Path $env:TEMP 'dio-diary-contract.json'
cd backend
.\gradlew.bat test --tests 'com.f106.DIO.diary.DiaryAuthenticatedReadTests' --rerun-tasks
cd ../frontend
pnpm run test:diary-read
# 브라우저 QA는 로그인 HTTP fixture를 사용한다. 실제 공유 서버 E2E는 아니다.
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8080/api'
pnpm exec expo export --platform web --output-dir .expo/diary-auth-web
pnpm run qa:diary-auth
```

PostgreSQL은 공유 DB가 아닌 별도 임시 클러스터에서 DB_URL/POSTGRES_USER/POSTGRES_PASSWORD를 지정하고 `gradlew postgresTest`로 검증했다. 서버는 검증 후 종료했다. 기존 migration 파일을 수정하지 않았다.

로컬 증거는 워크스페이스 `tmp/diary-auth-read-20261027-215926/`의 backend-test.log, backend-contract-final.log, frontend-regression.log, frontend-contract-final.log, spring-diary-contract.json, current-postgres-schema-test.log 및 preservation-after-check.json에 있다. 브라우저 결과·화면은 이 checkout의 `frontend/qa/.out/diary-auth/`에 있다. 임시 산출물과 node_modules junction은 제출 소스가 아니다.

보존 감사: notification-backend, diary-api-preparation, notification-submission, diary-list-query, diary-trash-integration, diary-purge-integration, diary-mvp2-contract의 HEAD·인덱스·파일 해시는 작업 전과 동일했다. 별도 diary-detail-permissions에서는 다른 세션의 b3c3158→b9f63a1 진행을 관찰했으며 변경·병합·되돌리기 하지 않았다. 이 브랜치에서 커밋·푸시·MR 생성은 하지 않았다.

테스트용 H2·독립 PostgreSQL·로컬 브라우저 결과를 공유 서버·실기기·원격 CI 결과로 해석하지 않는다. Android/iOS 기기·VoiceOver/TalkBack·운영 데이터 소유권 정비·초대/공유 쓰기·원격 CI·배포는 미검증 범위다. 페이지 API·원격 편집기는 후속 구현이다. 영구 삭제의 최신 검증은 [영구 삭제 계약](./diary-permanent-delete-contract.md)을 따른다. 휴지통 이동·복원 최신 검증은 [휴지통 계약](./diary-trash-contract.md)을 따른다. 수정 완료 및 최신 검증은 [수정 계약](./diary-update-contract.md)을 따른다.
