# 알림 삭제의 저장소 격리

알림 기본 API는 기존 notifications 테이블만 사용한다. NotificationDeleteService는 NotificationRepository와 Clock만 의존하며 전체 읽음 경계 저장소·초대 이벤트·신규 migration을 요구하지 않는다.

## 동작

- DELETE /api/v1/notifications/{id}는 검증된 수신자와 일치하는 알림만 소프트 삭제한다.
- 이미 삭제한 본인 알림도 204이며 최초 deleted_at을 유지한다. 타인·없는 알림은 같은 404다.
- 원본 초대·다이어리·회원 행은 삭제하지 않는다. 읽음 처리도 초대 수락·거절을 뜻하지 않는다.
- 삭제된 항목은 목록과 미읽음 수에서 제외한다.

## 회귀 검증

NotificationDeleteIsolationTests는 users·notifications만 정의한 최소 H2 fixture에서 반복 삭제·수신자 격리·원본 보존을 확인한다. NotificationCoreApiTests는 기본 목록·미읽음 수·개별 읽음·삭제 계약을 검증한다. NotificationFrontendContractTests는 실제 Spring 응답을 프런트 소비자에 전달한다.

현재 결과와 이력은 [MR !164](https://lab.ssafy.com/s15-final/S15P31F106/-/merge_requests/164), 연결 범위는 [알림 통합 범위와 연결 조건](./notification-final-selection.md)을 따른다. H2 테스트는 실제 PostgreSQL·JWT·공유 연동·실기기 검증을 대신하지 않는다.
