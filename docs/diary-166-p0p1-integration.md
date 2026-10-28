# !166 기준 다이어리 P0·P1 통합 사본

> 후속 상태: [develop·!172 통합 계약](./diary-172-integration.md)에서 최신 파일 반영·휴지통/복원 BE·FE 연결을 완료했다. 아래 내용과 수치는 해당 단계 당시 기록으로 유지한다.


2026-10-28. 기준은 !166 최신 `3b270da3663700147ef686b0fcab12f099858b91`이다. 원본 MR 소스와 다른 작업 폴더를 변경하지 않고 `.worktrees/diary-contract-integration`의 `feature/common/diary-contract-integration`에서만 수정했다. 커밋·푸시·MR 상태 변경·병합은 하지 않았다. 원격 develop `2de27fd`는 조회로 확인했으며 이번 작업의 HEAD는 !166 그대로다. 최신 develop UI 반영과 !172→!173 순차 갱신은 다음 통합 단계에서 수행해야 한다.

## 이번 단계의 외부 계약

기준 체인의 `/api/v1/member/diaries` 경로·회원 transport/store·JWT/활성 세션·카탈로그/편집 문서 연결을 유지한다. !176의 별도 계정 보관함·컨트롤러·서비스·V9~V11은 복사하지 않았다. 이번 범위는 !166의 생성·목록·상세·수정 네 API다.

- 활성 역할은 OWNER·EDITOR만 허용한다. VIEWER·비참여·탈퇴·불일치 OWNER는 404이며 기존 역할 데이터를 일괄 수정하지 않는다. 활성 EDITOR는 상세/내용 편집 권한이 있지만 메타데이터 수정은 403이다. metadata canEdit과 permissions.canEditCanvas를 구분해 EDITOR의 로컬 편집을 불필요하게 막지 않는다. 원격 캔버스 쓰기 구현은 아니다.
- 목록·상세·생성·수정 DTO에 양의 BIGINT 문자열 `version`, `myRole`, `myMembership.isFavorite`, `permissions`를 제공한다. 기존 nested diary 및 canEdit 필드는 호환을 위해 유지한다. 서버 휴지통 API·화면은 이번 범위가 아니며 canTrash는 도메인 권한이다.
- PATCH는 문자열 `expectedVersion` 필수다. 숫자·0·선행 0·BIGINT 초과·이전 expectedUpdatedAt 필드는 400이다. 권한 확인 및 행 잠금 안에서 version을 비교하고 SQL의 동일 version 조건으로 원자 갱신한다. 오래된 기준은 409 DIARY_METADATA_CONFLICT, 변경할 수 없는 최댓값은 409 VERSION_EXHAUSTED다. 동일 내용은 시각·version을 증가시키지 않는다. 기존 내부/비회원 수정 서비스의 시각 기반 함수는 별개로 유지한다.
- 생성 응답은 최초 완료 시각부터 24시간 전까지만 재사용한다. 정확한 만료 시각부터 409 IDEMPOTENCY_KEY_EXPIRED이고 키를 다시 생성에 사용하지 않는다. 요청 해시 충돌은 기존대로 409다. 응답 본문만 60초마다 최대 500건 정리하며 사용자·키·요청 해시·완료 시각과 다이어리 FK는 보존한다. 다이어리/사용자 삭제 시 기존 FK·응답 정리 정책을 유지한다.
- FE의 신규 키는 기존 UUID 생성기로 발급한다. 서버는 기존 미확인 요청을 깨뜨리지 않도록 기존 8~128자 키도 계속 허용한다. 재시도에는 기존 키·본문을 그대로 쓴다. 만료 시 자동 재생성하지 않는다. 사용자가 요청 정리를 확인하면 최신 목록 조회 성공 후 계정별 pending-archive에 원문을 보관하고 미확인 상태를 해제한다. 조회 실패 시 미확인 요청을 유지한다.
- 회원 기본 생성 UI는 가로/세로 무지 1장으로 시작한다. 서버의 기존 initialPages·카탈로그 확장 API와 기기 보관함의 여러 페이지·달력 구성은 유지한다. 과거 미확인 생성 요청의 내용을 무지 1장으로 바꾸지 않는다. 전체 페이지·OWNER·생성 응답 기록의 원자 생성은 기존 구현을 재사용한다.
- 목록에 filter=all/personal/shared, favorite=true/false를 추가한다. 개인 필터와 shared=false는 활성 멤버가 1명, 공유 필터와 shared=true는 활성 멤버가 2명 이상인 기준으로 통일한다. visibility가 PRIVATE여도 활성 공동 멤버가 있으면 공유 목록에 포함하며, MEMBERS/LINK여도 소유자만 남으면 개인 목록에 포함한다. 탈퇴한 멤버는 집계하지 않는다. 검색/정렬·ICU 점검·limit 1~100을 유지하고 기본 정렬은 updated다. 커서 v4는 계정·검색·정렬·filter·favorite에 귀속된다. 구 커서는 재사용하지 말고 첫 페이지부터 새로 조회한다. 기존 shared 표시의 활성 멤버 수 기반 의미를 유지하고 필터도 같은 집계값을 사용한다. 필터 의미가 바뀌므로 v3 이하 커서는 400/INVALID_DIARY_LIST_QUERY로 거부하고 첫 페이지부터 조회한다. 공유 초대·visibility 쓰기 정책·248 구현은 변경하지 않는다. 즐겨찾기는 서버 membership 읽기만 제공하고 회원의 임시 로컬 토글은 차단한다.
- 제목은 회원 생성·수정 HTTP 요청에서 ECMAScript trim 공백 집합으로 정규화한다. NBSP·figure/narrow NBSP·BOM 등만 있는 제목은 400이며 양끝 공백은 제거한다. 비회원 요청 DTO는 원본 그대로 유지한다. 기존에 저장된 잘못된 제목의 운영 정리는 별도다.

