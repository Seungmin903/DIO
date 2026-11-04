# iOS 점검 결과 (총 15건: P0 1, P1 5, P2 6, P3 3) — 핵심 파일 위주, 전수 아님

### [P0] production/preview iOS 빌드에서 포인터 이벤트가 꺼져 Apple Pencil 구분이 force 휴리스틱에만 의존
- 위치: eas.json:5-16, plugins/withPointerEvents.js(shouldEnableIOSPointers), src/editor/utils/stylus.js:47-53
- 현상·근거: `DIO_IOS_POINTER_EVENTS=1`은 development 프로필에만 있다. production/preview는 `RCTSetDispatchW3CPointerEvents(false)`가 된다. iOS 펜 판별은 `touch.force > 0`이면 'pen', 아니면 'touch'. 플러그인 주석에도 "운영 iOS 입력 회귀는 별도 기기 QA 대상"이라고 적혀 있다.
- 영향: 스토어 빌드가 개발 빌드와 다른 입력 경로로 출시된다. Pencil 첫 샘플 force가 0이면 손가락으로 오분류될 수 있다(추정). 손바닥 거치 차단과 펜 모드가 오동작한다. iOS 실측 근거가 없다.
- 해결안: iPad 실기기(Pencil 1/2/Pro)에서 production 프로필로 QA 후 포인터 이벤트 기본 on 여부 결정. 또는 Touch의 `touchType === 'stylus'`로 판별. QA 전 출시 보류.

### [P1] 계정 삭제 시 Apple 토큰 revoke 확인 불가 (App Store 5.1.1(v))
- 위치: src/auth/authApi.js:408-427, src/auth/ProfileEditScreen.js:241-243
- 현상·근거: 탈퇴는 `DELETE me` 호출뿐. appleLogin.native.js는 identityToken만 반환하고 authorizationCode를 서버에 넘기지 않는다. 백엔드 revoke 여부 미확인(추정).
- 영향: Sign in with Apple 앱은 삭제 시 `appleid.apple.com/auth/revoke` 호출 요구. 누락 시 심사 지적.
- 해결안: 로그인 때 authorizationCode를 서버로 보내 refresh token 저장, 탈퇴 시 서버가 revoke 호출.

### [P1] 알림 권한을 로그인 직후 자동 요청 (HIG 위반)
- 위치: App.js:230-243, src/notifications/nativePushAdapter.js:8-9
- 현상·근거: authenticated 상태가 되면 곧바로 startPushRuntime → `requestPermissionsAsync()`. 사전 설명 단계 없음.
- 영향: 맥락 없는 시스템 팝업이라 거부율↑. iOS는 거부 후 재요청 불가 → 알림 영구 차단.
- 해결안: 알림 설정 토글을 처음 켤 때나 초대 수락 맥락에서 요청. 사전 안내(pre-permission) 뒤 호출, 거부 상태면 `Linking.openSettings()` 안내.

### [P1] iPad 가로 고정 + requireFullScreen
- 위치: app.json:13-17, src/shared/useOrientationLock.js:17-22
- 현상·근거: `requireFullScreen: true`이고 태블릿은 `LANDSCAPE`로 잠긴다. Split View/Stage Manager 불가. app.json orientation은 `default`라 선언과 런타임 잠금이 다르다.
- 영향: iPad 세로 사용 불가. iPadOS 창 모드 흐름과 충돌(추정).
- 해결안: `requireFullScreen` 제거. 레이아웃은 이미 useWindowDimensions 기반. 세로 허용 검토 또는 `ios.infoPlist.UISupportedInterfaceOrientations~ipad` 명시.

### [P1] StatusBar 항상 숨김, 상단 인셋 처리가 폰에서만
- 위치: App.js:149, app.json(expo-status-bar hidden:true), App.js:975-977
- 현상·근거: 전 화면에서 상태바를 숨긴다. 상단 인셋 블록은 `isPhone && insets.top > 0`일 때만. 좌우(979-985)·하단(946)은 처리돼 있다.
- 영향: 시계·배터리 확인 불가. iPad 상단 UI 겹침 가능(추정).
- 해결안: 편집기 밖에서는 상태바 표시(`style="dark"`), 편집기에서만 hidden. 태블릿도 insets.top 반영.

