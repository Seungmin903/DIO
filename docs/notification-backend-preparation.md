# 알림 백엔드 사전 구현 — 245·246

최신 develop `4ebc10c`에서 별도 `feature/be/notification-api` 브랜치로 시작했다.
237 프론트 작업과 분리한 백엔드 기반 구현이다. 244 계약 합의와 인증·공유 실제 연결은 남아 있다.

## 구현한 API

| 요청 | 동작 |
| --- | --- |
| `GET /api/v1/notifications?limit=20&cursor=...` | 본인의 삭제되지 않은 알림 목록, 기본 20개·최대 100개 |
| `GET /api/v1/notifications/unread-count` | 본인의 삭제되지 않은 미읽음 알림 전체 개수 |
| `PATCH /api/v1/notifications/{notificationId}/read` | 본인 알림 최초 읽음 처리, 반복 호출 시 기존 시각 유지 |

목록은 `created_at DESC, notification_id DESC`로 정렬한다. 숫자 ID는 JSON에서 문자열로 반환한다.
응답은 `{items:[{notification:{notificationId,notificationType,actorUserId,diaryId,pageId,readAt,createdAt},invitation:null}],nextCursor,hasNext}`다.
읽음 응답은 `notification` 객체 자체, 미읽음 수 응답은 `{unreadCount}`다.
이는 사전 구현 응답 형태이며 249 목 API와 자동 호환된다고 가정하지 않는다. 244 합의 후 어댑터를 맞춘다.

커서는 버전·회원 ID·생성 시각·알림 ID를 Base64url로 인코딩한 불투명 값이다.
클라이언트는 해석하거나 생성하지 않는다. 잘못된 커서나 다른 회원의 커서는 400으로 처리한다.
커서는 서명된 인증 토큰이 아니다. 조작하더라도 모든 SQL의 수신자 조건 때문에 타인 알림을 조회할 수 없다.
다음 페이지는 정렬 키를 기준으로 조회하므로 경계 항목이 삭제되어도 진행된다.
페이지 사이에 새로 도착한 알림은 첫 페이지를 새로 조회할 때 반영한다. 전체 목록의 스냅샷을 보장하지 않는다.

## 인증 연결

현재 develop에는 JWT 인증 구현이 없다. 인증 모듈에서 검증된 요청 principal이
`NotificationUserPrincipal`을 구현해 양수 `userId()`를 제공해야 한다.
헤더·쿼리의 userId나 숫자 principal 이름을 신뢰하는 임시 우회는 제공하지 않는다.
연결 전 실제 요청은 401이며 테스트에서는 검증된 principal을 주입한다.
217·218 연결 후 토큰 만료·로그아웃·계정 전환 및 실제 서버 기기 QA가 필요하다.

## 공유 연결

공유 담당은 `InvitationLookup` 빈을 제공해 `(recipientUserId,notificationId)`에 대해
권한을 확인한 현재 `inviteId/status/diaryId/canOpen`을 반환한다.
빈이 없거나 참조를 찾을 수 없으면 `invitation:null`이며 이동을 허용하는 가짜 상태를 만들지 않는다.
초대별 상태값·참조 저장 방법·화면 이동 경로는 244 합의 대상이다.
기존 `payload_json`은 토큰이나 민감 참조가 포함될 수 있어 그대로 응답에 노출하지 않는다.
조회 포트 구현 시 목록의 최대 100건에 대한 호출 비용을 확인하고 필요하면 일괄 조회 인터페이스로 확장한다.
읽음 요청은 공유 모듈을 호출하지 않으므로 초대를 수락·거절하지 않는다.

## DB 및 오류

기존 Flyway V1의 `notifications`를 JDBC로 재사용하며 새 테이블·마이그레이션은 추가하지 않는다.
기존 다이어리·회원 엔티티와 237 프론트 파일을 수정하지 않는다.
소유권과 `deleted_at IS NULL` 조건을 모든 조회·갱신 SQL에 적용한다.
읽음은 `read_at IS NULL`인 행만 조건부 UPDATE하여 반복·동시 요청이 최초 시각을 덮어쓰지 않는다.
타인·없는·삭제된 알림은 동일한 404 `NOTIFICATION_NOT_FOUND`를 반환한다.
인증 누락은 401 `AUTHENTICATION_REQUIRED`, 커서 오류는 400 `INVALID_NOTIFICATION_CURSOR`,
범위를 벗어난 limit은 400 `INVALID_NOTIFICATION_LIMIT`이며 `application/problem+json`을 사용한다.
행이 많아지면 `(user_id,created_at DESC,notification_id DESC)`의 활성 행 부분 인덱스 등을 실행 계획으로 검토한다.

미읽음 수는 전체 미읽음 알림 수다. 유효한 초대만 세는 빨간 점과 동일하다고 확정하지 않는다.
247 전체 읽음·삭제 및 248 초대 이벤트 생성은 이 범위에 포함하지 않는다.

## 검증

- `backend/gradlew.bat test --console=plain --offline`: H2 API 통합 테스트와 기존 회귀.
- `backend/gradlew.bat postgresNotificationTest postgresTest --console=plain --offline`: 별도 PostgreSQL에서 V1 적용 후 동일 알림 계약과 기존 다이어리 회귀. 알림·회원 테스트 행은 트랜잭션으로 롤백한다.
- 검증 범위: 회원 격리·미인증 차단·삭제 제외·동일 시각 정렬·경계 삭제 후 페이지 진행·잘못된 커서/limit·미읽음 수·멱등 읽음·BIGINT 문자열·공유 조회 인터페이스.
- 실 JWT·실 초대·프론트 화면·iPad/Android QA는 미검증이다.

### 실행 결과 (2026-10-26)

- 기본 테스트 29개 통과. PostgreSQL 전용 10개는 기본 실행에서 의도적으로 건너뛴다.
- PostgreSQL 17.11에서 알림 7개·기존 다이어리 3개 모두 통과, 건너뜀·실패 0개.
- 임시 DB의 Flyway V1 적용 성공, 테스트 후 notifications·users·diaries 각각 0행 확인 후 DB 서버 종료.
- 기존 다이어리 PostgreSQL 테스트에서 `Instant` 직접 바인딩이 실패하여 테스트 입력만 `Timestamp.from`으로 수정했다.
- H2 테스트의 상속된 메서드에도 트랜잭션이 적용되도록 공통 테스트 클래스에 명시하고, 실제 트랜잭션 활성·autoCommit 해제를 검사한다.
- 새로운 제품 DB·기존 로컬 개발 DB는 변경하지 않았다. 전체 읽음과 다중 기기/스레드 경합은 검증 범위 밖이다.
