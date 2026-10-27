# 알림 상태 접근성·폰 가로 QA


## 확인한 문제와 수정

- 기존844×390 화면에서 목 설정 버튼 행이 오른쪽으로 잘렸다. 설정 content를 세로 배치로 바꾸고 각 행을 줄바꿈했다. 설정 영역과 상단 제어 영역은 화면 높이에 맞춰 제한하고 독립 스크롤을 제공해 목록 공간을 남긴다.
- 알림 패널은 flex/minHeight와 세로 스크롤을 명시했다. 공용 버튼은 최소44×44, 최대 폭100%를 적용해 긴 문구도 화면 폭 안에서 줄바꿈한다.
- 목록·카운트 로딩에 이름 있는 progressbar·busy 상태를 지정했다. ActivityIndicator의 내부 스피너는 숨긴 View 안에 넣어 중복 진행 표시로 읽히지 않게 했다.
- 실제 웹 DOM에서 일부 기존 accessibility 속성만으로 busy·이름이 전달되지 않아 aria-busy/aria-label/aria-live도 명시했다. 네이티브용 accessibility 속성도 유지한다.
- 오류 문구는 alert 역할과 polite 알림, 빈 목록과 처리 상태는 polite 알림을 지정했다. 오류 영역 전체를 하나의 접근성 요소로 묶지 않아 재시도 버튼을 별도로 탐색할 수 있다. 제목은 heading으로 제공한다.


## 재현과 확인 범위

frontend에서 웹 QA 번들을 준비한 후 `node qa/notification-a11y-browser.cjs`를 실행한다. 기본 번들은 .expo/notification-web이고 다른 번들은 DIO_NOTIFICATION_QA_ROOT로 지정한다. loopback 임의 포트를 사용하며 DIO_NOTIFICATION_A11Y_PORT로 고정할 수도 있다.

폰 가로 844×390·667×375·568×320, 폰 세로 412×892, 태블릿 1280×800에서 로딩 이름/busy·오류 alert·빈 목록 live·키보드 재시도·44px 터치 영역·스크롤 접근·가로 넘침을 확인한다. 웹 DOM 검사는 VoiceOver/TalkBack 실기기 검증을 대신하지 않는다. 현재 실행 결과는 [MR !164](https://lab.ssafy.com/s15-final/S15P31F106/-/merge_requests/164)에 기록한다.
