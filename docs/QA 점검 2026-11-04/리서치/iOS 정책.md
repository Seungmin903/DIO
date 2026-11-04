# 리서치 — iOS·App Store 정책 (기준일 2026-11-04)

> "확인함"은 Apple·Expo 1차 문서를 직접 읽은 것. HIG는 `tutorials/data/design/...json` 경로로 읽어 인용이 정확함.

**최우선 발견**: **Expo SDK 58은 iOS 27 SDK 기준**이라 `requireFullScreen`이 더는 창 크기 조절을 막지 못하고 `UIDesignRequiresCompatibility`도 무시된다. 가로 고정 태블릿 배치가 깨질 수 있다.

### 1. iPadOS 창 모드와 `UIRequiresFullScreen`
- 출처: [TN3192](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key)(최초 2025-09-08, 개정 2026-10-09) · [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58) · [Expo app config](https://docs.expo.dev/versions/latest/config/app/)
- 핵심: "Starting in iPadOS 26, `UIRequiresFullScreen` and its associated compatibility mode are deprecated and will be ignored in a future release." / "Starting in iOS 27 and iPadOS 27, `UIRequiresFullScreen` no longer opts your app out of resizing on either platform. Instead, the system resizes your app's scene discretely." / iOS 27·iPadOS 27부터 launch screen이 제출 필수(2026-06-08 추가). Expo: "SDK 58 is built for iOS 27 and includes React Native 0.88." "On iOS 27, requireFullScreen no longer opts your app out of resizing." "`ScreenOrientation.lockAsync` may have no effect while the app is resizable."
- 우리 앱 영향: `requireFullScreen: true`는 iOS 27 SDK 빌드에서 리사이즈를 막지 못하고, 손을 뗄 때 이산적으로 크기가 바뀐다. 가로 잠금 미보장 → 태블릿 가로 고정 배치와 `useWindowDimensions` 분기가 깨질 수 있다. launch screen 설정 확인 필요.
- 권장: 리사이즈 대응 레이아웃, 창 크기 변화에서 폰/태블릿 판정 재계산, 모든 방향 지원, `expo-splash-screen` 점검. 최소 창 크기는 `UISceneSizeRestrictions.minimumSize`(선호값일 뿐 보장 아님, [thread 802069](https://developer.apple.com/forums/thread/802069)). `UIRequiresFullScreenIgnoredStartingWithVersion`은 무시 시작 버전을 앞당기는 키이지 되돌리는 옵트아웃이 아니다.

### 2. 5.1.1(v) 계정 삭제와 Sign in with Apple revoke
- 출처: [TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)(2025-10-03, 시행 2022-06-30) · [심사 가이드라인](https://developer.apple.com/app-store/review/guidelines/)
- 핵심: 계정 생성을 지원하는 앱은 "as of June 30, 2022" 앱 안에서 계정 삭제 가능해야. `/auth/revoke`는 "the only way to programmatically invalidate user tokens", "either a valid refresh token or access token" 필요. 절차: identity token + **authorization code**를 서버로 → 서버가 `/auth/token`으로 교환해 refresh·access 저장. 토큰이 없으면 서버 데이터 삭제 + [수동 revoke 안내](https://support.apple.com/en-us/102571) + credential revoked 알림 응답(삭제 요건은 충족). authorization code는 10분 만료(포럼 답변).
- 우리 앱 영향: authorizationCode를 서버로 안 보내므로 revoke 불가. 앱 내 탈퇴는 있지만 Apple 토큰은 살아 있음. 반려 사례는 확인 못 함.
- 권장: `signInAsync` 결과의 `authorizationCode`를 함께 전송, 서버가 `/auth/token` 교환·암호화 저장, 탈퇴 시 `/auth/revoke`(`client_id`, `client_secret`(JWT), `token`, `token_type_hint=refresh_token`). 기존 가입자는 탈퇴 화면에 수동 revoke 안내(설정 > Apple 계정 > 로그인 및 보안 > Apple로 로그인).

### 3. 4.8 Login Services
- 출처: [Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/) · [Apple 뉴스](https://developer.apple.com/news/?id=7j1f99yf)
- 핵심: Google Sign-In 등으로 "primary account"를 만들면 ① 이름·이메일로 수집 제한 ② 이메일 비공개 허용 ③ 동의 없이 광고 목적 활동 수집 안 함 조건의 "equivalent option" 로그인을 함께 제공. 2024-03 개정에서 ③ 추가(원문 확인 못 함).
- 우리 앱 영향: 구글 + Sign in with Apple 함께 제공 → 충족. Apple 버튼이 구글과 동등한 비중인지 UI 확인. 이메일 비공개 릴레이 주소 처리 점검.

### 4. Privacy manifest
- 출처: [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)(2024-05-01 시행) · [Expo Apple privacy](https://docs.expo.dev/guides/apple-privacy/) · [포럼 774634](https://developer.apple.com/forums/thread/774634)
- 핵심: "You'll need to include approved reasons for the listed APIs used by your app's code (including from third-party SDKs) to upload a new or updated app". Expo: `expo.ios.privacyManifests`에 `NSPrivacyAccessedAPITypes`·`NSPrivacyAccessedAPITypeReasons`(UserDefaults `CA92.1` 등). "Apple does not correctly parse all the PrivacyInfo files included by static CocoaPods dependencies." ITMS-91053/91061은 2차 자료 기준.
- 권장: Xcode Archive Privacy Report로 누락 확인, `npx expo install --fix`, 의존 모듈 `ios/PrivacyInfo` 내용을 `ios.privacyManifests`에 복사, `NSPrivacyTracking: false` 명시.

### 5. 알림 권한
- 출처: [HIG Privacy: Requesting permission](https://developer.apple.com/design/human-interface-guidelines/privacy)(확인함) · [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- 핵심: "Ideally, wait to request permission until people actually use an app feature that requires access." "Avoid requesting permission at launch unless the data or resource is required for your app to function." 사전 안내 화면 허용(버튼 하나, Continue/Next, 취소 없음). `requestPermissionsAsync({ ios: { allowProvisional: true } })`로 조용한 알림, 결과는 `ios.status === PROVISIONAL`.
- 우리 앱 영향: 로그인 직후 자동 요청은 HIG에 어긋남, 거부 시 재요청 불가.
- 권장: 초대·알림 설정 맥락으로 이동 + 단일 버튼 사전 안내, 또는 provisional로 시작.

### 6. Apple Pencil
- 출처: [UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction)(확인함) · [RN Pointer Events 블로그](https://reactnative.dev/blog/2022/12/13/pointer-events-in-react-native)(2022-12-13)
- 핵심: `UIPencilInteraction`은 더블탭(iOS 12.1+)·스퀴즈(Pencil Pro). RN: iOS는 "we leverage the relevant MotionEvent and UITouch events", Fabric 전용·실험적. 활성화: `RCTSetDispatchW3CPointerEvents(YES)` + `UIApplicationSupportsIndirectInputEvents` + `shouldEmitW3CPointerEvents`. Apple Pencil 지원은 "문서화되지 않음". RN 0.88 stable 여부 확인 못 함(문서 404).
- 우리 앱 영향: `touch.force>0` 휴리스틱의 공식 보증 없음. 네이티브 `UITouch.type == .pencil`이 가장 확실.
- 권장: Expo Module로 `UITouch.type` 노출, production에서 Pointer Events 켤 경우 실기기(Pencil·손가락·마우스) 검증, 더블탭·스퀴즈는 `UIPencilInteraction` 모듈.

### 7. HIG 접근성·상태바·시트·햅틱
- 출처: [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)(확인함)
- 핵심: 컨트롤 기본 **44×44pt**, 최소 28×28pt. "Ideally, give people the option to enlarge text by at least 200 percent." 기본 17pt·최소 11pt. Reduce Motion: "reducing automatic and repetitive animations, including zooming, scaling, and peripheral motion", 이동 전환은 페이드로. 상태바 숨김 조건·pageSheet·햅틱 원문은 확인 못 함.
- 권장: `AccessibilityInfo.isReduceMotionEnabled` 분기, 44pt 미만은 `hitSlop`, 편집기만 상태바 숨김 검토, `expo-haptics`는 의미 있는 순간에만.

### 8. Liquid Glass와 `UIDesignRequiresCompatibility`
- 출처: [UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)(확인함) · [포럼 832543](https://developer.apple.com/forums/thread/832543) · Expo SDK 58 changelog
- 핵심: "Temporarily use this key while reviewing and refining your app's UI for the design in the latest SDKs." "The system ignores this key when you build for iOS 27 or later". SDK 58은 iOS 27 빌드, `expo-glass-effect` `isLiquidGlassAvailable` true.
- 우리 앱 영향: 임시 옵트아웃 불가. RN 자체 렌더라 영향 제한적일 가능성, 시스템 UI(알림창·시트·키보드 액세서리) 시각 회귀 확인.

### 9. 2026 제출 요건
- 출처: [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)(확인함) · [Expo 블로그](https://expo.dev/blog/app-store-connect-minimum-sdk-26)
- 핵심: "Since April 28, 2026: Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26…" / "Since September 9, 2026: … must target iOS 13 or later." / "Since January 31, 2026: Age Rating Updates". iOS 27 SDK 의무화 시점 확인 못 함(2차 자료 2027-04 추측).
- 권장: `ios.infoPlist` 사용 목적 문구를 완결 문장으로, App Store Connect 연령 등급 응답 확인.

### 10. 로그인 세션 보관
- 출처: [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)(확인함)
- 핵심: `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: "the entry is not migrated to a new device when restoring from a backup." 기본 `WHEN_UNLOCKED`. iOS 재설치 시 데이터 잔존 "is not guaranteed", Android는 삭제 시 사라짐. 최신 문서는 크기 한도를 강제하지 않고 네이티브가 큰 값을 거부할 수 있다고만 함.
- 권장: `setItemAsync(key, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })`, 첫 실행 시 이전 설치 잔존 토큰 정리, `AppState` 포그라운드 복귀 시 만료 임박 갱신.

### 11. 외장 키보드·Stage Manager·Split View — 심사 2.4.1 "iPhone apps should run on iPad whenever possible". 멀티태스킹 미지원 단독 반려 문구 확인 못 함. 리사이즈 중간 상태(discrete resize)에서 깨질 수 있어 실기기에서 창 크기 조절·회전·외장 키보드 확인.

### 12. ATT·Privacy Label — 5.1.2(i) "You must receive explicit permission from users via the App Tracking Transparency APIs to track their activity." 광고 SDK·타사 데이터 연결 없으면 ATT 불필요(일반 해석, 1차 문서 확인 못 함). `NSPrivacyTracking: false` 명시, Sentry 도입 시 Privacy Nutrition Label과 매니페스트 동시 갱신.

### 마감일 표
| 요건 | 시행일 | 대상 |
|---|---|---|
| 5.1.1(v) 앱 내 계정 삭제 | 2022-06-30 | 계정 생성 앱 |
| Required Reason API·privacy manifest | 2024-05-01 | 전체 업로드 |
| 연령 등급 질문 응답 | 2026-01-31 | 모든 앱 |
| Xcode 26 / iOS 26 SDK 빌드 | 2026-04-28 | 모든 업로드 |
| 타깃 iOS 13 이상 | 2026-09-09 | 모든 업로드 |
| iOS 27 SDK 빌드 시 `UIRequiresFullScreen` 리사이즈 옵트아웃 해제 | iOS 27 SDK 빌드부터(Expo SDK 58 해당) | iPad 앱 |
| iOS 27 SDK 빌드 시 `UIDesignRequiresCompatibility` 무시 | iOS 27 SDK 빌드부터 | 전 플랫폼 |
| iOS 27 launch screen 필수 | iOS 27 SDK 대상 | 전 앱 |
