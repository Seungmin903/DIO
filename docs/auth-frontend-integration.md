# 기존 인증 화면 API 연결

기존 화면·입력칸·버튼만 연결했다. API 실패 시 체험 계정으로 대체하지 않는다.

| 기존 UI | 연결 |
| --- | --- |
| 이메일·비밀번호 로그인 | POST /api/v1/auth/login, 응답의 사용자 이름·사진을 기존 마이페이지에 표시 |
| 이메일 인증 | 발송 전 POST /api/v1/auth/email-availability → POST /api/v1/auth/email-verifications → POST /api/v1/auth/email-verifications/verify |
| 인증 화면의 다음 | 같은 서비스 인스턴스의 인증 토큰을 확인하고 가입 초안을 준비한 후 프로필 화면으로 이동 |
| 닉네임 중복 확인 | POST /api/v1/auth/nickname-availability |
| 사진 선택·약관 체크 | 가입 요청으로 전달할 데이터 연결. SERVICE/PRIVACY 필수, MARKETING은 실제 선택값, 현재 버전 v1 |
| 가입 완료 | 인증된 signupToken이 있어야 POST /api/v1/auth/signup. 최종 가입 API 통합 검증은 S15P31F106-310 범위 |
| 마이페이지 로그아웃 | POST /api/v1/auth/logout, 만료된 accessToken은 refresh 후 재시도. 실패해도 기기 메모리의 토큰 제거 |
| 소셜 로그인 | 백엔드 미구현 안내. 가짜 로그인 금지 |
| 게스트로 시작 | 기존 로컬 체험 유지 |

## 프론트 담당자에게 요청할 작업

1. 이메일 인증 UI(308)와 발송·확인 연결(309)을 구현했다. 실제 앱은 `authService.verificationService`를 주입한다. 서버의 `resendAfter`를 화면의 `retryAfter`로 변환하고 `expiresIn`으로 유효 시간을 표시한다. 검증 결과 signupToken은 메모리에만 보관하며 다른 이메일·만료된 토큰은 사용할 수 없다. 이전 화면으로 나가면 진행 중 응답을 무효화하고 인증 상태를 초기화한다.
2. 실제 약관 본문/보기 연결과 운영 약관 버전 연동이 필요하다. 현재 보기 안내는 UI 체험용이며 법적 약관 문서가 아니다. 서버의 약관 버전을 바꾸면 어댑터의 v1도 함께 변경해야 한다.
3. 소셜 로그인, 아이디 찾기, 비밀번호 재설정은 별도 구현이 필요하다. 기존 버튼만으로 동작한다고 안내하지 않는다.
4. 재실행 시 자동 로그인은 아직 없다. 토큰은 메모리에만 보관하며 AsyncStorage에 저장하지 않는다. 추후 네이티브 보안 저장소·세션 복원 정책이 필요하다.
5. 다이어리/편집기 데이터는 기존 로컬 저장 흐름을 유지한다. 계정별 데이터 분리·서버 다이어리 인증 연동을 완료한 것으로 간주하면 안 된다.

## 실행 설정

`frontend/.env`의 `EXPO_PUBLIC_API_BASE_URL`을 서버에 맞춘 후 Expo를 재시작한다. 웹 `http://localhost:8080/api`, Android 에뮬레이터 `http://10.0.2.2:8080/api`, 실제 기기는 개발 PC의 LAN IP를 사용한다. 서버 포트를 변경했다면 여기도 변경한다. `/api/v1` 또는 서버 origin 형식도 지원한다.

웹 CORS는 인증 경로에 한해 localhost:8081/127.0.0.1:8081을 허용한다. 다른 웹 주소는 백엔드 `AUTH_ALLOWED_ORIGINS`에 쉼표로 구분해 설정한다. 기존 다이어리 API 보안/CORS 정책은 바꾸지 않는다.

사진은 웹에서는 PNG Blob, 네이티브에서는 PNG 파일로 변환하여 multipart의 `signup`(application/json), `photo`(image/png)로 보낸다. 네이티브 가입 JSON은 메모리 Blob으로 전송하며 비밀번호가 담긴 임시 파일을 만들지 않는다. Expo File 사진 파트는 expo/fetch로 전송하고 변환 사진만 요청 종료 시 삭제한다. 실기기 사진 업로드는 별도 확인이 필요하다. 서버의 local/S3 선택과 DB 저장 방식은 변경하지 않았다.

명시적인 UI 테스트 fixture만 previewAuth를 사용한다. 실제 App은 authService를 기본 사용한다.

## 검증 재현

