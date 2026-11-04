# 리서치 — 보안·안정성·UX 관례 (기준일 2026-11-04)

> 이 조사는 WebSearch 3건만 실제로 확인했고 나머지는 일반 지식(미검증)이다. 인용은 요약이며 보고서에 넣기 전에 URL 확인 필요.

### 1. 토큰 보관
- 출처: [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore)(확인) · [RFC 9700 OAuth 2.0 Security BCP](https://www.ietf.org/rfc/rfc9700.html)(2025-01, 요약본 확인) · OWASP MASVS-STORAGE(미검증)
- 핵심: `keychainAccessible` 기본 WHEN_UNLOCKED, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`는 백업 복원 시 미이전. 2048B 한도는 구버전 문서에만. RFC 9700은 공개 클라이언트 refresh token에 sender-constrained 또는 rotation 요구, 재사용 감지 시 토큰 계열 전체 폐기.
- 적용: refresh만 SecureStore, access는 메모리. 시작 시 silent refresh. 실패 시 게스트 강등이 아니라 "다시 로그인" 시트(로컬 편집 유지). 서버 rotation·재사용 감지는 백엔드 요청. 로그아웃 시 삭제. iOS Keychain 잔존 → 첫 실행 플래그로 정리.

### 2. 앱 잠금 PIN
- 출처: OWASP MASTG 로컬 인증 · expo-local-authentication(미검증)
- 핵심: 4자리 = 10,000 조합, 단일 SHA-256은 ms 단위 전수 대입. 권고: 느린 KDF(PBKDF2/scrypt/Argon2), 해시·salt를 Keystore/Keychain, 실패 횟수 지수 지연(5회 → 30초 …, 잠금 해제 시각 영속), 생체 기본 + PIN 폴백.
- 적용: SecureStore로 이동 + 시도 횟수·잠금 만료 저장, expo-local-authentication 추가, KDF는 `react-native-quick-crypto` PBKDF2 검토(Expo 58 호환 확인 못 함). 게스트 복구 불가를 설정 시점에 명시. 앱 잠금은 어깨너머 방지 수준임을 문서화.

### 3. 크래시·오류 처리
- 출처: react-error-boundary · Sentry for Expo · expo-updates(미검증)
- 핵심: ErrorBoundary는 렌더 오류만, 이벤트·비동기는 `ErrorUtils.setGlobalHandler` + Promise rejection 추적. Sentry는 Expo 플러그인·소스맵 지원. expo-updates는 시작 실패 시 이전 번들 롤백.
- 적용: 최상위·편집기 ErrorBoundary("문제가 생겼어요 / 다시 시도"), 폴백에서 작업 문서 로컬 저장 후 재시작. 크래시 SDK는 개인정보 고지·데이터 안전 항목 반영.

### 4. 로컬 데이터 마이그레이션
- 출처: redux-persist migrations · expo-file-system(미검증)
- 핵심: `schemaVersion` + v1→v2→v3 순차 migrate. 파싱 실패 원본 `.corrupt-타임스탬프` 보존. 원자적 저장은 temp → rename(새 File API `move` 시그니처 확인 못 함).
- 적용: 현재를 `schemaVersion: 1`, 없으면 1로 읽는 코드 먼저 배포. 상위 버전은 덮어쓰지 않고 "앱을 업데이트해 주세요". 다운그레이드·중단 시나리오 테스트.

### 5. 딥링크(초대 링크)
- 출처: [Firebase Dynamic Links 종료 — Branch](https://www.branch.io/resources/blog/firebase-dynamic-links-shutting-down) · [JotURL](https://joturl.com/blog/the-best-firebase-dynamic-links-alternative/)(벤더 글) · [Expo Linking](https://docs.expo.dev/linking/overview/)(미검증)
- 핵심: Firebase Dynamic Links 2025-08-25 종료(기존 링크 2026-02-25까지라는 글 1곳, Google 공식 FAQ 확인 못 함). 대안 Branch·Airbridge·자체 리다이렉트 서버. 초대 토큰은 서버 발급 무작위 + 만료 + 사용 횟수 제한, 방 ID 비노출.
- 적용: `scheme` + expo-linking, 1차는 Universal/App Links, 미설치자는 웹 랜딩 → 스토어. 미로그인 진입 시 토큰 보관 후 로그인 뒤 참여 화면. 출시 전 도메인 검증 파일 호스팅 필요.

### 6. 오프라인
- 출처: netinfo · Material 3 Snackbar(미검증)
- 핵심: `isInternetReachable` null 가능, 실제 요청 실패 신호 병행. 지속 상태는 배너, 일시 피드백은 스낵바. Notion/Figma/Docs 충돌 사례 확인 못 함.
- 적용: 상단 얇은 배너(상태 서술형, 안내 멘트 금지 규칙 고려), 공유 저장 실패 시 로컬 보존 + 다시 시도, 충돌 시 "서버 버전 불러오기 / 내 변경 다시 적용".

### 7. 파괴적 동작
- 출처: Material 3 Dialogs · HIG Alerts(미검증)
- 핵심: 되돌릴 수 있으면 undo 스낵바, 불가·영향 크면 확인창. "undo 5초", 휴지통 30일 수치는 공식 확인 못 함. HIG는 destructive 스타일 구분.
- 적용: 공유 페이지 삭제는 최소 확인창, 이상적으로 소프트 삭제(서버 스키마 변경 → 백엔드 요청) + undo. 로그아웃 확인창(게스트는 데이터 소실 경고).

### 8. 알림
- 출처: expo-notifications · [FCM 토큰 관리](https://firebase.google.com/docs/cloud-messaging/manage-tokens)(미검증)
- 핵심: 로그아웃·만료 토큰은 서버에서 정리(계정 전환 시 이전 계정 알림 문제). pre-permission 옵트인율 수치 확인 못 함. 읽음/안읽음·행 탭 이동·스와이프 삭제는 일반 관례.
- 적용: 로그아웃 시 unbind, 알림 화면을 목록으로, 설정 토글 즉시 저장 + 실패 롤백, 거부 후 설정 앱 안내.

### 9. 뒤로가기·내비게이션
- 출처: [Android custom back](https://developer.android.com/guide/navigation/custom-back) · [HIG Modality](https://developer.apple.com/design/human-interface-guidelines/modality)(미검증)
- 핵심: 뒤로가기는 한 단계씩, 최상위에서만 종료(종료 전 확인·두 번 누르기는 흔한 패턴). iOS 시트는 스와이프 또는 닫기 버튼. Figma/Procreate/GoodNotes 사례 확인 못 함.
- 적용: 편집기 뒤로가기 → 저장 후 보관함(미저장 확인), 보관함 최상위에서만 종료, 열린 시트·패널 먼저 닫기. 폰 패널 "바깥 눌러 닫기 없음" 결정과 일관.

### 10. 오류 문구 — Material Writing · HIG Writing(미검증): 사용자 언어, 원인보다 해결책. 토스·카카오 가이드 URL 확인 못 함. 서버 코드→문구 매핑 테이블, 알 수 없는 코드는 "잠시 후 다시 시도해 주세요", 개발 용어·상태 코드는 로그로만.

### 11. 접근성 — WCAG 2.2 SC 2.5.8 최소 24×24 CSS px, HIG 44pt, Material 48dp, 대비 4.5:1, Reduce Motion(`AccessibilityInfo.isReduceMotionEnabled`). KWCAG 모바일 조항 확인 못 함. 노랑 보조색 위 글자 대비 측정.

### 12. 필기 앱 경쟁사 관례 — 검색하지 않음(일반 지식): 펜 전용 입력 토글(손가락은 스크롤/선택), 손바닥 거치, 자동 저장 표시, 페이지 삭제 undo. 실제 앱으로 확인 뒤 서술할 것.

## 조치 우선순위 표
| 순위 | 조치 | 근거 | 공수 |
|---|---|---|---|
| 1 | refresh 토큰 SecureStore + silent refresh + 만료 재로그인 시트 | 1, RFC 9700 | M |
| 2 | 문서 `schemaVersion` + 원자적 저장 + 손상 백업 | 4 | M |
| 3 | 최상위/편집기 ErrorBoundary + 전역 핸들러 | 3 | M |
| 4 | 공유 페이지 삭제 확인창(이상적으로 undo/소프트 삭제) | 7 | S / L |
| 5 | PIN 해시 SecureStore + 실패 제한·지연 | 2 | S~M |
| 6 | 뒤로가기 단계화 | 9 | S |
| 7 | 서버 오류 코드→문구 매핑 | 10 | S |
| 8 | 로그아웃 시 푸시 unbind + 로그아웃 확인 | 7, 8 | S~M |
| 9 | 오프라인 배너 + 저장 실패 재시도 | 6 | M |
| 10 | 알림 화면 실사용 목록 | 8 | M |
| 11 | PIN 생체 인증·KDF 강화 | 2 | M |
| 12 | 초대 딥링크(scheme → 도메인 링크, 토큰 만료/1회성) | 5 | L |
| 13 | 접근성 점검(라벨·터치 영역·대비·Reduce Motion) | 11 | M |
| 14 | 크래시 수집(Sentry) | 3 | M |
