# 회원 다이어리 develop 통합 검토

2026-10-27. 관련 태스크: S15P31F106-231·232·233.

현재 상태: 최신 develop `5fef35a`를 실제 `.worktrees/diary-detail-permissions`에 통합하고 인증 리팩터링 호환성 및 문서 캐시·상세 응답 경합을 수정했다. 아래 최초 `0d0af5a` 검증은 이력이며 최신 결과는 마지막 「인증 리팩터링 통합과 경합 수정」을 따른다.

## 검토 대상과 보존

- 작업 브랜치 `feature/be/diary-detail-permissions`, 최초 검토 HEAD `24b03007140dac191703f67cc9b47f9563a8e3de`. 후속 실제 반영 후 HEAD는 기존 develop 커밋 `0d0af5a8c0d9e78993d53c7315a276a33d12c1ab`다.
- 원격 fetch 후 develop `0d0af5a8c0d9e78993d53c7315a276a33d12c1ab`를 고정해 검증했다. 시작 HEAD보다 5커밋 앞선 상태다.
- 원본의 미커밋·미추적 파일 87개를 `tmp/member-develop-review-20261027/original/`에 복사하고 `manifest.json`에 SHA-256을 기록했다. tracked diff는 `working.patch`에 별도 보관했다. 새로 고친 기존 공유 테스트의 원본도 `additional-original/`에 보관했다. 비공개 환경 파일은 이 백업과 패치에 포함하지 않았다.
- 최신 develop의 아카이브에 원본의 미커밋 변경을 적용한 독립 소스 사본 `tmp/member-develop-review-20261027/integrated/`에서 검증했다. 두 쪽에서 바뀐 파일은 HEAD를 공통 기반으로 3-way 병합했다. 새 커밋이나 stash를 만들지 않았다.
- 최초 검토에서는 실제 작업 브랜치의 HEAD·인덱스를 유지했다. 후속 요청으로 기존 develop 커밋까지 fast-forward했으며 새 커밋은 만들지 않았다. 회원 변경은 계속 미커밋·미스테이징 상태다.
- 다른 세션의 `DIO-ToolGuide`, `diary-api-preparation`, `notification-backend`, `diary-list-query` 폴더와 DB는 수정하지 않았다. 세션 메시지도 보내지 않았다. 조회 시 다른 세션은 Safari 영역 지우기 성능 개선과 알림 변경 선별·통합 검증을 진행 중이었다.

## develop 변경 영향

| 변경 | 영향 및 확인 |
| --- | --- |
| 227 마지막 열람 페이지 복원 | `editorDocs.js`가 직접 겹친다. 회원별 `editorDocKey`와 develop의 `loadViewedPage`·선택 페이지 속지 선행 로딩·캐시 무효화 반환값을 모두 유지해 자동 병합했다. |
| 문서 색인 | 두 쪽 추가 링크가 자동 병합됐다. 회원 문서와 develop의 마지막 열람 페이지 문서를 모두 보존한다. |
| 303 사진 불러오기·모양 전환·이전 비율 복원 | 사진 렌더러·프레임 옵션·미디어·출력 모듈에 변경이 있다. 회원 API 코드와 직접 겹치지 않으며 통합 프런트 회귀와 웹/iOS 번들로 확인했다. |
| S3 환경변수 전달 | infra compose에 변경이 있다. 회원 다이어리 백엔드 Java·DB 마이그레이션에는 develop의 추가 변경이 없다. 배포 환경 적용은 수행하지 않았다. |

직접 겹친 2개 파일에서 텍스트 충돌은 없었다. 다만 통합 전체 테스트를 실행하니 `shared-library.test.js`의 `editorDocs` 로더가 새 `memberDocumentKey` import를 제공하지 않아 4개가 실패했다. 실제 회원 저장 키 모듈을 fixture에 연결하고, 같은 다이어리 ID를 서로 다른 계정에서 사용할 때의 문서·캐시 분리 회귀를 추가했다. 원본 작업 폴더에도 이 테스트 보완을 적용했다.

통합 사본에는 develop의 열람 위치 hook 테스트를 확장해 실제 회원 키로 복원할 때 다른 회원·비회원의 위치를 읽지 않고 열람만으로 본문을 저장하지 않는 경우도 검증했다. 후속 실제 반영에서는 develop 모듈과 함께 이 회귀 및 브라우저 QA도 실제 작업 폴더에 옮겼다.

## 문서와 로컬 QA 보완

- HTTP 문서에 232 GET 목록 경로·오류 코드·list 어댑터를 반영하고 인증 회원/게스트 앱 라우팅을 현재 상태로 고쳤다.
- 생성 중복 방지·인증 연결·속지 매핑·생성 트랜잭션 문서에서 기본 앱 연결이 남았다는 오래된 설명을 정리했다. 과거 단계별 테스트 수는 당시 기록으로 보존하며 최신 결과는 이 문서로 연결했다.
- 로컬 QA의 PostgreSQL 첫 시작이 PowerShell의 native 출력 또는 자식 프로세스 대기 때문에 진행되지 않을 수 있어, 숨김 프로세스로 파일 출력하고 `pg_ctl` 자체의 종료만 기다리도록 보완했다. 첫 실행 중단 후에도 이 작업의 검증된 로컬 클러스터에서 DB 존재를 확인해 생성 단계를 복구한다.
- 기존 작업의 runtime PID는 제한된 첫 조회에서 보이지 않았으나 권한을 높인 조회에서 실행 중임을 확인했다. 기존 프로세스는 유지하고 통합 사본 전용 새 PostgreSQL/API를 사용했다. 비공개 설정·토큰은 결과 문서·패치·로그 요약에 기록하지 않는다.

## 검증

검증 실행 위치는 위 통합 사본이다. 기존 실행 결과를 재사용하지 않고 backend 테스트에서 생성한 새 Spring 계약 파일로 프런트 계약을 확인했다.

