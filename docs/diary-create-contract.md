# 계정 다이어리 생성 · 첫 페이지 · 재시도 계약

2026-10-27, `feature/common/diary-auth-read`, develop 기준 `b7a626ca740a840f5d5178db091b6fdfc039083c`.
Veloci 담당 7개 API 중 기존 인증·목록·상세에 POST 생성을 추가한다. [P0·P1 계약](./diary-auth-read-contract.md)을 따른다.

이번 추가 확정: **성공 응답 재사용 24시간, 만료된 키 재사용은 409, 첫 페이지는 가로/세로 무지 1장**. 기기 보관함의 여러 페이지·달력 서식 생성은 유지한다. 계정 생성에서 달력·템플릿·미디어·공유 초대를 지원한다고 표시하지 않는다.

## POST /api/v1/diaries

활성 로그인 세션 JWT와 `Idempotency-Key` 헤더가 필요하다. 키는 canonical UUID 문자열이다(대소문자는 동등). JWT의 사용자만 소유자가 된다. `userId`, `ownerUserId`, `ownerDeviceId`, `visibility`, `initialPages`, `templateConfig`, `templateId` 등의 추가 필드는 400으로 거부한다. 기존 무인증 POST는 제거했다.

```http
POST /api/v1/diaries
Authorization: Bearer <accessToken>
Idempotency-Key: 7e87f082-7388-4696-9466-4080ce037e56
Content-Type: application/json

{
  "diaryTitle": "여행 기록",
  "coverColor": "#AABBCC",
  "coverStyle": "LINEN",
  "firstPage": { "type": "BLANK", "orientation": "portrait" }
}
```

모든 입력 필드는 필수이며 null은 거부한다. 제목은 앞뒤 공백을 제거한 후 1~100자, 제어문자는 허용하지 않는다. 색은 #RRGGBB 형식이고 대문자로 정규화한다. coverStyle은 PLAIN/LINEN/LEATHER/DOT/GINGHAM/STRIPE다. firstPage.type은 BLANK, orientation은 landscape/portrait만 허용한다. 순서가 다른 JSON도 같은 정규화 DTO이면 동일 입력이다. 표지·방향·제목이 달라지면 다른 입력이다.

201 응답은 `{ diary: DiaryReadItem, firstPageId: UUID문자열 }`이다. diary는 [조회 DTO](./diary-auth-read-contract.md)와 같은 필드·required·nullable 계약을 사용한다. 생성 시 myRole=OWNER, visibility=PRIVATE, pageCount=1, diary.firstPageId와 최상위 firstPageId는 일치한다. Location은 `/api/v1/diaries/{diaryId}`, Cache-Control은 no-store다.

동일 요청 재사용도 원래 201·Location·본문을 그대로 반환한다. 재사용 본문은 최초 생성 시점의 스냅샷이다. 현재 제목·권한 등은 이후 GET으로 재조회한다. 후속 [수정 구현](./diary-update-contract.md)의 V10부터 diary.version 문자열을 포함한다. 기존 영수증은 최초 버전 "1"을 추가하며 현재 값은 GET으로 확인한다. 첫 페이지의 기존 pages.version은 스키마대로 1이다.

## 원자성 및 중복 처리

READ COMMITTED 트랜잭션에서 활성 users 행을 FOR UPDATE로 잠근다. 동일 사용자의 생성 요청을 DB에서 직렬화하므로 여러 서버 인스턴스에서도 같은 사용자·키가 경쟁할 수 없다. 서로 다른 키도 해당 사용자의 생성 작업 동안은 차례대로 처리한다. 다른 사용자의 같은 키는 별개 요청이다. JVM 메모리나 로컬 프로세스 잠금에 의존하지 않는다.

트랜잭션 안에서 아래 전체를 처리한다.

