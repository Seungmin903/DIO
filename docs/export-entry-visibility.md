# 내보내기 진입 임시 숨김

관련 Jira: [164](https://ssafy.atlassian.net/browse/S15P31F106-164), MR !70.

- 정책 회의 전까지 EditorScreen의 `exportEnabled = false`로 태블릿 상단, 폰 가로 왼쪽 막대, 폰 세로 더보기의 내보내기를 모두 숨긴다.
- 각 UI에 동일한 값을 전달하고 공통 `openExport` 함수에서도 비활성 상태를 확인해 진입을 차단한다.
- 재활성화는 EditorScreen의 값 하나를 true로 바꾼다. 기존 생성·저장 구현과 데이터는 유지한다.
- 읽기 전용과 편집 화면에서 동일하게 적용한다. 다른 도구·페이지·레이어·집중 편집 경로는 유지한다.

## 리뷰 보완

최신 develop의 폰 배치가 !70에 합쳐질 때 태블릿 TopBar만 숨겨지고 폰의 두 경로가 남는 누락을 확인했다. develop `985b2b6`을 충돌 없이 반영하고 폰 경로와 공통 진입 함수의 차단을 보완했다. 기존 !70에서 함께 리뷰한다.

`cd frontend` 후 `node --test tests/export-entry.test.js`: 3개 통과. 실제 컴포넌트의 표시 결과와 공통 진입 함수 호출을 검사하며 OS 화면·실기기 실행 검증은 아니다. 폰 가로·세로 및 태블릿에서 실제 표시 확인은 남아 있다.

기존 폼팩터 회귀를 함께 실행한 `node --test tests/export-entry.test.js tests/form-factor.test.js`도 6개 모두 통과했다.
