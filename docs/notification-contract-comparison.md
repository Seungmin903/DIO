# 244 알림 API 계약 대조

확인일: 2026-10-27. **최신 기준은 사용자가 제공한 API PDF**이며 아래 권고안은 팀 합의 완료를 뜻하지 않는다. 최초 문서 대조 후 사용자의 지시로 개별 읽음 경로를 아래와 같이 수정했다. 나머지 정책 권고는 팀 합의 전이다.

## 근거와 확인 범위

- PDF: `C:/Users/SSAFY/Downloads/1809723a-1878-4640-af97-1169d897120b_API.pdf`, 전체 4쪽. 3쪽 개발용 알림 5개 행을 텍스트와 렌더 이미지로 확인했다. PDF는 기능·메서드·경로 목록이며 알림 요청/응답 DTO·상태 코드·페이지네이션 세부 규격은 정의하지 않는다.
- BE: `../notification-backend/backend/src/main/java/com/f106/DIO/notification/`의 현재 작업 파일. Controller, DTO, Service, MutationService, Repository, InvitationLookup, ExceptionHandler를 확인했다. 원격 develop/배포 서버의 구현 상태를 의미하지 않는다.
- FE 서버용: `frontend/src/notifications/serverNotificationApi.js`, `notificationStore.js`, `notificationCount.js`, `NotificationPanel.js`, `NotificationProvider.js`.
- FE 목 전용: `frontend/src/notifications/notificationApi.js`, `mockNotificationTransport.js`. 서버 어댑터와 구분한다. 목 코드가 PDF 경로를 사용한다고 실서버 호환인 것은 아니다.
- Jira는 이전 조회가 커넥터 403으로 실패해 최신 이슈 본문·담당자·합의 코멘트를 확인하지 못했다. 사용자 요청의 244번 범위와 로컬 증거 기준이다. 팀원에게 메시지를 보내거나 Jira를 변경하지 않았다.

## 1. 메서드·경로

표의 경로는 `/api/v1`을 생략했다. FE baseUrl에 `/api/v1`을 포함해야 한다.

| 기능 | PDF 3쪽 | 현재 BE | FE 서버용 / 목 | 판단·권고 |
|---|---|---|---|---|
| 목록 | GET /notifications | 동일 | 서버 동일 / 목 동일+type 필터 | 경로 일치. BE는 type 필터를 구현하지 않으므로 목의 초대 전용 범위를 서버에 가정하지 않는다 |
| 미읽음 수 | GET /notifications/unread-count | 동일 | 양쪽 동일 | 경로 일치, 개수 의미는 별도 합의 |
| 개별 읽음 | PATCH /notifications/{notificationId} | PDF와 동일 | 서버·목 모두 동일, body 없음 | **경로 불일치 해소**. 기존 BE의200 NotificationData 응답 유지. body/응답 세부 규격은 PDF 미정의인 구현 계약 |
| 전체 읽음 | POST /notifications/read-all | 동일 | 양쪽 동일, body는 다름 | 경로 일치. 재시도 기준·body는 추가 계약 |
| 삭제 | DELETE /notifications/{notificationId} | 동일 | 양쪽 동일 | 경로 일치. 소프트 삭제·멱등·원본 보존은 PDF 미정의 |
| 전체 읽음 대상 발급 | 없음 | POST /notifications/read-watermarks | 서버 사용 / 목 없음 | **추가 API 제안**. PDF에 없는 기능을 확정 규격으로 간주하지 않는다 |

사용자 지시에 따라 단일 PDF 경로로 수정했다. 기존 `/read` 호환 별칭은 제공하지 않으며404를 검증한다. 배포 시 기존 경로를 사용하는 별도 클라이언트가 있다면 함께 전환해야 한다.

## 2. 응답·동작 차이