1. 기존 요청 키 확인, 정규화 요청 SHA-256 대조 및 만료 검사.
2. UUID 다이어리 생성, owner_user_id=로그인 사용자, visibility=PRIVATE.
3. 무지 페이지 1장 생성: template_id/template_config 없음, sort_key=1, 가로 1280×800 / 세로 800×1280, 빈 내용, 기존 스키마 기본값 사용.
4. 같은 사용자의 OWNER membership 생성: is_favorite=false, member_color=#CED9EE. 공유 초대·가입 기능은 호출하지 않는다.
5. 최초 201 응답 직렬화 후 요청 영수증 저장, 이후 트랜잭션 커밋.

페이지 저장·멤버십·영수증 저장 등 어느 단계가 실패해도 전부 롤백된다. 실패한 트랜잭션은 키를 소비하지 않으므로 같은 키로 재시도할 수 있다. 커밋 후 응답이 유실되면 같은 키로 최초 응답을 받는다. 네트워크 취소는 서버 커밋 취소를 보장하지 않는다.

## 24시간과 만료된 키

- 최초 생성 서버 시각부터 정확히 24×60×60초 동안 응답을 재사용한다. 재시도는 만료 시각을 연장하지 않는다.
- now >= expires_at이면 409 `IDEMPOTENCY_KEY_EXPIRED`. 만료된 키로 새 다이어리를 만들지 않는다.
- 성공 응답 본문은 만료 후 주기 정리한다. 60초마다 최대 500건의 만료 응답을 비우며 적체 시 다음 배치로 이어진다. 만료 시점의 재사용 차단은 스케줄러 실행 여부와 무관하다.
- 키·사용자·요청 해시·결과 diaryId·시각은 중복 생성 방지용 기록으로 남는다. 본문 정리나 다이어리 영구 삭제로 키 기록을 지우지 않는다. 사용자 물리 삭제 시 FK CASCADE로 정리된다.
- 재사용 전에 현재 다이어리 접근 및 OWNER 여부를 확인한다. 삭제·탈퇴·소유권 이전 등으로 결과에 접근할 수 없으면 409 `CREATED_DIARY_UNAVAILABLE`이며 새로 생성하지 않는다.

| 상태 | 의미·FE 처리 |
|---|---|
| 400 INVALID_IDEMPOTENCY_KEY | 키 누락·형식 오류. 입력 오류도 400 ProblemDetail |
| 401 AUTHENTICATION_REQUIRED | 로그인 필요. 이전 요청은 보존하고 같은 계정 재로그인 후 확인 |
| 409 IDEMPOTENCY_KEY_CONFLICT | 같은 키·다른 입력. 자동으로 새 키 발급 금지 |
| 409 IDEMPOTENCY_KEY_EXPIRED | 기한 만료. 목록에서 생성 여부 확인 |
| 409 CREATED_DIARY_UNAVAILABLE | 원래 결과에 현재 접근 불가. 재생성 금지 |
| 서버 오류·네트워크·타임아웃·잘못된 성공 DTO | 결과가 불확실하므로 같은 입력·키로 확인 |

## FE 연결과 보존

계정 보관함의 새 다이어리 카드에서 기존 DiaryCreateModal을 무지 1장 모드로 사용한다. 이름·표지·방향을 선택하고 생성한다. 원격 편집기는 아직 연결하지 않으며 생성 후 목록을 모든 다이어리·최근 수정순으로 갱신하고 상세에서 실제 1페이지를 확인한다.

요청 키는 UUID로 생성하고, HTTP 전 `dio:account-diary-creation:v1:{userId}`에 입력과 함께 저장한다. 토큰·비밀번호는 저장하지 않는다. 저장 실패 시 전송하지 않는다. 같은 계정의 닫기·앱 재시작·재로그인 후 저장된 요청을 복구하여 같은 키로 확인한다. 다른 계정에는 표시하지 않는다. 결과 불확실 상태에서는 입력을 잠그고 새 요청으로 덮어쓰지 않는다. 성공 영수증 로컬 정리에 실패해도 같은 키로 재시도한다. 늦은 이전 세션 응답은 새 화면에 반영하지 않는다.