### [P1] Dynamic Type 대응 없음
- 위치: src/handwriting/DrawingPad.js:57(allowFontScaling 유일), src/shared/dioText/DioText.js(상한 없음), src/diary/styles.js:134(고정 높이 예)
- 현상·근거: `maxFontSizeMultiplier` 0건. 기본 allowFontScaling=true라 시스템 글자 확대 시 고정 height 요소에서 잘림.
- 영향: 큰 글씨 사용자의 버튼·탭 라벨 잘림.
- 해결안: DioText/DioTextInput 래퍼에 `maxFontSizeMultiplier={1.3}` 기본값(한 곳 수정으로 전체 적용). 캔버스·속지 글자는 `allowFontScaling={false}`.

### [P2] 햅틱 미사용
- 위치: package.json(expo-haptics 없음), src 0건
- 해결안: `selectionAsync`(도구 전환), `impactAsync(Light)`(스냅), `notificationAsync(Success)`(저장 완료).

### [P2] elevation만 있는 그림자
- 위치: src/editor/components/canvas/Canvas.js:1024, SelectionOverlay.js:321,339, src/shared/theme.js:43,50
- 현상: shadow* 병기 여부 개별 확인 필요(추정). iOS에서 그림자 없음.
- 해결안: RN 0.88 `boxShadow`로 통일.

### [P2] KeyboardAvoidingView에 keyboardVerticalOffset 없음
- 위치: AuthScreen.js:399, PasswordResetScreen.js:140, ProfileEditScreen.js:274·433, TextLinkDialog.js:18, PageSettingsDialog.js:40, SharingHub.js:489; src/auth/useProfileKeyboard.js는 keyboardDidShow만 구독
- 영향: iPad 플로팅/분리 키보드에서 screenY 보정 어긋남(추정).
- 해결안: 헤더 높이를 offset으로, iOS는 keyboardWillChangeFrame, 플로팅 키보드는 보정 생략.

### [P2] iOS 모달/뒤로가기 관례 부족
- 위치: ConnectedDiaryLibrary.js:59, DiaryMutationPanel.js:75, MockLibraryApp.js:45
- 현상: onRequestClose만 쓰는데 iOS Modal에서는 호출되지 않음. 왼쪽 가장자리 스와이프·시트 끌어내리기 없음.
- 해결안: `presentationStyle="pageSheet"`+`onDismiss`, 시트 핸들 끌어내리기, 상시 닫기 버튼.

### [P2] 개인정보 매니페스트 앱 수준 선언 없음
- 위치: app.json(ios.privacyManifests 없음)
- 영향: 업로드 시 ITMS-91053 경고 가능(추정).
- 해결안: 빌드 후 Xcode Privacy Report 확인, 수집 데이터(이메일·사진·사용자 콘텐츠·푸시 토큰) 선언.

### [P2] 카메라/마이크 권한 문구
- 위치: app.json:19-24
- 현상: image-picker 플러그인에 photosPermission만 있고 `launchCameraAsync` 사용처 없음. 플러그인 기본값이 NSCamera/NSMicrophoneUsageDescription을 추가할 수 있음(추정).
- 해결안: `cameraPermission:false`, `microphonePermission:false` 지정.

### [P3] Pencil 더블탭/스퀴즈/호버, 외장 키보드 단축키 없음
- 위치: PenInput.js:117-187 (force 중심)

### [P3] 아이콘 알파 확인 필요
- assets/images/icon.png 1024px 알파 채널 제거 여부 확인. buildNumber는 eas `appVersionSource: remote`로 자동.

### [P3] 푸시 APNs 설정
- eas.json·app.json에 `UIBackgroundModes` 등 명시 없음, EAS 자동 처리 의존. 빌드 후 aps-environment 엔타이틀먼트 확인.

## 권한 대조
- NSPhotoLibraryUsageDescription·NSPhotoLibraryAddUsageDescription 충족. 앱 잠금은 PIN(src/shared/appLock.js)이라 Face ID 문구 불필요. 마이크 사용처는 대조 못 함.

## 잘 되어 있는 점
- Sign in with Apple 구현(appleLogin.native.js)·`usesAppleSignIn: true`·앱 내 탈퇴 UI.
- 사진 저장은 쓰기 전용 권한(`requestPermissionsAsync(true, [])`)과 savePhotosPermission 문구.
- 가로 좌우 인셋·하단 인셋을 App.js에서 일관 처리(946-985).
- 알림 `canAskAgain` 처리와 마지막 알림 응답 딥링크 처리, `usesNonExemptEncryption:false`.
- expo-navigation-bar는 Platform android 가드+try/catch로 iOS 무해.