- 프론트 어댑터·기존 화면 상태: `cd frontend`, `pnpm test:auth`.
- 서버 로그인·CORS: `cd backend`, `./gradlew.bat test --tests "com.f106.DIO.auth.integration.EmailLoginTests"`.
- 실제 HTTP와 브라우저: 먼저 frontend에서 `pnpm exec expo export --platform web --output-dir .expo/auth-api-export`를 **완료한 뒤**, backend PowerShell에서 `$env:DIO_AUTH_BROWSER_QA='true'`, `./gradlew.bat test --tests "com.f106.DIO.auth.integration.AuthBrowserTests"`를 실행한다. 끝나면 `Remove-Item Env:DIO_AUTH_BROWSER_QA`로 해제한다. Edge가 다른 위치라면 PLAYWRIGHT_BROWSER_PATH로 실행 파일 경로를 지정한다.

브라우저 검증은 포트 18081의 정적 파일 서버와 임시 H2 서버를 사용한다. 번들의 개발 API 주소는 테스트 프록시로 임시 서버에 연결하며 응답을 mock하지 않는다. 테스트용 사용자만 만들고 실제 메일 발송·개인 PostgreSQL 변경·기존 서버 종료는 하지 않는다. CORS 허용/차단은 서버 테스트로 별도 확인한다. 실기기 업로드·실제 S3 업로드·메일 인증 UI 전체 흐름을 검증한 것은 아니다.

2026-10-26 확인: 프론트 인증 테스트 26개, 서버 로그인/CORS 테스트 13개, 실제 HTTP 브라우저 테스트 1개 통과. 브라우저에서 로그인 실패·성공, 내 공간의 서버 닉네임 표시, 로그아웃, 닉네임 확인, 이메일 인증 없는 가입 요청 차단을 확인했다. 최종 웹·Android export도 성공했다. 실기기 실행 결과와는 구분한다.

## 이메일 인증 UI 후속 연결 경계

실제 앱은 개발·배포 모드 모두 서버 인증 서비스를 사용한다. 인증 서비스를 제공하지 않는 별도 화면/fixture에는 기존 배포 진입 게이트가 남는다. 임시 인증은 명시적 개발용 화면에서만 사용한다. 발송 제한 응답의 Retry-After를 적용하고, 비정상 응답은 오류로 표시한다. SMTP 실제 수신과 최종 가입·로그인은 팀 개발 서버에서 별도 확인한다.

개발 서버 접근 인증(2026-10-28): 개발8443의 이메일 확인·발송 API POST 요청은 접속 정보 없이 Nginx 401 Basic 인증 요구를 반환했다. 제공받은 접속 정보로 빈 요청을 보내면 백엔드 입력 검증400까지 도달하는 것을 확인했다. 브라우저의 Swagger 접근 인증은 Expo 앱과 공유되지 않는다.

Expo 개발 모드에서 발송 요청이 Basic401로 막히면 기존 입력칸으로 개발 서버 ID·비밀번호를 입력한다. ‘접속 인증 후 다시 시도’는 같은 요청을 재시도한다. 정보는 HTTPS 서비스 인스턴스의 메모리에만 보관하고 비밀번호 입력값은 제출 후 비운다. 앱 재시작 시 다시 입력한다. 소스·EXPO_PUBLIC 환경변수·디스크에는 저장하지 않는다. 배포 모드에는 입력 항목과 설정 기능이 없다. 인증 이후 JWT는 Basic Authorization과 충돌하지 않도록 기존 백엔드가 지원하는 X-DIO-Access-Token으로 전달한다. 서버 접근 정책·백엔드 코드는 변경하지 않았다.

309 검증: frontend에서 `pnpm test:auth`를 실행한다. Android 태블릿에서 개발 서버 접근 인증 → 실제 메일 수신 → 받은 번호 인증 → 프로필 화면 진입을 확인했다. 초기 검증 때 사용한 신규 Java 통합 테스트와 그 전용 프론트 QA 스크립트는 프론트 작업 범위를 지키기 위해 MR에서 제외했다. 기존 팀원의 백엔드 파일·테스트는 변경하지 않는다.

## 309 리뷰 확인 및 프론트 작업 범위

- 초기 MR에 추가했던 Java 통합 테스트도 제외했다. 리뷰 중 시도한 개발 Nginx 설정·배포 문서 변경은 원복했다. 제품의 프론트 인증 연결·프론트 단위 테스트·관련 문서만 유지한다.
- Spring은 이미 Retry-After를 노출한다. 개발 Nginx의 웹 교차 출처 OPTIONS·401 응답 헤더 제한은 프론트만으로 해결할 수 없으므로 미해결 제약으로 기록한다. 서버 설정은 변경하지 않는다. Android Expo Go에서 확인한 직접 API 호출과 웹 CORS는 구분한다.
- `authService.js`의 accessTokenHeader는 이미 export 선언되어 있다. 선언을 중복 추가하지 않고 실제 모듈 초기화 테스트로 주소·헤더 전달과 개발/운영 모드를 검증한다.
- 고정 포트 리뷰가 달렸던 신규 Java 테스트와 전용 Node QA 스크립트는 함께 제외했다. 해당 파일을 실행하는 재현 명령도 제거했다. 기존 팀원의 QA·백엔드 검증 경로는 유지한다.