사용자가 목록을 확인한 뒤 명시적으로 '요청 정리'를 확정할 때만 미확인 요청을 버린다. 안내문에 이미 서버에서 생성됐을 수 있으며 다음 생성은 별도 다이어리라는 점을 알린다. 저장소 자체가 읽히지 않으면 다시 읽기를 제공하고 생성은 차단한다. 이 요청 저장은 기존 기기 다이어리·문서·미디어 키에 쓰지 않는다. 기존 목 API, 기기 보관함의 다중 페이지·달력 생성, 알림·248은 변경하지 않는다.

현재 구현은 앱 인스턴스별 동시 제출을 막고 서버가 같은 키의 중복을 막는다. 사용자가 서로 다른 창에서 서로 다른 키로 따로 생성한 요청까지 하나로 합치지는 않는다. 로컬 앱 자료를 삭제하면 기기의 미확인 요청 기록도 사라지므로 목록에서 결과 확인이 필요하다.

## Migration·운영 경계

신규 `V9__create_diary_creation_requests.sql`만 추가한다. V1~V8 및 원본 작업 폴더의 migration은 그대로다. 새로운 테이블과 만료 응답 인덱스만 만들며 기존 소유자 없는 다이어리를 자동 배정하지 않는다. diaryId에는 FK를 두지 않아 영구 삭제 이후에도 키 기록을 유지한다.

통합 전에 원격 develop의 V9 사용 여부를 다시 확인해야 한다. 다른 기능의 migration과 번호가 겹치면 제출 전에 이 신규 파일의 버전을 조정하고 검증한다. 이미 적용된 migration을 수정하거나 공유 DB를 되돌리지 않는다. 생성 도입 당시 V9가 필요하며 현재 수정 통합 버전은 V10까지 적용 후 실행해야 한다. 이전 앱으로 되돌려도 새 테이블을 삭제하지 않는다.

만료 본문 정리는 기본 활성화다. 테스트에서는 `dio.diary.creation-cleanup.enabled=false`로 끄고 직접 호출해 검증한다. 공유 서버·운영 DB에는 이번 작업에서 접근하거나 migration을 적용하지 않았다.

## 검증과 재현

2026-10-27 검증 결과다. 실제 PostgreSQL 테스트도 독립 임시 DB이며 공유 서버 E2E·실기기 QA·원격 CI와 구분한다.

| 범위 | 결과 |
|---|---|
| 전체 BE 회귀 | 총 228개 중 192 통과, 조건부 36 제외, 실패 0 |
| 생성 최종 보강 후 영향 범위 | H2 실제 HTTP 10 통과. 첫 페이지 저장 후 실패 및 OWNER membership까지 저장한 뒤 영수증 실패 모두 전체 롤백. 동시 6요청 단일 생성 |
| OpenAPI 최종 보강 | 필수 Idempotency-Key·CORS·생성 스키마 검증 1 통과 |
| PostgreSQL 17, Flyway V1~V9 | 생성 HTTP 10 + 기존 조회/저장 4 = 14 통과. 검증 후 독립 서버 종료 |
| FE 인증·다이어리·알림 회귀 | 282 통과. 실제 Spring 생성 JSON 소비 포함 |
| Expo 웹 번들 | 최종 코드로 생성 성공 |
| Edge 생성 QA | 1280×800, 1024×768, 412×892, 667×375: 각각 POST 2회·같은 키·다이어리 1개, 응답 유실→새로고침→재로그인→복구, 기존 기기 자료 보존, pageerror 0 |
| Edge 조회 회귀 | 1280×800, 412×892: 목록·상세·404·서버 오류 재시도·알림·계정 전환 통과, pageerror 0 |
| 원격 develop | 마무리 시에도 b7a626c로 동일 |

전체 BE 실행 후 영수증 실패 롤백 테스트와 OpenAPI 헤더 표시를 보강했고, 영향받는 생성 테스트만 다시 실행했다. 이전 성공 기록을 이번 단계의 모든 코드에 대한 전체 재실행으로 표시하지 않는다. 웹 번들 첫 시도는 저장소 루트에서 실행해 package.json 경로 오류로 종료됐고, frontend 작업 폴더에서 다시 실행해 성공했다.

