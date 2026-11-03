# 캔버스 요소 프론트 연결

## 기준과 범위

백엔드 `CanvasElementController`·생성/수정 DTO·`CanvasElementService`를 읽어 프론트 요청을 맞춘다. 백엔드·인프라·AI 코드는 수정하거나 실행하지 않는다.

현재 편집기 `useMemberCanvasCollaboration`은 `createCanvasWriteApi`를 사용한다. 서버 `GET /diaries/{diaryId}/members`의 활성 참여자가 1명이면 `createCanvasElementApi`, 2명 이상이면 기존 `createCanvasApi`의 `/canvas-operations`를 사용한다. 이는 서버 `MemberDiaryListQuery.shared`와 같은 기준이며 접속 인원·visibility·오래된 화면 캐시를 기준으로 추정하지 않는다. 같은 변경을 두 경로로 이중 전송하지 않는다. 기존 로컬 저장 큐·미디어 준비·원격 수신·페이지 관리 구조는 유지한다.

| 기능 | 메서드·경로 (`/api/v1` 기준) | 응답 |
|---|---|---|
| 목록 | `GET /pages/{pageId}/elements` | `{items}` |
| 생성 | `POST /pages/{pageId}/elements` | `{element}` |
| 수정 | `PATCH /pages/{pageId}/elements/{elementId}` | `{element}` |
| 삭제 | `DELETE /pages/{pageId}/elements/{elementId}` | 빈 응답 |
| 복구 | `POST /pages/{pageId}/elements/{elementId}/restore` | `{element}` |
| 일괄 변경 | `POST /pages/{pageId}/elements/batch` | `{items}` |

개인 다이어리의 단일 변경은 해당 단건 API, 여러 요소를 함께 바꾸는 행동은 batch 한 번으로 전송한다. PATCH에는 현재 `version`을 보낸다. batch에는 기존 `creates`·`updates`·`deleteElementIds`·`restoreElementIds` 형식을 사용한다. 공유 다이어리는 이 변경들을 기존 작업 반영 요청에 담고 작업 ID·expectedVersions를 유지한다. 생성 UUID와 미디어 파일 참조는 기존 변환기를 사용한다. 다른 페이지 응답·중복 요소 ID·지원 요소의 잘못된 데이터는 성공으로 반영하지 않는다.

복구 메서드와 명시적 `restoreElementIds` 변경은 요소 복구 API에 연결한다. **현재 화면의 Undo·Redo 버튼은 기존 공동편집 작업 이력 API를 유지한다.** 단순 요소 복구는 생성 취소·이동 취소·다중 작업 취소와 같지 않으므로 Undo를 무조건 `/restore`로 바꾸지 않는다. 실시간 WebSocket 및 `/history/me`·`/undo`·`/redo`는 별도의 공동편집 기능이다.

## 재시도와 한계

- HTTP 인증은 공통 `getAuthHeaders`가 있는 경우 그 인증을 그대로 사용한다. 기존 페이지/WebSocket 전용 `getCollaborationHeaders`에 새 `/members` 경로를 전달하면 전송 전 예외가 `NETWORK_ERROR`로 포장되므로 HTTP 요청에 이 보조 인증을 중복 적용하지 않는다. 공통 인증이 없는 이전 인터페이스에만 기존 fetch 보조 처리를 유지한다. WebSocket 인증은 기존 경로를 유지한다.

- 작업을 전송 준비할 때 활성 참여 상태를 재조회하고 선택한 경로(`canvasWriteMode`)를 로컬 전송 큐에 함께 저장한다. 이 값은 서버 요청에는 포함하지 않는다. 준비된 작업의 응답 유실·재시작 중 공유 상태가 바뀌어도 같은 경로로 재시도한다. 다음 새 작업부터 최신 상태를 적용하며 기존 훅의 직렬 큐를 유지한다. 경로 표시가 없는 이전 버전의 준비된 작업은 원래 공동편집 경로를 유지한다.
- 멤버 조회 실패·빈/잘못된 멤버 응답에서는 개인 모드로 간주하지 않고 준비를 중단한다. 참여 확인과 실제 쓰기 사이를 잠그는 서버 API는 없으므로 그 사이 발생한 상태 변경까지 원자적으로 보호하는 것은 아니다.

- 요소 API는 `clientOperationId` 중복 실행 방지를 제공하지 않는다. 전송 전 최신 요소 목록을 읽고 이미 같은 생성·수정·삭제 결과가 있으면 해당 쓰기를 생략한다. 단건 변경 뒤에는 목록을 다시 읽어 버전·순서를 갱신한다.
- 응답 유실·앱 재시작의 로컬 대기 큐는 유지한다. 생성/수정 내용이 달라졌거나 버전이 다르면 409로 기존 세션의 재조회·충돌 처리를 거친다. 기기 전송 기록을 지우지 않는다.
- 이 대조는 `/canvas-operations`의 서버 명령 키와 동일한 보장이 아니다. 특히 DELETE·restore에는 서버 버전 조건이 없으므로 목록 조회와 쓰기 사이의 동시 변경까지 프론트에서 원자적으로 보호할 수 없다. 서버의 현재 계약을 변경하지 않는다.
- batch 항목별 최대 100개·propertiesJson 요소별 128KiB/전체 4MiB 등 서버 제한은 그대로 적용된다. 큰 행동을 임의로 여러 트랜잭션으로 나누지 않는다.

