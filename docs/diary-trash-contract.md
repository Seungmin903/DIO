# 계정 다이어리 휴지통 이동·복원 계약

기준: 2026-10-27 develop `b7a626ca740a840f5d5178db091b6fdfc039083c`, 작업 브랜치 `feature/common/diary-auth-read`.
[P0·P1](./diary-auth-read-contract.md), [생성](./diary-create-contract.md), [수정](./diary-update-contract.md)의 후속 단계다.
Veloci 담당 7개 API 중 생성·목록·상세·수정·휴지통 이동·복원 6개를 구현했다. 영구 삭제는 아직 제공하지 않는다.

## 외부 계약

| 요청 | 성공 | 동작 |
|---|---|---|
| DELETE /api/v1/diaries/{diaryId} | 204, 본문 없음 | OWNER의 휴지통 이동. 이미 삭제 상태면 변경 없이 204 |
| POST /api/v1/diaries/{diaryId}/restore | 200 `{ diary: DiaryReadItem }` | OWNER의 복원. 이미 활성 상태면 변경 없이 현재 DTO 반환 |
| GET /api/v1/diaries?status=trashed | 기존 200 페이지 DTO | OWNER의 휴지통 목록·기한·canRestore. 만료 행도 남아 복원 불가 상태 표시 |

JWT 활성 세션을 사용한다. UUID 경로이며 두 쓰기 요청 모두 본문이 없다. DELETE의 생략 또는 permanent=false만 휴지통 이동이고 permanent=true는 403 DIARY_WRITE_NOT_AVAILABLE이다. 그 밖의 쿼리·잘못된 permanent 값·빈 공백 이외 본문은 400이다. restore는 쿼리가 없다. 성공 응답에는 Cache-Control: no-store가 포함된다.

권한 원장은 diaries.owner_user_id다. 실제 소유자이면서 유효한 membership이 있는 사용자, 또는 기존 상세 조회와 같은 소유자 membership 누락 호환 대상만 허용한다. 활성 EDITOR는 403, 비참여·탈퇴·강퇴·VIEWER·잘못된 OWNER membership·owner 없는 레거시 행은 404다. 영구 삭제 차단은 대상 존재 여부와 무관하다.

| 상태·코드 | 의미 |
|---|---|
| 400 INVALID_DIARY_ID / INVALID_QUERY | ID·요청 형식 오류 |
| 401 AUTHENTICATION_REQUIRED | 로그인·활성 세션 확인 필요 |
| 403 DIARY_OWNER_REQUIRED | 활성 EDITOR의 소유자 작업 시도 |
| 403 DIARY_WRITE_NOT_AVAILABLE | 영구 삭제 미제공 |
| 404 DIARY_NOT_FOUND | 없음 또는 접근 권한 없음 |
| 409 VERSION_EXHAUSTED / VERSION_CONFLICT | 버전 증가 불가 또는 원자 갱신 실패 |
| 410 DIARY_RESTORE_EXPIRED | 복원 기한 도달·경과 |

## 최초 삭제 시각과 30일

- 최초 active→trashed 전환에만 deleted_at, updated_at을 서버 UTC 시각(마이크로초 정밀도)으로 기록하고 version을 1 증가시킨다.
- 반복 DELETE는 deleted_at·updated_at·version을 모두 유지한다. 기한이 지난 행에 반복해도 새로운 30일을 부여하지 않는다.
- expiresAt = deletedAt + 30×24시간이다. 달력 월 단위가 아니며 클라이언트 시각을 신뢰하지 않는다.
- 복원 조건은 **서버 now < expiresAt**이다. 정확히 같은 시각부터 410이다. 서버 시각은 행 잠금을 얻은 다음 읽으므로 잠금 대기 시간으로 기한을 늘리지 않는다.
- 복원 시 deleted_at=null, updated_at 갱신, version+1을 같은 트랜잭션에서 처리한다. 이미 활성 상태의 반복 복원은 시각·버전을 바꾸지 않는다.
- 복원 후 새 DELETE는 새로운 삭제 주기로 새 기한을 시작한다. 최초 시각 보존은 현재 삭제 주기 안에서 적용된다.
- 삭제·복원 후 오래된 메타데이터 PATCH의 expectedVersion은 409가 된다.

