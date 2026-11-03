# 약관 동의 조회·변경

로그인한 활성 회원 본인의 동의 기록을 기존 `user_terms_agreements`에서 조회·변경한다. 다른 회원 ID는 받지 않는다. 인증·만료·폐기 세션 검증은 기존 로그인 보안 체인을 사용한다. 새 테이블·컬럼·마이그레이션은 없다.

## 마케팅 선택 동의 조회

`GET /api/v1/me/terms`

Authorization: `Bearer {accessToken}`. 요청 본문·쿼리 매개변수는 필요 없다.

성공 200, `Cache-Control: no-store`:

```json
{
  "agreements": [
    {"termsType":"MARKETING_PRIVACY","termsVersion":"v1","agreed":true,"agreedAt":"2026-11-03T00:00:00Z","recordStatus":"CURRENT_VERSION"},
    {"termsType":"AD_EMAIL","termsVersion":"v1","agreed":false,"agreedAt":"2026-11-03T00:00:00Z","recordStatus":"CURRENT_VERSION"},
    {"termsType":"AD_PUSH","termsVersion":"v1","agreed":false,"agreedAt":null,"recordStatus":"NOT_RECORDED"},
    {"termsType":"AD_NIGHT_PUSH","termsVersion":"v1","agreed":false,"agreedAt":null,"recordStatus":"PREVIOUS_VERSION_ONLY"}
  ]
}
```

항상 위 순서의 4개 항목을 반환한다. 필수 SERVICE/PRIVACY와 호환용 MARKETING은 이번 조회 대상이 아니다.

| 필드 | 의미 |
| --- | --- |
| termsType | MARKETING_PRIVACY, AD_EMAIL, AD_PUSH, AD_NIGHT_PUSH |
| termsVersion | 변경 PUT과 동일한 **현재 설정 버전**. 과거 동의 버전이 아님 |
| agreed | 현재 버전에 실제로 동의했는지. 기록이 없으면 false |
| agreedAt | 현재 버전 기록의 마지막 상태 변경 시각(UTC). 철회 시각도 포함. 현재 기록이 없으면 null |
| recordStatus | CURRENT_VERSION / NOT_RECORDED / PREVIOUS_VERSION_ONLY |

| 저장 상태 | agreed | agreedAt | recordStatus |
| --- | --- | --- | --- |
| 현재 버전의 동의 기록 있음 | true | 기록된 시각 | CURRENT_VERSION |
| 현재 버전의 철회·미동의 기록 있음 | false | 기록된 시각 | CURRENT_VERSION |
| 해당 항목 기록 없음 | false | null | NOT_RECORDED |
| 현재 버전은 없고 다른 버전 기록만 있음 | false | null | PREVIOUS_VERSION_ONLY |

`CURRENT_VERSION`은 기록이 있다는 뜻이며 동의 상태는 반드시 `agreed`로 판단한다. `PREVIOUS_VERSION_ONLY`는 현재 설정과 불일치하는 버전만 있다는 뜻이다. v9/v10 문자열 정렬이나 최근 변경 시각으로 현재 버전을 추정하지 않는다. 과거 버전의 시각을 현재 버전의 동의 시각으로 내보내지 않는다.

구버전만 있으면 설정 체크는 꺼진 상태로 표시하고 사용자가 원하면 현재 버전에 새로 동의하게 한다. 선택 항목이므로 재동의를 하지 않았다는 이유로 기본 서비스 이용을 막지 않는다. 기존 MARKETING=true 기록을 네 항목으로 복사하거나 자동 동의로 간주하지 않는다. GET은 최초 동의 행을 생성하지 않고 기록·시각을 변경하지 않으며 쓰기 잠금을 잡지 않는다.

## 동의 변경

`PUT /api/v1/me/terms/{termsType}/{termsVersion}`

