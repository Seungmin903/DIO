# 플래너 비활성 빌드의 Android 시작 오류

관련 이슈: [S15P31F106-405 데일리 플래너 속지 교체](https://ssafy.atlassian.net/browse/S15P31F106-405)의 호환성 후속 수정.

## 재현과 원인

develop 5264f273, EXPO_PUBLIC_PLANNER_TEMPLATES_ENABLED=0으로 만든 release 앱을 정상 x86_64 에뮬레이터에서 시작하면 5초 내 종료된다. ReactNativeJS 오류는 `[runtime not ready]: TypeError: Cannot read property 'assetId' of undefined`였다. Hermes 스택의 anonymous@1:395658을 해당 APK의 합성 소스맵으로 해석하면 `src/editor/templates/creation.js:16`이다.

플래그 0의 속지 메뉴는 옛 하루 계획(type=daily)을 제공하지만 초기화 코드는 새 데일리 플래너(type=day)만 찾는다. find()가 undefined인 상태로 assetId를 읽어 앱 등록 전에 종료된다. 로그인·사용자 데이터와 무관한 모듈 초기화 오류다.

## 수정

- 하루 속지 분류와 기본 선택은 day/daily를 모두 처리한다. 플래그 0에서는 실제 메뉴의 옛 하루 속지를 사용한다.
- 기존 하루 속지 ID를 새 day-planner로 바꾸는 이전 로직은 플래너 선택이 켜진 경우만 적용한다. 꺼진 경우 기존 ID·선택·장수를 유지한다.
- 플래너 비활성화를 풀어서 오류를 숨기지 않는다. 기존 모델·사용자 자료·서버 설정은 유지한다.

## 검증

- 서버 속지 카탈로그·다이어리 생성 프리셋·속지·날짜 속지·다이어리 생성 입력 테스트 64개 통과.
- 플래그 0 자식 프로세스에서 creation 모듈 초기화, 가로/세로 기본 하루 속지 한 장 생성 및 구형 dailyCount=2 복원을 검사한다.
- 실기기 ADB는 아직 미연결이므로 사용자가 보고한 휴대폰 종료와 같은 로그인지는 미확정이다. 동일 설정의 정상 ABI release 앱에서 재현한 시작 오류를 수정했다.
- ARM64 APK를 x86 변환 에뮬레이터에서 실행할 때 생기는 libreactnative.so 로딩 오류는 별도 ABI 호환 문제로 분리했다.

## APK 실행 결과

수정된 release APK를 x86_64 에뮬레이터에 업데이트 설치했다. 두 차례 완전 재시작 후 DIO 프로세스(PID 14411, 14530)와 MainActivity 전면 상태를 확인했으며 각 프로세스의 ReactNativeJS/AndroidRuntime 오류 로그는 없었다. 데이터 초기화나 앱 삭제는 하지 않았다.

동일 수정 코드의 ARM64 전용 APK를 별도로 빌드했다. com.f106.DIO, 기존 서명 일치, FP32 모델 두 파일 해시·실행 번들·오프라인 라이선스 고지 검증이 통과했다. 휴대폰 ADB는 끝까지 미연결이므로 실기기 실행은 미검증이다. 수정 소스는 fix/fe/android-startup-planner 브랜치에서 관리한다.
