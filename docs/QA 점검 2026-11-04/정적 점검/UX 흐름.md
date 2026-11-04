# UX 흐름 점검 (총 34건: P0 1 / P1 10 / P2 11 / P3 12)

### [P0] 공유 다이어리에서 페이지 한 장 삭제가 확인창도 되돌리기도 없이 즉시 실행됨
- 위치: src/editor/components/panels/PageList.js:324, EditorScreen.js:558-563, :1163, :1205(`canUndoDelete={!textSync.enabled}`)
- 현상: 페이지 메뉴 `페이지 삭제`는 `onRemove(menuId)` 즉시 호출. 여러 장 삭제만 ConfirmDialog. 회원(공동 편집)은 `canUndoDelete=false`, 토스트 "페이지를 삭제했어요."뿐. 서버 복구 수단 없음(추정).
- 영향: 오터치 한 번에 다른 참여자의 페이지가 모두에게서 사라짐.
- 해결안: 단건도 `confirmAction`, 공동 편집은 소프트 삭제(페이지 휴지통 30일) 또는 ActionToast "되돌리기".

### [P1] 앱을 다시 켤 때마다 로그아웃되어 게스트로 시작 — App.js:109, authApi.js:12,:44, docs/auth-frontend-integration.md:24("재실행 자동 로그인은 아직 없다"). SecureStore refresh 복원 + 실패 시 게스트 폴백 토스트.
### [P1] 세션 만료 시 재로그인 경로 없음 — authApi.js:179-182, :424-426(`session = null`만), 401 전역 처리 없음. 화면마다 다른 문구(MemberLibraryNotice.js:19, notificationErrorNotice.js:10, SaveIndicator). `onSessionExpired`→`loginRequest` 시트.
### [P1] 로그인 오버레이에서 Android 뒤로가기가 화면을 닫지 못함 — App.js:156(absoluteFill zIndex 10), AuthScreen.js:242-263(welcome에서 `return false` → 뒤 화면 핸들러 실행, 앱 종료 가능). `onClose()` 후 `return true`, 백 핸들러 우선순위 스택.
### [P1] 게이트 로그인 후 원래 동작이 이어지지 않고 편집기에서 보관함으로 튕김 — App.js:127-129(`continueFromLogin` 실행 안 함), :151(key 재마운트), loginGate.js:43, sharingGate.js:6. 가져오기 완료 후 해당 다이어리 자동 열기·deferred action 보존.
### [P1] 저장소 읽기 실패 시 보관함이 빈 상태로 보이고 이후 변경 조용히 유실 — useDiaries.js:36,43-48,65-66,71-73; App.js:477,572-573. 오류 배너(다시 시도)+쓰기 차단, saveJSON false면 ActionToast.
### [P1] 편집 문서 읽기 실패해도 "저장됨", 손상 JSON은 빈 문서로 덮어씀 — useEditor.js:90-94,:135, editorDocs.js:68(`catch { saved = null }`), :95. 배너+읽기 전용, `…:corrupt:{timestamp}` 백업 후 새 문서, 원자적 저장.
### [P1] 공동 편집 충돌(409)에 해결 수단 없음 — SaveIndicator.js:15,38-41, useMemberCanvasCollaboration.js:216,:273. 탭 시 `서버 내용으로 새로고침`/`내 변경 다시 적용` 시트.
### [P1] 알림 화면이 "연결 검증용 패널", 내부 ID가 버튼 글자로 노출, 이동 가능한 알림이 초대뿐 — NotificationPanel.js:11, :80-82(`초대 확인 ${row.id}`), :42 주석, :95("공유 담당의 수락·거절 화면 연결을 기다리고 있어요."), notificationPresentation.js:11-13. 가이드 컴포넌트로 재작성, 종류별 딥링크.
### [P1] 알림 설정 토글이 실제 알림에 반영되지 않음 — src/shared/notificationSettings.js:3-4("서버 발송은 아직 연결 전"), NotificationSetting.js:1, NotificationSettingsScreen.js:33-45. 즉시 저장+서버 전달, 연결 전이면 비활성+"준비 중".
### [P1] iOS에서 "폰트 추가"가 로그인 후에야 불가능하다고 알려 줌 — handwriting/generator.js:9-10,14-16, DecorationStudioScreen.js:182, HandwritingStudio.js:41. 공방 진입 시 `capabilities().available`로 비활성·사유 표시.
### [P1] 게스트 앱 잠금 비밀번호를 잊으면 복구 수단 없음 — App.js:220-224(`forgotAppLock` 회원만), AppLockSetting.js:13-18, PinScreen.js:51-57. 설정 시 복구 불가 고지, 생체 인증, "로컬 데이터 지우고 해제" 옵션.

