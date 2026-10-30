# 로그인 상태의 비밀번호 변경

기존 명세 경로 `PATCH /api/v1/me/password`를 구현한다. 새 테이블·컬럼은 없으며 기존 인증 계정·세션·재설정 인증을 사용한다. 내 정보 조회·닉네임 변경은 [내 회원정보](./my-profile.md)에서 다루며, 회원 탈퇴는 다른 작업 범위다.

## 요청

Authorization: Bearer {accessToken}. 개발용 보조 토큰 헤더도 기존 인증 설정을 따른다.

```json
{"currentPassword":"DioMember123!","newPassword":"ChangedDio123!"}
```

새 비밀번호는 영문·숫자를 포함한 ASCII 8~32자다. 현재 비밀번호와 달라야 한다. 확인 입력은 프론트에서 검사하고 전송하지 않는다. 로그인 사용자 본인의 EMAIL 인증 계정만 변경한다.

## 응답과 세션

- 성공: 204, 본문 없음, Cache-Control: no-store.
- 현재 비밀번호 오류: 400 CURRENT_PASSWORD_MISMATCH. 세션·기존 비밀번호 유지.
- 동일 비밀번호: 400 PASSWORD_UNCHANGED. 소셜 전용 계정: 400 EMAIL_PASSWORD_REQUIRED.
- 검증 중 다른 요청으로 변경됨: 400 PASSWORD_CHANGED. 다시 로그인 필요.
- 인증·세션 만료: 401 INVALID_TOKEN. 반복 오답: 기존 LoginThrottle의 15분 제한(계정·IP 조합 5회/IP 100회), 429.

성공하면 본인 모든 기기의 Access/Refresh 세션을 폐기한다. 진행 중인 비밀번호 재설정 인증도 소비 처리한다. 새 비밀번호 해시 저장과 폐기는 같은 트랜잭션이다. BCrypt 비교·해시는 트랜잭션 밖에서 수행하고, 저장 전 계정 잠금과 기존 해시·세션·활성 회원 여부를 다시 확인한다. 잠금 순서는 account → reset → session이다.

## 기존 화면 연결

실제 이메일 로그인 → 내 공간 → 비밀번호 변경 → 기존 현재/새 비밀번호/확인 창. 계정 정보 수정·탈퇴 화면은 노출하거나 연결하지 않는다. 성공 후 로그인으로 복귀한다. 실패 시 입력을 유지하며, 취소 시 내 공간으로 돌아간다. 체험 계정은 기존 메모리 동작을 유지한다.

## 확인

일반 가입·로그인 후 Swagger Authorize에 accessToken을 넣고 PATCH를 호출한다. 성공 후 기존 토큰 요청과 기존 비밀번호 로그인은 거절되고 새 비밀번호 로그인은 성공해야 한다. 프론트는 같은 계정의 내 공간에서 확인한다.

자동 검증: `frontend/`에서 `pnpm test:auth`, `backend/`에서 `./gradlew test --tests "*EmailLoginTests" --tests "*PasswordResetTests" --tests "*DomainStructureTests"`. 실기기 확인은 별도 수행한다.
