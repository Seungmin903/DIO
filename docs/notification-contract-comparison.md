# 알림 API 계약과 미합의 경계

사용자가 제공한 API 명세 PDF의 경로를 기준으로 한다. PDF에 없는 DTO·오류·정책은 아래 구현 계약과 팀 합의를 구분한다. 제출·검증 이력은 [MR !164](https://lab.ssafy.com/s15-final/S15P31F106/-/merge_requests/164)에서 관리한다.

## 현재 구현

경로 앞에는 /api/v1이 붙는다.

| 기능 | 경로 | 응답·조건 |
|---|---|---|
| 목록 | GET /notifications | items: [{notification, invitation}], nextCursor, hasNext. limit 기본 20, 1~100 |
| 미읽음 수 | GET /notifications/unread-count | unreadCount: 삭제되지 않은 본인의 전체 미읽음 수 |
| 개별 읽음 | PATCH /notifications/{notificationId} | body 없음, 200 NotificationData. 최초 readAt 유지 |
| 삭제 | DELETE /notifications/{notificationId} | 소프트 삭제, 반복 본인 삭제 204, 원본 초대 보존 |

이전 /{id}/read 별칭은 제공하지 않는다. PATCH·DELETE의 비숫자·long 범위 초과 ID는 프레임워크 400이며 code가 없을 수 있다. 타인·없는·삭제된 알림 읽음은 같은 404다.

PDF의 전체 읽음 POST /notifications/read-all과 제안 watermark API는 현재 서버 제출 범위에 없다. 서버 어댑터는 모두 읽음 버튼을 숨긴다. 기존 목의 경계 기반 전체 읽음은 서버 지원으로 해석하지 않는다.

## 응답과 페이지

알림·회원 BIGINT는 문자열, diaryId/pageId는 UUID다. 페이지 커서는 생성 시각·숫자 ID를 이용한 불투명 값이며 FE는 해석하지 않는다. hasNext=false이면 nextCursor=null이다. 검색 조건에 없는 목 type 필터를 서버에 가정하지 않는다.

서버는 제목·닉네임을 제공하지 않아 FE는 기본 문구를 사용한다. 확인된 초대 종류 DIARY_INVITE 및 목 호환 DIARY_INVITED만 초대 동작을 제공한다. 그 외 종류는 일반 알림으로 표시한다.

## 연결과 팀 결정

- JWT 검증 후 NotificationUserPrincipal 매핑과 로그인 세션 수명을 연결했다. 미인증·변조·만료·로그아웃/탈퇴 세션은 401이다.
- 공유 포트는 수신자와 페이지 ID 목록을 받아 일괄 조회한다. 없거나 권한 없는 결과는 invitation=null이다. FE의 초대 상세 gateway도 별도 연결해야 한다.
- 이동 직전 같은 inviteId·PENDING·canOpen===true를 확인한다. 알림 읽음·삭제를 초대 수락·거절로 간주하지 않는다.
- PDF 공유 API의 링크 token을 inviteId로 추측하지 않는다. 수신자 권한으로 ID 기반 상세를 조회할 계약이 필요하며 알림에 링크 토큰을 노출하지 않는다.
- 전체 미읽음 숫자와 유효 초대 빨간 점은 다른 의미다. 최종 표시 정책·서버 전체 읽음 경계/재시도·추가 표시 DTO·429 복구는 팀 합의가 필요하다.

재현은 [Spring 계약 회귀](./notification-spring-contract-regression.md)와 [HTTP 연결](./notification-http-integration.md)을 따른다.
