# 알림 통합 범위와 연결 조건

현재 제출·리뷰·검증 이력은 [MR !164](https://lab.ssafy.com/s15-final/S15P31F106/-/merge_requests/164)에서 관리한다. 기존 기반 MR !159는 !164로 대체되어 종료되었다. 이 문서는 지속적으로 필요한 구현 경계와 연결 조건만 기록한다.

## 포함 범위

- 목록·전체 미읽음 수·개별 읽음·삭제의 기본 4개 API, 검증 principal 경계, 초대 조회 포트, DTO·오류·OpenAPI.
- 서버 응답 어댑터와 공통 알림 상태, 오류·경합·종류별 문구·접근성 처리. 기존 목 화면 동작은 유지한다.
- 기존 notifications 테이블만 사용한다. 기존 로그인 검증을 알림 전용 보안 체인에서 재사용하며 다이어리·펜·기존 migration·의존성/lockfile은 변경하지 않는다. backend/build.gradle은 기존 격리 PostgreSQL 잡에 알림 스키마 회귀를 포함하도록 테스트 필터만 확장한다.
- 서버 전체 읽음·watermark·초대 이벤트·receipt와 신규 migration은 포함하지 않는다. 서버 모드는 모두 읽음 버튼을 숨긴다.

## 인증과 공유 연결

- NotificationUserPrincipal은 검증된 수신자 ID만 받는 경계다. 기존 로그인 JWT·활성 세션 검증 후 매핑한다. 임의 사용자 헤더로 우회하지 않으며 누락·변조·만료·로그아웃/탈퇴 세션은 401이다.
- 기본 App의 일반 로그인 알림은 실제 서버 모델을 사용하고 방문자·미리보기는 목을 유지한다. 실제 공유·실기기 QA가 끝날 때까지 Draft를 유지한다.
- InvitationLookup.findForRecipient(recipientUserId, notificationIds)는 반환 페이지의 ID를 최대 100개까지 한 번에 받는다. 다음 페이지 존재 판정용 추가 행은 전달하지 않는다. 공유 구현은 수신자 권한·현재 초대 상태를 일괄 조회하고, 없는/접근 불가한 ID는 Map에서 제외한다. 빈 페이지는 포트를 호출하지 않는다.
- 공유 포트가 없거나 결과에 ID가 없으면 invitation=null이다. 실제 공유 조회는 미연결이며 초대 수락·거절을 수행하지 않는다.
- 공유 모듈을 연결할 때 실제 DB 쿼리 수·응답 시간을 측정한다. 포트의 일괄 호출 검증을 실제 DB 일괄 조회·성능 검증으로 해석하지 않는다.

## HTTP와 검증 경계

프런트는 URLSearchParams에 의존하지 않고 각 query 키·값을 encodeURIComponent로 직렬화한다. null/undefined는 생략하고 cursor·limit·특수 문자를 보존한다. 네이티브 호환성 회귀는 URLSearchParams 사용 불가 조건을 포함하지만 실제 Hermes·실기기 검증을 대신하지 않는다.

V1 및 최신 migration 전체의 Repository SQL 회귀를 별도로 유지한다.

계약·재현 명령은 [HTTP 연결](./notification-http-integration.md), [Spring 계약 회귀](./notification-spring-contract-regression.md), [삭제 격리](./notification-delete-isolation.md)를 따른다. 현재 실행 결과와 기준 SHA는 MR에 기록한다. 로그인 통합과 남은 공유·실기기 범위는 [로그인 연결과 QA](./notification-auth-integration.md)를 따른다.
