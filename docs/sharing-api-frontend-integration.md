# 공유 API 프론트 연결

S15P31F106-312·313·314·315 · feature/fe/sharing-api-integration

## 현재 범위와 계약

기존 공유 화면·서버 어댑터에 이메일 주소 기반 초대, 보낸 초대 목록·취소, 소유권 양도를 연결한다. 로그인 회원은 서버 API, 게스트는 기존 세션 목업을 사용한다. 최신 백엔드는 가입된 활성 회원을 이메일로 찾아 초대와 앱 알림을 생성한다. 실제 이메일·휴대폰 푸시는 이 엔드포인트에서 발송하지 않는다.

| 기능 | API |
|---|---|
| 초대 링크 생성·재생성 | POST /api/v1/diaries/{diaryId}/invites |
| 현재 링크·보낸 초대 첫 페이지 | GET /api/v1/diaries/{diaryId}/invites?page=0&size=20 |
| 보낸 초대 다음 페이지 | GET /api/v1/diaries/{diaryId}/invites?page={page}&size=20 |
| 이메일 주소로 초대 | POST /api/v1/diaries/{diaryId}/invites/email, body: email |
| 보낸 초대 취소 | DELETE /api/v1/diaries/{diaryId}/invites/{inviteId} |
| 소유권 양도 | POST /api/v1/diaries/{diaryId}/transfer-owner, body: newOwnerUserId |
| 초대 링크 조회·수락 | GET /api/v1/invites/{token}, POST /api/v1/invites/{token}/accept |
| 받은 초대·거절 | GET /api/v1/me/invites, POST /api/v1/me/invites/{inviteId}/decline |
| 참여자 조회·내보내기·본인 나가기 | GET /api/v1/diaries/{diaryId}/members, DELETE /api/v1/diaries/{diaryId}/members/{userId} |

기존 프로필·즐겨찾기의 PATCH /api/v1/diaries/{diaryId}/membership은 팀원 구현을 유지한다. 다이어리 CRUD·홈 알림 창·백엔드·인프라 변경은 이번 범위에 포함하지 않는다.

## 동작과 오류 처리

- 소유자·편집자 모두 이메일 주소로 초대·목록 조회·취소를 사용할 수 있다. 소유권 양도는 소유자의 참여자 관리에서 제공한다.
- 이메일은 앞뒤 공백 제거·소문자 변환 후 보낸다. 202 응답은 가입 여부를 노출하지 않는 공통 안내다. 가짜 대기 행을 추가하지 않고 서버 목록을 재조회한다.
- 보낸 목록은 처음부터 20개씩 요청하고 ID로 합친다. 페이지 조회 실패 시 기존 목록·페이지를 유지하며, 새로고침 후 늦게 도착한 이전 페이지는 반영하지 않는다. 목록 뷰에는 초대 token/inviteUrl을 복사하지 않는다.
- 초대·취소·양도 성공 후 목록 재조회만 실패하면 반영 완료와 조회 실패를 구분해 새로고침을 제공한다. 변경 요청을 자동 반복하지 않으며 401·403·404·폐기된 세션을 성공으로 숨기지 않는다.
- 양도 성공 전 역할은 유지한다. 성공 후 기존 소유자는 편집자로 갱신하고 서버 멤버를 재조회한다. 자동 나가기 요청은 보내지 않는다.
- 공통 getAuthHeaders로 개발 Basic 접근 인증과 회원 토큰을 분리한다. 비공개 참여자 사진은 각 사진 URL을 검증한 뒤 그 URL로 인증 헤더를 만든다. 외부 출처 사진에는 요청하지 않고 리다이렉트를 차단한다.
- 계정 사진은 기존 getProfilePhotoSource가 제공한 개발 게이트웨이 인증만 사용해 메모리 이미지로 표시한다. 회원 토큰은 보내지 않는다. 사진 소스 제공자가 인증 헤더를 반환하더라도 공유 어댑터에서 같은 출처인지 다시 검사하며, 외부 출처·다른 스킴/포트·사용자 정보 포함 URL·잘못된 URL에는 요청하지 않고 기본 이미지로 처리한다. 인증이 필요 없는 공개 계정 사진은 기존 URL을 유지한다.
- 캔버스 fetch 어댑터는 기존 X-DIO-Access-Token을 보존하고, 없을 때만 정상 Bearer 토큰을 옮긴다. 이 처리는 collaboration/canvasFetch.js에서 제공하며 훅과 테스트가 같은 함수를 사용한다.
- API 요청의 임시 진단 로그는 없다. 저장 데이터 형식·마이그레이션 변경도 없다.

