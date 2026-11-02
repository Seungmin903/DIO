# 약관 동의 변경

기존 명세의 `PUT /api/v1/me/terms/{termsType}/{termsVersion}`을 구현한다. 인증·세션 검증은 기존 로그인 보안 체인을 사용한다. 다른 회원 ID를 입력받지 않으며 로그인한 활성 회원 본인의 행만 변경한다.

## 요청·응답

Authorization: `Bearer {accessToken}`

- `termsType`: `SERVICE`, `PRIVACY`, `MARKETING` (대문자)
- `termsVersion`: 기존 `dio.signup.*-terms-version`에 지정된 종류별 현재 버전. 기본값 SERVICE/PRIVACY `v2`, MARKETING_PRIVACY·AD_EMAIL·AD_PUSH·AD_NIGHT_PUSH와 기존 MARKETING `v1`.
- 요청: `{"agreed": true}` 또는 `{"agreed": false}`. 누락·null은 400.
- 성공 200: `{"termsType":"MARKETING","termsVersion":"v1","agreed":false,"agreedAt":"2026-10-30T00:00:00Z"}`
- `agreedAt`: 해당 버전의 마지막 동의 상태 변경 시각(UTC). 동의 철회도 상태 변경으로 기록한다. 동일 상태 PUT 재시도는 시각을 유지한다.
- 모든 성공·도메인 오류는 `Cache-Control: no-store`.

| 오류 | 응답 |
| --- | --- |
| 인증 없음·만료·세션 폐기·비활성 회원 | 401 |
| 알 수 없는 종류·입력 본문 오류 | 400 |
| 현재 버전과 다른 버전 | 400 `INVALID_TERMS` |
| SERVICE·PRIVACY를 false로 요청 | 400 `REQUIRED_TERMS_NOT_AGREED` |

## 저장·정책

- 기존 `user_terms_agreements`의 `(user_id, terms_type, terms_version)` 행을 사용한다. 테이블·컬럼·마이그레이션을 추가하지 않는다.
- 선택 약관 MARKETING은 true/false 모두 가능하다. 필수 약관 SERVICE·PRIVACY 철회는 현재 서비스 정책상 탈퇴 절차로 안내한다. 기존 회원가입 동의 검증은 그대로 유지한다.
- 새 현재 버전에 동의하면 새 버전 행만 저장하고 이전 버전 행은 보존한다. 같은 버전의 모든 변경 이벤트를 누적하는 감사 로그는 아니다.
- 사용자 행 잠금으로 동일 회원의 첫 동의 동시 생성·탈퇴와 직렬화한다. 다른 회원의 행은 변경하지 않는다.
- 별도 재동의 화면·이메일/푸시/야간 마케팅 채널 구분·광고 발송 기능은 이번 범위에 포함하지 않는다. 기존 MARKETING 한 종류의 동의만 다룬다.

## 프론트 연결 범위

현재 가입 후 약관 변경 화면은 없고 회원가입용 약관 체크 UI만 있다. 따라서 프론트 UI·가입 요청은 수정하지 않는다. 가입 중에는 기존 signup의 agreements로 저장하며, 가입 후 동의 변경 PUT을 가입 흐름에 억지로 호출하지 않는다. 변경 화면이 추가되면 이 API에 연결할 수 있다.

## Swagger 확인

1. 기존 로그인 API를 실행하고 받은 accessToken으로 Authorize한다.
2. `PUT /api/v1/me/terms/MARKETING/v1`에 `{"agreed":true}`를 보낸다.
3. 같은 요청을 반복해 agreedAt이 유지되는지 확인한다.
4. `{"agreed":false}`로 철회 후 저장된 상태·시각을 확인한다.
5. 필수 약관 false, 잘못된 버전·종류, 본문 누락, 인증 없이 요청했을 때 거절되는지 확인한다.


## 2026-11-02 선택 마케팅 동의 항목 분리 (이 절이 이전 열람 전용 설명보다 우선)

기존 `POST /api/v1/auth/signup`의 agreements와 `PUT /api/v1/me/terms/{termsType}/{termsVersion}`을 그대로 사용한다. 새 API·테이블·컬럼·마이그레이션은 없다. 기존 VARCHAR(20) 약관 종류에 다음 항목을 저장한다.

| 종류 | 의미 | 버전 |
|---|---|---|
| MARKETING_PRIVACY | 마케팅 목적 개인정보 수집·이용 | v1 |
| AD_EMAIL | 광고성 이메일 수신 | v1 |
| AD_PUSH | 광고성 앱 푸시 수신 | v1 |
| AD_NIGHT_PUSH | 야간 광고성 앱 푸시 수신 | v1 |

네 항목은 각각 선택·철회할 수 있고 미동의나 생략으로 가입을 막지 않는다. UI는 기본 미선택이며 필수 전체 동의는 선택 항목을 변경하지 않는다. 개인정보처리방침은 열람만 제공한다. 각 행의 보기는 기존 HTTPS 문서 URL 설정을 사용한다.

기존 MARKETING 저장 행과 클라이언트 요청은 호환용으로 유지하며 신규 채널 동의로 복사하거나 간주하지 않는다. 새 항목 버전은 기존 SIGNUP_MARKETING_TERMS_VERSION(기본 v1) 설정을 공유하므로 프론트 v1과 일치시켜야 한다. 각 행은 버전·변경 시각을 기존 방식으로 기록한다.

이 변경은 동의 기록만 연결하며 광고 발송 기능을 추가하지 않는다. 추후 발송 시 개인정보 마케팅 동의와 해당 채널 동의의 교집합을 확인하고, 야간 푸시는 AD_NIGHT_PUSH도 확인해야 한다. 기존 일반 초대 알림 발송 정책은 변경하지 않는다.


## PostgreSQL 항목 저장 검증 (2026-11-02)

`UserTermsPostgresTests`는 실제 마이그레이션을 적용한 별도 PostgreSQL에서 7개 종류 저장과 신규 선택 4종 철회를 검증한다. VARCHAR(20) 컬럼과 실제 저장을 확인했으며 추가 마이그레이션은 필요하지 않다. 각 테스트 행은 롤백한다. 일반 로컬 DB로의 폴백은 없다.

실행하려면 별도 빈 DB `dio_terms_qa_<식별자>`를 만들고 `DIO_TERMS_POSTGRES_TEST=true`, `DIO_TERMS_POSTGRES_URL=jdbc:postgresql://127.0.0.1:<포트>/dio_terms_qa_<식별자>`, `DIO_TERMS_POSTGRES_USER`, `DIO_TERMS_POSTGRES_PASSWORD`를 환경변수로 지정한다. backend에서 `./gradlew.bat test --tests '*UserTermsPostgresTests' --tests '*UserTermsUpdateTests'`로 실행한다. 인증정보는 저장소에 기록하지 않는다. 해당 테스트는 명시적으로 활성화하지 않으면 제외되며 기존 CI 태스크의 환경변수 요구사항은 바꾸지 않았다.

검증 결과: PostgreSQL 1개 및 기존 약관 변경 8개 통과, 제외 0개. 운영 배포 서버의 실제 환경변수는 로컬에서 검증하지 않았다.