이 API에는 별도 Idempotency-Key·expectedVersion·삭제 주기 ID를 추가하지 않았다. 같은 상태에서 중복 요청은 무변경이지만, 다른 기기에서 복원/재삭제하여 상태가 바뀐 뒤 과거 요청이 도착하면 현재 상태에 대한 요청으로 처리한다. 주기를 넘는 요청의 식별·재생 방지는 별도 계약이 필요하며 이번 구현이 보장한다고 표시하지 않는다.

## 보존과 동시성

READ_COMMITTED 트랜잭션에서 다이어리→요청자 membership 순으로 잠그고 OWNER를 재검사한다. 실제 상태 전환은 owner·version 조건을 포함한 SQL로 갱신한다. 같은 상태로 향하는 동시 DELETE/restore는 각각 전환을 한 번만 수행한다. 버전 최댓값에서 실제 전환은 409, 이미 목표 상태라면 버전 증가 없는 성공이다.

페이지·요소·회원·즐겨찾기·생성 영수증·미디어를 삭제하거나 변경하지 않는다. 공유 다이어리는 삭제 상태 동안 OWNER와 EDITOR의 활성 목록·상세에서 모두 숨겨지며, 복원하면 기존 멤버가 다시 접근한다. 페이지 API와 초대 수락 등 공유 담당의 쓰기 경계에서 deleted_at을 확인하는 실제 연동은 후속이다. 다른 세션의 공유·248 구현은 가져오지 않았다.

기한 만료는 복원 불가 판정이며 자동 물리 삭제를 뜻하지 않는다. 영구 삭제·미디어 참조 정리·정리 스케줄러는 다음 단계다. 신규 migration은 없고 이전 V9·V10 및 기존 migration은 변경하지 않았다. 메타데이터 version이 있는 V10 기반에서 동작한다. PostgreSQL의 시간대 포함 값은 OffsetDateTime으로 바인딩한다.

## FE

계정 보관함의 OWNER 카드에서 확인창을 거쳐 휴지통으로 이동한다. EDITOR 카드에는 버튼이 없다. 휴지통 보기/보관함 보기로 전환하고, 기존 TrashScreen을 서버 모드로 재사용한다. 영구 삭제·일괄 삭제·로컬 정리 루틴을 연결하지 않는다.

삭제·복원 성공 후 활성/휴지통 목록을 다시 조회한다. 휴지통 조회·페이지 추가·새로고침·로딩·오류·빈 목록과 앱 복귀 갱신을 제공한다. canRestore는 서버 응답 기준으로 판단하며 요청 시 서버가 기한을 다시 확인한다. 410을 받으면 기한 안내와 함께 재조회하여 복원을 비활성화한다.

네트워크/서버 오류는 결과 미확인으로 남기고 같은 대상·동작으로 명시적 재시도한다. 다른 작업으로 미확인 요청을 덮어쓰거나 성공 항목을 자동 재전송하지 않는다. 중복 탭은 요청 하나로 합친다. 401·403·404·410은 같은 요청의 재시도를 막고 최신 목록을 확인한다. 계정 전환·언마운트 뒤 지연 응답은 무시한다. 요청은 세션 메모리 안에서 유지하며 앱 재시작 후에는 서버 목록부터 확인한다.

기존 기기 보관함 자료를 계정 휴지통으로 복사하거나 지우지 않는다. 공용 확인창은 선택적인 largeControls 속성으로 새 휴지통 흐름의 버튼을 44px 이상 확보하며 기본 사용처는 유지한다.

## 검증

| 범위 | 결과 |
|---|---|
| H2 다이어리 회귀 | 82개 중 49 통과, PostgreSQL 조건부 33 제외, 실패 0 |
| 최종 시간 바인딩 변경 후 | H2 휴지통 실제 HTTP 10개 재검증 통과 |
| PostgreSQL 17 | 기존 생성·조회·수정·V10 업그레이드 23개 통과. 시간 바인딩 수정 후 휴지통·복원 10개 통과. 최종 유효 결과 33개 |
| FE 영향 회귀 | 121 통과, 실패·제외 0. 실제 Spring 휴지통 목록·복원 응답 소비 포함 |
| Expo 웹 번들 | 최종 코드 생성 성공 |
| Edge 휴지통 QA | 1280×800, 1024×768, 412×892, 667×375: OWNER 버튼, 취소, 삭제/복원 응답 유실 재시도, 만료 거부, 기기 자료 보존, 44px 동작 버튼. pageerror 0 |
| Edge 생성·수정 회귀 | 같은 4개 크기 각각 통과, pageerror 0 |

