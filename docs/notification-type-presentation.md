# 알림 종류별 표시·동작 분리

2026-10-27. watermark·인증 연결·BE API/DTO는 변경하지 않고 FE 표시·행 동작을 분리했다.

## 확인한 종류와 표시

현재 BE `InvitationNotificationRepository`가 생성하는 종류는 DIARY_INVITE다. 기존 목은 DIARY_INVITED를 사용하므로 이 이름도 초대 호환 이름으로 허용한다. 다른 일반 알림 종류의 서버 enum/발행자는 확인되지 않았다. 임의의 서버 종류·문구를 확정하지 않는다.

| 종류 | 문구·동작 |
|---|---|
| DIARY_INVITE / 기존 목 DIARY_INVITED | 초대 문구·상태 표시. inviteId가 있으면 초대 확인, 없으면 미읽음의 읽음 버튼. 삭제는 항상 가능 |
| 그 외 모든 비어 있지 않은 종류 | `알림` / `새로운 알림이 도착했어요.`. 미읽음이면 읽음, 읽은 뒤에는 삭제. 초대 문구·상태·상세·이동은 제공하지 않음 |

일반/미지원 종류의 원시 코드·actor·초대 payload를 사용자 문구나 이동에 사용하지 않는다. 해당 종류의 invitation payload가 함께 와도 참조/권한을 무시한다. 알림 자체의 ID·종류·생성 시각 등 기본 DTO 검증은 유지한다. 초대 종류의 잘못된 초대 DTO는 기존처럼 오류로 처리하며 null 초대는 허용한다.

`notificationPresentation.js`에서 종류 판정·문구·상세 가능 여부를 공통 처리한다. 서버/목 어댑터 모두 notificationType을 보존하고 종류에 맞게 inviteId/status/actionable을 변환한다. NotificationPanel은 같은 판정으로 버튼을 제공한다. store.open도 종류를 검사하므로 직접 호출에 위조 inviteId가 있어도 일반 알림의 gateway를 호출하지 않는다. 일반 알림을 열면 기존 초대 상세를 닫고 알림 읽음만 처리한다.

초대 이동은 기존대로 이동 직전 상세를 다시 조회해 동일 inviteId·PENDING·canOpen === true를 확인한다. 알림 읽음·삭제는 초대 수락/거절이 아니다. watermark 처리·카운트 정책·인증 토큰/Provider 경계는 변경하지 않았다.

## 검증

- 일반 알림 회귀42개 통과: 종류별 어댑터·문구·초대 참조 차단, gateway 미호출·이전 상세 정리·읽음·삭제, 기존 초대/수명/HTTP 회귀 포함.
- 이전 실행에서 실제 Spring이 생성한 최신 응답 파일로 프런트 계약8개 재실행, 모두 통과. 이번에는 BE 생산자를 다시 실행하지 않았다. 실제 서버 종류 DIARY_INVITE·DTO·OpenAPI 호환 확인이며 운영 서버 검증은 아니다.
- 목 QA에 일반/미지원 종류 도착 버튼을 추가했다. MOCK_NOTICE/FUTURE_TYPE은 테스트 fixture용이며 서버 enum 추가가 아니다.
- 웹 개발 번들 `.expo/notification-types-web` 생성 성공. 실제 기기·공유/JWT 서버 연결은 미검증이다.
- 독립 Edge 1280×800·412×892 모두 통과, pageerror 0. 일반/미지원 알림의 초대 버튼 부재·읽음 버튼 처리·초대 상세 미노출·삭제와 기존 초대 회귀를 확인했다. `DIO_NOTIFICATION_QA_ROOT=../.expo/notification-types-web`, `DIO_NOTIFICATION_QA_PORT=18150`으로 `node qa/notification-browser.cjs` 실행.
- 커밋·푸시·MR·Jira·제품 데이터는 변경하지 않았다.
