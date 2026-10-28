# 계정 다이어리 영구 삭제·원자 정리·재시도 계약

기준: 2026-10-28 develop `b7a626ca740a840f5d5178db091b6fdfc039083c`. 작업 폴더 `.worktrees/diary-auth-read`, 브랜치 `feature/common/diary-auth-read`.
[P0·P1](./diary-auth-read-contract.md), [생성](./diary-create-contract.md), [수정](./diary-update-contract.md), [휴지통·복원](./diary-trash-contract.md)을 잇는 단계다.
사용자가 확정한 미디어 정책은 **공용 미디어 원본 보존, 다이어리 참조만 정리**다. 저장소 원본 삭제나 미참조 공용 미디어 수거는 이 API의 동작이 아니다.

## DELETE /api/v1/diaries/{diaryId}?permanent=true

JWT 활성 세션, canonical UUID 경로, 본문 없음. permanent=true는 명시적 영구 삭제이며 false 또는 생략은 기존 휴지통 이동이다. 성공·완료 재시도는 **204, 빈 본문, Cache-Control: no-store**다.

| 상태·코드 | 의미 |
|---|---|
| 400 INVALID_DIARY_ID / INVALID_QUERY | ID·쿼리·본문 오류 |
| 401 AUTHENTICATION_REQUIRED | 로그인·활성 세션 확인 필요 |
| 403 DIARY_OWNER_REQUIRED | 활성 EDITOR의 요청 |
| 404 DIARY_NOT_FOUND | 없음·비참여·탈퇴·강퇴·지원하지 않는 역할·owner 없는 행 또는 다른 사용자의 완료 기록 |
| 409 DIARY_NOT_TRASHED | 현재 활성 상태. 먼저 휴지통으로 이동해야 함 |
| 500 | 정리·DB 처리 실패. 전체 롤백 후 같은 요청으로 재시도 가능 |

권한 원장은 diaries.owner_user_id다. 기존 휴지통/복원과 같은 OWNER 검사와 legacy owner membership 누락 호환 정책을 사용한다. 30일 전·후 모두 휴지통 상태라면 소유자가 영구 삭제할 수 있다. 복원이 먼저 완료됐다면 409로 보호한다. 이 API가 30일 경과 자동 삭제를 예약하거나 실행하지는 않는다.

## 정리와 보존

다이어리→요청자 membership 순으로 잠근 후 OWNER와 deleted_at을 다시 확인한다. READ_COMMITTED 트랜잭션 하나에서 다음을 수행한다.

1. 알림 행과 본문 이력은 보존하고 대상 diary_id/page_id의 nullable 연결만 해제한다. 다른 다이어리의 알림 연결은 유지한다.
2. 대상 페이지를 가리키는 last_opened_page_id를 null로 바꾼다. 다른 다이어리의 잘못된 교차 포인터도 회원 행을 지우지 않고 연결만 해제한다.
3. 대상 페이지의 element_strokes, canvas_history_operations, canvas_elements를 정리한다. soft-deleted 페이지·요소도 포함한다.
4. 대상 diary_handwriting_fonts, diary_media_library, diary_invites, diary_members, pages를 정리한다.
5. 완료 기록을 넣고 다이어리 행을 물리 삭제한다.

media_files, 공용 저장소 원본, 파생 원본 연결(source_media_file_id), AI 작업·다른 다이어리의 폰트/라이브러리·다른 사용자 자료는 삭제하지 않는다. 미디어가 이 다이어리에서만 사용되더라도 공용 원본은 유지한다. 확인되지 않은 참조나 저장소 위치를 추정해 삭제하지 않는다. 새 FK가 추가돼 정리가 막히면 DB 제약으로 전체 작업이 롤백되며 부분 성공으로 응답하지 않는다. 공유/248의 별도 구현은 가져오지 않았다.

생성 Idempotency-Key의 기존 영수증은 보존한다. 해당 키의 생성 재시도는 삭제된 다이어리를 다시 만들지 않고 기존 생성 서비스가 409 CREATED_DIARY_UNAVAILABLE(또는 만료/입력 충돌 코드)로 거부한다. 생성 응답 스냅샷은 기존 24시간 정리 정책을 따른다.

## 재시도