- `termsType`: SERVICE, PRIVACY, MARKETING_PRIVACY, AD_EMAIL, AD_PUSH, AD_NIGHT_PUSH. 기존 MARKETING도 호환용으로 유지한다.
- `termsVersion`: `dio.signup.*-terms-version`의 현재 설정값. SERVICE/PRIVACY 기본 v2, 선택 4종 및 기존 MARKETING 기본 v1.
- 요청: `{"agreed":true}` 또는 `{"agreed":false}`. 누락·null은 400.
- 성공 200: `{"termsType":"AD_EMAIL","termsVersion":"v1","agreed":false,"agreedAt":"2026-11-03T00:00:00Z"}`.
- 같은 상태 재요청은 기존 agreedAt을 유지한다. 상태가 바뀌면 시각을 갱신한다.
- 필수 약관 false는 400으로 거절하고 탈퇴 절차를 안내한다. 선택 항목은 각각 동의·철회 가능하다.
- 현재 버전 행만 저장·변경하며 이전 버전 행은 보존한다. 같은 버전의 모든 변경 이벤트를 누적하는 감사 로그는 아니다.
- 사용자 행 잠금으로 동일 회원의 첫 동의 생성·탈퇴와 직렬화한다. 다른 회원의 행을 변경하지 않는다.

모든 성공·회원 도메인 오류 및 인증 오류에는 `Cache-Control: no-store`를 적용한다.

| 오류 | 응답 |
| --- | --- |
| 인증 없음·만료·세션 폐기·비활성 회원 | 401 INVALID_TOKEN |
| PUT 종류·입력 본문 오류 | 400 |
| PUT 현재 버전 불일치 | 400 INVALID_TERMS |
| SERVICE·PRIVACY false 요청 | 400 REQUIRED_TERMS_NOT_AGREED |

## 버전·저장 구조

조회 서비스 `UserTermsQueryService`와 변경 서비스 `UserTermsUpdateService`를 분리하고 기존 `UserTermsController`에서 연결한다. 요청·응답 DTO는 `user/dto`, 상태 enum과 엔티티는 `user/domain`, 조회 메서드는 `user/repository`에 둔다.

기존 `(user_id, terms_type, terms_version)` 키를 사용한다. 현재 네 선택 항목은 가입·PUT과 동일하게 `SIGNUP_MARKETING_TERMS_VERSION` 설정(기본 v1)을 공유한다. 이번 작업은 종류별 버전 설정을 새로 추가하지 않는다. 버전을 올리면 기존 기록은 보존되고 GET은 현재 버전 기록이 없는 항목을 미동의로 반환한다.

기존 VARCHAR(20)은 가장 긴 MARKETING_PRIVACY(17자)를 저장할 수 있다. 기존 `UserTermsPostgresTests`는 전용 PostgreSQL을 명시적으로 지정했을 때 7종 저장·철회를 검증한다. 일반 로컬 DB로 폴백하지 않는다. 이번 조회는 JPA 파생 조회만 사용하며 스키마·DB 전용 SQL 변경은 없다.

## 프론트 연결 안내

설정 화면 진입 시 GET의 agreements로 네 체크 상태를 표시한다. 사용자가 변경하면 응답의 termsType/termsVersion으로 기존 PUT을 호출하고, 성공 응답으로 해당 항목을 갱신하거나 GET으로 다시 조회한다. 서버 저장 성공 전에 확정 상태로 표시하지 않는다. 이번 작업은 백엔드 조회 API와 문서·테스트이며 프론트 화면/UI는 수정하지 않는다.

광고 발송 권한 검사나 발송 기능은 별도다. 추후 발송 시 MARKETING_PRIVACY와 해당 채널 동의의 교집합을 확인하고 야간 푸시는 AD_NIGHT_PUSH도 확인해야 한다. 기존 일반 초대 알림 정책은 변경하지 않는다.

## 검증

backend에서 `./gradlew.bat test --tests '*UserTermsUpdateTests'`를 실행한다. HTTP 수준에서 현재 동의·철회, 기록 없음·구버전만 있음, 다른 회원 격리, 현재 설정 버전 우선, 기존 MARKETING 자동 전환 방지, 조회의 무변경, PUT 이후 재조회, 익명·폐기 세션·탈퇴 계정 거부를 검증한다. 기존 PUT 회귀 테스트도 함께 실행한다.

Swagger에서는 로그인 후 Authorize하고 GET으로 초기 상태를 확인한다. PUT AD_EMAIL/v1로 true, 다시 false로 변경한 뒤 GET에서 상태와 agreedAt을 확인한다. 실제 설정 버전이 다르면 GET 응답의 termsVersion을 사용한다.
