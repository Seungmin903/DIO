# develop·!172 휴지통·복원 통합 사본

2026-10-28. 작업 폴더 `.worktrees/diary-contract-integration`, 브랜치 `feature/common/diary-contract-integration`. !166의 확정 P0·P1 미커밋 구현을 보존하면서 develop 초기 `2de27fd6528b6c73186d671cda5fcdef9c3da020`의 54개 경로와 !172 초기 `c4531fca3ba0acb49e685fcd0b87be8e222c5acb`의 12개 경로, 작업 도중 원격에 추가된 최신 `dca742d96e67549cd9ca81eada9b3aa327ddcb4f`의 28개 경로 변경을 파일 단위로 삼방향 반영했다. 최신 추가 반영의 충돌 8개는 기존 P0·P1과 양쪽 최신 내용을 보존해 해결했다. 최종 확인된 develop `514261576add618a97b47de703ac8b33b6962cc2`의 추가 63개 경로(학습 플래너·편집기·문서)와 !172 문서 후속 `fa6099dffeee92263e1c2a869ef075a3ea4980a9`도 반영했다. 문서 색인은 양쪽 항목을 보존했다. !172 기준 부모는 `83a83cc`이며 그 이전 !166 내용으로 되돌리지 않았다.

커밋 금지에 따라 HEAD는 !166 `3b270da` 그대로이며 index도 비어 있다. git merge/새 merge commit이나 MR 상태 변경을 하지 않았으므로 여기서 '반영'은 작업 파일의 내용 통합이다. 제출 허용 시 정상 Git 이력 연결 및 최신 원격 기준 확인은 별도 단계다. 원본 브랜치·다른 세션의 미커밋 작업을 복사·스테이징하지 않았다.

## 완료한 계약

| API | 현재 계약 |
|---|---|
| DELETE /api/v1/member/diaries/{diaryId} | 활성 OWNER만 휴지통 이동. 본문·쿼리 없음. 204 빈 응답. 실제 active→trashed 전환에만 version+1·deleted_at 최초 기록·updated_at 갱신. 반복 요청은 이 세 값을 모두 보존 |
| GET /api/v1/member/diaries/trash | 본인 활성 OWNER의 휴지통만, 삭제 시각/UUID 내림차순·q·limit 1~100·계정/검색 귀속 커서. 문자열 version·deletedAt·purgeAt·canRestore. 끝/빈 페이지 nextCursor=null. 조회로 물리 삭제하지 않음 |
| POST /api/v1/member/diaries/{diaryId}/restore | 본문·쿼리 없음. OWNER만 200 최신 상세 DTO. 최초 삭제부터 정확히 30×24시간 직전까지만 복원. 실제 trashed→active에 version+1·deleted_at=null·updated_at 갱신. 이미 활성인 재요청은 무변경 |

- JWT·활성 서버 세션·활성 계정 검사와 기존 회원 잠금 순서를 재사용한다. 활성 EDITOR의 OWNER 작업은 403 DIARY_OWNER_REQUIRED, 비참여·탈퇴·강퇴·VIEWER·잘못된 OWNER·없는 자료는 404다. 무인증·위조·만료·취소 세션과 비활성 계정은 401이다.
- 권한·행 잠금 후 서버 UTC 시각으로 만료를 판단한다. now==deletedAt+30일 부터 410 DIARY_RESTORE_EXPIRED. 보관 기간 설정은 30만 허용해 기존 행의 기한을 설정 변경으로 늘리지 않는다.
- SQL은 잠금 안에서 확인한 version 조건으로 상태와 version을 원자 갱신한다. 최댓값의 실제 변경은 409 VERSION_EXHAUSTED이고 이미 목표 상태의 반복 요청은 버전을 올리지 않는다. 이동·복원 전의 expectedVersion으로 이후 메타데이터 수정은 409다. 복원 응답도 현재 version·역할·permissions를 같은 트랜잭션에서 조회한다.
- 반복 보존은 현재 삭제 주기 안의 보장이다. 복원/재삭제 뒤 늦게 도착한 과거 DELETE·restore를 구분하는 별도 주기 ID는 이번 계약에 없다.
- 페이지·요소·회원·즐겨찾기·취소 초대·미디어 원본·기기 문서를 변경하거나 지우지 않는다. 멤버의 활성 목록·상세는 휴지통 상태를 제외하고 복원 후 기존 멤버십으로 다시 접근한다. 초대 수락/원격 편집 쓰기의 실제 연동은 공유·페이지 담당 후속이다.

## FE 연결

