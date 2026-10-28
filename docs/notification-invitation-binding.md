# 초대 알림 연결 준비와 공유 API 의존성

관련 Jira: 244·245·248·250·251. 2026-10-28 원격 develop `ea04571` 기준.

## 확인한 작업 범위

- 최신 원격 develop의 공유/초대 서버 코드는 아직 없으며 InvitationLookup 인터페이스만 존재한다. 공개 원격 브랜치에서 이름에 invit/shar가 포함된 브랜치는 확인되지 않았다. 다른 이름의 미공개 작업 존재 여부는 확정하지 않는다.
- 공유 담당 Jira 329·330·332·333은 진행 중이며 조회 당시 본문·댓글에 경로/DTO 계약은 없었다. 링크 생성과 수락은 이 담당 범위를 유지한다.
- 다른 활성 세션 「알림 API·프런트 통합 이어가기」는 회원 목록·일괄 휴지통 MR !194 작업 중이다. 그 작업 폴더 및 App.js는 변경하지 않는다.
- 기존 notification-backend의 전체 읽음·초대 이벤트 미커밋 준비 코드는 보존한다. 현재 V2/V3 준비 migration을 최신 develop에 복사하거나 실행하지 않는다.

사용자와 확인하여 공유 담당 API 의존 부분은 이번 구현에서 제외했다. 따라서 실제 초대 발생→알림 생성→수락/거절 종단 완료가 아니다.

## 이번 연결 코드

AuthenticatedNotificationProvider에 안정적인 createInvitations factory를 전달하면 생성된 gateway가 알림과 같은 HTTP transport를 사용할 수 있다. factory 입력은 `{ transport }`, 반환 객체는 `{ get(inviteId, { signal }) }`이다. transport는 로그인 서비스의 API 주소·인증 헤더·토큰 갱신을 사용한다. 호출 경로와 DTO 변환은 공유 담당이 확정한 어댑터가 책임진다.

factory는 알림 세션마다 생성한다. factory 함수 참조는 호출자가 안정적으로 유지해야 불필요한 목록 초기화를 피할 수 있다. 기존 직접 invitations 주입은 테스트/호환 경계로 유지한다. 미주입 상태는 기존 INVITATION_NOT_CONNECTED 안내를 유지한다.

factory는 동기 함수로 get 메서드를 제공하는 gateway를 반환해야 한다. 생성 예외·잘못된 반환값·async factory는 미연결 gateway로 격리하여 기본 알림 조회를 유지한다. 잘못된 async factory의 Promise rejection도 처리하며 내부 오류 본문을 UI에 노출하지 않는다. 설정 수정 후 새 factory 참조 또는 새 로그인 세션으로 gateway를 재생성한다.

초대 조회 전후에 로그인 세션 키와 AbortSignal을 확인한다. 계정 전환·같은 계정 재로그인·취소 뒤 도착한 이전 조회 결과는 반환하지 않는다. factory를 통한 HTTP 요청에는 기존 userId/sessionKey 기반 토큰 검증도 적용된다.

AuthenticatedNotificationDialog의 onInvitationReady를 NotificationPanel로 전달한다. 공유 담당이 실제 화면 처리 callback을 제공하면 기존 store가 이동 직전에 같은 inviteId·PENDING·canOpen===true를 재확인한 뒤 상세를 전달한다. 실제 App.js에는 아직 factory와 callback을 주입하지 않는다. 목 공유 화면으로 일반 로그인 사용자를 이동시키지 않는다.

## 실제 연동에 필요한 계약

1. **244:** 현재 공유 작업은 링크 초대 중심이다. LINK 생성만으로 특정 수신자 알림을 만들지 않는다. DIRECT 초대 또는 명확한 수신자 이벤트가 실제 제공되는지 먼저 합의한다. 이 원칙은 합의 전 제안이며 이번 작업으로 팀 합의를 완료 처리하지 않는다.
2. **248:** 이벤트 생산자·수신자·고유 이벤트 ID·전달/재시도 보장과 취소/만료 경합의 트랜잭션 경계를 확정한다. 기존 준비 코드를 확인해 중복 구현 없이 통합한다.
3. **245:** 알림 ID→초대 ID 명시적 참조 및 수신자 권한을 확인하는 일괄 InvitationLookup 구현이 필요하다. payload_json이나 diaryId로 초대를 추정하지 않는다. 링크 토큰을 알림 응답에 노출하지 않는다.
4. **250:** 수신자용 ID 기반 상세 경로·응답 DTO와 실제 초대 처리 화면 callback이 필요하다. `/invites/{token}`의 token과 inviteId를 동일하게 간주하지 않는다. 전체 미읽음 수를 유효 초대 빨간 점으로 바꾸지 않는다.
5. **251:** 계정 A→B 초대 도착·조회·수락/거절·취소·만료·이미 참여·권한 회수, 중복 이벤트 및 로그아웃 중 지연 응답을 실제 공유 서버로 검증한다. iPad/Android의 빌드 ID·기종/OS·서버 환경·시각과 결과를 기록한다.

## 회귀 검증

frontend의 test:notifications에 포함되는 notification-auth-session.test.js에 공유 factory의 인증 transport/토큰 갱신/AbortSignal 전달, 계정 교체 후 지연 응답 및 옛 gateway 차단, 취소를 무시한 어댑터 결과 차단, 이동 직전 초대 취소, 정상 상세 재확인 후 callback 전달을 추가했다. 이 테스트의 공유 응답은 격리된 테스트 어댑터이며 실제 공유 서버 QA가 아니다.

2026-10-28 실행 결과:

- test:notifications의 8개 파일 + test:auth의 6개 파일 + member-notification-auth.test.js: 132개 통과, 실패/건너뜀 0개. 새 공유 연결 회귀 7개와 Provider/Dialog 전달 경계 회귀 2개 포함. 명령은 `node --test tests/notification-auth-session.test.js tests/notification-api.test.js tests/server-notification-api.test.js tests/notification-lifecycle.test.js tests/notification-integration.test.js tests/notification-presentation.test.js tests/notification-errors.test.js tests/notification-races.test.js tests/auth-api.test.js tests/auth-password-reset.test.js tests/auth-photo-native.test.js tests/auth.test.js tests/auth-state.test.js tests/auth-routing.test.js tests/member-notification-auth.test.js`.
- `node node_modules/expo/bin/cli export --platform web --output-dir .expo/notification-binding-web`: 성공.
- 최초 새 작업 폴더 검증에서는 loopback HTTP 연결 제한과 React 의존성 누락이 발생했다. 기존 설치 node_modules를 junction으로 참조하고 loopback 허용 환경에서 위 검증을 다시 실행했다. 패키지/lockfile 및 기존 설치 의존성 파일을 변경하지 않았다.
- 실제 공유 서버 API·이벤트 생산자·수락/거절 화면 및 iPad/Android 종단 QA는 미검증이다. 244의 팀 합의와 245·248·250·251의 전체 완료를 선언하지 않는다.

원본 QA DB·비공개 설정을 사용하지 않는다. backend 및 migration은 변경하지 않는다. 제출 범위는 이 연결 준비 변경으로 제한한다.