V11__create_diary_purge_receipts.sql에 diary_id(PK), owner_user_id, completed_at만 저장한다. 삭제된 콘텐츠를 복사하지 않고 다이어리 FK도 두지 않는다. 사용자 FK는 ON DELETE CASCADE다.

- 하위 정리·완료 기록·부모 삭제 중 하나라도 실패하면 모두 롤백한다. 행과 참조가 남으므로 같은 DELETE로 다시 시도한다.
- 커밋 후 응답이 유실돼도 같은 OWNER·diaryId의 요청은 완료 기록을 확인해 204다. 완료 시각을 갱신하거나 하위 정리를 반복하지 않는다.
- 다른 사용자는 완료 기록으로 권한을 얻지 못하며 404다. 인증 없는 요청은 401이다.
- 동시 6요청은 행 잠금으로 한 번만 정리하고 완료 기록 하나를 남긴다. 대기 중 부모 행이 없어지면 잠금 조회 뒤 커밋된 완료 기록을 다시 읽는다.
- 완료 기록은 자동 만료시키지 않는다. 사용자 계정 삭제 시 함께 삭제한다. 복원·재생성에 사용하는 데이터가 아니다.

Idempotency-Key·expectedVersion 본문을 새로 요구하지 않는다. 기존 UUID의 삭제 완료 여부를 기준으로 응답한다. 외부 저장소를 삭제하지 않아 분산 파일 삭제 큐나 원본 삭제 작업 재시도는 필요하지 않다.

## FE

서버 OWNER 권한과 canPermanentlyDelete=true인 휴지통 카드에만 영구 삭제 버튼을 제공한다. 활성 다이어리·EDITOR는 진입할 수 없다. 별도 확인창에서 복원 불가와 미디어 원본 보존을 안내한다. 취소는 요청하지 않는다.

성공 후 활성·휴지통 목록을 새로 조회하고 완료를 안내한다. 500·네트워크·응답 유실은 결과 미확인 상태로 남겨 **같은 요청 다시 확인**으로만 재시도한다. 처리 중 또는 미확인 요청이 있으면 다른 대상을 새 요청으로 덮어쓰지 않는다. 중복 클릭은 하나로 합친다. 401·403·404·409는 자동 재시도하지 않고 최신 목록을 확인한다. 세션 전환·언마운트 후 지연 응답은 무시한다. 앱 재시작 후에는 서버 목록을 다시 확인한다.

공용 TrashScreen과 ConfirmDialog를 재사용했다. 새 영구 삭제 동작 버튼은 44px 이상이고 기기 보관함·로컬 휴지통 정리 루틴과 분리된다.

## Migration과 통합 순서

기존 V1~V10은 그대로다. V11 적용 후 BE, FE 순으로 반영한다. 기존 데이터 변환·삭제는 없고 완료 기록 테이블만 추가한다. 통합 직전 develop의 V9·V10·V11 점유 여부를 재확인하고 충돌 시 아직 제출하지 않은 이번 신규 migration 번호를 조정해 검증해야 한다. 다른 세션의 migration·공유 코드를 복사하거나 수정하지 않는다. 이전 앱으로 되돌릴 때 완료 기록 테이블을 지우면 응답 유실 재시도 보장이 사라지므로 유지한다.

## 검증 기록

| 범위 | 결과 |
|---|---|
| H2 다이어리 영향 범위 | 기존 49개 통과. 영구 삭제 fixture 보완 후 새 HTTP 7개 통과. 합계 유효 56개, PostgreSQL 조건부 40개 제외 |
| PostgreSQL 17/Flyway V1~V11 | 생성·조회·수정·휴지통·영구 삭제·기존 데이터 migration 40개 통과, 실패·제외 0 |
| FE 인증·다이어리·로컬 휴지통 회귀 | 127개 통과, 실패·제외 0. 실제 Spring 삭제 후 목록 소비 포함 |
| Expo 웹 번들 | 성공 |
| 최종 OpenAPI·CORS | permanent 쿼리 표시 포함 1개 통과 |
| Edge 영구 삭제 QA | 1280×800, 1024×768, 412×892, 667×375: OWNER 버튼·취소·실패 재시도·응답 유실 재확인·다른 다이어리/기기 자료 보존. 모두 pageerror 0 |

