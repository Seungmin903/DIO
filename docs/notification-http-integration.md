# 249 알림 HTTP 연결

분리 후 추가 검증: 현재 BE→FE 계약 Spring1개+FE8개 통과, 웹 번들 생성 성공. 새 번들의 독립 Edge1280×800/412×892 목 기능 회귀(전체 읽음 응답 유실·새 도착 보존 포함) 통과, pageerror0. 서버 버튼 부재는 RN Web 패널 렌더링 회귀에서 검증했다. 실제 서버/JWT·네이티브 기기 검증은 수행하지 않았다.
2026-10-27. 기존 목 API는 유지하고 notification-backend 작업 폴더의 현재 컨트롤러·DTO에 맞춘 서버 어댑터를 추가했다. 인증 MR 및 224 최종 화면 연결은 분리한다.

## 사용

```js
const model = useServerNotifications({
  sessionKey, // 계정 변경·로그아웃 때 변경
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL, // https://서버/api/v1
  getAccessToken, // 매 요청 최신 토큰 반환. 저장/갱신은 인증 담당
  invitations, // 공유 담당의 수신자 상세 get(inviteId, { signal })
});
// 기존 NotificationPanel에 model을 전달한다.
```

한 세션 상위에서 한 번 호출해 같은 모델을 공유한다. 토큰 조회 함수와 invitations 객체는 안정된 참조로 전달한다. 토큰 변경만으로 store를 재생성하지 않는다. 기본 App/목 검증 화면을 실제 서버로 자동 전환하지 않았다. 인증 미연결 시 요청 전에 401이며 쿠키·임의 사용자 ID 우회는 없다. 401 자동 갱신·재전송은 수행하지 않는다.

## 서버 경계

- 목록 GET /notifications: `{notification, invitation}` 배열을 화면 모델로 변환한다. 초대 null은 UNAVAILABLE, 이동 불가로 보존하며 문자열 BIGINT를 숫자로 바꾸지 않는다. 제목·닉네임은 서버에서 제공하지 않아 기본 문구를 사용한다.
- 카운트 GET /notifications/unread-count: unreadCount만 제공한다. actionableUnreadCount로 가장하지 않는다. 기존 빨간 점은 유효 초대 카운트가 있을 때만 표시되므로 현재 서버 연결에서는 점을 표시하지 않는다. 250의 카운트 표시 정책은 별도 확정한다.
- 개별 읽음 PATCH /notifications/{id}: 최신 PDF 경로로 BE·서버/목 FE·테스트를 통일했다. 요청 body 없음, 기존 BE의200 NotificationData 응답을 유지한다. 이전 /{id}/read 별칭은 제공하지 않는다.

  244 경로 통일 검증(2026-10-27): 프런트 알림 회귀36개 통과. HTTP fixture는 정확한 PDF 경로만 허용하고 body 부재를 확인한다. BE 기본 테스트49개 통과·PostgreSQL 전용34개 제외, Swagger 새 경로 노출/이전 경로 제거·미인증401·이전 경로404·최초 읽은 시각 보존을 확인했다. 실제 개발 서버/JWT·기기 검증은 별도이며 PostgreSQL 전용 검증은 이번 변경에서 재실행하지 않았다.
- 삭제 DELETE /notifications/{id}: 204 정상 처리.
- 서버 어댑터는 목록·카운트·개별 읽음·삭제만 제공한다. `prepareReadAll`/`readAll`을 제공하지 않으며 `/read-watermarks`와 `/read-all`을 호출하지 않는다. watermark 정책은 별도 후속 범위다.
- 공통 store의 `canReadAll`은 어댑터의 readAll 지원 여부를 따른다. 패널은 지원할 때만 모두 읽음 버튼을 렌더링한다. 서버 store의 readAll 직접 호출/재시도도 상태 변경이나 HTTP 요청 없이 종료한다.
- 기존 목은 readAll을 유지한다. 첫 페이지의 throughNotificationId를 고정하고 응답 유실 뒤 같은 경계로 재시도하며, 이후 도착한 알림은 읽지 않는다. 공통 store의 watermark 발급 분기는 제거했다.
- 공유 상세 경로를 추측하지 않고 게이트웨이를 주입한다. 공유 미연결도 알림 읽음·삭제를 막지 않는다.

## 검증

2026-10-27 서버 전체 읽음 분리 후 `frontend/`의 `test:notifications`와 같은 Node 테스트 명령: **53개 통과**. 서버 HTTP 기본4개 동작, 전체 읽음 직접 호출·재시도의 요청 부재, 같은 패널의 실제 RN Web 렌더링에서 서버 버튼 부재/목 버튼 유지, 목 전체 읽음 성공·응답 유실 후 새 알림 보존을 검증했다. 인증 연결은 추가하지 않았다. 테스트 포트 기본18149/18151, 환경 변수로 변경 가능하다.

