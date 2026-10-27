# 알림 Spring·프런트 계약 회귀 (watermark 제외)

2026-10-27. 실제 Spring MockMvc 응답·OpenAPI를 프런트 transport/DTO 어댑터에서 소비하는 회귀를 추가했다. 제품 API·인증·watermark 정책은 수정하지 않았다.

## 검증 구조

BE의 `NotificationFrontendContractTests.exportsActualSpringResponsesForFrontend`는 실제 Spring 애플리케이션·컨트롤러·서비스·H2 repository·직렬화·예외 처리를 실행한다. 인증은 테스트용 NotificationUserPrincipal, 공유 상세는 InvitationLookup mock을 주입한다. 합성 회원/알림 데이터는 트랜잭션 롤백한다. watermark API는 호출하지 않는다.

FE `spring-notification-contract.test.js`는 생산자가 생성한 목록·카운트·읽음·삭제·오류 응답과 `/v3/api-docs`를 읽는다. fetch만 주입하고 실제 `createNotificationHttpTransport`와 `createServerNotificationApi`를 실행한다. 직접 작성한 DTO로 생산자 응답을 대체하지 않는다. FE 요청 경로/메서드가 OpenAPI에 존재하는지도 확인한다.

MockMvc는 실제 Spring 처리 계층을 실행하지만 네트워크 소켓·개발 서버·JWT·실제 공유 모듈은 검증하지 않는다. 기존 로컬 HTTP fixture 회귀와 구분한다.

## 결과

| 항목 | 확인 내용 |
|---|---|
| 목록 DTO | 문자열 BIGINT 9007199254740993 보존, `{notification,invitation}` 구조, 초대 canOpen true/false |
| 페이지 | 불투명 cursor 전달, 마지막 nextCursor null, 빈 목록, invitation null의 UNAVAILABLE/이동 불가 변환 |
| 카운트 | `{unreadCount:3}` 소비, 유효 초대 수로 바꾸지 않음 |
| 읽음·삭제 | body 없는 PDF PATCH·200 NotificationData/readAt, 삭제204 빈 body 및 반복204 |
| 도메인 오류 |401 AUTHENTICATION_REQUIRED,404 NOTIFICATION_NOT_FOUND,400 INVALID_NOTIFICATION_LIMIT |
| 프레임워크 오류 | 타입 검증400의 code 부재를 FE HTTP_ERROR로 처리 |
| OpenAPI 경로 | GET 목록/카운트200·PATCH200·DELETE204, cursor/limit, 읽음 requestBody 없음, 이전 /read 없음 |
| OpenAPI DTO | schema 참조와 ID string·canOpen boolean·날짜 date-time·카운트 integer 타입 |

**Spring 생산자1개·프런트 소비자5개 통과, 실패/건너뜀0.** 최초 연결 실행은 소비자4개 통과했고, 같은 실행에서 생성한 응답으로 OpenAPI DTO 참조·타입 검증을 추가한 소비자5개를 다시 실행해 통과했다. 기존 전체 프런트39개·PostgreSQL·기기 QA는 이번 변경에서 재실행하지 않았다.

## 재현

Java17/JAVA_HOME과 기존 Gradle 캐시가 있는 Windows의 frontend 폴더에서:

```powershell
pnpm test:notifications:contract
# BE 위치가 다를 때:
powershell -NoProfile -ExecutionPolicy Bypass -File qa/run-notification-contract.ps1 -BackendRoot 'C:/프로젝트/backend'
```

기본 BE 위치는 같은 checkout에서 `frontend/`를 기준으로 한 `../backend`다. 전용 제출 작업 폴더에서는 `pnpm test:notifications:contract`만으로 같은 checkout의 BE를 사용한다. 원본처럼 BE·FE가 서로 다른 작업 폴더에 있으면 `-BackendRoot`로 BE의 `backend/` 절대 경로를 명시한다. 생산자 BE 테스트와 소비자 FE 테스트/스크립트를 함께 반영해야 한다.

매번 UUID 이름으로 `.expo/notification-contract/`에 새 응답을 생성한다. 생산자 실패·파일 미생성은 즉시 실패하며 이전 파일로 대체하지 않는다. Gradle --rerun-tasks와 전용 build/cache를 사용한다. 생성 응답은 ignore 대상이며 소스 fixture로 커밋하지 않는다. 일반 test:notifications와 분리했다. 소비자 단독 실행은 DIO_NOTIFICATION_CONTRACT_OUTPUT이 필수이며 누락 시 skip하지 않고 실패한다.

## nullable 보강 (2026-10-27)

알림 DTO의 actorUserId·diaryId·pageId·readAt, 목록 nextCursor, 항목 invitation 총6개 필드에 실제 응답의 null 허용을 반영했다. 앞5개는 OpenAPI3.1의 `type: [string, null]`을 사용하며 uuid/date-time format을 유지한다. invitation은 `anyOf: [{$ref: InvitationTarget}, {type: null}]`로 표현한다. ID·createdAt·items·hasNext·unreadCount·canOpen 및 InvitationTarget 공통 객체 자체에는 null 허용을 추가하지 않았다. required 정책은 바꾸지 않았다.

