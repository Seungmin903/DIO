# 다이어리 통합 CI 보완

2026-10-28. 별도 통합 사본 `.worktrees/diary-contract-integration`에서만 작업했다. 기존 [!166 계약](./diary-166-p0p1-integration.md)·[!172 휴지통](./diary-172-integration.md)·[!173 영구 삭제](./diary-173-integration.md)의 계약과 검증 이력은 유지한다.

## 반영한 변경

- 최신 develop `4cd34b2fa47955bbe784d168b1e30df608124640`의 카드 액션 boxShadow 한 부분만 반영했다. 통합 사본의 휴지통 44px 버튼과 다른 변경을 보존했다. 내용 통합이며 HEAD 이동·merge·commit은 하지 않았다.
- 회원 응답 생산자 3개(`member-diary-http.json`, `member-diary-trash-http.json`, `member-diary-purge-http.json`)를 Gradle test 출력으로 등록했다. 출력이 없어지면 재사용 작업 공간에서도 UP-TO-DATE로 생략되지 않는다. backend-test가 `backend/build/contracts/`를 artifact로 전달한다.
- 새 `diary-fe-contract-test`는 backend-test의 artifact를 명시적으로 받는다. 두 job이 같은 changes 목록을 사용하므로 FE 계약 코드·테스트·실행기·package.json·lockfile 변경만 있어도 생산자와 소비자가 함께 선택된다. 기존 알림 CI·배포 입력 마운트는 유지했다.
- 소비 실행기는 누락·손상된 JSON을 실패와 JUnit으로 기록한다. 실제 Spring 응답의 생성·조회·수정·휴지통·복원·영구 삭제, 오류·권한·version·재시도·지연 응답 계약을 소비한다. 테스트를 skip해 성공시키지 않는다.
- 간접 React 참조가 있어 무설치 실행으로 가정하지 않는다. CI에서는 package.json의 `pnpm@11.25.0`과 고정 lockfile로 의존성을 설치하고 lifecycle scripts는 실행하지 않는다. 비특권 Docker 사용자의 npm/pnpm 캐시는 `/tmp`를 사용한다. 이 작업에서 원본 설치 폴더나 통합 사본의 node_modules junction, package.json·lockfile은 변경하지 않았다.
- 새 `postgresMemberDiaryHttpTest`는 명시적인 루프백 `dio_member_contract_qa` DB에서 실제 회원 HTTP 24개를 실행한다. `postgresDiaryTrashTest`는 휴지통 HTTP 10개를 추가로 선택하고 opt-in을 설정한다. 기존 영구 삭제 PostgreSQL HTTP 연결은 유지한다.
- CI 셸이 새 폐기용 DB를 생성하고 인증/회원 서비스→회원 HTTP→휴지통/영구 삭제 태스크를 순차 실행한다. 같은 backend 빌드 디렉터리의 동시 쓰기를 만들지 않는다. 실제 개발/공유 DB로 대체하지 않는다.
- 휴지통·영구 삭제 JUnit glob을 각각의 YAML 항목으로 고치고 새 회원 HTTP 보고서도 연결했다. 별도 JUnit 경로는 6개다. 기존 배포 CI 계약 테스트도 새 명령과 DB 분리에 맞춰 갱신했다.

## 영향 검증

| 검증 | 결과 |
|---|---|
| H2 실제 Spring 응답 생산자·기존 배포 CI 회귀 | 24 + 10 + 5 + 3 = **42 통과**, 실패·제외 0 |
| 새 PostgreSQL CI 태스크 | 회원 HTTP 24 + 휴지통 HTTP 10 + 기존 휴지통 11 = **45 통과**, 실패·제외 0 |
| 실제 Spring→FE CI 소비 실행기 | **40 통과**, 실패·제외 0; JUnit 생성 |
| 별도 소비 사본 | 실제 React 19.3.0만 제공하고 Expo 없이 40개 통과. 공유 node_modules 사용 없음 |
| 필수 artifact 부정 검증 | 파일 누락·손상 JSON 모두 실행기 종료 실패 및 실패 JUnit 확인 |
| CI 구조 | 생산자/소비자 changes 일치·needs/artifact 연결·독립 JUnit glob 6개·package/lockfile specifier 일치 확인 |
| GitLab CI Lint | 로컬 변경 YAML로 서버 검증, valid=true·오류/경고 0. 파이프라인 생성은 하지 않음 |
| Expo 웹 번들·회원 화면 | 번들 성공. 1280×800·1024×768·412×892·667×375 QA 통과, pageerror 0 |
| 셸 문법·diff | CI 셸 2개 Bash 문법 확인, git diff --check 통과 |

증적은 워크스페이스 `tmp/diary-ci-final-review/`에 보존한다. HTTP·PostgreSQL JUnit 사본, 소비자 JUnit·실패 로그, GitLab Lint 응답, 브라우저 결과를 포함한다. PostgreSQL은 별도 임시 클러스터와 무작위 스키마를 사용하고 해당 서버를 종료했다. 변경하지 않은 영구 삭제 경합·미디어 보존 등의 앞선 12개 PostgreSQL 검증은 불필요하게 반복하지 않았다.

## 실행·남은 범위

backend에서 `gradlew.bat test --tests '*MemberDiaryHttpTests' --tests '*MemberDiaryTrashHttpTests' --tests '*MemberDiaryPurgeHttpTests' --tests '*DeploymentAuthContractTests'`로 응답을 생산한다. frontend에서 `node qa/run-member-contract-ci.cjs`로 소비한다. CI 설치를 포함한 경로는 frontend에서 `sh qa/run-member-contract-job.sh`다.

PostgreSQL 태스크에는 정확한 폐기용 DB URL·계정 환경변수를 제공해야 한다. 회원 HTTP는 `dio_member_contract_qa`, 휴지통·영구 삭제는 `dio_trash_qa`를 사용한다. 휴지통·영구 삭제는 `DIO_LIST_QUERY_PG=true`도 필요하다. HTTP opt-in은 전용 태스크가 설정한다.

Docker 엔진 부재로 실제 Docker 래퍼·Node Alpine의 네트워크 의존성 설치·GitLab runner 파이프라인은 실행하지 않았다. 설치 옵션과 package/lockfile 일치 및 실제 React 소비는 로컬 검증이며, 원격 CI 성공으로 표현하지 않는다. 공유/개발/운영 서버·실기기·VoiceOver/TalkBack·배포·자동 만료 삭제·미디어 GC·248은 기존 제외 범위를 유지한다.

원본과 다른 세션의 진행을 되돌리지 않는다. 커밋·푸시·MR 생성/닫기/병합은 하지 않았다. HEAD·브랜치·index와 기존 migration, 보호 파일 보존 여부는 실행 증적의 before/after 및 preservation-audit.json을 기준으로 기록한다.