## 자동 검증

저장소 루트에서 실행:

```bash
node --test frontend/tests/sharing-api.test.js frontend/tests/diary-sharing-state.test.js frontend/tests/diary-sharing.test.js frontend/tests/sharing-members.test.js frontend/tests/sharing-management.test.js frontend/tests/canvas-auth-headers.test.js frontend/tests/auth-api.test.js frontend/tests/auth-email-verification-api.test.js frontend/tests/auth-routing.test.js frontend/tests/development-access-store.test.js
```

2026-11-01 리뷰 보완 코드 기준 125개 모두 통과. HTTP 응답 함수를 사용하는 프론트 테스트이며 실제 서버 호출은 하지 않는다. 공유 API 23개·캔버스 인증 4개를 포함한다.

- 정원이 찬 서버 다이어리의 소유자·편집자는 초대 API가 있어도 이메일 입력과 전송이 비활성화됨
- 사진 소스 제공자의 출처 검사에 의존하지 않고 인증을 포함한 외부 사진 요청 차단
- 서버 기본 크기를 다르게 둔 45개 보낸 초대의 첫·다음 페이지 누락/중복 방지
- 사진 URL마다 다른 인증 헤더 적용 및 외부 출처 요청 차단
- 회원가입 계정 사진의 Basic 전용 인증 fetch·메모리 이미지 표시, 공개 계정 사진의 URL 유지
- 발송 정규화·오류, 페이지 실패 재시도·늦은 응답, 취소, 양도 실패/성공·역할 전환
- 성공 후 재조회 실패, Basic·회원 헤더 분리, membership JSON·multipart·즐겨찾기 회귀
- 실제 캔버스 fetch 함수와 memberTransport 조합, 두 토큰 헤더 설정·이전 Bearer 경로·Basic 단독·배포 경로

웹 export는 frontend에서 실행한다:

```bash
node node_modules/expo/bin/cli export --platform web --output-dir .expo/sharing-review-export
```

2026-11-01 첫 페이지·사진 URL별 헤더·캔버스 함수 분리 보완 코드로 위 웹 export를 실행해 exit 0을 확인했다. 후속 계정 사진 보완 뒤에는 재실행하지 않았다. 브라우저 화면·실기기 동작 검증과는 구분한다.

## 실기기 검증과 제한

### 마지막 열람 페이지

회원 다이어리의 페이지 진입·이동 시 `PATCH /diaries/{diaryId}/membership`에 `{ lastOpenedPageId }`만 전달한다. 읽기 모드도 포함하며 게스트는 요청하지 않는다. 연속 이동은 요청 순서를 유지하고 대기 중인 위치는 마지막 값으로 합친다. 실패 시 기기 위치 기록은 유지하고 다음 이동·앱 활성화 때 재시도한다. 로그아웃·화면 종료 시 요청을 취소한다.

현재 백엔드 다이어리 조회 DTO의 `myMembership`에는 `isFavorite`만 있으므로 **서버에서 위치를 읽어 다른 기기에 복원하는 기능은 아직 연결할 수 없다**. 같은 기기의 기존 `editorViewState` 복원은 유지한다. 백엔드 조회 응답에 `lastOpenedPageId`가 제공되면 서버 복원을 추가해야 한다. 백엔드는 변경하지 않았다. `node --test tests/member-page-position.test.js`로 저장·중복 억제·순서·실패 재시도·계정 변경·취소를 검증한다. 2026-11-02 Android Expo Go에서 사용자 확인: 2페이지·1페이지 이동 후 홈 재진입 시 같은 기기의 열람 위치 복원 정상. 임시 개발 로그로 페이지 이동의 PATCH `/membership` 응답 200 두 건을 확인했다. 확인 후 임시 로그는 제거했다.

Android 태블릿 Expo Go에서 사용자 확인 완료:

- 공유 정보 조회, 초대 요청·보낸 목록, 취소 확인창 취소/확정
- 수신 계정의 앱 알림·수락, 공유 다이어리 목록과 참여자 반영
- 소유권 양도·역할별 버튼 갱신, 본인 참여 해제·인원 및 목록 반영
- 초대 링크 생성·복사·붙여넣기 조회, 참여자 내보내기 확인 취소/확정
- 캔버스 401 오류 해소, 최신 백엔드 정책에서 앱 초대 알림 수신

