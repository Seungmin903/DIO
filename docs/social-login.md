# 구글·애플 소셜 로그인 및 공통 기반

관련 Jira: S15P31F106-267(구글), S15P31F106-430(애플). 카카오(S15P31F106-431)는 같은 공통 기반에 검증기만 추가하면 된다.

## 구현 범위

- 기존 명세 `POST /api/v1/auth/oauth/{provider}`에 JSON/multipart를 연결했다. 실제 검증기는 google, apple이며 kakao는 설정 미완료 503이다.
- 도메인: SocialProvider, VerifiedSocialIdentity. 인프라: SocialIdentityVerifier, GoogleSocialIdentityVerifier. 서비스: SocialLoginService, LoginSessionService. DTO·컨트롤러·예외 처리기는 각 역할 폴더로 분리했다.
- 기존 user_auth_accounts의 provider/subject로 식별하고 소셜 비밀번호는 null이다. 회원·동의·사진·세션을 기존 저장소에서 한 트랜잭션으로 저장한다. 외부 구글 검증과 사진 디코딩·업로드는 트랜잭션 밖에서 수행한다.
- 기존 이메일 로그인은 토큰 발급 서비스만 분리해 재사용한다. 재발급·로그아웃·푸시 세션 폐기는 기존 경로를 유지한다.
- 새 테이블·컬럼·마이그레이션·추가 URL은 없다. 기존 Google 버튼·연령/약관·프로필 화면만 연결했고 디자인은 바꾸지 않았다.

## API 계약

기존 회원: `POST /api/v1/auth/oauth/google` JSON에 `idToken`(Google ID 토큰), 선택 `deviceName`(100자 이내)을 전송한다. 200 응답은 기존 LoginResponse와 동일한 Bearer Access/Refresh 및 user다.

신규 회원: 409 `SOCIAL_SIGNUP_REQUIRED`면 같은 경로로 다음 정보를 다시 전송한다. Google ID 토큰은 메모리에만 보관하고 매 요청 서버에서 다시 검증한다. 가입 후에는 즉시 DIO 세션을 발급한다.

```json
{
 "idToken": "Google에서 받은 ID 토큰",
 "enrollment": {
  "nickname": "디오회원",
  "ageConfirmed": true,
  "agreements": [
   {"termsType":"SERVICE","termsVersion":"v2","agreed":true},
   {"termsType":"PRIVACY","termsVersion":"v2","agreed":true},
   {"termsType":"AD_EMAIL","termsVersion":"v1","agreed":false}
  ]
 }
}
```

사진은 같은 경로의 multipart `oauth`(application/json) 및 선택 `photo`를 사용한다. 새 이미지 API는 추가하지 않고 기존 프로필 사진 저장/조회 경로를 쓴다. 기존 계정 로그인 요청으로 사진을 변경하지 않는다.

### 기존 계정 연결·해제

기존 **이메일·비밀번호** 계정 연결은 `POST /api/v1/auth/oauth/{provider}/link`로 요청한다. `{ "idToken":"...", "email":"member@example.com", "password":"기존 DIO 비밀번호" }`를 보내며, 성공하면 일반 로그인과 같은 200 `LoginResponse`를 받는다. `SOCIAL_IDENTITY_ALREADY_LINKED`, `SOCIAL_PROVIDER_ALREADY_LINKED`, `SOCIAL_LINK_CONFLICT`는 409이고 `INVALID_EXISTING_CREDENTIALS`는 401이다. 비밀번호가 없는 소셜 전용 기존 계정은 `SOCIAL_EXISTING_PROVIDER_LOGIN_REQUIRED`(409)를 받고, 연결이 아니라 기존에 가입한 제공자로 로그인해야 한다. 로그인한 사용자에게 다른 제공자를 추가하는 API는 아직 제공하지 않는다. 연결 요청은 기존 비밀번호를 확인하므로 이메일 로그인과 같은 시도 제한 예산(정규화한 이메일+클라이언트 주소, 실패 5회 시 15분 429)을 함께 쓴다. 클라이언트 주소는 dev/prod에서 Tomcat RemoteIpValve가 신뢰 프록시의 `X-Forwarded-For`로 해석한 값이다. 여러 주소에 걸친 같은 계정 시도는 이메일 로그인과 마찬가지로 인프라 단에서 제한한다.