## P2
- 로컬 휴지통 이동·즐겨찾기·이름 바꾸기 저장 실패 미안내 — useDiaries.js:31,71-73,75-79,98-101; App.js:471-483.
- 참여 해제·공유 목록 소실 시 편집기→보관함 조용히 이동 — App.js:371-378.
- 편집기를 떠나면 진행 중 내보내기 안내 없이 중단 — ExportRunner.js:82, EditorScreen.js:1086,957-959,1501-1511. 확인창 또는 App 레벨 알약.
- 서버/개발 용어 노출 — authApi.js:113,100,103(`data?.detail`), sharingApi.js:47, MemberRequestNotice.js:7-13("확인하지 못한 이전 생성 요청"), MemberLibraryNotice.js:10-11, canvasMediaFiles.native.js:29·shareImage.native.js:21("기존 에셋 API 기준으로 5MB"), appleLogin.native.js:19·googleLogin.native.js:5("Expo Go…"), App.js:454·467·754 `error.message`. 오류 매핑표.
- 오프라인/네트워크 감지 전무 — NetInfo 없음, authApi.js:83,111-113. 전역 오프라인 배너+복귀 재시도.
- 로그아웃 확인창 없음 — ProfileScreen.js:105, App.js:121-126.
- 로컬 페이지 삭제 "되돌리기" 문구뿐 — EditorScreen.js:562,1169,1229. ActionToast 액션.
- 게스트 제한이 눌러서야 드러남(벨·공유·공방 도구) — App.js:913-915, sharingGate.js:8, DecorationStudioScreen.js:182,417-419.
- 알림 설정 저장 버튼 방식, 변경 조용히 버려짐 — NotificationSettingsScreen.js:33-45,67-70.
- 계정 찾기 진입점이 미구현 안내만 — AuthScreen.js:592-600("계정 서비스 연결 후"), :166-169("회원가입 준비 중"). 제거 또는 실제 경로.
- 안내 문구 §8 위반 — EditorScreen.js:999("집중 편집 · 두 손가락으로 이동하고 확대하세요."), GuestImportDialog.js:22, EditorScreen.js:959("다이어리 홈은 다른 화면에서 연결될 예정이에요." 개발 잔재).

## P3
- 로그인 오류 메시지 5초 자동 소멸(AuthScreen.js:286-290) · 소셜 로그인 취소가 오류처럼 표시(googleLogin.native.js:17,21, appleLogin.native.js:30) · 이메일 인증 `인증번호 받기` 직접 눌러야(EmailVerification.js:94-99) · 첫 사용 안내 빈 보관함 한 줄(LibraryScreen.js:118,359,458, EmptyState.js:28 `onCreate` 미전달) · 스플래시 8초 후 빈 작업영역 가능(App.js:80,133,817) · 편집기 500ms 상한 후 로딩 표현 불명확(App.js:74,347) · 알림→초대→공유 허브 모달 3단 · 탈퇴 비활성 사유 접근성 힌트에만(ProfileEditScreen.js:390-391) · 가져오기 창 `가져오지 않기`/`나중에` 의미 중복, `failed[0].error.message` 원문 노출(GuestImportDialog.js:24-26,39).

## 빈 catch / 조용한 실패 (catch 약 596곳 중 삼킴 146곳+)
- useDiaries.js:31(저장 큐 실패), :55, :149 · useEditor.js:65-71(`saveEditorDoc().then().finally()`에 `.catch` 없음 → "저장 중" 고착 가능, 추정), :78(hydrateMedia) · usePenSettings.js:24, useRecentPenColors.js:13/19, usePalettes.js:46 · EditorScreen.js:575 · App.js:306,394 · ProfileScreen.js:62(`getProfile` 실패 무시) · authApi.js:21/24/30.

## 잘 되어 있는 점
- 자동 저장(1.2초, 5초 상한, 백그라운드·화면 이동 flush)·저장 상태 표시·읽기 실패 시 덮어쓰기 방지.
- 다이어리 만들기/수정 `저장하지 않고 닫을까요?`, 일괄 휴지통 부분 실패 개별 보고, 영구 삭제·탈퇴(`탈퇴합니다` 입력)·비밀번호 변경 단계적 확인.
- 내보내기 알약(진행 %, 취소)+완료/실패 토스트.
- 초대 흐름 만료·취소·거절·이미 수락 구분, 이메일 인증 만료·쿨다운·6자리 검증.
- BootSplash로 빈 화면 깜빡임 차단, Android 뒤로가기 시트→보조 화면→보관함 단계 처리(로그인 오버레이 제외).