기존 휴지통·복원 및 수정 브라우저 회귀도 같은 4개 화면 크기에서 모두 통과했고 pageerror는 0이었다.

실제 HTTP 테스트는 모든 하위 FK 순서, 공유/독점/파생 미디어 보존, 다른 다이어리·알림 이력 보존, 하위 정리 후 실패 및 완료 기록 실패의 전체 롤백, 원래 OWNER만 완료 재시도, 생성 키 재생성 차단, 동시 6요청, 휴지통 기한 만료 행, 복원 후 409를 검증했다.

최초 H2 실행에서 V1의 TIMESTAMPTZ 표기를 테스트용 호환 표기로 바꾸고 누락한 fixture 테이블을 추가했다. 롤백 실패 주입은 트랜잭션 프록시 내부 spy에 설정하도록 보완했다. 제품 SQL을 바꾸지 않았으며 영향받는 새 테스트 7개만 재실행했다. 브라우저 최초 기대값은 보존 대상 이름이 표지·제목에 각각 표시되는 점을 반영해 수정했다. 이전 단계의 전체 BE·기타 검증 이력은 기존 문서에 유지하며 이번 실행 결과로 중복 계산하지 않는다.

증거: 워크스페이스 `tmp/diary-permanent-20261028-093620/`의 backend-diary.log·backend-purge-final.log·final-postgres-schema-test.log·final-postgres-result.json·frontend.log·spring-purge.json·web-build.log·browser-purge.log·openapi-final.log·browser-trash-regression.log·browser-update-regression.log. 화면은 이 checkout의 `frontend/qa/.out/diary-purge/`에 있다. 브라우저 QA는 실제 Spring DTO 형태를 쓰는 HTTP fixture이며 공유 서버 end-to-end 결과가 아니다.

```powershell
$env:DIO_DIARY_PURGE_CONTRACT_OUTPUT = Join-Path $env:TEMP 'dio-purge-page.json'
cd backend
.\gradlew.bat test --tests 'com.f106.DIO.diary.DiaryPurgeHttpTests' --rerun-tasks
cd ../frontend
pnpm run test:diary-purge
# 휴지통 HTTP 테스트로 생성한 DIO_DIARY_TRASH_CONTRACT_OUTPUT를 브라우저 fixture에 지정한다.
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8080/api'
pnpm exec expo export --platform web --output-dir .expo/diary-auth-web
pnpm run qa:diary-purge
```

PostgreSQL HTTP 테스트는 폐기 가능한 dio_diary_create_qa DB, DIO_DIARY_CREATE_PG_QA=true 및 DB_URL/POSTGRES_USER/POSTGRES_PASSWORD를 요구한다. fixture 정리가 있어 기존 데이터 DB를 사용하면 안 된다. 이번 검증은 새 임시 PostgreSQL 클러스터를 만들고 종료했다.

## 완료 범위와 후속

Veloci 담당 다이어리 API 7개의 BE·FE 기본 구현을 이 브랜치에서 모두 연결했다. 기존 develop의 별도 구현과의 통합·공유/초대/248·페이지 담당 쓰기 경계·실제 저장소 연동·운영 데이터·Android/iOS 실기기·VoiceOver/TalkBack·원격 CI·배포는 별도 검증이 필요하다. 30일 경과 자동 삭제·공용 미디어 수거는 구현 범위가 아니다. 커밋·푸시·MR 생성은 하지 않았다.


최종 보존 감사: notification-backend·diary-api-preparation·notification-submission·diary-list-query·diary-trash-integration·diary-purge-integration·diary-mvp2-contract의 HEAD·브랜치·인덱스·추적/비무시 파일 해시는 시작과 동일했다. diary-detail-permissions는 다른 세션에서 860adc1→8c0950f 및 2개 파일 변경이 관찰됐다. 해당 폴더는 읽기만 했고 수정·복사·병합·되돌리기 하지 않았다. 본 작업의 HEAD·브랜치·인덱스는 그대로이며 기존 App·lockfile·V1~V10을 별도로 대조해 보존했다. 원격 develop도 b7a626c로 동일했다. 증거는 preservation-before.json·preservation-after.json·preservation-check.json에 있다.