| 항목 | 현재 BE | FE 서버용 | 기존 목 | 합의 또는 수정 지점 |
|---|---|---|---|---|
| 목록 envelope | `{items:[{notification, invitation}],nextCursor,hasNext}` | 이 구조를 변환 | items에 notificationId·actor·diary·invitation·action을 평탄하게 포함 | 서버용은 현재 BE와 일치. 목 DTO를 서버 규격으로 사용하지 않는다 |
| 기본 필드 | notificationId, notificationType, actorUserId, diaryId, pageId, readAt, createdAt | id·type·actorUserId·diaryId·readAt·createdAt 사용, pageId 미사용 | title·nickname 포함 | 제목/초대한 사람 표시가 필요하면 BE의 안전한 표시 DTO 또는 공유 조회를 추가 합의. 현 FE는 기본 문구 사용 |
| 식별자 | 알림/회원 ID 문자열, diary/page UUID | BIGINT 문자열 그대로 보존 | 문자열 ID지만 숫자 순서 비교 | 문자열 ID 유지. 숫자 크기·시간만으로 전체 읽음 경계를 만들지 않는다 |
| 페이지 | limit 기본20, 1~100, 생성 시각/ID 내림차순, 불투명 cursor | limit20·cursor 전달, nextCursor 종료 처리 | 오프셋 목 cursor | 서버 커서 형식은 FE에서 해석하지 않는다. 정렬·limit·잘못된 cursor 오류를 계약에 기재 |
| 초대 조회 미연결 | invitation null 가능 | UNAVAILABLE·actionable false로 변환 | 항상 초대 정보 있음 | null 허용 및 초대 미연결에서도 알림 조회·읽음·삭제 가능함을 명시 |
| 초대 이동 | `{inviteId,status,diaryId,canOpen}` 또는 null | 목록의 actionable은 PENDING && canOpen | action.enabled 기반 | 이동 직전 재조회한 상세의 PENDING && canOpen === true 및 동일 inviteId를 확인하도록 보강 완료. 상세 gateway도 canOpen boolean을 제공해야 함 |
| 미읽음 수 | `{unreadCount}`: 본인·미삭제·readAt null 전체 | `안 읽은 알림 N개`, 초대 점 없음 | `{unreadCount,actionableUnreadCount}`: 유효 초대 점 | 전체 미읽음과 유효 초대 수를 구별. 필요 시 별도 actionableUnreadCount와 유효 상태 판정 주체 합의 |
| 개별 읽음 응답 | 200 NotificationData, 최초 readAt 유지 | 응답 후 목록·카운트 재조회, DTO 자체는 미검증 | null 가능 | 응답200 DTO 또는204 중 확정. 현재 호환되지만 251 fixture는 Spring 응답 계약을 자동 보장하지 않음 |
| 삭제 응답/범위 | 204·소프트 삭제, 본인 반복204, 타인/없음404 | 204 지원, 반복 요청 가능 | 목 행 숨김 | 초대·멤버십·다이어리 원본은 변경하지 않는 것으로 명시 권고 |
| 갱신 | 요청 시점 값 | active 복귀 때 목록·카운트·열린 상세, 활성 중30초 count | 같은 수명 사용 | polling 허용 주기·화면 재진입 refresh 호출 위치·실시간 목표 지연 합의. 현 API가 push를 보장하지 않음 |

PDF에는 위 세부 필드가 없으므로 BE와 서버 FE가 일치하는 항목도 ‘PDF에 정의됨’으로 표시하지 않는다.

## 3. 전체 읽음 추가 계약 제안

현재 BE·서버 FE는 다음 순서로 일치한다.

1. POST /notifications/read-watermarks → 201 `{readWatermark,expiresAt}`. 본인 전체 미읽음 대상 ID를 고정한다.
2. POST /notifications/read-all, body `{readWatermark}` → 204. FE는 값을 해석하지 않는다.
3. 적용 응답 유실·일시 오류 재시도는 같은 값을 사용한다. 발급 이후 새로 도착/커밋한 알림은 제외한다. 반복 적용은 최초 readAt을 유지한다.

기존 목은 `{type:'DIARY_INVITED',throughNotificationId}`를 보내며 숫자 ID 경계를 비교한다. 실제 서버에 이식하면 안 된다. 서버는 전체 알림을 대상으로 하므로 초대 전용 버튼/필터에 연결할 경우 ‘모두’의 범위를 명시해야 한다.

확정 필요: 발급 endpoint 추가 승인, 전체/초대 전용 범위, 10분 TTL, 회원별 활성 최대20개, 만료 청소 주기·보관량. 현재 한도는 적용 완료 기록도 만료 전까지 포함한다. 발급 응답 자체가 유실되면 FE는 재발급하므로 한도에 영향을 줄 수 있다. 429 재시도·대기 안내 및 Retry-After 제공 여부를 합의한다.

현재 BE는 잘못된/타인 watermark400, 만료410, 발급 한도429를 사용한다. **완료한 watermark도 TTL 뒤에는410**이므로 무기한 멱등 성공은 보장하지 않는다. FE는410을 단순 재시도하지 않고 새 명령으로 다시 발급한다. 새 명령은 그 시점의 새 알림도 포함할 수 있어 사용자 안내가 필요하다.

## 4. 인증·공유·오류 경계

