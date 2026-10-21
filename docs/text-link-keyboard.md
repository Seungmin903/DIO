# 링크 입력창의 키보드 회피 (182)

Jira: [S15P31F106-182](https://ssafy.atlassian.net/browse/S15P31F106-182)

기준 develop `cdc0b18`, 브랜치 `fix/fe/link-dialog-keyboard`.

기존 TextLinkDialog는 전체 화면 중앙에 고정된 Modal로, 키보드가 나타날 때 가용 높이를 조정하지 않았다. Modal 내부에 KeyboardAvoidingView를 두고 iOS에서 padding 방식으로 키보드와 겹치는 공간을 확보한다. Android는 기존 OS 창 크기 조정에 맡긴다.

안쪽 ScrollView는 가용 높이가 충분하면 창을 가운데에 놓고, 부족하면 내용 전체 높이를 유지해 입력란·오류·버튼으로 스크롤할 수 있게 한다. 키보드가 열린 상태의 버튼 탭은 `keyboardShouldPersistTaps="handled"`로 전달한다. ScrollView의 자동 키보드 inset은 꺼 중복 여백을 방지한다. 링크 추가·수정·제거·취소 및 배지 설정은 기존 콜백을 사용하며 저장 형식·서버 API는 바뀌지 않는다.

## 검증 및 남은 확인

- `cd frontend` 후 `node --test tests/text-link-dialog.test.js`: 3개 통과. 플랫폼별 회피 설정, 스크롤/탭 전달 설정, 실제 JSX 이벤트의 URL 수정·열기·저장·제거·취소 및 오류 안내를 확인한다. OS 키보드를 실행하는 테스트는 아니다.
- `node node_modules/expo/bin/cli export --platform ios --no-bytecode --output-dir .expo/link-dialog-keyboard-ios`: iOS JavaScript 번들 생성 성공(exit 0). 실제 기기 실행 검증은 아니다.
- `git diff --check`: 통과.
- 실제 iPad 확인 전까지 Jira는 진행 중으로 유지한다.
- 가로·세로에서 URL 입력란, 오류 문구, 적용·취소 버튼이 보이거나 스크롤로 접근 가능한지 확인한다.
- 키보드 닫기·재열기, 링크 변경·제거·취소, 사진·스티커 링크의 배지 스위치를 확인한다.
- 일반 화면 키보드 외에 분할·플로팅 키보드 및 외장 키보드 사용 결과도 기록한다. 플로팅 키보드의 회피는 OS가 보고하는 프레임에 영향을 받으므로 실기기 확인이 필요하다.
- 기기 모델·iPadOS·화면 방향·키보드 종류를 기록한다.

실제 iPad QA를 기다리는 Draft MR로 제출한다.