springdoc 어노테이션만으로 참조형 null을 지정하면 기존 $ref가 남아 object 제약과 교차 적용되는 문제가 있었다. `NotificationOpenApiConfiguration`의 알림 전용 customizer에서 목록 항목의 invitation 스키마만 anyOf로 교체했다. 런타임 DTO·직렬화·서비스/DB·API 경로·인증·watermark는 변경하지 않았다.

프런트 계약 검증은 실제 Spring 응답에 object/array/primitive/$ref/anyOf 부분집합 검증을 적용한다. `$ref`를 형제 type으로 덮어쓰지 않고 함께 검증하며, 잘못된 `{$ref: InvitationTarget, type:[object,null]}`가 null을 허용하지 못하는 것도 음성 사례로 확인한다. 실제 null 필드·마지막/빈 페이지·null과 객체인 invitation·읽음 전후 readAt을 검사한다. null 허용 누락과 비nullable ID에 null을 넣은 경우는 실패해야 한다.

최종 연결 실행에서 **Spring 생산자1개·프런트 계약6개 모두 통과, 실패/건너뜀0**. 기존5개 검증에 nullable 회귀1개를 추가했다. 변경 검증 중 참조형 스키마 결합 실패를 잡아 보정한 뒤 생산자와 소비자를 함께 재실행했다. 재현 명령은 위 `pnpm test:notifications:contract`와 같다.

## required·오류 코드 보강 (2026-10-27)

아래는 실제 응답에서 항상 포함되는 키이며, nullable인 키도 required에 포함한다. required는 키 존재 여부이고 null 허용과 별개다. 응답 DTO의 직렬화나 런타임 검증을 변경하지 않고 OpenAPI 메타데이터만 보강했다.

| 스키마 | required |
|---|---|
| NotificationData | notificationId, notificationType, actorUserId, diaryId, pageId, readAt, createdAt |
| NotificationListResponse | items, nextCursor, hasNext |
| Item | notification, invitation |
| InvitationTarget | inviteId, status, diaryId, canOpen |
| UnreadCount | unreadCount |

목록·카운트·개별 읽음·삭제의4개 작업에만 아래 오류 응답을 문서화했다. watermark와 인증 연결 로직은 변경하지 않았다. 공통 ProblemDetail 컴포넌트를 바꾸지 않고 알림 전용 오류 스키마를 사용한다.

| 작업/상태 | 실제 오류 코드·문서 표현 |
|---|---|
| 목록400 | INVALID_NOTIFICATION_LIMIT, INVALID_NOTIFICATION_CURSOR. 타입 변환 오류는 code 없음. code는 선택 필드이며 존재하면 enum 값이어야 함 |
| 읽음·삭제400 | ID 타입/범위 변환 오류, code 없음. 별도 파라미터 오류 스키마 사용 |
|4개 작업401 | AUTHENTICATION_REQUIRED, code 필수. 기존 검증 principal 경계의 응답만 확인하며 JWT 연결은 추가하지 않음 |
| 읽음·삭제404 | 도메인 오류 NOTIFICATION_NOT_FOUND. 타인·없는 ID·읽음의 삭제된 알림을 검증. 경로 미매칭404에는 code가 없을 수 있어 스키마의 code는 선택으로 두고, 도메인 시나리오 회귀에서는 해당 코드가 반드시 있어야 함을 검사 |

모두 application/problem+json을 명시한다. 실제 Spring은 기본 about:blank인 type을 생략하므로 type은 선택이다. title/status/detail/instance는 필수,401은 code도 필수다. status는 각 응답의 고정 enum으로 제한했다. instance는 실제 상대 경로를 허용하는 uri-reference다. 프레임워크 오류에 임의 도메인 코드를 추가하거나 FE의 HTTP_ERROR fallback을 서버 코드로 문서화하지 않았다.

생산자에 잘못된 커서·각 작업401·없는/삭제된 알림 읽음404·타인 삭제404·잘못된/범위 초과 ID400을 추가했다. 실제 Content-Type도 전달한다. 소비자는 required 누락·잘못된 status/code enum을 음성 사례로 검증하고 FE 오류 변환도 확인한다.

최종 연결 실행: **Spring 생산자1개·프런트 계약8개 통과, 실패/건너뜀0**. 최초 검사에서 실제 응답에 없는 type을 필수로 둔 오류를 발견해 문서를 수정한 뒤 생산자/소비자를 모두 다시 실행해 통과했다. `pnpm test:notifications:contract`로 재현한다. 이번 변경에서 일반 전체 프런트 회귀·PostgreSQL·기기 QA는 재실행하지 않았다.

## 남은 범위

- 알림6개 필드 nullable 및4개 작업의 required·현재 확인한400/401/404 오류 명시를 완료했다. 예기치 않은500 등 모든 오류 가능성을 문서화한 것은 아니다.
- 전체 JSON Schema validator 대신 알림 응답의 타입/$ref/anyOf/required/enum 부분집합을 검증한다. format/additionalProperties 등 전체 JSON Schema 키워드의 적합성을 보장하지 않는다.
- JWT·실제 공유/배포 서버·CORS·다중 계정/기기·224 최종 화면은 남아 있다. watermark 정책·발급·전체 읽음은 제외했다. 생성한 OpenAPI 전체 파일에 해당 경로는 포함될 수 있으나 이 회귀는4개 작업만 검사한다.
- 커밋·푸시·MR·Jira·제품 DB는 변경하지 않았다.