실제 Spring 서버/JWT·다중 계정·CORS·기기·최종 화면 통합 검증은 남아 있다. 로컬 HTTP 테스트 성공을 개발 서버 연동 완료로 간주하지 않는다. 기존 작업 폴더의 237 및 문서 변경은 보존했으며 커밋·푸시·MR 생성은 하지 않았다.

## 250 공통 카운트·앱 복귀 갱신

`ServerNotificationProvider`를 보관함·편집기·알림 패널의 공통 상위에 한 번 배치한다. 각 화면은 `useSharedNotifications()`로 동일 모델을 구독한다. Provider props는 위 훅과 같다. sessionKey가 바뀌면 하위 화면을 다시 만들고 기존 store·요청·타이머를 정리한다. 토큰 갱신만으로 sessionKey를 변경하지 않는다. 최종 인증/224 루트 연결 전이며 기본 앱에 임시 계정이나 테스트 토큰을 넣지 않았다. 목 검증 화면은 같은 Provider/구독 경계로 전환했다.

최초 active 및 inactive/background→active 복귀 때 목록·카운트·열린 초대 상세를 재조회한다. native 초기 상태 null은 active 이벤트까지 기다린다. 웹은 visibilitychange를 사용한다. 활성 중 30초마다 카운트만 조회하고 이미 진행 중이면 중복 조회하지 않는다. 중복 active 이벤트는 재시작하지 않으며 비활성·언마운트 후 타이머 콜백은 무효화한다. 조회 실패는 이전 카운트를 보존한다. 읽음·삭제 후 기존 store의 목록/카운트 갱신도 같은 구독자에 전달된다.

서버 전체 미읽음은 `안 읽은 알림 N개`로 표시하며 새 초대 개수로 바꾸지 않는다. 유효 초대 수가 제공되는 목 모델만 새 초대 점을 표시한다. 서버 빨간 점·공유 최종 화면 배치는 244/224 합의 대상으로 유지한다.

자동 회귀 30개 통과: native/web 수명·중복 이벤트·타이머 정리·공통 구독 결과·오류 값 보존·진행 중 중복 요청·dispose 이후 지연 응답 차단 및 기존 HTTP/목 회귀. 실제 기기 복귀·실제 서버/JWT 검증은 미실행이다.

웹 개발 번들 생성 성공(`EXPO_PUBLIC_DIARY_SOURCE=mock-library`, `expo export --platform web --dev --output-dir .expo/notification-250-web --max-workers 2`). 독립 Edge 1280×800·412×892에서 Provider를 사용하는 목 화면의 목록·읽음·삭제·전체 읽음 응답 유실 재시도·새 초대 보존·카운트 오류/재시도·계정 전환 회귀 통과, pageerror 0. `DIO_NOTIFICATION_QA_ROOT=../.expo/notification-250-web`, `DIO_NOTIFICATION_QA_PORT=18150`으로 `node qa/notification-browser.cjs` 실행. 이 결과는 최종 보관함/편집기 실서버 연동이나 네이티브 기기 복귀 검증을 대체하지 않는다.

## 초대 이동 조건 보강 (2026-10-27)

화면과 store가 공통 canOpenInvitation 판정을 사용한다. 상세가 PENDING이고 canOpen이 boolean true일 때만 이동 버튼을 제공한다. 이동을 누르면 gateway를 다시 조회해 동일 inviteId와 두 조건을 재검증한다. canOpen=false/누락/null/문자열/숫자, 비PENDING, 다른 inviteId, 조회 오류면 콜백을 호출하지 않는다. 실패하거나 이동 불가이면 기존 상세 다시 시도 또는 초대 상태 다시 확인으로 복구할 수 있다. 닫기·다른 초대 선택·dispose·연타 차단은 유지한다.

createInvitationGateway는 응답의 canOpen boolean을 필수 검증한다. 직접 주입한 gateway도 store에서 엄격히 확인하며 canOpen을 생략한 기존 공유 어댑터는 이동을 허용하지 않는다. 목록의 invitation.canOpen을 최신 상세의 허용값으로 대신 사용하지 않는다. 인증·실제 수락/거절 API는 연결하지 않았다. 목 상세에도 canOpen과 이동 불가 시나리오를 추가했다.

자동 알림 회귀39개 통과: 이동 직전 권한 해제·회복, canOpen 잘못된 타입/누락, 비PENDING+true, 다른 초대 ID 차단 및 기존 HTTP/수명 회귀를 포함한다.

웹 개발 번들 `.expo/notification-invitation-access-web` 생성 성공. 독립 Edge 1280×800·412×892에서 기존 알림 회귀와 함께 `PENDING + canOpen=false`의 이동 직전 차단·버튼 숨김·콜백 미호출·정상 상태 재확인 후 버튼 복구를 확인했다. 두 크기 모두 통과, pageerror 0. 실제 인증/공유 서버·네이티브 기기 검증은 남아 있으며 커밋·푸시는 하지 않았다.
