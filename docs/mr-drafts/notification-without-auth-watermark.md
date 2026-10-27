# MR 설명 초안

제목: `feat(notification): 알림 기본 API와 공통 프런트 상태 연결 [S15P31F106-249]`

대상: develop. 현재 기준 `5fef35ae09d193f6017409751e8f7ff0655ab64e`. 브랜치 `codex/notification-api-integration`, 작업 폴더 `.worktrees/notification-latest-submission`. 원격 MR은 이 작업에서 생성하지 않았다. [최종 선별·검증 보고서](../notification-final-selection.md)에 최신 기준과 이전 검증 이력을 구분했다. 실제 MR 본문에는 제출 브랜치의 보고서 blob 링크를 사용한다.

## 관련 이슈

- 대표 Jira: https://ssafy.atlassian.net/browse/S15P31F106-249
- 함께 다루는 범위: [244 API 계약](https://ssafy.atlassian.net/browse/S15P31F106-244), [245 저장/조회 기반](https://ssafy.atlassian.net/browse/S15P31F106-245), [246 목록·개별 읽음](https://ssafy.atlassian.net/browse/S15P31F106-246), [247 중 삭제](https://ssafy.atlassian.net/browse/S15P31F106-247), [250 공통 상태/복귀](https://ssafy.atlassian.net/browse/S15P31F106-250), [251 중 인증 제외 회귀](https://ssafy.atlassian.net/browse/S15P31F106-251).
- 최신 제공 API PDF의 기본4개 API 경로를 기준으로 한다. 위 태스크 전체의 완료/자동 종료를 의미하지 않는다.248은 다른 세션 범위로 제외한다.

## 작업 내용

목 화면과 서버 응답 형식의 차이를 서버 어댑터에서 처리하고 목록·미읽음 수·개별 읽음·삭제를 한 세션의 공통 store로 제공한다. 앱 복귀 시 갱신하며 조회 실패·동시 요청·계정 종료의 지연 응답에서도 기존 목록과 카운트를 일관되게 유지한다.

초대 알림은 상세 조회 후 이동 직전에 같은 inviteId·PENDING·canOpen=true를 확인한다. 일반/미지원 알림은 일반 문구와 읽음·삭제를 제공한다.401/403/404와 서버·네트워크 오류별 안내/재시도, 로딩·빈 목록 접근성과 폰 가로 화면을 보강했다.

서버 전체 읽음과 watermark 호출은 제외했다. 지원 여부에 따라 서버의 모두 읽음 버튼을 숨기고 기존 목 전체 읽음·동일 경계 재시도는 유지한다. 실제 JWT·공유 API·최종224 화면 연결은 후속이다.

## 주요 변경과 데이터 영향

- API: GET /api/v1/notifications, GET /api/v1/notifications/unread-count, PATCH /api/v1/notifications/{notificationId}, DELETE /api/v1/notifications/{notificationId}.
- 개별 읽음은 body 없음·200 DTO, 삭제는204이며 반복 삭제 때 최초 삭제 시각을 유지한다. 이전 /{id}/read 경로는 제공하지 않는다.
- 문자열 BIGINT·nullable/required·오류 코드·프레임워크 code 부재·OpenAPI를 실제 Spring 응답과 대조한다.
- 삭제 전용 서비스는 watermark 저장소 없이 동작한다. 기본 H2 테스트도 users/notifications만 명시적으로 생성하며 Hibernate DDL을 끈다.
- 기존 notifications.deleted_at만 사용한다. 신규 migration·데이터 변환은 없고 회원·초대·다이어리 원본을 삭제하지 않는다. 되돌릴 때도 DB migration 복구는 필요하지 않는다.
- watermark V2·248 receipt V3/이벤트·JWT 연결은 포함하지 않는다. 기준 develop의 기존 인증/배포/migration/build/lockfile을 유지한다.
- 공통 파일은 알림 scripts와 한국어 문서 색인/디자인 가이드의 알림 단락만 변경한다. App·다이어리·테이프·사진 모양 변경은 포함하지 않는다.
- 문서: notification-final-selection.md, notification-http-integration.md, notification-spring-contract-regression.md, notification-contract-comparison.md, notification-delete-isolation.md 및 오류·종류·경합·접근성 문서.

## 최신 기준 검증

2026-10-27 최신 기준 갱신: develop `5fef35ae09d193f6017409751e8f7ff0655ab64e`를 별도 전용 작업 폴더 `.worktrees/notification-latest-submission`, 브랜치 `codex/notification-api-integration`에 반영했다. docs/색인.md의 인증·회원 구조 항목과 알림 항목을 모두 보존했다. 최신 기준 BE 실행: 총152개 중144통과·8조건부 제외·실패0(기본 알림17개 포함). 별도 계약 실행의 Spring 생산자1개+FE 소비자8개도 통과했다. 아래 기존 FE53·웹 번들·브라우저 QA와 기준 대조는 이전 `0d0af5a` 사본의 이력이며 이번에 반복하지 않았다. 알림 제품 코드·테스트·FE 의존성은 바꾸지 않았다. 원본 BE·FE·248 작업은 보존했으며 이 작업에서 커밋·푸시·MR 생성·병합을 실행하지 않았다.

## 기존 통합 사본 검증 이력

아래는 이전 기준 `0d0af5a`의 **같은 통합 사본**에서 실행한 결과다. 최신 기준 결과는 위 절을 따른다.

문서 정정과 최신 기준 색인 결합 후 최종 산출물을 새로 만든다. 산출물 경로: `C:/Users/SSAFY/Documents/ChatGPT/자율프로젝트 2/tmp/notification-latest-develop-20261027-135443`. patch·zip·manifest·artifact-check는 로컬 검토 자료이며, 실제 MR에는 업로드한 자료 링크를 사용한다. 기존 산출물과 로그도 보존한다.

- backend `./gradlew.bat test --offline --console=plain`: 총147개 중139통과·환경/DB 조건8개 제외·실패0. 기본 알림17개 포함.
- frontend `test:notifications`와 같은 Node 명령:53통과.
- frontend `./qa/run-notification-contract.ps1`: 기본 같은-checkout 경로로 Spring1+FE8통과. 실제 OpenAPI에 서버 watermark/전체 읽음 경로 없음.
- `expo export --platform web --dev --max-workers 2 --output-dir .expo/notification-web`: 성공.
- Edge 기능 회귀1280×800/412×892, 접근성844×390/667×375/568×320/412×892/1280×800: 모두 통과, pageerror0.
- 확인 흐름: 목록/카운트·페이지 조회·읽음/삭제·오류복구·초대 이동 검증·목 전체 읽음 유실 재시도·새 도착 보존·계정 전환·키보드·빈 목록·스크롤. 서버 버튼 부재는 RN Web 패널 렌더링 회귀로 확인.
- 최초 전체 backend 실행의 배포 테스트3개 실패는 사본의 기준 CI/infra 파일 누락으로 발생했다. 원본 그대로 보완한 뒤 위 전체 검증이 통과했다.
- 미검증: 실제 PostgreSQL/Flyway·JWT·개발 서버·공유 서버·다중 기기·VoiceOver/TalkBack·네이티브 방향 전환·배포. 브라우저 결과를 실기기 검증으로 보지 않는다.
- CI: 원격 MR/파이프라인을 생성하지 않아 미확인.

## 화면 자료

최종 통합 사본 frontend/qa/.out/notification-a11y/의 568x320-error.png·412x892-empty.png와 frontend/qa/.out/notifications/의 폰/태블릿 결과를 검토 자료로 선별했다. 로컬 QA 산출물이며 외부 첨부는 하지 않았다. ignore 대상 원시 화면 자료는 소스 패치/zip에 포함하지 않는다.

보고서에 적은 patch·zip·manifest·화면 자료의 로컬 경로는 리뷰어가 접근할 수 있는 원격 첨부가 아니다. 실제 MR 작성 시 화면 자료를 첨부하고, 추가 검증 자료를 공유하면 업로드 결과 링크를 본문에 적는다.

## 리뷰어 참고

- 소유권·개별 읽음/삭제의 반복 요청·페이지 경계·문자열 식별자·nullable/required 구분을 확인해 주세요.
- 인증 개발은 기준 develop에 존재하지만 알림의 NotificationUserPrincipal/JWT 매핑은 연결하지 않았다. 임의 사용자 헤더나 테스트 토큰을 제품에 넣지 않았다.
- 초대 조회는 인터페이스만 제공하며 실제 공유 모듈이 연결되지 않으면 invitation=null/이동 불가로 처리한다.
- 기존 기능 브랜치 전체를 가져오지 않고 선별한 55개 경로와 위 문서 정정만 전용 브랜치에 반영했다. 원본 BE·FE 및248 작업은 보존했으며 스테이징·커밋·푸시·MR 생성·병합은 하지 않았다.

## 병합 전 확인

- [x] 제목·관련 Jira 범위와 실제 선별 목적을 정리했다.
- [x] watermark·인증 연결·248·다른 작업을 제외한 로컬 통합 후보를 만들었다.
- [x] 최종 후보의 BE/FE/계약·웹 회귀와 한국어 색인/가이드 갱신을 확인했다.
- [x] 데이터 영향과 미검증 범위를 기록했다.
- [x] 최신 develop `5fef35a` 위에 선별 변경을 반영하고 색인의 양쪽 항목과 BE·Spring 계약을 검증했다.
- [x] 최종 리뷰의 문서 문제 2건을 정정하고 링크·실행 경로·완료 상태와 제품 코드/원본 보존을 확인했다.
- [ ] 화면 자료를 실제 MR에 첨부했다.
- [ ] 작성자 외 최소1명의 승인을 받았다.
- [ ] must 의견·미해결 대화·충돌·필수 CI를 확인했다.
- [ ] develop 대상 Squash merge 조건을 확인했다.

커밋·푸시·MR 생성·병합은 수행하지 않았다.