## 데이터 변경

V1~V11을 보존하고 미제출 V12__align_member_diary_contract.sql만 추가했다.

1. diaries.version 양의 BIGINT, 신규 기본값 1. migration 당시 기존 행은 2로 전환한다. 과거 생성 스냅샷이 version 1로 재응답되더라도 이미 수정된 기존 메타데이터를 바로 덮어쓰지 못하게 하기 위한 기준이다. 생성 응답은 최초 스냅샷이며 수정 전 GET으로 현재 DTO를 확인해야 한다. FE 수정 진입은 기존처럼 상세를 먼저 재조회한다.
2. 기존 생성 기록 CHECK를 확장해 live diary FK·키를 남긴 채 만료 응답 본문만 비울 수 있게 했다. completed_at 부분 인덱스를 추가했다. 기존 키·해시·완료 시각·콘텐츠를 migration에서 삭제하지 않는다. 배포 시 이미 24시간이 지난 요청도 새 정책으로 409가 된다.

새/기존 데이터·카탈로그·페이지/멤버·생성 영수증 보존을 별도 임시 PostgreSQL에서 검증했다. 원본 DB/Flyway 이력·비공개 환경 파일·기존 서버를 수정하거나 재시작하지 않았다. 배포 전 백업과 별도 적용 검증이 필요하며 적용된 migration 삭제·재번호화/무조건 repair를 복구 절차로 쓰지 않는다. V12는 아직 배포하지 않았으며 후속 체인 최신 migration 번호와 함께 재확인해야 한다.

## 검증 기록