## 검증 결과 (2026-11-02)

- 인증 보완·임시 로그 제거 후 최종 회귀: `node --test tests/canvas-auth-headers.test.js tests/canvas-write-api.test.js tests/canvas-element-api.test.js tests/collaboration-hook.test.js tests/collaboration-session.test.js tests/collaboration-reducer.test.js tests/collaboration-media.test.js tests/page-settings.test.js` 111개 통과.
- 최종 웹 번들: `pnpm exec expo export --platform web --output-dir .expo/canvas-final-export` 통과.

- 개인/공유 분리 회귀: `node --test tests/canvas-write-api.test.js tests/canvas-element-api.test.js tests/collaboration-hook.test.js tests/collaboration-session.test.js tests/collaboration-reducer.test.js tests/collaboration-media.test.js tests/page-settings.test.js` 105개 통과. 공유→개인→공유의 훅 저장 경로, 재시작 시 준비된 경로 유지, 이전 큐 호환을 포함한다.
- 인증 보완: `node --test tests/canvas-auth-headers.test.js tests/canvas-write-api.test.js tests/canvas-element-api.test.js tests/collaboration-hook.test.js` 37개 통과. 실제 인증 모듈·공통 HTTP transport로 Bearer/Basic의 멤버 조회를 검증한다. 위 실행과 중복되므로 개수를 합산하지 않는다.
- 분리 후 웹 번들: `pnpm exec expo export --platform web --output-dir .expo/canvas-routing-export` 통과. 인증 보완은 이후 적용됐으며 최종 검증 결과는 아래에 기록한다.

## 화면 연결 및 실기기 확인 범위

Android Expo Go에서 사용자가 개인·공유 편집과 재진입 유지를 확인했다. 임시 진단 로그로 개인 요소 조회·생성·수정·삭제·일괄 변경, 공유 작업 반영 3회 및 `/undo`·`/redo` 요청 성공을 확인했다. 진단 로그는 확인 후 제거했다. 로그의 success는 HTTP transport가 성공 응답으로 처리했다는 뜻이며 정확한 HTTP 상태 숫자를 기록한 것은 아니다.

| 기능 | 화면 연결 | 검증 |
|---|---|---|
| 목록·생성·수정·삭제·일괄 변경 | 개인 편집 동선 연결 완료 | 자동 테스트 및 실기기 요청 경로 확인 |
| 단건 복구 `/elements/{id}/restore` | 어댑터만 구현, 현재 호출하는 화면 동선 없음 | 자동 테스트만 완료, 실기기 미검증 |
| 공유 작업 반영 `/canvas-operations` | 기존 동선 유지 | 실기기 요청 성공 확인 |
| 작업 취소·다시 실행 `/undo`·`/redo` | 기존 동선 유지 | 실기기 요청 성공 확인 |

복구 API 1개까지 화면 구현이 완료됐다고 표시하지 않는다. 현재 저장 세션은 일반 편집으로 `restoreElementIds`를 만들지 않으며, 화면의 삭제 되돌리기는 `/undo`를 사용한다. 실기기 개인↔공유 상태 전환 중 경로 변경·응답 유실·앱 재시작은 이번 로그로 확인하지 않았고 자동 테스트 범위다.

## 실기기 확인 순서

1. 일반 로그인 후 본인 서버 다이어리를 연다.
2. 텍스트·획·스티커·도형을 각각 추가하고 저장 완료 후 홈→재진입해 유지되는지 확인한다.
3. 단일 요소 이동·색/크기 변경·삭제 후 재진입한다.
4. 여러 요소를 선택해 함께 이동하거나 삭제한 뒤 재진입한다.
5. 삭제 후 기존 Undo·Redo로 되돌리고 다시 실행되는지 확인한다(공동편집 이력 경로).
6. 사진이 있는 페이지를 열어 미디어 수신과 기존 페이지 추가·복사·설정이 유지되는지 확인한다.
7. 공유 다이어리는 `/canvas-operations`로만 저장되는지 확인한다. 초대를 상대가 수락해 공유가 된 뒤 새 편집은 공동편집 경로, 참여 해제 후 1명이 되면 새 편집은 요소 경로로 저장되는지 확인한다. 초대 전송만으로는 공유로 전환하지 않는다.

실제 서버 요청·네이티브 실행 결과는 자동 테스트와 구분해 기록한다.

## 589eb160 리뷰 보완