- 백엔드 전체: 194개 통과, 조건부 DB 59개 제외, 실패·오류 0개.
- 프런트 전체: 706개 통과, 실패·제외 0개. 새 Spring 응답 계약과 develop의 마지막 열람 페이지·사진·미디어·출력·휴지통 회귀를 포함한다. 원본 작업 폴더의 공유/회원 API 회귀도 별도 19개 통과했다.
- 별도 PostgreSQL: 생성·카탈로그·중복 방지 38개, 상세 권한·동시 수정 13개, 총 51개 통과. 실패·제외 0개. 테스트 후 creation_qa/detail_qa/catalog_qa 스키마 0개 확인.
- 웹·iOS 번들 생성 성공. iOS는 Hermes 바이트코드 생성까지 확인했고 실기기 실행은 하지 않았다.
- 실제 PostgreSQL V1~V8 적용 8개 성공, 속지 288개 등록.
- 독립 Edge 브라우저 1280×800·412×892: 실제 로그인, 최초 201 응답 유실, 새로고침·재로그인·동일 키 재시도, 서버 다이어리/페이지 ID 보존, PATCH, 기존 편집기 진입, 비회원 키 보존 통과. limit=1 다중 커서 조회·새 저장소에서 서버 자료 발견·기기 문서 없는 자료의 빈 문서 미생성도 확인했다. 휴대폰 화면에서 2페이지 열람 후 새로고침·재로그인해 같은 서버 페이지를 복원했고 열람만으로 기기 문서가 바뀌지 않았다. 수집한 pageerror 0개.

재현 명령:

```powershell
# 통합 사본 backend에서, Java 17 / 기존 Gradle 캐시 사용
./gradlew.bat test --offline --console=plain
# 전용 로컬 DB 환경변수를 프로세스에 주입한 뒤
./gradlew.bat postgresMemberDiaryCreationTest postgresDiaryDetailTest --offline --console=plain
# 통합 사본 frontend에서 (backend 계약 산출물 생성 후)
node --test tests/*.test.js
node node_modules/expo/bin/cli export --platform web --max-workers 2 --output-dir .expo/member-app-web
node node_modules/expo/bin/cli export --platform ios --max-workers 2 --output-dir .expo/member-app-ios
node qa/member-app-browser.cjs
```

## 남은 범위

최종 팀 API 계약, 공유 개발/운영 DB 적용, iPad·갤럭시탭 실기기 QA는 남아 있다. 캔버스 본문·미디어·페이지 추가/삭제 서버 동기화, 회원 휴지통·실제 공유 기능은 이번 통합 범위에 포함되지 않는다. 즐겨찾기는 계정별 기기 값이며 서버 검색 UI·대규모 점진 로딩은 후속 최적화다.

검증 후 통합 사본 전용 API·PostgreSQL을 종료했다. 기존 작업의 서버 PID 69636은 해당 작업 경로의 Java 프로세스로 계속 실행 중임을 확인했다.

검증된 develop 변경과 추가 통합 QA는 `tmp/member-develop-review-20261027/validated-develop-overlay.patch`에 보관했다. 최초 검토 시 원본 상태에서 `git apply --ignore-space-change --check`로 적용 가능함을 확인했다. 후속 실제 반영은 fast-forward 후 검증된 통합 파일을 복원하는 방식으로 진행했다. CRLF/LF 차이로 검사에 `--ignore-space-change`가 필요하다. 이 파일은 검토·후속 통합용 산출물이며 Git merge 기록을 대신하지 않는다.

커밋·푸시·MR 생성은 수행하지 않았다.


## 실제 작업 폴더 반영 (2026-10-27 후속)

- 반영 전 미커밋·미추적 파일 89개를 `tmp/member-develop-apply-20261027/original/`에 새로 백업하고 `manifest.json`·`working.patch`를 보관했다. 백업 SHA-256도 확인했다.
- 새 변경 여부를 검사한 결과, 앞서 검증한 소스 중 반영 대상 외의 추가 변경은 없었다. 겹친 tracked 파일은 `docs/색인.md`, `editorDocs.js`, `shared-library.test.js` 3개였다.
- 세 파일의 기존 내용을 별도 보존한 상태에서 `git merge --ff-only --no-edit 0d0af5a8c0d9e78993d53c7315a276a33d12c1ab`로 브랜치를 전진시켰다. 검증 사본의 통합 파일과 회원 열람 위치 회귀·브라우저 QA를 복원했다.
- 반영 직후 실제 소스·테스트·QA 574개의 SHA-256이 검증 사본과 일치함을 확인했다. 이후 아래 실제 폴더 브라우저 회귀에서 QA 스크립트 1개만 보완했다. 겹치지 않는 기존 미커밋 파일도 바이트 단위로 유지했다. `application.json`에 전후 HEAD와 적용 파일을 기록했다.
- 다른 작업 폴더·다른 세션 DB는 수정하지 않았다. 기존 회원 API PID 69636과 127.0.0.1:8080 health 200을 확인했으며 재시작하지 않았다.
- 실제 폴더 백엔드: `test --rerun --offline --console=plain`으로 테스트를 다시 실행했다. 194개 통과, 조건부 DB 59개 제외, 실패·오류 0개. 최초 일반 실행은 UP-TO-DATE였으므로 이 재실행 결과로 기록한다.
- 실제 폴더 프런트: 일반 회귀 703개와 새 Spring 응답 산출물을 이용한 계약 3개, 합계 706개 통과. 실패·제외 0개.
- 실제 폴더 웹 번들 생성 성공. 같은 폴더의 번들과 기존 회원 API를 이용한 독립 Edge 1280×800·412×892 브라우저 회귀 통과: 실제 로그인·201 응답 유실·재로그인/동일 키 재시도·ID 보존·PATCH·기존 편집기 진입·다중 커서·새 브라우저 목록 발견·기기 문서 없는 자료의 빈 문서 미생성·2페이지 열람 후 새로고침/재로그인 복원·열람만으로 문서 불변, 수집한 pageerror 0개.
- 최초 브라우저 실행에서는 데이터가 누적된 휴대폰 보관함의 캐러셀이 끝의 생성 카드를 가상화해 로그인 후 카드 대기가 시간 초과됐다. 제품 오류가 아니라 QA의 화면 요소 가정이었다. 회원 준비 안내를 확인한 뒤 실제 ‘한눈에 보기’ 탭으로 전환해 카드를 찾도록 QA를 보완하고 재검증했다. 실패 시 스크립트 위치를 출력하도록 해 진단도 개선했다. 제품 소스에는 추가 변경이 없다.
- 반영 후 `git diff --check` 통과. 기존 비공개 설정 두 파일은 계속 Git 무시 대상이다. 기존 회원 API와 DB는 종료하거나 재시작하지 않았다.
- PostgreSQL 51개와 iOS Hermes 번들은 앞선 동일 소스의 통합 사본에서 통과한 결과를 유지한다. 이번 실제 반영에서 백엔드/DB 로직은 바뀌지 않았고 574개 소스 해시도 일치하여 이 두 검증을 반복하지 않는다.
- 새 커밋·푸시·MR 생성은 하지 않았으며 스테이징된 변경도 없다.


