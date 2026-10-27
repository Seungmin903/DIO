# 알림 최종 선별·통합 검증

현재 제출 기준 develop: `5fef35ae09d193f6017409751e8f7ff0655ab64e`.

2026-10-27 최신 기준 갱신: develop `5fef35ae09d193f6017409751e8f7ff0655ab64e`를 별도 전용 작업 폴더 `.worktrees/notification-latest-submission`, 브랜치 `codex/notification-api-integration`에 반영했다. docs/색인.md의 인증·회원 구조 항목과 알림 항목을 모두 보존했다. 최신 기준 BE 실행: 총152개 중144통과·8조건부 제외·실패0(기본 알림17개 포함). 별도 계약 실행의 Spring 생산자1개+FE 소비자8개도 통과했다. 아래 기존 FE53·웹 번들·브라우저 QA와 기준 대조는 이전 `0d0af5a` 사본의 이력이며 이번에 반복하지 않았다. 알림 제품 코드·테스트·FE 의존성은 바꾸지 않았다. 원본 BE·FE·248 작업은 보존했으며 이 작업에서 커밋·푸시·MR 생성·병합을 실행하지 않았다.

## 이전 통합 검증 이력 (기준 0d0af5a)

알림만 담은 통합 사본과 적용 패치를 만들고 같은 사본에서 검증했다. 기존 BE/FE 브랜치를 전환·병합·스테이징하지 않았다. 이 결과는 로컬 제출 후보 검증이며 원격 MR/CI/승인을 의미하지 않는다.

## 이전 결과물 (보존 자료)

- 통합 사본: `C:/Users/SSAFY/Documents/ChatGPT/자율프로젝트 2/tmp/notification-final-selection-1793075072/candidate`
- 적용 패치: `C:/Users/SSAFY/Documents/ChatGPT/자율프로젝트 2/tmp/notification-final-selection-1793075072/notification-only.patch`
- 파일별 기준/결과 SHA-256: `C:/Users/SSAFY/Documents/ChatGPT/자율프로젝트 2/tmp/notification-final-selection-1793075072/manifest.json`
- 변경 파일만 담은 소스 묶음: `C:/Users/SSAFY/Documents/ChatGPT/자율프로젝트 2/tmp/notification-final-selection-1793075072/notification-only-files.zip`
- 선별 대상 55개 경로. 실제 변경 수와 해시는 manifest를 따른다. 생성된 빌드·로그·화면 자료·node_modules는 패치/소스 묶음에서 제외한다.

## 포함 범위

| 구분 | 선별한 내용 |
|---|---|
| BE 제품 코드 | 알림 패키지 기본12개 클래스: 목록·카운트·개별 읽음·삭제, 검증 principal 경계, 초대 조회 인터페이스, DTO·오류·OpenAPI |
| BE 회귀 | NotificationCoreApiTests10개, 독립 삭제3개, 초대 인터페이스3개, 실제 Spring 응답 생산자1개 및 최소 H2 fixture |
| FE | notifications 하위 코드, 알림 Node 회귀8개 파일, 브라우저 기능/접근성 QA, Spring 계약 실행 스크립트 |
| 공통 파일 | package.json의 알림 script만, 최신 한국어 색인과 디자인 가이드의 알림 단락만 |
| 문서 | 현재 HTTP 계약·오류·종류·경합·접근성·삭제 격리, 이 보고서와 MR 초안 |

BE의 혼합 NotificationContract/NotificationApiTests/이벤트·watermark 회귀는 복사하지 않았다. 그중 기본4개 API의 기존 검증10개를 독립 NotificationCoreApiTests로 분리했으며 원본 혼합 테스트는 보존했다. 일반 테스트는 최소 users/notifications fixture와 ddl-auto=none을 사용한다.

서버 read-watermarks/read-all Controller·서비스·저장소·신규 migration과248 이벤트·receipt는 제외했다. 기존 목 readAll과 동일 ID 경계 재시도는 유지한다. 서버 어댑터는 readAll을 제공하지 않아 canReadAll=false이며 모두 읽음 버튼도 노출하지 않는다.

인증 코드는 기준 develop 그대로 유지한다. NotificationUserPrincipal은 테스트/호출자용 검증 경계이며 JWT 매핑은 구현하지 않았다. 실제 앱의 인증 흐름·공유 API·224 최종 배치는 연결하지 않았다.

## 통합 과정에서 반영한 사항

