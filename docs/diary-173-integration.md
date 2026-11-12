# !173 영구 삭제 통합 사본

2026-10-28. 작업 폴더 `.worktrees/diary-contract-integration`, 브랜치 `feature/common/diary-contract-integration`.

## 기준과 보존

- !173 최신 `1cbc767c1203396e5a25ee8b0e8c9a9e84a4be6b`, 비교 기준 `c4531fca3ba0acb49e685fcd0b87be8e222c5acb`의 8개 경로 중 신규 5개를 가져오고 예외 처리·Gradle·색인은 현재 사본에 맞게 선별 연결했다.
- 기존 !166 P0·P1, develop `514261576add618a97b47de703ac8b33b6962cc2`, !172 `fa6099dffeee92263e1c2a869ef075a3ea4980a9`의 내용과 검증 이력은 [!166 보고서](./diary-166-p0p1-integration.md), [!172 보고서](./diary-172-integration.md)에 유지한다.
- 내용만 통합했다. HEAD `3b270da3663700147ef686b0fcab12f099858b91`와 index를 유지하며 merge/cherry-pick/commit/push/MR 수정·닫기·병합은 하지 않는다. 제출 시 이력 연결은 별도 승인 이후 진행한다.
- 원본 9개 작업 폴더와 248·다른 세션 자료는 수정하지 않는다. V1~V12 SQL을 보존하고 V13만 추가한다. 앱/의존성 파일을 통째로 복사하지 않는다.

## 완료 계약

`DELETE /api/v1/member/diaries/{UUID}/purge`, body·query 없음, `204` 빈 본문과 `Cache-Control: no-store`.

- 활성 로그인 세션 + 일치하는 OWNER만 실행한다. 활성 EDITOR 403, 비참여·VIEWER·탈퇴·불일치 OWNER·미확인 ID 404, 무효 세션/비활성 계정 401, 활성 다이어리 409.
- 기간과 관계없이 휴지통 자료만 수동 영구 삭제한다. 휴지통 목록은 `canPermanentlyDelete` 필수 boolean과 기존 문자열 version·복원 기한을 제공한다.
- 기존 !173의 페이지·요소·획·캔버스 이력·초대·멤버십·다이어리 미디어/폰트 연결 정리를 하나의 트랜잭션으로 수행한다. 알림 행은 유지하고 대상 FK·payload를 비운다. 다른 다이어리의 대상 페이지 포인터만 해제한다.
- 생성 키·요청 hash·완료 표식은 보존하고 응답/diary FK만 비워 동일 생성 키의 재생성을 막는다.
- V13 `diary_purge_receipts`의 원래 소유자·대상 UUID·최초 완료 시각과 삭제를 원자적으로 커밋한다. 소유자 동일 ID 재요청은 204, 완료 시각 불변. 잠금 대기 중 삭제가 끝나도 완료 기록을 재확인한다. 타인은 기록을 사용할 수 없다.
- 공용 `media_files` 원본·파생·폰트·AI 작업·외부 객체는 단독 참조처럼 보이는 경우에도 보존한다. 물리 GC·자동 만료 삭제(!174)는 제외한다.
- FE는 명시적 권한 버튼과 공용 확인창을 사용한다. 취소는 요청 없음, 중복 탭 결합, 응답 유실/503은 같은 ID 재시도, 성공 후 조회 실패는 DELETE 없이 조회만 재시도한다. 401/403/404/409는 쓰기 재시도를 멈추고 최신 상태를 조회한다. 지연 GET·로그아웃 응답 방어와 기기/다른 계정 문서 보존을 유지한다.
- 복원·영구 삭제 버튼은 기존 디자인 가이드의 최소 44px를 적용한다.

## 검증

최종 결과: 실패·오류·조건부 제외 없이 아래 범위를 통과했다. 실행 증적은 워크스페이스 `tmp/diary173-integration/`에 보존한다.