- 생성 재시도 비교는 숫자 필드의 동등한 숫자 표기, 서버가 제거하는 이름 앞뒤 공백, JSON 객체 키 순서를 허용한다. 좌표·정렬·속성 내용이 다르면 충돌을 유지한다. 실제 서버 응답 유실 재현은 아직 미검증이다.
- 서버 UUID가 아닌 다이어리 ID는 초기화 전에 오류 상태로 안내하고 요청을 보내지 않는다.
- 미디어 다운로드 실패는 기존 canvasMedia의 files.fail 상태와 자동 백오프·수동 재시도를 유지한다. 일부 이미지 실패로 전체 요소 조회를 중단하지 않는다.
- 현재 백엔드 DiaryMember의 지원 역할은 OWNER·EDITOR이므로 역할 검증은 유지한다. 역할 확장 시 서버 계약과 함께 변경한다.
- `node --test tests/canvas-element-api.test.js tests/canvas-write-api.test.js tests/collaboration-hook.test.js tests/collaboration-media.test.js tests/collaboration-media-files.test.js`: 55개 통과.

## f93bcbf7 리뷰 보완

- 공통 인증이 있는 모든 HTTP 요청은 createAuthenticatedMemberTransport의 세션 검증과 auth.getAccessToken의 계정 검증을 사용한다. 이전 HTTP 브리지를 중복 적용하지 않으며 WebSocket 인증은 별도로 유지한다. 현재 getConnectionOptions는 미로그인 상태에서도 설정을 반환한다. 계정 불일치·생성 후 세션 변경의 전송 차단을 테스트한다.
- 개인 경로도 최초 페이지 조회에서 pageId·diaryId를 검증한 뒤 요소를 조회한다. 성공한 소속 검증만 해당 API 인스턴스에 캐시하며 새 세션에서는 다시 확인한다. 실제 권한은 계속 서버가 요청마다 검증한다.
- 개인 저장의 사전 목록 조회는 응답 유실 뒤 중복 생성 방지를 위해 유지한다. 단건 저장의 사후 조회는 아래 64d16891 보완에서 제거했다. 멤버 조회는 개인/공유 전환을 즉시 반영하기 위해 유지한다. 실제 모바일 망의 지연 측정은 아직 수행하지 않았다.
- 공유 경로의 연속 행동은 서로 다른 clientOperationId를 사용한다는 훅 테스트를 복구했다.
- `node --test tests/canvas-auth-headers.test.js tests/canvas-write-api.test.js tests/collaboration-hook.test.js`: 30개 통과.

## 64d16891 리뷰 보완

- 개인 단건 생성·수정·복구는 검증된 쓰기 응답의 element를 사전 목록에 반영하며, 삭제는 성공 응답 후 해당 요소를 제거한다. 사후 GET을 없애 쓰기 성공 뒤 재조회 오류 때문에 대기 작업이 남는 경로를 제거했다. 이후 원격 변경은 기존 동기화에서 가져온다. 쓰기 응답 자체가 유실·비정상이면 기존 재시도 대조를 유지한다.
- 단건 apply는 GET 1회와 쓰기 1회로 감소했다(기존 3회→2회). 멤버 조회·개인 페이지 최초 소속 확인은 별도이며 유지한다. 요소 1,000개 자동 테스트로 요청 수·다른 요소와 지원하지 않는 요소의 정렬값 보존을 확인한다. 이는 가짜 transport 검증이며 실제 서버 부하·모바일 지연 측정 결과가 아니다.
- UUID 검증은 canvasElements.isUuid를 요소 API·저장 분기·편집기 훅에서 공유한다.
- `node --test tests/canvas-element-api.test.js tests/canvas-write-api.test.js tests/canvas-auth-headers.test.js tests/collaboration-hook.test.js tests/collaboration-session.test.js tests/collaboration-reducer.test.js`: 74개 통과. 단건 응답으로 저장 확정·재시도·공유 전환·공유 작업 ID 회귀를 포함한다.

## d1fc426a 계약 확인

- CanvasElementService.batchTracked는 변경 후 listWithoutPageCheck(pageId)를 반환한다. 따라서 batch의 items는 변경된 행만이 아니라 페이지 전체 활성 요소 목록이다. 프론트는 이를 전체 스냅샷으로 적용한다. 변경분만 반환하는 가짜 응답은 현재 서버 계약과 다르므로 호환 대상으로 가정하지 않는다. 변경하지 않은 요소 보존과 삭제·추가 반영을 테스트한다.
- CanvasElementController.delete/restore와 CanvasElementBatchRequest에는 삭제·복구 버전 조건이 없다. batchTracked도 삭제·복구에는 버전을 검사하지 않는다. 따라서 batch로 우회해도 조회와 삭제 사이의 같은 계정 다른 기기 수정 경쟁을 해결하지 못한다. 개인 요소 API·공유 canvas-operations 분리는 유지하며, 삭제·복구의 원자적 버전 조건은 백엔드 계약 보완이 필요하다. 현재 사전 대조는 요청 전에 이미 알려진 충돌만 차단하며 서버 실행 시점의 경쟁까지 보장하지 않는다.

## 대량 요청 경계 보완 (2026-11-03)
- 종류별 100개·expectedVersions 200개 제한을 공용 검사로 적용한다. 회원 편집기 새 행동의 초과 변경은 적용 전 차단하고, 과거 초과 큐는 기기 원본과 함께 보존해 전송 보류한다. 정상 작업을 임의 분할하지 않는다.
- 상세 계약·검증·과거 큐 복구 한계는 [캔버스 대량 편집 요청 제한](./canvas-batch-limit.md)을 참고한다.
