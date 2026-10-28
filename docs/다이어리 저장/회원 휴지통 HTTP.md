# 회원 다이어리 휴지통 HTTP (234)

관련 Jira: [S15P31F106-234](https://ssafy.atlassian.net/browse/S15P31F106-234).

## 제출 범위와 기반

기존 `.worktrees/diary-list-query`의 미커밋 휴지통 조회·복원 로직을 !166 최신 회원 다이어리 코드(b9f63a1, develop 통합·V9/V10 및 인증/알림 호환 보완 포함)에 맞춰 통합했다. 기존 로컬 작업은 보존했다. !166의 생성·회원 목록·검색·정렬·메타데이터 구현은 재제출하지 않는다. 후속 Draft MR의 대상은 !166 브랜치 `feature/be/diary-detail-permissions`이며 !166 병합 뒤 develop으로 전환하고 최신 develop 통합·CI를 다시 확인한다. !166 자체의 develop 충돌은 이 후속 MR로 해결됐다고 간주하지 않는다.

234는 백엔드 휴지통 이동·조회·복원만 구현한다. 프런트엔드 휴지통 화면 연결, 영구 삭제(235), 만료 자동 정리(236), 실제 배포·실기기 QA는 포함하지 않는다. 156·164 브랜치/작업 트리/MR은 변경하지 않는다.

## 인증·권한과 동시성

!166의 회원 전용 SecurityFilterChain과 DiaryRequestIdentity를 그대로 사용한다. 기존 loginJwtDecoder/loginBearerTokenResolver가 JWT 서명·용도·만료·활성 세션·회원 상태를 검증한다. 임의 userId 헤더나 요청 본문은 권한 근거가 아니다. 무인증·위조·만료·취소 세션은 401이다.

조회 대상은 `owner_user_id=현재 회원`, 활성 `OWNER` 멤버십이며 둘이 불일치하거나 탈퇴한 멤버십은 제외한다. EDITOR/VIEWER에게 소유자의 휴지통을 노출하지 않는다. 삭제·복원은 타인/없는/멤버십 불일치 ID 모두 404/DIARY_NOT_FOUND다. 만료 410 판단보다 권한 판단을 먼저 한다.

변경 트랜잭션은 !166 상세 서비스와 동일한 사용자→다이어리→멤버십 잠금 순서를 사용한다. 활성 계정 행을 잠그고 다이어리 FOR UPDATE 및 활성 OWNER 멤버십 잠금 뒤 상태·현재 서버 시각을 재확인한다. 동시 복원은 직렬화되며 두 번째 요청은 이미 활성인 상태를 반환한다. 235·236의 영구 삭제/배치와의 경합 검증은 해당 구현 뒤 추가해야 한다.

## API

| 요청 | 결과 |
| --- | --- |
| `DELETE /api/v1/member/diaries/{UUID}` | 최초 deleted_at을 서버 UTC로 기록하고 updated_at 갱신, 204. 이미 휴지통이면 204이며 삭제 시각·보관 기한을 연장하지 않음 |
| `GET /api/v1/member/diaries/trash?q=여행&limit=20&cursor=...` | 본인 휴지통 `{items,nextCursor,hasNext}`. 기본 20, 1~100. 제목 대소문자 무시 부분 검색(공백 제거 후 최대 100자), `%`·`_`·`!`는 문자 그대로. 삭제 시각/UUID 내림차순, 커서는 현재 회원·검색어에 연결 |
| `POST /api/v1/member/diaries/{UUID}/restore` | 본문 없음. `{diary:...}` 200, canEdit=true. 기본 30일 직전까지 복원, 정확히 만료 시각부터 410/DIARY_RESTORE_EXPIRED. 이미 활성인 자료 재요청은 updated_at을 다시 바꾸지 않음 |

휴지통 항목은 diaryId/diaryTitle/coverColor/coverStyle/visibility/createdAt/updatedAt/deletedAt/purgeAt/canRestore를 포함한다. 만료 후 물리 정리 전 항목도 canRestore=false로 반환하며 조회 자체는 삭제하지 않는다. 빈·끝 페이지는 nextCursor=null/hasNext=false다. 잘못된 조건·커서는 400/INVALID_DIARY_TRASH_QUERY, 잘못된 UUID는 400이다. 모든 응답에 Cache-Control: no-store를 적용한다. 회원 API CORS에 DELETE를 추가한다.

기본 보관 기간은 `dio.diary.trash.retention-days=30`이다. 운영에서 기간을 바꾸면 기존 삭제 시각에도 새 기간이 적용되므로 정책 합의 없이 변경하지 않는다. 서버 시각은 마이크로초 단위이며 updated_at은 기존 값보다 단조 증가해 !166의 수정 기준 토큰과 호환된다.

삭제된 자료는 !166의 활성 목록·상세·수정에서 숨긴다. 기존 비회원 `/api/v1/diaries` 경로는 회원 자료를 취급하지 않아 우회할 수 없다. 복원은 다이어리 deleted_at만 해제한다. 개별 삭제 페이지·left_at·취소된 초대·공유 권한을 변경하거나 물리 파일을 삭제하지 않는다. 공유 초대의 실제 검증 서비스는 다이어리 삭제 상태를 확인해야 하며 공유 구현과의 종단 검증은 별도다.

## 데이터 영향·복구

기존 diaries.deleted_at/updated_at만 변경하며 신규 마이그레이션은 없다. 스키마·회원 소유자·페이지·초대·미디어·생성 영수증은 삭제하지 않는다. 롤백은 애플리케이션 커밋을 revert하되 이미 기록한 deleted_at은 보존한다. DELETE를 다시 물리 삭제로 전환하지 않는다.

## 재현 검증

backend에서:

```sh
./gradlew test --tests 'com.f106.DIO.diary.trash.*' --tests 'com.f106.DIO.diary.http.MemberDiaryTrashHttpTests'
./gradlew test
```

Windows는 gradlew.bat. H2 HTTP 검증은 실제 서명 JWT·활성 서버 세션·SecurityFilterChain을 사용한다. 실제 이메일 로그인 화면·실기기 검증을 의미하지 않는다.

실제 PostgreSQL은 명시적으로 폐기 가능한 루프백 `dio_trash_qa` DB에만 실행한다. `DIO_LIST_QUERY_PG=true`, `DB_URL=jdbc:postgresql://127.0.0.1:<port>/dio_trash_qa`, `POSTGRES_USER`, `POSTGRES_PASSWORD`를 주입하고 trash 테스트만 실행한다. 각 테스트는 임의 trash_qa_/trash_flyway_ 스키마를 생성하고 finally/AfterEach에서 자기 스키마만 제거한다. Flyway 검증은 기존 마이그레이션 전체를 적용한 실제 스키마에서 동작을 검증한다.

기존 격리 PostgreSQL CI 잡은 별도 dio_trash_qa DB를 생성하고 authPostgresTest에서 trash SQL·잠금·Flyway 테스트도 실행한다. 개발/운영 DB 또는 다른 세션 서버에는 실행하지 않는다. 실행별 SHA·결과와 남은 QA는 MR 본문에 기록한다.


## MR !166 최신 통합 (2026-10-28)

!166의 9ec1689까지 통합했다. 인증 JWT 재사용·속지 ID 충돌 검증·ICU 조회·목록 인덱스를 포함하며 V10/V11 SQL은 변경하지 않는다. CI의 DB_URL 중복을 제거하고 auth_ci/dio_reset_qa와 분리된 dio_trash_qa에서 회원/휴지통 회귀를 실행한다.

휴지통 목록도 PostgreSQL의 deterministic ICU root 규칙으로 제목과 검색어를 함께 정규화한다. ICU가 없으면 검색만 503/DIARY_TRASH_SEARCH_UNAVAILABLE이며 검색 없는 목록·삭제·복원은 유지한다. 사용자 행 공유 잠금은 계정 비활성화와 권한 확인의 일관성을 위한 것으로 readOnly 트랜잭션으로 전환하지 않는다.

166번이 아직 미병합이므로 172번의 대상은 부모 기능 브랜치를 유지한다. 병합 순서는 166→172이며 166 병합 후 172의 대상을 develop으로 바꾸고 최신 develop 통합·CI를 다시 확인한다.

로컬 통합 검증: backend 전체 test 281개 통과(조건부 90개 제외), CI와 동일한 PostgreSQL 검증 작업 96개 통과(실패·제외 0), 회원 API/속지/문서 프런트 회귀 28개 통과, Bash 구문 검사 통과. 원본 QA/운영 DB와 다른 세션은 변경하지 않고 소유 폐기용 클러스터만 사용했다.