위 실기기 기록은 이번 리뷰 보완 전 결과다. 계정 사진 인증 보완 후 회원가입 사진이 본인 다이어리의 공유 화면에 정상 표시되는 것을 사용자가 실기기에서 확인했다. 리뷰 보완 후 캔버스 서버 저장 상태와 보낸 초대 목록 새로고침·상태 유지도 사용자 실기기 확인을 완료했다. 20개를 넘는 보낸 초대의 연속 페이지 동작은 자동 테스트에서 45개 자료로 확인했다. iOS·실제 외부 링크 클릭을 통한 자동 앱 진입은 미검증이다. 홈 알림 창 수정은 별도 담당 범위이며 실제 이메일 발송은 현재 서버 기능이 아니다. 백엔드·인프라 테스트는 실행하지 않았다.


## 강퇴·접근 권한 상실 시 편집기 종료

공유 다이어리를 보고 있는 동안 참여자 조회를 감시한다. 강퇴로 WebSocket이 종료되면 참여자 API를 즉시 재조회하며, 연결이 없을 때의 폴링도 같은 경로를 사용한다. 이 조회가 403 + DIARY_ACCESS_DENIED 또는 404 + DIARY_NOT_FOUND 조합으로 접근 불가를 확인하면 공유 런타임의 해당 다이어리·참여 캐시를 제거하고 onUnavailable(message, error)로 상태를 전달한다. 기존 메시지만 받는 호출부는 그대로 사용할 수 있다.

앱은 해당 다이어리 탭만 닫고 활성 다이어리·열기 대기 요청·공유창을 정리한 뒤 다른 탭으로 이동하지 않고 기본 목록으로 돌아간다. 다른 다이어리 탭은 유지하고 서버 보관함을 새로 조회한다. 목록 갱신 실패가 이미 종료한 편집기를 다시 열지는 않는다. 기기에 남은 편집 문서나 전송 대기 작업을 이 경로에서 삭제하지 않는다.

코드가 없거나 다른 오류 코드를 가진 403/404와 JSON이 아닌 게이트웨이 응답은 탭·캐시를 제거하지 않고 재시도한다. App과 공유 API는 같은 판정 함수를 사용한다.

WebSocket 종료 코드 1008은 세션 만료에도 사용하므로 그 코드만으로 강퇴 처리하지 않는다. 네트워크 단절·타임아웃·500/503은 화면과 캐시를 유지하고 기존 백오프로 재시도한다. 401은 기존 로그인 상태 안내와 세션 만료 흐름에 맡기며 강퇴로 탭을 제거하지 않는다. 감시를 해제하거나 다른 탭으로 전환한 뒤의 늦은 응답은 현재 화면과 캐시를 지우지 않는다.

회귀: frontend에서 node --test tests/kicked-diary-exit.test.js tests/sharing-api.test.js tests/collaboration-socket.test.js. App 밖으로 분리한 퇴장 처리 모듈을 직접 import하고 공유 API 런타임과 함께 실행하여 403/404 퇴장, 다른 탭 보존, 연결 종료 후 확인, 네트워크·타임아웃·500/503 복구, 401 구분, 늦은 응답 무시, 서버 ID와 다른 탭 ID, 목록 갱신 실패를 검사한다. 이는 제어된 HTTP 응답·React 상태 갱신 대체 객체를 쓰는 테스트이며 실기기 두 계정 QA와 구분한다.

2026-11-12 검증: 위 세 파일과 collaboration-hook·diary-sharing-state·diary-sharing·member-app-store·route-memory 테스트를 함께 실행해 총 160건 통과(신규 강퇴 회귀 12건 포함). pnpm exec expo export --platform web --output-dir .expo/kicked-diary-exit-export 성공. 실기기 테스트는 사용자가 직접 수행해 정상 동작을 확인했다고 보고했다. 기종·OS와 세부 실행 로그는 전달받지 않았으며, 자동화 검사와 사용자 실기기 확인을 구분한다.

리뷰 보완: useKickedDiaryExit는 React 생명주기를 담당하고 watchKickedDiaryExit가 실제 퇴장 흐름을 처리한다. App.js AST 추출을 제거했으며, 퇴장 모듈을 직접 import한 테스트와 훅 모듈의 생명주기 테스트로 분리했다.

2026-11-12 리뷰 보완 검증: kicked-diary-exit-hook 테스트를 포함한 관련 9개 파일 172건 통과, 최종 소스 웹 export 성공. 코드 없는 403/404·무관하거나 상태와 불일치하는 코드·HTML 게이트웨이 응답의 캐시/탭 유지 및 재시도를 검증했다. 사용자 실기기 정상 확인은 보완 전 9ddd288f에 대한 보고이며 이번 보완 후 실기기 재확인은 별도다.