- BE는 검증된 NotificationUserPrincipal의 양수 userId가 필요하며 미연결401. FE는 최신 access token 조회 함수를 주입받고 토큰 미제공 시 fetch 전401. 실제 JWT 매핑·갱신·로그아웃은 인증 담당 연결 범위다.
- PDF 공유 API는 GET /invites/{token}, POST /invites/{token}/accept다. 기존 목의 GET /me/invitations/{inviteId}는 PDF에 없다. 서버 FE는 해당 경로를 추측하지 않고 `invitations.get(inviteId,{signal})`를 주입받는다. inviteId를 token처럼 사용하거나 알림에 초대 링크 토큰을 추가하지 않는다. 수신자 권한으로 ID 기반 상세를 조회할 별도 API/어댑터가 필요한지 공유 담당과 확정한다.
- 읽음은 수락/거절이 아니다. 목록 payload만으로 실제 가입·이동 권한을 확정하지 않는다. 공유 담당의 최신 상세/권한 판단이 필요하다.
- BE 도메인 오류는 ProblemDetail의 code/detail, 프레임워크 검증 오류는 code가 없을 수 있다. FE는 code 부재 시 HTTP_ERROR로 처리하고 서버 detail을 그대로 노출하지 않는다.
- FE는400/401/403/404/409/410/422를 같은 쓰기 단순 재시도에서 제외한다. 네트워크/5xx/429 등은 수동 재시도 가능하지만 지수 backoff나 Retry-After 반영은 구현하지 않았다. 429의 UX는 확정 대상이다.

## 5. 팀에 확인할 최소 결정과 제안

| 우선 | 누구의 결정이 필요한가 | 질문 | 권고안·후속 영향 |
|---|---|---|---|
| 1 (경로 반영) | 244 계약 + 알림 BE/FE | body·응답의 최종 세부 규격은? | PDF 경로 통일 완료. body 없이 읽음 처리, 기존200 DTO 유지. 읽음 취소 API는 추가하지 않음 |
| 2 | 244 계약 + 알림 BE/FE | watermark 보조 API와 TTL/한도/범위를 승인할까? | 새 알림 보존·동일 경계 재시도 유지. 승인한 정책만 최종 명세에 반영하고 목 경계도 정렬 |
| 3 | 공유 BE/FE + 224 화면 | inviteId 기반 수신자 상세·canOpen은 어디서 제공할까? | 링크 토큰 노출 없이 수신자 상세 gateway 제공, status와 canOpen 모두 이동 직전 검증(프런트 보강 완료) |
| 4 | 244 계약 + 224 화면 | 전체 미읽음 수면 충분한가, 유효 초대 점이 필요한가? | MVP2는 전체 미읽음 숫자로 진행 가능. 점이 필요하면 별도 카운트와 상태 판정 명세 추가 |
| 5 | 224 화면 + 공유/알림 BE | 제목·닉네임·알림 종류별 상세 문구가 필요한가? | 종류별 기본 UI 분리 완료: 확인된 초대 종류만 초대 상세 제공, 그 외는 일반 문구·읽음/삭제. 실제 추가 종류·표시 필드는 별도 합의 |
| 6 | 인증 담당 + 알림 BE/FE | principal 매핑·최신 토큰 함수·sessionKey 변경 시점은? | JWT 검증 뒤 principal 연결, 로그인 세션 변경 시 Provider 재생성. 토큰 갱신만으로 재생성하지 않음 |

현재 Jira 담당자·미병합 MR 소유권을 재조회하지 못했으므로 위 표는 역할 기준이다. 사용자에게서 확인된 과거 담당자 정보만으로 최신 책임자를 단정하지 않는다.

## 6. 후속 구현 순서와 완료 기준

PDF 경로 일치 수정 완료 → 승인된 watermark/DTO/오류 명세 반영 → 공유 이동의 canOpen 프런트 보강 완료 → FE 목/서버 계약 회귀 정렬 → 실제 Spring OpenAPI/응답 검증 → 인증·224 연결 및 251 실제 계정/기기 검증 순서로 진행한다.

기존 35개 프런트 회귀와 PostgreSQL 검증 기록은 각각의 검증 결과다. 로컬 fixture 통과만으로 최종 계약·실서버 호환·244/251 전체 완료를 선언하지 않는다. 최초 문서 대조에서는 테스트를 재실행하지 않았다. 이후 경로 통일 시 BE/FE 회귀를 실행했으며 결과는 HTTP 연결 문서와 BE 준비 문서에 기록한다. PDF 원본·인증 코드·DB 구조·커밋·푸시·Jira는 변경하지 않았다.
