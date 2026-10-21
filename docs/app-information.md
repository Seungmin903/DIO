# 앱 정보와 문의

관련 Jira: [S15P31F106-161](https://ssafy.atlassian.net/browse/S15P31F106-161)

- 위치: 보관함 사이드 메뉴의 **내 공간 → 앱 정보**.
- **개인정보 처리방침**을 누르면 React Native `Linking.openURL`로 아래 문서를 외부 브라우저에 연다. 열기 실패 시 연결 상태를 확인하고 다시 시도하도록 안내한다.
  - https://docs.google.com/document/d/1JxZvkpKiEl7GXpVThQYxck0l_bwzg33FxGShE6rpqd0/edit?usp=sharing
- **문의 이메일**은 `dioapp.official@gmail.com`이며 텍스트 선택과 **복사** 버튼을 제공한다. 기존 의존성 `expo-clipboard`를 사용하고 복사 성공·실패를 화면에 안내한다. 이메일을 자동 전송하지 않는다.
- 저장 문서·저장 키·서버 API·의존성 선언 변경은 없고 마이그레이션도 필요하지 않다. 처리방침 원문은 앱에서 편집하지 않는다.

## 확인 기록

- 수정 JavaScript 2개 파일의 문법 해석과 Git 공백·충돌 표시를 확인했다. 오류 없음.
- 사용자 요청에 따라 테스트·웹/네이티브 빌드·앱 화면·실기기 조작은 수행하지 않는다.
- 미검증: Android/iOS/웹에서 외부 브라우저 열기, 문서의 비로그인 열람 권한, 연결 실패 안내, 이메일 선택·복사 및 실패 안내, 화면 크기별 배치. Google 문서의 공개 권한은 별도로 확인해야 한다.