연결 해제는 `DELETE /api/v1/me/auth-providers/{provider}`에 새 제공자 `idToken`을 본문으로 보내며 성공 시 204다. `SOCIAL_PROVIDER_NOT_LINKED`(404), `SOCIAL_PROVIDER_MISMATCH`(403), `LAST_LOGIN_PROVIDER`(409)를 반환한다. 마지막 **사용 가능한** 로그인 수단(소셜 제공자 또는 비밀번호 해시가 있는 EMAIL)은 해제할 수 없다. 해제는 로그인 수단만 지우며 이미 발급된 세션·리프레시 토큰은 폐기하지 않는다(세션은 제공자가 아니라 사용자 단위로 저장되어 해제한 제공자의 세션만 골라 끊을 수 없다). 계정 탈취가 의심되면 비밀번호 변경·재설정으로 모든 기기 세션을 폐기한다.

선택 약관은 기존 4종을 독립 전송하며 필수 v2/선택 v1 규칙을 재사용한다. 새 회원의 닉네임·만 14세 이상 자기확인이 필요하다. 기존 회원은 인증 후 프로필 입력 없이 바로 로그인한다. 현재 기존 화면 흐름상 소셜 버튼 다음 연령·약관 확인을 먼저 거친다.

## 검증과 오류

Google의 고정 JWKS에서 RS256 서명, issuer, audience, azp, 만료, subject를 검증한다. 연결 3초/읽기 5초 제한을 두며 토큰과 이메일을 로그로 출력하지 않는다. 클라이언트의 이메일·사용자 ID를 인증 근거로 사용하지 않는다.

- 400: 잘못된 DTO/제공자/연령·약관·닉네임.
- 401 INVALID_SOCIAL_CREDENTIAL: 잘못되거나 만료된 Google ID 토큰.
- 409 SOCIAL_SIGNUP_REQUIRED: 인증 성공했으나 신규 가입 정보 필요.
- 409 SOCIAL_ACCOUNT_LINK_REQUIRED: 기존 이메일 계정과 중복. 앱은 즉시 기존 DIO 비밀번호 확인 화면을 열고, `POST /api/v1/auth/oauth/{provider}/link`에 Google ID 토큰·기존 이메일·비밀번호를 함께 보낸다. 두 인증이 모두 성공할 때만 제공자를 연결하고 로그인한다.
- 409 SOCIAL_VERIFIED_EMAIL_REQUIRED: Gmail/Workspace 등 현재 소유를 확인한 이메일이 없는 신규 사용자. 추가 이메일 인증 흐름은 후속 범위이며 임시 이메일을 만들지 않는다. 기존 subject가 있으면 이후 이메일 누락에도 로그인 가능하다.
- 409 SOCIAL_SIGNUP_CONFLICT: 동시 최초 가입의 알려진 유니크 제약 충돌. 부분 가입 없이 롤백 후 재로그인한다.
- 429: 기존 LoginThrottle로 검증 중 요청과 실패 횟수를 제한한다.
- 503 SOCIAL_PROVIDER_NOT_CONFIGURED / SOCIAL_VERIFICATION_UNAVAILABLE: 허용 클라이언트 미설정 또는 구글 검증 서비스 장애.

응답은 no-store다. 서명 검증은 실패 시 다른 로그인 방식이나 체험 계정으로 대체하지 않는다. 앱 화면 이동·종료 뒤 도착한 응답은 세션으로 채택하지 않고, 뒤로 가면 가입용 ID 토큰을 메모리에서 제거한다.

## 애플 로그인 (S15P31F106-430)