별도 계정 앱을 추가하지 않고 기존 memberDiaryApi/memberAppStore/useMemberDiaries와 회원 App에 연결했다.

- OWNER 카드에서 확인·취소 후 개별 이동. EDITOR 버튼 숨김. 일괄 이동·회원 영구 삭제는 제공하지 않는다. 기기/목 경로는 기존 동작을 유지한다.
- 회원 휴지통은 서버 목록·purgeAt·canRestore로 표시하며 만료·로딩·오류·빈 목록과 새로고침을 제공한다. 410 뒤 재조회하여 복원을 비활성화한다. 앱 복귀 시 서버 목록을 갱신한다.
- 동일 요청 중복 탭은 하나로 합치고, 네트워크/서버 오류는 같은 대상·동작으로 명시적 재시도한다. 다른 미확인 작업으로 덮어쓰지 않는다. 서버 성공 후 목록만 실패하면 쓰기를 다시 보내지 않고 조회만 재시도한다.
- 400/401/403/404/409/410은 쓰기 자동 재시도를 하지 않고 최신 상태 확인으로 전환한다. 변경 전 시작한 GET의 지연 응답은 삭제/복원 결과를 덮어쓰지 못한다. 계정 종료 후 응답도 캐시·문서에 반영하지 않는다.
- 작업 상태는 세션 메모리에 보관한다. 앱 재시작 후 서버 목록부터 확인하며, 기기 문서를 자동 삭제하거나 휴지통에 없는 자료를 물리 삭제하지 않는다.
- 브라우저 QA에서 보관함 useMemo의 작업 상태 의존성 누락을 찾아 재시도 안내가 즉시 갱신되도록 수정했다.

## OpenAPI·CI 통합

- DELETE 204 무본문, DELETE/restore requestBody 없음, JSON 응답, 휴지통 항목의 version·기한 필수 및 nullable 커서를 실제 OpenAPI로 검증했다.
- 기존 Item 이름이 알림 모델과 충돌하는 것을 확인해 MemberDiaryTrashItem/MemberDiaryListItem으로 분리했다. 기존 회원 목록의 200 응답 명시 누락도 보완했다. 알림 Item은 notification/invitation 구조를 유지한다.
- !172 패치에 있는 두 DB_URL 설정이 !166의 회원 DB 설정과 겹쳐 그대로 합치지 않았다. 기존 authPostgresTest·회원 생성·상세 명령과 dio_member_ci는 유지하고, 별도 dio_trash_qa JVM에서 postgresDiaryTrashTest를 실행하도록 했다. JUnit/HTML artifact를 기존 backend-postgres-test에 추가했다.
- 새 태스크는 DIO_LIST_QUERY_PG=true·명시적 loopback dio_trash_qa·자격정보가 없으면 실패한다. DB 테스트는 캐시로 생략하지 않는다. 일반 H2 실행을 실제 PG 통과로 간주하지 않는다.
- 실제 Docker 래퍼·원격 GitLab CI는 실행하지 않았다. 기존 컨테이너 생성/정리 방식은 이번 변경으로 운영 승인한 것이 아니다. 회원 FE 계약 artifact의 원격 CI 연결은 후속 단계다.

최신 dca742d에서는 필터가 검증한 같은 Bearer의 인증 완료 JWT만 재사용하고 그 외에는 기존 loginJwtDecoder로 검증하는 변경, ICU가 없는 경우 휴지통 검색만 503이고 기본 목록은 유지하는 변경, 속지 코드·버전의 중복/실제 PK 충돌 방지와 CI ICU probe를 추가 반영했다. 날짜/권한/version 정책을 이전 초안으로 되돌리지 않았다. dca742d에서는 FE 제품 코드가 바뀌지 않아 화면 QA를 반복하지 않았다. 이후 develop 5142615에 공통 편집기 변경이 생겨 최종 번들·생성/휴지통 네 화면 QA와 해당 FE 회귀를 다시 수행했다.

## 영향 검증

