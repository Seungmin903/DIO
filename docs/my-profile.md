# 내 회원정보 조회·닉네임 변경

`GET /api/v1/me`와 `PATCH /api/v1/me`를 구현한다. 새 테이블·컬럼은 없으며 기존 `users`·`profile_photos`를 사용한다. 프로필 사진 변경과 회원 탈퇴는 다른 작업 범위다.

## 인증

`Authorization: Bearer {accessToken}`. 로그인·다이어리 API와 같은 JWT 검증과 세션 활성 확인을 거친다. 개발용 보조 토큰 헤더도 기존 인증 설정을 따른다. 토큰이 없거나 만료·폐기됐거나 회원이 비활성(`ACTIVE`가 아니거나 삭제됨)이면 401 `INVALID_TOKEN`이다.

## 응답

두 API 모두 200, `Cache-Control: no-store`이며 로그인 응답의 `user`와 같은 형태다.

```json
{"userId":"1","email":"member@example.com","nickname":"디오사용자","profilePhotoUrl":null}
```

`profilePhotoUrl`은 프로필 사진이 없으면 `null`이다.

## 닉네임 변경

```json
{"nickname":"새닉네임"}
```

- 앞뒤 공백 제거·NFKC 정규화 후 한글·영문·숫자·밑줄 2~12자만 허용한다. 회원가입과 같은 규칙이다. 형식 오류는 400이다.
- 닉네임 중복은 허용한다(V20 정책). `nickname_key`는 소문자로 함께 갱신한다.
- 같은 닉네임이면 수정 시각을 바꾸지 않고 현재 정보를 반환한다.
- 기존 공유 다이어리의 참여 프로필 닉네임은 바꾸지 않는다.

## 웹 호출

`/api/v1/me`, `/api/v1/me/password`는 `AUTH_ALLOWED_ORIGINS` 출처에서 GET·PATCH CORS 사전 요청을 허용한다.

## 확인

자동 검증: `backend/`에서 `./gradlew test --tests "*EmailLoginTests"`. 인증 없음·로그아웃 후 401, 비활성 회원 401, 정규화·중복 허용 저장, 형식 오류 400, CORS 사전 요청, Swagger Bearer 표시를 확인한다.