- 이유: 구글 같은 외부 로그인을 제공하면 iOS 앱은 Sign in with Apple도 함께 제공해야 한다(App Store 심사 지침 4.8).
- 앱: `expo-apple-authentication`, `app.json`의 `ios.usesAppleSignIn: true`. iOS에서만 애플 버튼을 보이고 Android·웹에서는 숨긴다. 카카오 버튼은 구현 전이라 숨긴다(동작하지 않는 버튼은 심사 반려 사유).
- 요청: 구글과 같은 `POST /api/v1/auth/oauth/apple`에 `idToken`(Apple `identityToken`)을 보낸다. 신규 가입·사진·오류 코드는 구글과 같다.
- 서버 검증: Apple 고정 JWKS(`https://appleid.apple.com/auth/keys`)로 RS256 서명, `iss=https://appleid.apple.com`, `aud`=허용 목록(기본 앱 번들 ID `com.f106.DIO`), 만료, `sub`를 확인한다. 회원 식별은 `sub`다.
- 이메일: Apple이 확인한 이메일(이메일 가리기 선택 시 `@privaterelay.appleid.com` 주소)을 쓴다. 이메일은 첫 로그인 때만 앱 credential에 오므로 앱은 토큰의 email을 화면 표시용으로 읽는다. 기존 회원 재로그인은 이메일이 없어도 된다.
- 설정: `AUTH_APPLE_CLIENT_IDS`는 기본값이 `com.f106.DIO`라 서버 env에 따로 넣지 않아도 된다. 번들 ID가 바뀌거나 웹 로그인(Services ID)을 추가할 때만 쉼표로 넣는다.
- Apple Developer: App ID `com.f106.DIO`에 Sign in with Apple 기능이 켜져 있어야 한다. EAS 빌드가 `usesAppleSignIn`을 보고 자동으로 맞춘다.
- 탈퇴 시 Apple 토큰 철회(App Store 심사 지침 5.1.1(v)):
  - 흐름: 앱 `DELETE /api/v1/me` → 애플 회원이면 400 `APPLE_REAUTH_REQUIRED` → 앱이 애플 로그인을 한 번 더 받아 `{"appleAuthorizationCode": "..."}`로 다시 요청 → 서버가 Apple `/auth/token`으로 교환하고, 받은 `id_token`의 `sub`가 탈퇴 회원과 같은지 확인한 뒤 `/auth/revoke` 호출 → 성공하면 DB 탈퇴.
  - Apple 토큰은 DB에 저장하지 않는다. authorizationCode는 5분 안에 한 번만 쓸 수 있다.
  - 철회가 실패하면 탈퇴하지 않는다: `INVALID_APPLE_AUTHORIZATION`(400, code 만료·재사용), `APPLE_ACCOUNT_MISMATCH`(403, 다른 애플 ID), `APPLE_REVOKE_UNAVAILABLE`(503), `APPLE_REVOKE_NOT_CONFIGURED`(503, 키 미설정).
  - 설정: `AUTH_APPLE_TEAM_ID`(기본 `5574VUMQN5`), `AUTH_APPLE_KEY_ID`(Apple Developer > Keys의 Sign in with Apple 키 ID), `AUTH_APPLE_PRIVATE_KEY`(.p8에서 BEGIN/END 줄을 뺀 본문 한 줄. 비밀값). client_secret은 ES256 JWT(iss=Team ID, sub=번들 ID, aud=`https://appleid.apple.com`, 유효 5분)로 요청마다 만든다.
- 탈퇴 시 구글 연결 해제(앱에서 처리, 서버 변경 없음):
  - 흐름: `DELETE /api/v1/me` 성공 → 앱이 로그인 상태를 정리 → 이 세션이 구글 로그인(`provider: 'google'`)이면 구글 SDK `revokeAccess()` → `signOut()`. 구글 계정 설정 > 연결된 앱에서 DIO가 사라지고, 같은 구글 계정으로 다시 로그인하면 계정 선택·동의 창을 거쳐 신규 가입으로 진행한다.
  - 서버는 구글 토큰을 저장하지 않으므로(`offlineAccess: false`) 기기 SDK로 끊는다. 앱을 다시 켜 SDK 계정이 비어 있으면 `signInSilently()`로 기억된 계정을 창 없이 되살려 끊는다(`frontend/src/auth/googleLogin.native.js` `revokeGoogleAccess`).
  - 끊는 대상 확인: SDK가 기억한 구글 계정의 이메일이 탈퇴한 계정의 이메일과 같을 때만 끊는다(대소문자 · 앞뒤 공백 무시). 같은 기기에서 다른 구글 계정으로도 로그인했었다면 그 계정의 DIO 연결은 그대로 둔다. 이메일을 모르거나 다르면 끊지 않는다.
    - 구글로 가입한 회원의 DIO 이메일은 가입할 때 받은 구글의 확인된 이메일이고(`SocialLoginService`), 이메일 계정에 구글을 연결하는 것도 같은 이메일일 때뿐이며, DIO 이메일은 바꿀 수 없다(회원정보 수정은 닉네임 · 사진만). 그래서 둘이 다른 것은 가입 뒤 구글 쪽 기본 이메일이 바뀐 드문 경우다. 구글 계정 식별자(`sub`)를 세션에 보관해 비교하는 것은 세션 저장 형식이 바뀌어 하지 않았다.
    - 끊지 않고 건너뛰면 개인정보 없이 이유만 경고로 남긴다: `[GoogleSignin] REVOKE_SKIPPED` + `NO_EMAIL` · `NO_ACCOUNT` · `ACCOUNT_MISMATCH` · `CANCELLED`.
  - 탈퇴는 이미 끝났으므로 해제를 기다리지 않는다. 실패해도 경고 로그 `[auth] GOOGLE_REVOKE_FAILED`만 남긴다. 애플과 달리 해제 실패로 탈퇴를 막지 않는다.
  - 탈퇴 직후 같은 기기에서 다시 구글로 로그인(또는 계정 재확인)하면, 진행 중인 해제가 끝난 뒤에 구글 로그인 창을 연다(최대 5초, `GOOGLE_REVOKE_WAIT_MS`). 해제의 `revokeAccess` · `signOut`이 새로 로그인한 계정에 실행되지 않게 하려는 것이다. 해제가 멈춰도 5초 뒤에는 로그인을 진행하고, 그 해제는 그만두게 한다(취소 표시). 같은 구글 계정으로 다시 가입하면 이메일로는 이전 · 새 세션을 구분할 수 없으므로, 해제는 계정을 되살린 뒤 · `revokeAccess` 직전 · `signOut` 직전에 취소 표시를 확인하고 멈춘다.
    - 한계: 이미 네이티브로 넘어가 실행 중인 `revokeAccess` 한 번은 취소할 수 없다. 이때도 DIO 로그인 · 가입은 정상이고, 구글 연결된 앱 목록에서 빠졌다가 다음 로그인 때 동의 창이 다시 뜨는 정도다.
  - 한계: 이 기기에서 구글로 로그인한 세션일 때만 끊는다. 이메일로 로그인한 회원에게 구글이 연결돼 있거나, 이 기기에 구글 로그인 기록이 없으면 끊지 않는다. 이때는 사용자가 구글 계정 설정에서 직접 지워야 한다. 이메일·애플 회원의 탈퇴 동작은 바뀌지 않는다. 웹에는 구글 로그인이 없어 해당 없다.