| 검증 | 결과 | 증적 |
|---|---|---|
| H2 실제 JWT·활성 세션 HTTP | 영구 삭제 5 + 기존 휴지통/복원 10 = **15 통과** | backend-http-final.log, final-http-results/ |
| PostgreSQL 17·전체 Flyway V1~V13 | 그래프/롤백/미디어/경합 7 + 실제 HTTP 5 = **12 통과**, skipped 0 | postgres.log, final-pg-results/ |
| FE 영향 회귀·실제 Spring 휴지통/영구 삭제 응답 소비 | **49 통과** | frontend-final.log |
| Expo 웹 번들 | 성공 | web-build.log |
| Edge 영구 삭제 QA | 1280×800·1024×768·412×892·667×375, 모두 pageerror 0 | browser-purge.log, frontend/qa/.out/member-purge/ |
| Edge 기존 휴지통·복원 회귀 | 같은 4개 크기, 모두 pageerror 0 | browser-trash.log |
| CI 설정 정적 검사 | YAML 파싱, Bash 문법 확인. postgresDiaryPurgeTest 전용 DB/실행 및 JUnit·보고서 경로 연결 | .gitlab-ci.yml, infra/scripts/test-auth-postgres.sh |

PostgreSQL 검증은 임시 루프백 클러스터·임의 스키마를 사용했고 해당 서버를 종료했다. 개발/공유 서버를 사용하지 않았다. 정상 삭제 및 반복·동시 삭제, 복원 우선/삭제 우선, 생성 재전송과의 잠금 순서, 늦은 FK 오류 시 완료 기록까지 롤백하는 경우를 포함했다. 검증 중 찾은 동시 요청 404와 버튼 40px는 수정 후 통과했다. 초기에 테스트 수정 오류 및 병렬 Gradle 산출물 경합이 있었으며 최종 H2 검증은 PostgreSQL 실행 종료 후 순차 재실행했다.

재현: backend에서 `gradlew.bat test --tests '*MemberDiaryPurgeHttpTests' --tests '*MemberDiaryTrashHttpTests'`, 명시적 폐기용 `dio_trash_qa` DB 환경에서 `gradlew.bat postgresDiaryPurgeTest`. 해당 Spring 응답 파일을 생성한 뒤 frontend에서 `node --test tests/member-diary-api.test.js tests/member-app-store.test.js tests/member-diary-lifecycle.test.js tests/member-diary-purge.test.js tests/member-editor-docs.test.js tests/trash-lifecycle.test.js`를 실행한다. 공유 산출물 충돌을 피하도록 같은 checkout의 Gradle 실행은 순차로 한다.

원본 보존 대조: 9개 중 8개는 HEAD·브랜치·index·파일 해시·상태 동일. `diary-purge-integration`은 다른 세션에서 28개 경로와 index가 변경되었으며 HEAD는 1cbc767 그대로였다. 그 변경을 되돌리거나 복사하지 않았다. 변경된 원본과 통합 파일의 동일 파일 여부도 모두 false다. 이 사본의 HEAD·브랜치·index와 V1~V12는 시작 상태 그대로 유지했다. 자세한 증거는 preservation-before.json / preservation-after.json / preservation-audit.json에 있다. 완료 직전 원격 !173도 1cbc767 유지 확인.

## 미검증·제외

원격 CI·Docker CI 컨테이너 실행·공유/개발/운영 DB·실제 객체 저장소·실기기·VoiceOver/TalkBack·배포는 검증하지 않았다. 브라우저는 실제 Spring 응답을 사용하는 격리 HTTP 시나리오이며 실행 중인 공유 서버와의 종단 테스트가 아니다. 초대/공유 쓰기 API·자동 만료 배치·미디어 GC는 후속 범위다. 데이터 영구 삭제 자체는 애플리케이션 되돌리기로 복구할 수 없다.

후속 CI 보완은 [다이어리 통합 CI 보완](./diary-ci-integration.md)에 기록했다. 위 수치와 당시 미검증 이력은 유지한다.