## 인증 리팩터링 통합과 경합 수정 (2026-10-27 후속)

### 보존과 기반

- 통합 당시 최신 origin/develop `5fef35ae09d193f6017409751e8f7ff0655ab64e`를 fetch해 실제 기능 브랜치에 fast-forward했다. 앞선 `0d0af5a` 이후 인증·회원 패키지 분리 5커밋이 추가된 상태였다. 새 커밋은 만들지 않았다.
- 반영 전 90개 미커밋·미추적 파일의 원본과 SHA-256, tracked patch를 `tmp/member-diary-race-fixes-20261027/`에 보관했다. 겹친 build.gradle·문서 색인은 양쪽 변경을 유지했다. 색인의 CRLF/LF 차이를 정규화한 뒤 병합했다.
- 다른 세션의 작업 폴더·DB·서버를 수정하지 않았다. 기존 회원 API는 기록된 PID와 이 작업의 jar 경로가 일치함을 확인한 뒤 이 프로세스만 최신 코드로 재시작했다. 기존 전용 PostgreSQL과 자료는 유지했다. 실행 중인 최신 PID·포트는 비공개 runtime.json을 따른다.

### 인증 테스트 컴파일

- `auth/login/MemberDiaryHttpTests.java`를 `diary/http/MemberDiaryHttpTests.java`, `auth/login/DiaryAuthenticationIntegrationTests.java`를 `diary/auth/DiaryAuthenticationIntegrationTests.java`로 옮겼다.
- 새 auth.config/domain/repository/security/service/support의 공개 타입과 엔티티 getter·revoke를 사용한다. 만료 세션을 만드는 테스트는 ReflectionTestUtils로 테스트 데이터만 바꾼다. 운영 엔티티의 가시성을 되돌리거나 이전 패키지를 다시 만들지 않았다.
- HTTP 테스트의 JWT 키는 테스트 자체에서 임의 생성해 준비한다. 다른 패키지의 package-private EmailLoginTests 도우미 의존성을 제거했다. 최신 develop 통합 시 발견됐던 테스트 컴파일 오류를 해소했다.

### 문서 재진입 경합

- `rememberEditorDoc`에 `overwrite` 옵션을 추가했다. 기본값은 기존 편집 캐시 갱신 동작을 유지하며 회원의 디스크→편집기 인계에서만 false를 전달한다.
- 이미 메모리에 최신 편집본이 있으면 늦게 읽은 디스크 사본을 넣지 않는다. 캐시가 없거나 null이면 검증된 기기 문서를 기억한다. 회원 권한 확인과 계정별 문서 키·문서 소유 검증은 유지한다.
- 저장 중 및 저장 실패 후 재진입, 이후 재저장, 빈/음성 캐시에서 진입, 같은 다이어리 ID의 계정별 격리를 검증한다. 실행 중 캐시 보존에 대한 수정이며 앱 종료 후 영구 보관에는 기기 저장 성공이 필요하다.

### 상세 응답 경합

- 다이어리별 메타데이터 변경 버전과 상세 요청 순서를 기록한다. 생성·수정·목록 교체·기기 인덱스 변경 뒤에는 그 전에 시작한 상세를 적용하지 않는다.
- 응답 적용 여부는 인덱스 저장 큐 안에서 확인한다. 늦은 GET에는 현재 행을 반환해 성공한 PATCH의 제목·마이크로초 updatedAt 및 저장 인덱스를 유지한다. 먼저 시작한 GET이 나중 GET 뒤에 도착하는 경우도 차단한다.
- 실제 GET 응답을 보류하고 별도 GET·PATCH가 끝난 뒤 전달하는 브라우저 회귀도 추가했다. 제품 흐름에서 제목과 기기 인덱스가 최신 값으로 유지되는지 확인한다.

### 회귀와 결과

- 수정 전 신규 회귀 5개 실패를 확인했고 수정 후 해당 묶음 18개가 모두 통과했다. 실패 로그 `frontend-red.log`, 수정 후 결과 `frontend-green.log`를 위 작업별 tmp 폴더에 보관했다.
- `test:member-diary`에 새 `member-editor-docs.test.js`를 포함해 공식 명령으로도 문서 경합을 검증한다.
- 백엔드 전체 199개 통과, 조건부 DB 59개 제외, 실패·오류 0개. 두 다이어리 테스트를 새 경로에서 실행했으며 최신 인증/회원 도메인 회귀도 포함한다.
- 프런트 전체 710개와 새 Spring 산출물로 계약 3개, 합계 713개 통과. 실패·제외 0개.
- 실제 작업 폴더의 웹·iOS Hermes 번들 생성 성공.
- 최신 API의 실제 로그인·201 응답 유실·재로그인/같은 키 재시도·서버 ID 보존·PATCH·다중 커서·새 기기 목록 발견·빈 문서 미생성·휴대폰 마지막 페이지 복원 기본 브라우저 회귀 통과.
- 지연 GET/PATCH 브라우저 회귀도 통과했다. 실제 서버의 이전 GET을 PATCH 성공 뒤 전달해도 새 제목·기기 인덱스가 유지됐다. 기본·경합 브라우저 회귀에서 수집한 pageerror는 0개다.
- PostgreSQL 생성·카탈로그·중복 방지 38개, 상세 권한·동시 수정 13개, 합계 51개 통과. 실패·제외 0개. 테스트는 이 작업 전용 DB의 격리 스키마에서 수행했다.

커밋·푸시·MR 생성과 Jira 완료 전환은 수행하지 않았다. 229·230의 팀 계약 확정, 공유 개발/운영 DB 적용과 실기기 QA는 별도 상태로 유지한다.


## Draft MR !166 CI·자동 리뷰 후속 확인 (2026-10-27)

