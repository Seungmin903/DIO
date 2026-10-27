# 알림 상태 접근성·폰 가로 QA

2026-10-27. 알림 패널과 개발용 목 검증 화면의 접근성·배치를 수정했다. watermark 정책·인증·BE·알림 상태 저장 로직은 변경하지 않았다.

## 확인한 문제와 수정

- 기존844×390 화면에서 목 설정 버튼 행이 오른쪽으로 잘렸다. 설정 content를 세로 배치로 바꾸고 각 행을 줄바꿈했다. 설정 영역과 상단 제어 영역은 화면 높이에 맞춰 제한하고 독립 스크롤을 제공해 목록 공간을 남긴다.
- 알림 패널은 flex/minHeight와 세로 스크롤을 명시했다. 공용 버튼은 최소44×44, 최대 폭100%를 적용해 긴 문구도 화면 폭 안에서 줄바꿈한다.
- 목록·카운트 로딩에 이름 있는 progressbar·busy 상태를 지정했다. ActivityIndicator의 내부 스피너는 숨긴 View 안에 넣어 중복 진행 표시로 읽히지 않게 했다.
- 실제 웹 DOM에서 일부 기존 accessibility 속성만으로 busy·이름이 전달되지 않아 aria-busy/aria-label/aria-live도 명시했다. 네이티브용 accessibility 속성도 유지한다.
- 오류 문구는 alert 역할과 polite 알림, 빈 목록과 처리 상태는 polite 알림을 지정했다. 오류 영역 전체를 하나의 접근성 요소로 묶지 않아 재시도 버튼을 별도로 탐색할 수 있다. 제목은 heading으로 제공한다.

## 회귀 검사

`qa/notification-a11y-browser.cjs`는 사용자 브라우저/서버와 분리한 Edge에서 목 번들을 실행한다. 알림 화면 범위의 진행 표시를 검사하며 모달 fade 전환 중 배경 보관함 로딩을 알림 스피너로 혼동하지 않는다.

검사 항목:

- 로딩 이름·busy, 알림 화면에 이름 없는 progressbar 없음
- 로딩 중 빈 목록 오표시 없음, 성공 빈 목록의 polite 알림
- 오류 alert·polite, 오류/빈 문구까지 스크롤 도달
- 새로고침 버튼에서 Tab으로 재시도 버튼에 도달하고 Enter로 정상 복구
- 재시도 터치 영역44×44 이상, 로딩 중 모두 읽음 disabled 상태
- 문서/설정 영역 가로 넘침 없음, 목록 높이 확보·행 버튼까지 세로 스크롤 가능
- pageerror 없음

## 재현

frontend에서:

```powershell
$env:EXPO_PUBLIC_DIARY_SOURCE='mock-library'
node node_modules/expo/bin/cli export --platform web --dev --output-dir .expo/notification-a11y-final-web --max-workers 2
pnpm qa:notifications:a11y
pnpm test:notifications
```

기본 로컬 포트18152, 변경 시 DIO_NOTIFICATION_A11Y_PORT 사용. 다른 번들은 DIO_NOTIFICATION_QA_ROOT로 지정한다. 스크린샷은 ignore 대상 `frontend/qa/.out/notification-a11y/`에 크기별 기본·빈 목록·오류 상태로 저장한다. 기존 기능 QA는 DIO_NOTIFICATION_QA_ROOT=../.expo/notification-a11y-final-web 및 DIO_NOTIFICATION_QA_PORT=18150으로 `node qa/notification-browser.cjs`를 사용한다.

## 검증 범위와 한계

상태/HTTP 회귀52개 통과. 기존 알림 기능 브라우저 회귀도 폰 세로·태블릿에서 통과했다. 새로운 QA는 실제 브라우저의 역할·ARIA 속성·키보드·경계 크기·스크롤을 검증하며 전체 WCAG 자동 감사가 아니다.

최종 접근성 QA는 폰 가로844×390·667×375·568×320, 폰 세로412×892, 태블릿1280×800 총5개 모두 통과, pageerror0. 작은 가로 화면의 오류·빈 목록 스크린샷도 시각 확인했다. 검사 도중 busy/이름 속성 미출력을 발견해 명시적 ARIA와 장식 스피너 숨김을 반영한 최종 번들로 재실행했다.

실제 iOS/Android 기기의 VoiceOver/TalkBack 낭독·네이티브 방향 전환·글꼴 확대·하드웨어 키보드 검증은 하지 않았다. 웹 viewport 통과를 실기기 접근성 통과로 간주하지 않는다. 인증·공유 실서버·Spring 생산자·PostgreSQL 테스트는 이번에 재실행하지 않았다. 커밋·푸시·MR·Jira는 변경하지 않았다.
