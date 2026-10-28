# 알림 종류별 표시·동작 분리


## 확인한 종류와 표시

현재 초대 계약 종류는 DIARY_INVITE다. 초대 이벤트 발행 구현은 이 제출 범위에 포함하지 않는다. 기존 목은 DIARY_INVITED를 사용하므로 이 이름도 초대 호환 이름으로 허용한다. 다른 일반 알림 종류의 서버 enum/발행자는 확인되지 않았다. 임의의 서버 종류·문구를 확정하지 않는다.

| 종류 | 문구·동작 |
|---|---|
| DIARY_INVITE / 기존 목 DIARY_INVITED | 초대 문구·상태 표시. inviteId가 있으면 초대 확인, 없으면 미읽음의 읽음 버튼. 삭제는 항상 가능 |
| 그 외 모든 비어 있지 않은 종류 | `알림` / `새로운 알림이 도착했어요.`. 미읽음이면 읽음, 읽은 뒤에는 삭제. 초대 문구·상태·상세·이동은 제공하지 않음 |

일반/미지원 종류의 원시 코드·actor·초대 payload를 사용자 문구나 이동에 사용하지 않는다. 해당 종류의 invitation payload가 함께 와도 참조/권한을 무시한다. 알림 자체의 ID·종류·생성 시각 등 기본 DTO 검증은 유지한다. 초대 종류의 잘못된 초대 DTO는 기존처럼 오류로 처리하며 null 초대는 허용한다.

`notificationPresentation.js`에서 종류 판정·문구·상세 가능 여부를 공통 처리한다. 서버/목 어댑터 모두 notificationType을 보존하고 종류에 맞게 inviteId/status/actionable을 변환한다. NotificationPanel은 같은 판정으로 버튼을 제공한다. store.open도 종류를 검사하므로 직접 호출에 위조 inviteId가 있어도 일반 알림의 gateway를 호출하지 않는다. 일반 알림을 열면 기존 초대 상세를 닫고 알림 읽음만 처리한다.

초대 이동은 기존대로 이동 직전 상세를 다시 조회해 동일 inviteId·PENDING·canOpen === true를 확인한다. 알림 읽음·삭제는 초대 수락/거절이 아니다. watermark 처리·카운트 정책·인증 토큰/Provider 경계는 변경하지 않았다.

## 재현

frontend에서 `node --run test:notifications`를 실행한다. 실행 결과·기준 SHA와 이력은 [MR !164](https://lab.ssafy.com/s15-final/S15P31F106/-/merge_requests/164)에서 관리한다. 실제 인증·공유·네이티브 검증과 구분한다.