- qa/run-notification-contract.ps1의 기본 경로를 같은 checkout의 ../backend로 수정했다. 원래 분리 작업 폴더에서는 -BackendRoot로 명시한다.
- 기능/접근성 브라우저 QA는 같은 .expo/notification-web 번들을 기본으로 사용하도록 맞췄다.
- 최신 develop의 App.js·package 의존성·lockfile·backend build.gradle·회원/인증·다이어리·테이프·사진 모양 변경을 보존했다. 새 script 때문에 기존 auth/diary test script를 덮어쓰지 않았다.
- 전체 backend 최초 실행은 사본에서 누락한 .gitlab-ci.yml/infra 입력 때문에 배포 테스트3개가 실패했다. 기준 develop 파일을 그대로 복구한 후 전체 재실행이 성공했다. 제품 코드를 수정하거나 해당 테스트를 제외하지 않았다.

## 이전 검증 결과

| 명령/검증 | 최종 결과 |
|---|---|
| backend: ./gradlew.bat test --offline --console=plain | 총147개: **139통과, 8조건부 제외, 실패0**. 기본 알림17개 포함 |
| frontend: package.json의 test:notifications와 같은 node --test 명령 | **53통과**, 실패/제외0 |
| frontend: ./qa/run-notification-contract.ps1 (BackendRoot 생략) | **Spring1+FE8 통과**, 현재 실행 UUID의 응답 파일 사용 |
| OpenAPI 실제 출력 점검 | 기본4개 operation 존재, read-watermarks/read-all 경로 부재 |
| EXPO_PUBLIC_DIARY_SOURCE=mock-library, expo export --platform web --dev --max-workers 2 --output-dir .expo/notification-web | 성공 |
| node qa/notification-browser.cjs | Edge1280×800/412×892 통과, pageerror0 |
| node qa/notification-a11y-browser.cjs | 844×390/667×375/568×320/412×892/1280×800 통과, pageerror0 |
| 기준 파일 대조 | baseline1123개 점검, 보호 대상118개 동일. 인증·다이어리·infra·기존 migration·App·build·lockfile 변경 없음 |

브라우저 QA는 목 화면의 읽음·삭제·초대 이동 조건·전체 읽음 유실 재시도·새 도착 보존·계정 전환과 로딩/오류/빈 목록·키보드·44px·가로 넘침·목록 스크롤을 확인했다. 서버 버튼 부재는 같은 패널을 RN Web으로 렌더링한 Node 회귀에서 확인했다.

알림 계약 API의 인증401은 검증 principal 주입/부재를 사용하는 테스트 결과다. 실제 JWT·개발 서버·공유 상세·PostgreSQL/Flyway 적용·VoiceOver/TalkBack·네이티브 기기·배포·원격 CI는 미검증이다. 조건부 제외8개는 기존 DB/환경 전용 테스트이며 해당 XML에 기록돼 있다.

## 재현과 제출

통합 사본 backend에서 위 Gradle 명령을 실행하고, frontend에서 package.json의 test:notifications 및 test:notifications:contract를 실행한다. Java17/Node·의존성이 필요하다. 이번 로컬 검증은 기존 설치 node_modules를 junction으로 사용했으며 의존성/lockfile 자체는 기준 develop 그대로다. 패치/zip에는 이 연결이 포함되지 않는다.

패치는 명시한 기준 develop에서 git apply --check로 확인한 뒤 적용하는 파일이다. 다른 브랜치나 다른 작업이 섞인 디렉터리에 바로 적용하지 않는다. 실제 제출 시 전용 기능 브랜치에 이 변경만 반영하고 기준 갱신·리뷰 승인·필수 CI·Squash 조건을 확인해야 한다. 커밋·푸시·MR 생성·병합은 수행하지 않았다.

## 현재 제출 자료와 재현

현재 패치·zip·manifest·제출 준비 보고서·MR 초안은 `C:/Users/SSAFY/Documents/ChatGPT/자율프로젝트 2/tmp/notification-latest-develop-20261027-135443`에 새로 생성한다. 산출물 해시는 같은 폴더의 manifest와 제출 준비 보고서를 따른다. 이전 자료는 덮어쓰지 않는다. 최신 BE는 backend에서 `./gradlew.bat test --offline --console=plain`, Spring→FE 계약은 frontend에서 `./qa/run-notification-contract.ps1`로 검증했다. 새로운 폴더에는 node_modules junction을 복사하지 않았다. 원격 CI·실제 PostgreSQL/Flyway·JWT·공유 서버·기기/보조기술·배포는 계속 미검증이다.