- 후속: 재전송 방지용 nonce 검토.

## 설정·배포·실기기 테스트

서버 `AUTH_GOOGLE_CLIENT_IDS`는 DIO의 웹·Android·iOS OAuth ID를 쉼표로 구분한 허용 목록이다. root .env는 설정했고 dev/prod Compose 전달 항목과 env.example을 추가했다. 실제 배포 환경에도 담당자가 값을 주입해야 한다. client secret은 필요하지 않다.

프론트는 GoogleSignin의 webClientId에 웹 ID, iosClientId에 iOS ID를 사용한다. 제공받은 DIO 공개 ID를 기본값으로 사용하며 필요 시 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID로 변경한다. iOS ID가 달라지면 app.json Google 플러그인의 iosUrlScheme도 맞춰야 한다. 클라이언트 ID는 공개 식별자이며 비밀키가 아니다.

`@react-native-google-signin/google-signin` 네이티브 모듈과 iOS URL scheme을 추가했다. **기존 APK/Expo Go에는 모듈이 없으므로 개발 빌드를 새로 만들어 설치해야 한다.** 기존 EAS development 프로필을 사용한다. 프로젝트 접근 권한이 있는 계정에서 `pnpm dlx eas-cli build --platform android --profile development`로 빌드하고, 설치 후 `pnpm exec expo start --dev-client`로 실행한다. 키스토어를 새로 만들지 말고 Google Cloud에 등록한 SHA-1과 동일한 서명 키를 쓴다.

테스트: 서버 재시작 또는 배포 → 새 개발 APK 설치 → Google 버튼 → 기존 연령/필수 약관 확인 → Google 계정 선택 → 신규는 기존 닉네임/사진 입력 → 완료 → 앱 진입. 이후 같은 계정으로 재로그인 시 프로필 단계를 건너뛴다. 개발 Nginx Basic 인증은 기존 개발 서버 ID/비밀번호 화면을 재사용해 Google 요청도 재시도한다.

현재 PC의 Expo 계정은 DIO EAS 프로젝트 읽기 권한이 없어 클라우드 APK 빌드는 수행하지 않았다. Windows에서 iOS 네이티브 빌드도 수행하지 않았다. 실제 Google 계정·APK 로그인은 아직 미검증이며 번들 생성은 설치/로그인 성공을 의미하지 않는다.

## 검증

구글 서명 테스트는 로컬 RSA 키로 서명된 토큰을 사용하며 실제 Google 네트워크 인증 테스트가 아니다. 공통 서비스/HTTP 테스트의 가짜 Kakao 검증기는 test 소스에만 있으며 운영 카카오 로그인을 활성화하지 않는다. JSON 신규/기존 회원·multipart 사진·약관·오류·이메일 로그인 회귀를 확인한다. 프론트는 API/상태 테스트와 Android 번들을 확인한다.

공식 안내: https://developers.google.com/identity/sign-in/android/backend-auth , https://react-native-google-signin.github.io/docs/setting-up/expo , https://docs.expo.dev/guides/google-authentication/ .

카카오·애플 실제 검증, 로그인한 소셜 전용 사용자의 추가 제공자 연결, Google의 비-Gmail/Workspace 신규 이메일 추가 인증은 후속 작업이다.

최종 자동 검증: 백엔드 전체 1104개(PostgreSQL 전용 355개 건너뜀), 프론트 `test:auth` 395개 통과. Android JS/Hermes 번들 생성은 이전 검증에서 성공했고 이번 변경 뒤에는 다시 만들지 않았다. APK 설치 및 실제 구글 계정 로그인은 미검증.