로컬 증거: 워크스페이스 `tmp/diary-create-20261027-223437/`의 backend-full.log, backend-full-result.json, creation-final.log, openapi-final.log, current-postgres-schema-test.log, current-postgres-result.json, frontend-regression.log, spring-create-contract.json, web-build.log. 화면과 결과는 이 checkout의 `frontend/qa/.out/diary-create/` 및 `frontend/qa/.out/diary-auth/`에 있다. node_modules는 기존 설치의 로컬 junction이며 산출물·의존성 폴더를 제출 소스에 포함하지 않는다.

보존 감사는 같은 증거 폴더의 preservation-before.json, preservation-after-check.json, external-session-progress.json에 기록했다. notification-backend·diary-api-preparation·notification-submission·diary-list-query·diary-mvp2-contract는 HEAD·인덱스·추적/비무시 파일 해시가 시작 시점과 동일했다. 다른 세션의 diary-detail-permissions(b9f63a1→83a83cc 및 미커밋 변경), diary-trash-integration(2e34825→c4531fc), diary-purge-integration(ff606ad→1cbc767)은 외부 진행 상태를 관찰만 했고 수정·복사·병합·되돌리기 하지 않았다. 본 작업 브랜치의 HEAD·인덱스는 그대로이며 커밋·푸시·MR 생성은 하지 않았다.

```powershell
$env:DIO_DIARY_CREATE_CONTRACT_OUTPUT = Join-Path $env:TEMP 'dio-create-contract.json'
cd backend
.\gradlew.bat test --tests 'com.f106.DIO.diary.DiaryCreationHttpTests' --rerun-tasks
cd ../frontend
pnpm run test:diary-create
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8080/api'
pnpm exec expo export --platform web --output-dir .expo/diary-auth-web
pnpm run qa:diary-create
```

PostgreSQL 생성 HTTP 테스트는 `postgresTest` 태스크에 포함되며 `DIO_DIARY_CREATE_PG_QA=true`, DB_URL, POSTGRES_USER, POSTGRES_PASSWORD를 명시해야 실행한다. DB 이름은 **dio_diary_create_qa**여야 한다. 해당 테스트는 이 전용 DB의 테스트 행을 정리하므로 기존 데이터가 있는 DB를 사용하면 안 된다. 일반 조회/저장 PostgreSQL 테스트는 기존처럼 트랜잭션 롤백한다.

PATCH의 OWNER·버전 충돌 계약은 [수정 단계](./diary-update-contract.md)에서 완료했다. 후속: 휴지통·복원·영구 삭제, 페이지 담당의 실제 편집·서식 연결. 공유·248 연동, Android/iOS 실기기·VoiceOver/TalkBack, 공유 서버·원격 CI·배포는 이번 완료 범위가 아니다.


후속 상태 갱신: [휴지통 이동·복원](./diary-trash-contract.md)을 구현했다. 위 검증 기록은 해당 단계 당시 이력으로 유지하며, 최신 계약과 영향 범위 검증은 휴지통 문서를 따른다. 영구 삭제는 후속이다.


2026-10-28 후속 갱신: [영구 삭제](./diary-permanent-delete-contract.md)를 OWNER·휴지통 상태·하위 원자 정리·완료 기록 재시도로 구현했다. 사용자는 공용 미디어 원본을 보존하고 다이어리 참조만 정리하는 기준을 확정했다. 위 내용과 검증 수치는 해당 단계 당시 이력이며 최신 동작·검증은 영구 삭제 문서를 따른다.

## 2026-10-28 제목 정규화 보완

BE도 FE의 ECMAScript trim과 같은 유니코드 공백 기준으로 양끝을 제거한 뒤 제목 필수·길이를 검증한다. NBSP·BOM 등을 포함한 공백만 있는 제목은 400이다. [최종 리뷰 수정·CI 검증](./diary-review-fixes-ci.md)에 회귀 결과와 CI 연결을 기록했다.
