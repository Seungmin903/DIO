# 기존 인증 화면 API 연결

기존 화면·입력칸·버튼만 연결했다. API 실패 시 체험 계정으로 대체하지 않는다.

| 기존 UI | 연결 |
| --- | --- |
| 이메일·비밀번호 로그인 | POST /api/v1/auth/login, 응답의 사용자 이름·사진을 기존 마이페이지에 표시 |
| 회원가입 다음 | POST /api/v1/auth/email-availability, 가입 입력은 완료 전까지 메모리에서만 보관 |
| 닉네임 중복 확인 | POST /api/v1/auth/nickname-availability |
| 사진 선택·약관 체크 | 가입 요청으로 전달할 데이터 연결. SERVICE/PRIVACY 필수, MARKETING은 실제 선택값, 현재 버전 v1 |
| 가입 완료 | 인증된 signupToken이 있어야 POST /api/v1/auth/signup. 현재 UI에는 인증 단계가 없어 오류 안내 후 중단 |
| 마이페이지 로그아웃 | POST /api/v1/auth/logout, 만료된 accessToken은 refresh 후 재시도. 실패해도 기기 메모리의 토큰 제거 |
| 소셜 로그인 | 백엔드 미구현 안내. 가짜 로그인 금지 |
| 게스트로 시작 | 기존 로컬 체험 유지 |

## 프론트 담당자에게 요청할 작업

1. 이메일 인증번호 발송·입력·검증·재발송 UI가 필요하다. `authService.sendVerification(email)`과 `verifyEmail(email, code)`를 같은 서비스 인스턴스로 호출하면, 검증 결과 signupToken이 메모리에 보관되고 기존 가입 완료가 동작한다. 다른 이메일에 사용할 수 없으며 10분 후 만료된다. 이메일 변경 시 다시 인증한다.
2. 실제 약관 본문/보기 연결과 운영 약관 버전 연동이 필요하다. 현재 보기 안내는 UI 체험용이며 법적 약관 문서가 아니다. 서버의 약관 버전을 바꾸면 어댑터의 v1도 함께 변경해야 한다.
3. 소셜 로그인, 아이디 찾기와 비밀번호 재설정 입력 화면은 별도 구현이 필요하다. 비밀번호 재설정 API·호출 함수는 [password-reset.md](./password-reset.md)에 정리했다. 기존 버튼만으로 동작한다고 안내하지 않는다.
4. 재실행 시 자동 로그인은 아직 없다. 토큰은 메모리에만 보관하며 AsyncStorage에 저장하지 않는다. 추후 네이티브 보안 저장소·세션 복원 정책이 필요하다.
5. 다이어리/편집기 데이터는 기존 로컬 저장 흐름을 유지한다. 계정별 데이터 분리·서버 다이어리 인증 연동을 완료한 것으로 간주하면 안 된다.

## 실행 설정

`frontend/.env`의 `EXPO_PUBLIC_API_BASE_URL`을 서버에 맞춘 후 Expo를 재시작한다. 웹 `http://localhost:8080/api`, Android 에뮬레이터 `http://10.0.2.2:8080/api`, 실제 기기는 개발 PC의 LAN IP를 사용한다. 서버 포트를 변경했다면 여기도 변경한다. `/api/v1` 또는 서버 origin 형식도 지원한다.

웹 CORS는 인증 경로에 한해 localhost:8081/127.0.0.1:8081을 허용한다. 다른 웹 주소는 백엔드 `AUTH_ALLOWED_ORIGINS`에 쉼표로 구분해 설정한다. 기존 다이어리 API 보안/CORS 정책은 바꾸지 않는다.

사진은 웹에서는 PNG Blob, 네이티브에서는 PNG 파일로 변환하여 multipart의 `signup`(application/json), `photo`(image/png)로 보낸다. 네이티브 가입 JSON은 메모리 Blob으로 전송하며 비밀번호가 담긴 임시 파일을 만들지 않는다. Expo File 사진 파트는 expo/fetch로 전송하고 변환 사진만 요청 종료 시 삭제한다. 실기기 사진 업로드는 별도 확인이 필요하다. 서버의 local/S3 선택과 DB 저장 방식은 변경하지 않았다.

명시적인 UI 테스트 fixture만 previewAuth를 사용한다. 실제 App은 authService를 기본 사용한다.

## 검증 재현

- 프론트 어댑터·기존 화면 상태: `cd frontend`, `pnpm test:auth`.
- 서버 로그인·CORS: `cd backend`, `./gradlew.bat test --tests "com.f106.DIO.auth.login.EmailLoginTests"`.
- 실제 HTTP와 브라우저: 먼저 frontend에서 `pnpm exec expo export --platform web --output-dir .expo/auth-api-export`를 **완료한 뒤**, backend PowerShell에서 `$env:DIO_AUTH_BROWSER_QA='true'`, `./gradlew.bat test --tests "com.f106.DIO.auth.login.AuthBrowserTests"`를 실행한다. 끝나면 `Remove-Item Env:DIO_AUTH_BROWSER_QA`로 해제한다. Edge가 다른 위치라면 PLAYWRIGHT_BROWSER_PATH로 실행 파일 경로를 지정한다.

브라우저 검증은 포트 18081의 정적 파일 서버와 임시 H2 서버를 사용한다. 번들의 개발 API 주소는 테스트 프록시로 임시 서버에 연결하며 응답을 mock하지 않는다. 테스트용 사용자만 만들고 실제 메일 발송·개인 PostgreSQL 변경·기존 서버 종료는 하지 않는다. CORS 허용/차단은 서버 테스트로 별도 확인한다. 실기기 업로드·실제 S3 업로드·메일 인증 UI 전체 흐름을 검증한 것은 아니다.

2026-10-26 확인: 프론트 인증 테스트 26개, 서버 로그인/CORS 테스트 13개, 실제 HTTP 브라우저 테스트 1개 통과. 브라우저에서 로그인 실패·성공, 내 공간의 서버 닉네임 표시, 로그아웃, 닉네임 확인, 이메일 인증 없는 가입 요청 차단을 확인했다. 최종 웹·Android export도 성공했다. 실기기 실행 결과와는 구분한다.