HTTP 검증은 최초 시각·updated_at·version 보존, 공유 멤버 노출 차단/복구, 30일 정확한 경계와 1마이크로초 전, 반복 및 동시 6요청, OWNER 변경·탈퇴·권한 상실, 영구 삭제 차단, BIGINT 최댓값, CORS/OpenAPI를 포함한다.

최초 컴파일에서 새 컨트롤러의 package-private 예외 helper 접근을 고쳤다. PostgreSQL 최초 실행에서는 Timestamp를 TIMESTAMP_WITH_TIMEZONE으로 전달한 바인딩 문제로 휴지통 테스트 일부가 실패했다. OffsetDateTime으로 수정한 뒤 영향받는 H2·PostgreSQL 휴지통 테스트 각 10개만 재실행했다. 이미 통과한 기존 23개 PostgreSQL 검증은 불필요하게 반복하지 않았다. 전체 애플리케이션 BE 이전 검증 이력은 수정 문서에 보존하며 이번 실행은 다이어리 범위다.

증거: 워크스페이스 `tmp/diary-trash-20261027-232811/`의 backend-diary.log·backend-diary-result.json·backend-trash-final.log·current-postgres-schema-test.log·final-postgres-schema-test.log·final-postgres-result.json·frontend.log·spring-trash.json·spring-restore.json·web-build.log·browser-trash.log·browser-update-regression.log·browser-create-regression.log. 화면은 이 checkout의 `frontend/qa/.out/diary-trash/`에 있다. 브라우저는 Spring JSON 형태를 사용하는 HTTP fixture이며 공유 서버 end-to-end 결과는 아니다.

```powershell
$env:DIO_DIARY_TRASH_CONTRACT_OUTPUT = Join-Path $env:TEMP 'dio-trash-contract.json'
$env:DIO_DIARY_RESTORE_CONTRACT_OUTPUT = Join-Path $env:TEMP 'dio-restore-contract.json'
cd backend
.\gradlew.bat test --tests 'com.f106.DIO.diary.DiaryTrashHttpTests' --rerun-tasks
cd ../frontend
pnpm run test:diary-lifecycle
# 생성 HTTP 테스트에서 출력한 DIO_DIARY_CREATE_CONTRACT_OUTPUT를 브라우저 fixture에 지정한다.
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8080/api'
pnpm exec expo export --platform web --output-dir .expo/diary-auth-web
pnpm run qa:diary-lifecycle
```

PostgreSQL 테스트는 전용 폐기 가능한 dio_diary_create_qa DB, DIO_DIARY_CREATE_PG_QA=true 및 DB_URL/POSTGRES_USER/POSTGRES_PASSWORD를 사용한다. fixture 정리가 있으므로 기존 데이터가 있는 DB를 쓰지 않는다. 이번 검증은 독립 임시 클러스터를 생성하고 종료했다.

## 남은 범위

담당 API 중 다음은 영구 삭제다. 공유·초대·248·페이지 담당과 실제 연동, Android/iOS 실기기·VoiceOver/TalkBack, 공유 서버·운영 데이터·원격 CI·배포는 미검증이다. 원본·다른 세션은 수정하지 않았으며 커밋·푸시·MR 생성도 하지 않았다. 보존 비교는 같은 증거 폴더의 preservation-before.json·preservation-check.json에 기록한다.

최종 보존 감사: notification-backend·diary-api-preparation·notification-submission·diary-list-query·diary-trash-integration·diary-purge-integration·diary-mvp2-contract 7개 폴더의 HEAD·브랜치·인덱스·추적/비무시 파일 해시는 시작과 동일했다. 다른 세션 diary-detail-permissions는 8bbb25e→860adc1 및 9개 파일 변경을 관찰했다. 해당 폴더는 읽기만 했고 수정·복사·병합·되돌리기 하지 않았다. 본 작업의 HEAD·인덱스는 그대로다. 기존 App·lockfile·모든 migration을 별도로 대조해 보존을 확인했다. 원격 develop은 마무리 시에도 b7a626c로 동일하다. 최종 시간 바인딩 이후 Spring 응답을 FE 계약 6개로 다시 소비해 모두 통과했다.


2026-10-28 후속 갱신: [영구 삭제](./diary-permanent-delete-contract.md)를 OWNER·휴지통 상태·하위 원자 정리·완료 기록 재시도로 구현했다. 사용자는 공용 미디어 원본을 보존하고 다이어리 참조만 정리하는 기준을 확정했다. 위 내용과 검증 수치는 해당 단계 당시 이력이며 최신 동작·검증은 영구 삭제 문서를 따른다.