- 원격 검증 대상은 `ca132719`이며 [파이프라인 244657](https://lab.ssafy.com/s15-final/S15P31F106/-/pipelines/244657)의 `backend-test`, `backend-postgres-test`, `secret-scan`, `ai-code-review`가 모두 성공했다. JUnit 합계는 203개 통과, 조건부 59개 제외, 실패·오류 0개다. 이 중 PostgreSQL CI 작업은 인증 스키마 4개이며 회원 다이어리 전용 51개 실행과 구분한다.
- 자동 리뷰는 앞 200,000바이트만 읽은 참고 의견 5개다. 전체 diff 검토나 사람 승인을 대신하지 않는다.
- 초기 실행 스크립트의 시드 `--offline`을 제거했다. 시드는 테스트 런타임에 의존하므로 첫 실행에서도 해당 의존성을 받을 수 있어야 한다. `initdb` 성공 뒤에만 설정을 저장하고, 기존 설정에 기록된 클러스터의 `PG_VERSION`이 없으면 복구 안내로 중단한다. 기존 설정·클러스터를 자동 삭제하지 않는다.
- `pwsh -NoProfile -File backend/qa/test-member-development-startup.ps1`은 전용 임시 파일과 PostgreSQL 모의 명령으로 초기화 실패·재시도·불완전 클러스터를 검증한다. 기존 시작 스크립트에서는 첫 검증이 실패하고 수정 후 3개가 통과했다. 실제 첫 설치의 빈 Gradle 캐시 다운로드까지 재현한 것은 아니다.
- 저장소 예외는 종류와 검증된 5자리 SQLState만 기록한다. SQL·본문·토큰·예외 메시지·스택은 기록하지 않는다. 로깅 회귀는 응답 500/503 유지와 비밀 문자열·Throwable 미포함을 함께 확인한다.
- 현재 다른 `CorsConfigurationSource` 빈은 없다. 실제 Spring 보안 체인으로 POST의 `Idempotency-Key`, PATCH의 사전 요청, 노출 헤더와 미허용 origin 거부를 추가 검증했다. 현재 CORS 설정을 바꿀 재현 근거는 없다.
- 목록 성능 지적은 전용 PostgreSQL 17의 `EXPLAIN (ANALYZE, VERBOSE, FORMAT JSON)`으로 확인했다. 활성 후보 10건·LIMIT 2에서 `created/updated/title`의 페이지·멤버 집계는 각각 2회, `pages` 정렬의 페이지 집계는 정렬에 필요한 10회·멤버 집계는 2회다. 모든 정렬에서 모든 집계가 LIMIT 전에 실행된다는 전제는 재현되지 않아 SQL은 유지했다. 제목 부분 검색 및 페이지 수 정렬의 대규모 부하·인덱스 평가는 별도다. 이 작은 표본을 부하 검증으로 간주하지 않는다.
- 로컬 수정은 원격 CI 검증 대상에 아직 포함되지 않는다. 병합·Jira 상태 변경은 하지 않는다. 229·230 합의 대기와 실기기 QA 미완료도 유지한다.

로컬 후속 검증: `backend/gradlew.bat test --offline --console=plain`으로 201개 통과·조건부 59개 제외·실패/오류 0개. 새 Spring 응답 산출물을 사용하는 프런트 계약 3개 통과, 시작 스크립트 회귀 3개 통과. DB 스키마와 프런트 제품 코드는 바꾸지 않아 PostgreSQL 전용 51개·웹/iOS 번들·브라우저 전체 QA는 이번 후속 수정에서 재실행하지 않았다. 수정 파일 7개는 미커밋 상태로 남겼고, 커밋·푸시와 원격 리뷰 댓글 등록/해결은 하지 않았다.


## MR !166 새 INFO 3개 실제 코드 검토 (2026-10-27)

기준은 푸시된 `4151842`다. 해당 커밋의 원격 CI #244786은 4개 작업 성공·JUnit 205개 통과·59개 조건부 제외였다. 아래 변경은 로컬 후속 수정이며 아직 그 원격 CI의 검증 대상이 아니다.

1. **실행 중 PID 사전 확인 — 수정.** 기록된 backendPid 확인을 환경변수 로딩·DB 명령·bootJar보다 앞으로 옮겼다. 실행 중인 서버를 종료하지 않고 명확한 안내로 중단한다. 시작 스크립트 회귀는 실제 테스트 프로세스의 살아 있는 PID와 호출 흔적을 남기는 모의 Gradle을 사용한다. 수정 전에는 bootJar 실패가 먼저 발생하는 것을 재현했고, 수정 후에는 Gradle 호출 없이 중단되는 것을 확인했다. 실제 앱 jar를 잠그거나 실행 중인 앱을 재시작하지 않았다.
2. **기본 빈 등록 순서 — 수정.** 생성·상세의 두 기본 구성을 `AutoConfiguration`과 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`로 등록했다. 일반 사용자 구성의 대체 구현을 먼저 평가하므로 `ConditionalOnMissingBean`이 등록 순서에 따라 중복 빈을 만드는 문제를 피한다. 수정 전에는 늦게 등록한 사용자 구현과 `authenticatedDiaryCreationIdentity`가 함께 존재하는 실패를 재현했다. 회귀는 기본 구성·사용자 구성이 앞선 경우·뒤인 경우를 검증하며, 기존 실제 Spring 인증/서비스 연결도 함께 확인한다. 다른 자동 구성에서 대체 구현을 제공한다면 명시적 자동 구성 순서가 필요하다.
3. **상세 GET의 FOR SHARE — 유지·근거 보강.** 현재 서비스는 readOnly가 아닌 트랜잭션이며 사용자→다이어리→멤버십의 공유 잠금으로 권한 확인과 서비스 응답 스냅샷 구성 사이의 계정 비활성화·삭제·멤버십 철회를 직렬화한다. 잠금을 제거하면 현재 일관성 계약이 바뀌므로 이번에는 제거하지 않았다. 코드와 상세 권한 문서에 근거, 튜플 메타데이터 I/O·PATCH/사용자 갱신 경합 비용, 대규모 부하 미검증을 명시했다. PostgreSQL 회귀에 두 GET의 공유 잠금 병행, 계정 비활성화·다이어리 삭제의 실제 DB 잠금 대기를 추가했다. 후자는 `pg_blocking_pids`로 실제 대기 관계를 확인하며 서비스 스냅샷 생성 뒤 HTTP 전송까지 권한 불변을 보장한다는 뜻은 아니다.

기존 비공개 설정·기존 앱 서버와 다른 세션 작업은 유지한다. 이번 요청에서는 커밋·푸시·MR 댓글/본문 갱신·병합·Jira 상태 변경을 하지 않는다. 229·230 합의 및 실기기 QA 미완료도 그대로다.

후속 검증 결과: `backend/gradlew.bat test postgresMemberDiaryCreationTest postgresDiaryDetailTest --offline --console=plain` 성공. 일반 백엔드 204개 통과·조건부 DB 62개 제외·실패/오류 0개, 실제 PostgreSQL 생성·카탈로그 38개와 상세·권한·잠금 16개(합계 54개) 모두 통과했다. 테스트 스키마 잔여 0개를 확인했다. 시작 스크립트 회귀 4개와 새 Spring 응답 기반 프런트 계약 3개도 통과했다. 두 수정은 각각 수정 전 실패 재현을 확인했다. 비공개 설정 해시와 기존 앱 서버 생존을 확인했으며, diff 검사도 통과했다. 프런트 제품 코드·DB 스키마 변경이 없어 웹/iOS 번들·브라우저 전체 QA는 재실행하지 않았다. 변경 12개 파일은 미커밋이며 원격 MR/CI는 여전히 `4151842` 기준이다.


## MR !166 최신 INFO 3개 재검토 (`595ab2e`, 2026-10-27)

- **PID 재사용 — 수정.** 실행 중 PID의 `Win32_Process` 이름과 `-jar` 절대 경로를 확인한다. 이 작업 폴더 `backend/build/libs`의 실행 jar만 소유 서버로 판정한다. 다른 프로그램·다른 작업 폴더·종료된 PID는 시작을 막지 않으며 프로세스를 종료하지 않는다. 프로세스 정보 조회 실패·Java 명령줄 미확인은 DB/빌드 전에 확인 안내로 중단한다. 기존 runtime.json에는 새 필드를 요구하지 않고 이번 작업에서는 실제 설정을 수정하지 않았다.
- 수정 전 모의 재사용 PID가 시작을 막는 실패를 재현했다. 초기화·소유 서버·다른 작업 폴더 Java·다른 프로그램·종료 PID·유사 경로·plain jar·-jar 없음·정보 미확인/조회 거부를 포함한 시작 회귀 12개를 통과했다. 실제 실행 중 서버가 소유 서버로 판별되고 현재 PowerShell은 배제되는 것도 확인했다. 실제 PID 재할당을 강제하거나 프로세스를 종료하지 않았다.
- **목록 집계 재지적 — SQL 유지.** 현재 SQL을 추출해 전용 PostgreSQL 17의 읽기 전용 `EXPLAIN (ANALYZE, VERBOSE, FORMAT JSON)`으로 다시 확인했다. 후보 10건/LIMIT 2에서 created/updated/title은 페이지·멤버 집계 각 2회, pages 정렬은 페이지 집계 10회·멤버 집계 2회다. 모든 후보의 두 집계가 항상 LIMIT 전에 실행된다는 전제는 재현되지 않았다. 실행 계획·집계 횟수는 작업 tmp에 저장했다. 다른 데이터 분포·검색·커서에서 같은 계획이나 성능을 보장하는 부하 검증으로 해석하지 않는다.
- **영수증 보관 — 기존 계약 유지·근거와 회귀 보강.** V8 주석·트리거·사용자 FK와 보관 문서를 확인했다. 키를 조용히 만료시키면 오래된 기기의 재시도가 두 번째 다이어리를 만들 수 있어 TTL 정리 배치는 추가하지 않았다. 다이어리 영구 삭제 시 응답 스냅샷 제거·키 표식 유지, 사용자 영구 삭제 시 표식 제거 정책이다. 저장 용량은 자동 제한되지 않으므로 최종 기간·용량·235 삭제 통합은 별도 합의가 필요하다. 근거를 저장소 코드 주석과 문서에 명시하고, 오래된 완료 시각의 키 재응답과 사용자 삭제 후 표식 제거를 PostgreSQL 회귀에 추가했다.

이번 변경은 로컬 후속 수정이다. 커밋·푸시·원격 MR 본문/댓글 갱신·병합·Jira 상태 변경을 하지 않는다. 원격 CI #245775의 208개 통과·62개 조건부 제외는 기존 `595ab2e` 기준이며 이번 미커밋 변경의 원격 검증 결과가 아니다. 229·230 합의와 실기기 QA 미완료도 유지한다.

후속 검증: 시작 스크립트 회귀 12개 및 실제 프로세스 판별 2조건 확인, 영수증 PostgreSQL 선별 회귀 5개(신규 2개 포함) 통과·실패/제외 0개, 테스트 스키마 잔여 0개, 목록 4정렬 읽기 전용 실행 계획 재확인, diff 검사 통과. 제품 Java 로직·API·SQL·스키마·프런트 코드는 바꾸지 않아 전체 백엔드·웹/iOS·브라우저 QA를 반복하지 않았다. 비공개 설정 해시가 유지됐으며 7개 파일은 미커밋 상태다.


## MR !166 최신 INFO 4개 검토 (`df59f46`, 2026-10-27)

1. **비공개 설정 Git 제외 — 충족 확인.** `.gitignore:16`의 `.local-data/`, `frontend/.gitignore:14`의 `*.local`이 적용된다. 실제 backend.env/runtime.json/frontend/.env.local을 `git check-ignore -v`로 확인했고 추적 파일 목록에 없다. 추가 ignore 변경이나 시작 때 Git 호출 의존성을 넣을 필요는 없다.
2. **API 포트 불일치 — 경고 추가.** 기존 `.env.local`이 현재 loopback API 포트를 가리키지 않으면 파일과 값은 보존하고 일반 안내만 경고한다. 개인 endpoint·비밀값은 로그에 출력하지 않는다. 키 누락·중복도 경고하며, 파일이 없을 때만 새 설정을 만든다. 경고가 개인 원격 설정을 자동 수정하지는 않는다.
3. **실행 jar 선택·JAVA_HOME — 수정.** Java 실행 경로를 runtime 생성과 DB 작업 전에 확인한다. `bootJar`에 의존하는 Gradle `writeMemberDevelopmentArtifact` 작업이 실제 archiveFile 경로를 기록하고 실행기는 그 파일만 사용한다. 여러 jar가 있어도 정렬·최신 수정 시각으로 추측하지 않는다. 이전 산출물을 지우지 않으며 모호하거나 잘못된 기록은 거부한다.
4. **목록 집계 재지적 — SQL 유지.** 현재 SQL을 전용 PostgreSQL 17에서 읽기 전용 실행 계획으로 다시 확인했다. 후보 10건/LIMIT 2에서 created/updated/title의 페이지·멤버 집계 각 2회, pages의 페이지 집계 10회·멤버 집계 2회다. 모든 후보의 두 집계가 항상 LIMIT 전에 실행된다는 전제는 이 표본에서 재현되지 않았다. 대규모 데이터·검색·커서의 다른 실행 계획과 부하는 별도 검증 대상이다.

검증: 시작 스크립트 회귀 14개와 Java·정확한 jar·개인 설정 보존 사전 검사 18개 통과. 수정 전에는 JAVA_HOME이 없어도 DB 시작 단계에 도달하는 실패를 재현했다. 사전 검사에는 더 최신인 구버전 jar가 함께 있어도 정확한 산출물 선택, 잘못된 manifest 거부, 기존 endpoint 불일치 경고·파일 해시 보존·비밀 문자열 미노출이 포함된다.

실제 Gradle `writeMemberDevelopmentArtifact`는 임시 init 스크립트로 bootJar 출력 폴더와 이름을 `build/member-artifact-qa/member-current-qa.jar`로 분리해 검증했다. bootJar와 기록 작업이 성공했고 jar 내용 및 실행 선택기가 같은 파일을 가리키는지 확인했다. 기존 build/libs의 jar 해시와 기존 앱 서버 생존을 확인했으며 서버를 재시작하지 않았다. QA용 무시 대상 manifest는 다음 정상 시작의 기록 작업에서 실제 bootJar 경로로 다시 기록된다. 기본 출력 jar를 덮어쓰는 실행 검증이나 실기기 QA를 수행한 것은 아니다.

제품 Java/API/SQL/DB 스키마/프런트 코드는 변경하지 않아 전체 백엔드·PostgreSQL 쓰기 회귀·웹/iOS·브라우저 QA는 반복하지 않았다. 비공개 설정과 다른 세션 작업을 보존하며 이번 변경은 미커밋이다. 원격 MR/CI #245793의 208개 통과·조건부 64개 제외는 기존 df59f46 기준이다. 커밋·푸시·MR 본문/댓글 갱신·병합·Jira 상태 변경을 하지 않는다. 229·230 합의 및 실기기 QA 미완료도 유지한다.


## 최신 develop 재통합 및 Flyway 이력 검증 (2026-10-27)

- 시작 HEAD는 `b036b8b`, 최신 develop은 `7b1b164d81377da36f0e6dc41f097c6ee14e6d35`다. 시작 시 미커밋/스테이징 변경은 없었다. 자동 통합 결과를 작업 폴더에 미커밋 변경으로 적용했고 HEAD·index는 그대로 유지했다. 원격 병합·커밋·푸시·Jira 상태 변경은 하지 않았다. 다른 작업 폴더와 비공개 설정은 수정하지 않았다.
- package.json은 develop의 auth-password-reset 테스트와 기존 test:member-diary/test:member-diary:contract/qa:member-app을 모두 보존했다. 인증·비밀번호 재설정과 스티커/화면 관련 develop 변경도 그대로 반영했다.
- develop의 V7(create_password_reset_verifications), V8(index_expired_verifications)을 보존하고 회원 카탈로그 V7→V9, 영수증 V8→V10으로 이동했다. 회원 SQL 본문은 바꾸지 않아 체크섬 의미를 유지한다. 버전 1~10이 유일하다. 프런트 카탈로그 생성기의 출력 경로와 PostgreSQL 카탈로그 회귀도 V9에 맞췄다. 카탈로그 실패 시 회원 V9 이력이 남지 않는지 확인하며, 그 앞 인증 V7/V8의 정상 적용을 실패로 오인하지 않는다.

### QA DB 처리 범위와 절차

원본 `dio_member_app`은 최초 회원 분기의 V7/V8이 이미 적용돼 있으므로 이름만 바꾼 새 코드를 바로 실행하면 Flyway 검증이 실패한다. 원본 DB의 행·이력과 기존 서버, backend.env/runtime.json/frontend/.env.local은 보존했다. 이번 검증에서 source history UPDATE·Flyway repair·데이터 삭제는 하지 않았다. 시작 스크립트는 이 레거시 이력을 발견하면 빌드 전에 안내로 중단하며 자동 수리하지 않는다.

검증은 비공개 pg_dump 백업을 별도 `dio_member_integration_<12자리>` DB에 복원한 후 진행했다.

1. 백업/복제본의 성공 이력 8개와 구 script가 정확히 `V7__seed_page_template_catalog.sql`, `V8__create_diary_creation_receipts.sql`인지 확인한다. 새 V9/V10의 SQL 원문이 구 파일과 같은지도 확인한다.
2. **복제본에만** 트랜잭션으로 구 7의 version/script를 9/V9__seed_page_template_catalog.sql, 구 8을 10/V10__create_diary_creation_receipts.sql로 대응시킨다. checksum·installed_rank·installed_on·기타 이력은 수정하지 않는다. 단순 `repair`로 인증 V7/V8의 체크섬으로 덮어쓰면 안 된다.
3. 복제본에서 한 번만 outOfOrder=true로 현재 마이그레이션을 실행해 비어 있는 인증 V7/V8을 적용한다. 이후 기본 outOfOrder=false로 validate·재시작해야 한다. 전역 또는 원본 runtime에 outOfOrder 설정을 남기지 않는다.
4. 사용자·다이어리·멤버십·페이지·속지·영수증의 전체 행 지문과 개수 보존, 성공 버전 1~10, 기본 설정 재시작을 확인한다. 이번 복제본에서 모두 통과했다. 별도 자동 PostgreSQL 회귀 `MemberMigrationUpgradePostgresTests`도 같은 이력 전환과 실제 데이터 보존·최초 검증 실패·전환 후 재실행을 검사한다.
5. 원본 전환은 이번에 실행하지 않았다. 실제 전환 전에는 기존 앱의 쓰기를 멈춘 뒤 최신 백업부터 다시 검증하고, 검증한 적용/복구 절차를 선택해야 한다. 이번 복제본에서 생성한 QA 자료를 원본에 역반영하지 않는다. 일반 develop V1~V8이 적용된 DB 또는 새 DB에는 현재 V9/V10을 정상 순서로 적용하며 위 레거시 회원 이력 대응이 필요하지 않다. 공유/운영 DB에는 이 절차를 임의 적용하지 않는다.

백업과 비공개 실행 정보는 저장소 밖 작업 tmp/mr166-develop-integration에 보관한다. 브라우저 QA는 DIO_MEMBER_QA_RUNTIME_DIR로 복제본 전용 runtime과 별도 API/웹 포트를 사용했다. 원본 서버를 재시작하지 않았으며 QA용 API만 정상 설정으로 재시작했다. 일회용 인증/비밀번호 재설정 PostgreSQL은 별도 클러스터와 auth_ci/dio_reset_qa 두 DB를 사용했다.

### 통합 회귀 결과

- 백엔드 일반 test: 232개 통과, 조건부 DB 81개 제외, 실패/오류 0개.
- 회원 PostgreSQL: 생성·카탈로그·멱등성·이력 전환 41개, 상세·권한·경합 16개, 합계 57개 모두 통과.
- 별도 인증/비밀번호 재설정 authPostgresTest: 20개 모두 통과.
- 프런트 전체 815개 통과. 새 Spring 응답 기반 계약 3개도 재확인했다(815개에 포함되는 계약 테스트의 재실행).
- 웹 export 및 iOS Hermes export 성공. 초기화/실행 가드 15개, 사전 검사 18개 통과.
- 최신 API+복제 DB의 실제 Edge 1280x800·412x892 QA 통과: 로그인, 최초 201 응답 유실, 재로그인/동일 키 복구, 서버 ID/초기 페이지, PATCH, 늦은 실제 GET 경합, 편집기, 비회원 키 격리, 다중 커서, 새 기기 목록 발견, 빈 문서 미생성, 마지막 페이지 재실행 복원.
- 첫 통합 실행의 카탈로그 파일 경로 1개와 카탈로그 실패 이력 가정 2개 오류는 새 V9 경계로 수정한 뒤 위 전체 회귀를 다시 통과했다.

229·230의 정책/모델 합의, 실기기 QA, 작성자 외 승인과 원본 QA 환경의 실제 전환은 별도다. 통합 내용은 로컬 미커밋 상태이므로 원격 MR !166/CI는 아직 기존 b036b8b 기준이다.


## 알림 통합 develop b7a626c 재통합 (2026-10-27)

- 시작 HEAD b49c440, 최신 develop b7a626ca740a840f5d5178db091b6fdfc039083c. 시작 시 미커밋·스테이징 변경은 없었다. 알림 통합 6267a7f의 75개 경로를 자동 통합 결과로 반영하고 App.js/package.json/authApi.js 충돌을 해결했다. HEAD/index와 다른 작업 폴더는 유지하며 이번 결과는 미커밋이다.
- App.js: LocalDiaryApp/MemberDiaryApp와 회원 diaryState를 유지하고 인증 회원의 콘텐츠에 실제 알림 Provider/Dialog를 연결했다. 게스트 로컬 흐름을 보존했다.
- package.json: 인증·회원·카탈로그 명령과 최신 알림 전체/경합/계약/a11y 명령을 함께 유지했다. 공통 문자열을 무조건 develop 버전으로 덮어써 회원 카탈로그 테스트가 빠지지 않도록 했다.
- authApi.js: develop의 세션 키·TTL 사전 갱신·동시 refresh·인증 거부/일시 실패·로그아웃 경계를 유지했다. 회원 transport/hook를 비동기 객체 인자와 로그인 세션 키 계약에 맞췄다. 단순히 문자열 인자의 구 API를 유지하는 호환 분기는 만들지 않았다.
- 신규 교차 회귀 4개: 회원/알림 동시 만료 요청의 갱신 1회·같은 토큰, 401 생성 재시도의 같은 키/본문, 같은 계정 재로그인 시 옛 양쪽 호출자 차단, 공동 갱신 중 계정 변경 시 새 계정으로 데이터 요청 미전송. 구 회원 transport가 새 인증 API와 호환되지 않는 수정 전 실패도 별도 임시 모듈로 재현했다.

### 통합 검증

- 일반 백엔드 256개 통과, 조건부 DB 83개 제외, 실패/오류 0개.
- 회원 PostgreSQL 41+16=57개 통과. 별도 인증/비밀번호 재설정/알림 SQL authPostgresTest 22개 통과. 원본과 분리된 회원 복제 DB 및 일회용 인증 클러스터를 재사용했다.
- 프런트 일반 865개 통과. 실제 Spring 알림 계약 8개를 별도 실행해 합계 873개이며 회원 Spring 계약 3개도 재확인했다(일반 865개에 포함된 부분집합). 실제 loopback HTTP를 사용하는 알림 6개 테스트는 네트워크 제한이 없는 검증 환경에서 통과했다.
- 웹·iOS Hermes 번들 성공. 실제 기기 실행을 뜻하지 않는다.
- 복제 DB+새 통합 API의 실제 Edge QA 통과: 로그인한 본인 알림 조회/읽음/삭제, 타인 알림 미표시 및 PATCH/DELETE 404, 알림 닫기 후 회원 보관함 유지. 이어 201 응답 유실·동일 키 재시도·서버 ID·PATCH·늦은 GET 경합·편집기·게스트 키 격리·다중 커서·새 기기 발견·빈 문서 미생성·휴대폰 마지막 페이지 재실행 복원을 확인했다.
- 신규 알림 UI QA의 첫 선택자는 라벨 구분자(쉼표)를 놓쳐 타임아웃했다. 실제 접근성 라벨에 맞춘 뒤 전체 흐름을 통과했으며 제품 코드를 테스트에 맞춰 바꾸지 않았다.

원본 QA DB·마이그레이션 이력·기존 서버와 jar·비공개 설정은 보존한다. 테스트 알림은 복제 DB에만 주입했다. 회원 마이그레이션 V9/V10과 develop 인증 V7/V8은 유지하고 이 통합에서 이력을 다시 변경하지 않았다. 원본 QA 환경의 실제 전환·229/230 합의·회원 기능 실기기 QA·작성자 외 승인은 여전히 별도다. 커밋·푸시·원격 MR 본문/댓글 변경·병합·Jira 상태 변경은 하지 않는다. 원격 MR/CI는 기존 b49c440 기준이다.


## 원본 QA 연결 복구와 최신 INFO 4개 검토 (2026-10-27, b3c3158 이후 미커밋)

MR !166의 b3c3158 대상 자동 리뷰 note 2934581의 INFO 4개를 실제 코드와 실행 환경에서 재검토했다. 원격 코멘트·MR 본문·Jira 상태는 수정하지 않았다. 직전 원격 CI #245869는 4개 job 성공(backend 256개, PostgreSQL 22개 통과, 조건부 83개 건너뜀)이며 아래 로컬 변경은 아직 원격 CI에 포함되지 않는다.

### 원본 DB 보존과 연결 복구

원본 PostgreSQL 프로세스는 살아 있었지만 임시 배포 디렉터리의 psql/pg_ctl 및 timezone 지원 파일이 누락되어 신규 연결이 끊겼다. 서버 로그의 `invalid value for parameter timezone_abbreviations: Default`와 파일 누락을 확인했다. 캐시 PostgreSQL 17 아카이브의 postgres.exe SHA256이 실행 중 바이너리와 동일함을 확인한 뒤 bin/lib/share의 **누락된 파일 1,545개만** 복원했다. 기존 파일은 배타적 생성으로 덮어쓰지 않았고 데이터 디렉터리는 대상에서 제외했다. 원본 PostgreSQL/API 재시작이나 DB 초기화·Flyway repair/이력 전환은 하지 않았다. 원본 API health 200과 SQL 접속 회복을 확인했다.

원본 users/diaries/diary_members/pages/page_templates/diary_creation_receipts/flyway_schema_history의 행 수와 전체 행 지문이 기존 기준과 같다. 원본 이력 8개와 C locale은 유지한다. 비공개 backend.env/runtime.json/frontend .env.local 및 기존 build/libs jar의 해시는 보존했다. 복구 목록과 검증 증적은 저장소 밖 `tmp/mr166-db-info4`에만 보관하며 자격증명이나 DB 덤프를 제출하지 않는다. 임시 설치 경로를 안정된 경로로 옮기는 작업과 원본 V7/V8→V9/V10 이력 전환은 별도 미수행 사항이다.

### INFO별 판단

1. 비공개 backend.env: `.local-data/`가 기존 .gitignore에 포함되어 실제 제외된다. 추적 파일이 아니며 원본 설정을 수정하지 않았다. 추가 ignore 변경은 불필요하다.
2. 비ASCII 검색: 실제 C locale DB에서 ÉÄ와 Java 소문자화 검색어가 불일치했다. 제목/검색어를 PostgreSQL ICU root로 함께 소문자화하고 제목 비교를 C 순서로 고정했다. 전용 PostgreSQL 테스트 3개의 수정 전 실패와 수정 후 통과를 확인했다. v1 커서는 400으로 거부하고 v2를 발급한다. PostgreSQL에 `und-x-icu`가 필요한 실행 전제가 추가되며 DB locale·데이터·마이그레이션 변경은 없다.
3. 집계 비용: 수정 SQL의 EXPLAIN ANALYZE에서 후보 10개/LIMIT 2일 때 created/updated/title은 page/member 집계 각각 2회, pages 정렬은 page 10회/member 2회였다. 관측 실행 시간은 약 0.6~1.6ms다. 모든 집계를 항상 LIMIT 전에 전체 후보에 수행한다는 주장은 이 표본에서 재현되지 않아 쿼리 구조는 유지한다. 대용량·동시 부하 성능을 보증하는 결과는 아니다.
4. 상세 공유 잠금: 활성 사용자→다이어리→멤버십 잠금으로 권한 확인과 응답 스냅샷의 일관성을 보장하는 기존 정책을 유지한다. FOR SHARE는 쓰기/튜플 비용과 PATCH·탈퇴 대기를 유발할 수 있다. 실제 두 GET 병행, 비활성화·삭제·권한 회수 대기, PATCH 경합을 포함한 PostgreSQL 16개를 재검증했다. 운영 대기시간·처리량 부하 측정은 미수행이다.

### 이번 로컬 회귀

- 일반 backend test: 256개 통과, 조건부 DB 86개 건너뜀, 실패/오류 0개.
- PostgreSQL 회원 생성·목록·이력 전환 44개 + 상세·권한·잠금 16개 = 60개 전부 통과. 원본이 아닌 기존 격리 복제 DB의 전용 스키마를 사용했다.
- 시작 스크립트 회귀 15개, preflight 회귀 21개 통과. 누락 지원 파일을 감지하며 기존 DB·프로세스는 변경하지 않는다.
- 프런트 회원/인증/알림 경계 및 새 Spring 회원 계약을 포함한 집중 회귀 29개 통과.
- 실제 PostgreSQL+최신 격리 API+기존 웹 번들의 Edge QA 통과: Unicode 제목 생성, 동일 키 재시도, PATCH 뒤 지연 GET, ÉÄ/éä 인증 검색, 커서 순회, 새 기기 발견, 폰 화면과 기기 문서 보존. 첫 실행은 QA 제목이 24자 입력 한도를 넘어 실패했으며 제품 코드를 바꾸지 않고 QA 제목을 줄여 전체 흐름을 재실행했다. 이번에는 앱 제품 코드가 바뀌지 않아 web/iOS 번들을 다시 export하지 않았다.
- 최종 원본 API health 200, 7개 테이블 전체 지문 동일, 비공개 파일/기존 jar 해시 동일, 복원 파일 1,545개 해시 일치, 테스트 스키마 잔존 0개. 이번 격리 API만 종료했으며 원본 PostgreSQL/API PID는 유지했다.

229·230 정책/화면 합의와 실기기 QA는 여전히 별도 미완료 사항이다. 이번 변경은 로컬 미커밋이며 커밋·푸시·병합·Jira 상태 변경을 수행하지 않는다.
