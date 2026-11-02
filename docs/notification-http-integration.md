# 알림 HTTP 연결

기존 목을 유지하며 서버 어댑터와 공통 상태를 제공한다. 기존 실제 로그인 JWT와 기본 앱의 로그인 알림 진입점을 연결한다. 실제 공유 gateway·수락/거절은 후속이다. 제출·실행 이력은 [MR !164](https://lab.ssafy.com/s15-final/S15P31F106/-/merge_requests/164)에서 관리한다.

```js
const model = useServerNotifications({
  sessionKey, // 계정 변경·로그아웃 때 변경
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL, // https://서버/api/v1
  getAccessToken, // 요청마다 최신 토큰, 갱신·저장은 인증 담당
  invitations, // 수신자 상세 get(inviteId, { signal })
});
```

상위 세션에서 한 번 호출해 NotificationPanel 등에 같은 model을 전달한다. getAccessToken과 invitations는 안정된 참조를 사용한다. 토큰 변경만으로 store를 재생성하지 않는다. 계정 변경·로그아웃은 sessionKey를 바꾼다.

잘못되거나 누락된 baseUrl은 렌더 중 예외 대신 API_NOT_CONFIGURED 조회 오류로 전달한다. 요청을 보내지 않으며 같은 쓰기 직접 재시도도 하지 않는다. 서버 설정을 고친 뒤 세션을 다시 생성해야 한다. 토큰 미제공은 fetch 전 401이다. 일반 로그인 연결은 기존 인증 서비스로 만료 전 토큰을 갱신하며 계정/로그인 세션을 재확인한다. 401 뒤 쓰기 재전송·자동 로그아웃·쿠키·임의 사용자 ID 우회는 없다.

목록 envelope·불투명 커서·문자열 BIGINT를 보존한다. 초대 null은 이동 불가다. 미읽음 수는 전체 미읽음이며 유효 초대 수로 가장하지 않는다. 서버가 제공하는 `actionableUnreadCount`는 읽지 않았고 현재 처리 가능한 초대만 세며 이 값이 0보다 크면 빨간 점을 표시한다. 이전 서버가 해당 필드를 제공하지 않을 때는 전체 미읽음 수로 대체하지 않는다. 유효 초대 수는 조건에 맞는 후보를 한 번 조회한 후 초대 ID 형식을 검증한다. 후보가 많으면 가져오는 행과 처리량이 늘어나므로 운영 규모의 부하 측정이 필요하다.

서버 모드는 목록·카운트·개별 읽음·삭제만 제공하고 모두 읽음 버튼을 숨긴다. 초대 gateway가 없으면 INVITATION_NOT_CONNECTED 안내만 제공하며 직접 재시도를 막는다. 이동은 현재 상세의 같은 inviteId·PENDING·canOpen===true가 모두 필요하다.

## 재현

frontend에서 test:notifications와 test:notifications:contract를 실행한다. HTTP fixture 서버는 기본 임의 포트를 사용하며 필요하면 DIO_NOTIFICATION_TEST_PORT/DIO_NOTIFICATION_INTEGRATION_PORT로 지정한다. query는 URLSearchParams 없이 encodeURIComponent로 생성하고 null/undefined만 생략한다.

API와 미합의 항목은 [계약](./notification-contract-comparison.md), 오류는 [오류 안내](./notification-error-behavior.md), 검증 경계는 [Spring 계약](./notification-spring-contract-regression.md)을 따른다.
