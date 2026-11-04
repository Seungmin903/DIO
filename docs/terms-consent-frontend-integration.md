# 가입 후 선택 동의 조회·변경 연결

Jira: S15P31F106-474. 프론트에서 백엔드의 GET·PUT 계약을 사용한다.

## 화면

설정 → 알림 설정의 서비스 알림, 마케팅 정보 수신 구역과 저장 버튼 배치를 유지한다. 기기 전용 ‘마케팅 정보 받기’ 하나는 아래 네 계정 동의로 대체한다. 각 행은 왼쪽 항목명·원문 보기, 오른쪽 동의/미동의 상태·스위치다. 서비스 알림과 선택 동의는 기존 설정의 SettingSwitch(52×32)를 함께 사용한다. 항목 아래 저장 완료 문구와 하단 기기 저장 안내는 표시하지 않는다.

| 항목 | termsType |
|---|---|
| 마케팅 목적 개인정보 수집·이용 동의 | MARKETING_PRIVACY |
| 광고성 이메일 수신 동의 | AD_EMAIL |
| 광고성 앱 푸시 수신 동의 | AD_PUSH |
| 야간 광고성 앱 푸시 수신 동의 | AD_NIGHT_PUSH |

같은 저장 버튼으로 선택 동의의 서버 저장과 서비스 알림의 기기 저장을 독립적으로 처리한다. 동의 조회 실패·PUT 실패가 서비스 알림 저장을 막지 않는다. 결과 안내는 전체 성공과 부분 성공을 구분한다. 네 선택 동의는 스위치 변경을 화면의 임시 선택으로 보관하고, 아래 저장 버튼을 누를 때 변경한 항목만 PUT으로 저장한다. 저장하지 않고 화면을 닫으면 임시 선택은 폐기한다. 기존 로컬 marketing 값을 서버 동의로 복제하지 않는다. 원문 보기는 기존 링크를 사용하며 주소가 없으면 비활성화한다.

## 서버 계약

`UserTermsController`, `UserTermsQueryService`, `TermsStatusItem`, `UserTermsUpdateService` 기준이다.

- 화면 진입마다 `GET /api/v1/me/terms`를 호출한다. 응답의 `agreements` 배열에서 네 항목의 종류·버전·boolean·시각·기록 상태를 검증한다.
- `CURRENT_VERSION`은 해당 버전 기록이 있다는 뜻이다. agreed가 false인 철회 기록도 그대로 표시한다.
- `NOT_RECORDED`, `PREVIOUS_VERSION_ONLY`는 서버 계약대로 agreed=false, agreedAt=null로 읽는다. 자동으로 동의하거나 기록을 생성하지 않는다.
- 버전은 v1 등으로 고정하지 않는다. 조회한 항목의 termsType·termsVersion으로 `PUT /api/v1/me/terms/{termsType}/{termsVersion}`에 `{ agreed }`만 전송한다.
- 선택 즉시 스위치와 옆 상태만 갱신한다. 저장 버튼을 누르면 변경한 항목들의 PUT 응답을 검증한다. 저장 중에는 조작과 중복 저장을 막는다. 실패한 항목은 임시 선택과 오류를 유지하며 재시도 시 이미 성공한 항목은 다시 보내지 않는다.
- 조회 중·실패·누락·비정상 응답이면 스위치 변경을 차단한다. 조회 실패에는 ‘다시 시도’를 제공한다.
- 동일 항목의 같은 선택 연타는 동일 Promise로 합친다. 저장 중인 반대 선택 및 저장 중 재조회는 차단한다.
- 공용 회원 인증 transport를 재사용한다. 계정·세션 변경 또는 화면 종료 후의 늦은 응답은 채택하지 않는다.
- 이번 API 어댑터는 선택 동의 네 항목 전용이다. 필수 동의 변경 UI는 제공하지 않는다.

## 자동 검증

```sh
node --test tests/terms-consent.test.js tests/terms-consent-section.test.js tests/signup-policy.test.js tests/notification-preferences.test.js tests/notification-setting-section.test.js tests/notification-settings-screen.test.js tests/profile-password-change.test.js tests/auth-api.test.js
```

GET 상태 해석·서버 버전 PUT·재진입·중복 요청·계정 전환·조회 재시도·실패 시 이전 선택 유지와 기존 인증/알림 설정 회귀를 검증한다. 백엔드·인프라는 수정하지 않았으며 백엔드 테스트도 실행하지 않았다.

## 실기기 확인

1. 일반 로그인 → 설정 → 알림 설정에서 네 동의 상태가 로드되는지 확인한다.
2. 항목을 하나씩 변경해 스위치와 옆 동의/미동의 글씨가 즉시 바뀌는지 확인한다.
3. 저장하지 않고 나갔다 돌아오면 기존 값인지 확인하고, 다시 변경한 뒤 저장 버튼을 눌러 재진입 시 유지되는지 확인한다.
4. 하나를 끄고 재진입해 철회 상태도 유지되는지 확인한다.
5. 네트워크를 끊고 새로 진입하면 변경이 차단되고, 복구 후 ‘다시 시도’로 조회되는지 확인한다.

실서버 배포 여부와 실기기 GET·PUT 성공은 사용자 확인이 필요하다. 자동 테스트는 모의 응답을 사용한다.

## 리뷰 보완

동의 조회 전·실패 중에도 기기 저장 버튼은 사용할 수 있다. 동의가 조회된 경우에만 동의 저장을 시도하며, 두 저장의 성공·실패를 각각 판단한다. 화면 단위 테스트로 조회 미준비, PUT 실패, 기기 저장 실패, 전체 성공 및 연타를 검증했다. 관련 5파일 26개 통과.