- 최종 H2: 회원 HTTP 23 + ICU 가용성 4 + 상세 12 + 생성 29 + 인증 통합 10 = 78 통과, 실패·제외 0.
- 기기 API·저장 H2 회귀: 14 통과, 실패·제외 0.
- 실제 PostgreSQL: 기존 생성·카탈로그·목록·migration 45개, 상세 16개, 새 HTTP 23개를 검증했다. 첫 실행의 이전 TTL/구 커서 기대값 두 건을 새 계약에 맞춘 뒤 해당 항목만 재실행했다. 새 HTTP fixture의 NOT NULL 누락을 실제 스키마에 맞춰 고친 뒤 HTTP 범위만 재실행했다. 통과 이력은 실행별로 보존하며 중복 합산하지 않는다.
- 실제 Spring 응답→FE 소비·회원 상태·인증/알림 갱신·생성 입력: 최종 34 통과, 실패·제외 0. 만료 요청의 자동 POST 차단·목록 조회 실패 시 보존·명시적 정리 후 원문 보관을 포함한다.
- Expo 웹 번들 성공. 격리된 Edge 1280×800, 1024×768, 412×892, 667×375에서 무지 1장·유니코드 공백·응답 유실 동일 키 재시도·문자열 version 수정·만료 요청 정리·기기 자료 보존 통과. 모두 pageerror 0. HTTP fixture와 실제 Spring 응답을 활용한 QA이며 공유 서버 end-to-end나 실기기 결과가 아니다.
- 로컬 증거: 워크스페이스 `tmp/diary166-p0p1-integration/`. 웹 QA 소스는 frontend/qa/member-contract-browser.cjs, 실제 PostgreSQL HTTP는 MemberDiaryContractPostgresTests다.

재현: backend에서 `gradlew test --tests com.f106.DIO.diary.http.MemberDiaryHttpTests` 실행 후 frontend의 member-diary-spring-contract.test.js가 실제 생산자 파일을 소비한다. PostgreSQL HTTP는 DIO_MEMBER_CONTRACT_PG=true와 명시적 loopback의 빈 dio_member_contract_qa DB_URL/POSTGRES_USER/POSTGRES_PASSWORD를 요구한다. 전용 임시 schema를 만들고 지우므로 기존 데이터 DB에 연결하면 안 된다.

## 후속 단계·미검증

- !172: OWNER 작업의 EDITOR 403·비참여 404, 삭제/복원 시 version 증가·반복 무변경, 최초 삭제 시각·정확한 30일 경계 유지, 회원 휴지통 FE 연결.
- !173: 원래 OWNER의 완료 재시도 204 및 하위 원자 정리·미디어 원본 보존 검증·FE 연결. !176 삭제 서비스 전체 복사 금지.
- CI: 이번 단계는 기존 CI 파일을 변경하지 않았다. 후속 단계에서 기존 PostgreSQL job의 보호·보고서를 보완하고 회원 계약 artifact 생산/소비를 연결한다. 새 실제 PostgreSQL HTTP 테스트는 명시적 opt-in 실행이며 원격 CI 통과로 표시하지 않는다.
- 공유/초대·최대 4명·링크 1시간·소유권 이전·강퇴·사본·248, !174 자동 정리, 원격 캔버스 쓰기, 실기기/VoiceOver/TalkBack, 운영/공유 서버·배포는 범위 밖이다.
- 최종 develop 및 !166 후속 변경·팀 계약·MR 순차 갱신 확인 전 이 사본을 그대로 병합 가능한 상태로 해석하지 않는다. 기존 MR 본문과 승인·Draft 상태는 변경하지 않았다.

최종 보존 감사: 원본·248 관련 작업을 포함한 기존 9개 작업 폴더의 HEAD·브랜치·index·추적/비무시 파일 SHA-256은 작업 시작과 동일했다. 새 통합 사본의 V1~V11은 기준 !166과 동일하고 index는 비어 있다. 원본 서버·DB·MR은 변경하지 않았다. 최소 H2 fixture에서 백그라운드 정리가 실행되지 않도록 테스트 프로필에서 타이머만 끄며, 정리 SQL은 전용 fixture에서 직접 검증한다. 이 설정 후 만료 정리·실제 응답 생산자 두 항목과 실제 Spring→FE 소비 3개를 재확인했다.