| 검증 | 결과 |
|---|---|
| H2 | 초기 기준 유효 44개 통과. 최신 dca742d의 회원 기본·휴지통·ICU 가용성·요청 인증·인증 통합·생성·배포 계약 영향 회귀도 latest-172-backend.log에서 BUILD SUCCESSFUL 확인. 실행별 수치를 중복 합산하지 않음 |
| 실제 PostgreSQL 17/Flyway | 최신 기준 HTTP 10 + 서비스 9 + ICU 가용성 1 + 전체 migration 호환 1 + 카탈로그 변경 2 + 레거시 upgrade 1 = 24 통과, 실패·제외 0. 동시 복원·정확한 기한·멤버/페이지/초대 보존 포함 |
| FE 회원 상태·API·휴지통·인증/알림·테마·카탈로그 | dca742d 기준 42 통과. 최종 develop 포함 유효 110 통과(최초 108 통과, 테스트 로더 충돌 2건 보완 후 해당 2개만 재실행 통과), 실패·제외 0 |
| 최종 실제 Spring 응답 소비 | 회원 기본 3 추가 확인 + 휴지통/회귀 9 재확인 = 12 통과. 휴지통 9개는 최종 FE 회귀의 부분집합이며 중복 합산하지 않음 |
| 웹·Edge | 번들 성공. 1280×800, 1024×768, 412×892, 667×375의 휴지통 QA 및 기존 생성·수정·만료 키 복구 모두 통과, pageerror 0 |
| CI·설정 | YAML 파싱·별도 DB_URL·JUnit·셸 문법 통과. 잘못된 DB는 연결 전 거부. 최신 ICU 점검 스크립트의 격리 mock Docker 8개 시나리오도 통과 |

최초 회귀의 기존 EDITOR 404 기대값은 합의된 403으로 보완했다. OpenAPI 검사에서 발견한 이름 충돌·목록 200 선언 누락은 실제 문서와 계약에 맞춰 수정했다. 과거 전체 검증은 불필요하게 반복하지 않았으며 이전 !166 검증 이력은 기존 문서에 보존한다. 새 develop의 학습 플래너 저장/복원 테스트 2건은 !166의 실제 memberStorage 의존성을 테스트 로더가 찾지 못해 실패했다. 제품 코드와 원래 검증 조건은 유지하고 실제 모듈을 로더에 전달해 두 항목만 재확인했다.

증거는 워크스페이스 tmp/diary172-integration/의 integration-sources.json, backend-final.log, openapi-final.log, latest-172-backend.log, latest-172-postgres.log, latest-postgres-results/, latest-172-frontend.log, final-develop-frontend.log, study-planner-loader-fix.log, final-browser-trash.log, final-browser-create.log, postgres-guard.log 및 보존 감사다. QA 소스는 frontend/qa/member-trash-browser.cjs다. 실제 Spring DTO를 활용하는 격리 HTTP fixture QA이며 공유 서버 end-to-end가 아니다.

재현: backend에서 gradlew test --tests com.f106.DIO.diary.http.MemberDiaryTrashHttpTests 후 frontend에서 node --test tests/member-diary-lifecycle.test.js. 실제 PG는 빈 전용 dio_trash_qa DB와 DIO_LIST_QUERY_PG=true의 postgresDiaryTrashTest, 새 HTTP는 DIO_MEMBER_TRASH_PG=true opt-in 및 MemberDiaryTrashContractPostgresTests를 사용한다. 원본/운영 DB를 테스트 대상으로 사용하지 않는다.

## 보존·다음 단계

- 최초 통합 사본의 모든 추적/비무시 파일을 별도 백업했다. develop의 중복 문서/PDF 삭제를 통합 사본에 반영했고 기존 파일은 백업에 남겼다. 문서 색인은 develop·회원·P0·P1 항목을 모두 보존했다.
- 기존 9개 폴더 중 8개는 보존 대조에서 HEAD·브랜치·index·파일 SHA-256이 시작과 동일했다. diary-trash-integration에서는 다른 세션이 c4531fc→dca742d→fa6099d 커밋 및 인덱스 갱신과 28개 경로 변경을 진행했다. 초기 4개 파일 변경부터 최종 커밋까지 관찰 기록을 preservation-final-audit.json에 보존했다. 해당 폴더에 쓰거나 되돌리지 않았다. 새 원격 커밋 dca742d와 문서 후속 fa6099d만 기준으로 추가 반영했고 다른 세션의 미커밋 파일은 가져오지 않았다. 원본 파일과 통합 사본이 서로 독립된 파일인 것도 확인했다.
- 통합 사본의 기존 V1~V12는 변경하지 않았고 신규 migration도 추가하지 않았다. !176 전체 커밋·watermark·공유/248·!173 영구 삭제·!174 자동 정리는 가져오지 않았다.
- 다음 단계는 !173의 OWNER 완료 재시도·하위 원자 정리·미디어 원본 보존 및 FE 연결이다. 실기기/VoiceOver/TalkBack, 실제 공유·개발 서버, 운영 데이터·배포·원격 CI는 별도 검증이다.
- 커밋·푸시·MR 생성/닫기·Draft 상태 변경·병합을 하지 않았다.
