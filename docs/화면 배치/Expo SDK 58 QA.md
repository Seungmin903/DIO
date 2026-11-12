# Expo SDK 58 업그레이드

관련 Jira: [S15P31F106-228](https://ssafy.atlassian.net/browse/S15P31F106-228)

## 변경 범위
- develop `f6f663b` 기반 `chore/fe/expo-sdk58`. 보관함 편집 기능(!127)은 별도 MR이며 이 변경에 포함하지 않는다.
- Expo ~58.0.19 / React Native 0.88.0 / React·React DOM 19.3.0 및 Expo 권장 네이티브 패키지 정렬.
- 제거된 InteractionManager 대신 requestIdleCallback으로 자동 저장 예약. 취소, 미지원 환경 타이머, 최대 대기 1초, 중복 실행 방지를 유지한다.
- androidStatusBar를 expo-status-bar 플러그인(hidden: true)으로 이관하고 밝은 테마의 expo-system-ui 의존성을 추가한다.
- pnpm 잠금 파일과 설치 중 생성된 특정 버전 release-age 예외 목록을 포함한다. 모든 버전을 허용하는 와일드카드 예외는 없다.
- 로컬 데이터 키·형식과 서버 API 변경 없음.

## 팀 적용 절차
1. 최신 브랜치를 받고 frontend에서 `pnpm install --frozen-lockfile` 실행.
2. `pnpm exec expo start --go --clear` 실행. Expo Go는 SDK 58 지원 버전 사용.
3. 개발 빌드는 네이티브 런타임이 달라져 재빌드해야 한다. 기존 SDK 57 앱에 SDK 58 JS만 배포하지 않는다.
4. 생성된 ios/android 폴더를 유지한 환경은 로컬 수정을 보존하고 SDK 58 prebuild로 재생성한다. iOS 설치 빌드는 macOS 또는 EAS 환경에서 수행한다.
5. 기존 SDK 57 작업과 node_modules를 공유하지 않는다. 롤백 시 이전 소스·잠금 파일을 함께 복원하고 해당 SDK 개발 빌드를 사용한다. 저장 데이터 마이그레이션은 없다.

## 검증 기록과 범위
검증은 SDK 58 + !127 통합 QA 폴더에서 수행했다. 이 SDK 단독 MR로 분리한 체크아웃에서는 다시 실행하지 않았다.
- `node --test tests/*.test.js`: 초기 427개, 편집 회귀 테스트 반영 후 430개 통과. 유휴 예약 테스트 4개 포함.
- Expo Doctor 20/20 통과, Expo 의존성 버전 검사 통과.
- `expo export --platform all`: iOS·Android Hermes 및 웹 번들 생성 성공.
- Android prebuild 성공, 포인터 이벤트 및 상태 표시줄 설정 확인.
- iOS·Android 외부 개발 번들 다운로드 확인.
- 사용자 iPad QA 완료 범위: 앱 접속, !127 편집·전체 선택/해제·휴지통 이동.
- 미검증: SDK 단독 브랜치의 전체 회귀, Android 실기기, iOS/Android 설치 빌드, 전체 필기·사진·GIF·내보내기 실기기 회귀.
- Expo Go로 확인할 수 없는 자체 네이티브 기능(Pencil 더블 탭 등)은 개발 빌드에서 별도 QA한다.

## 리뷰·병합
별도 MR로 검토한다. SDK 58 통합 QA 결과를 모든 플랫폼의 전체 QA 완료로 간주하지 않는다. Android 및 설치 빌드 미검증 범위를 확인하고 팀 적용 시점을 맞춘다.
