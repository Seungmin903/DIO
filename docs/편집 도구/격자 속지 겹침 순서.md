# 속지 글씨 아래에 격자 표시 (174)

Jira: [S15P31F106-174](https://ssafy.atlassian.net/browse/S15P31F106-174)

## 원인 및 수정

Canvas는 속지 전체 SVG 다음에 격자·보조선을 그렸다. 사용자 요소는 덮지 않았지만 SVG에 포함된 글씨·날짜 위에는 가이드가 표시됐다.

표시 순서를 **종이 바탕색 → 격자·보조선 → 속지 글씨·도형 → 사용자 요소**로 변경한다.

- Canvas가 가이드를 PageBackground의 underlay로 전달한다. 읽기 전용이거나 모든 가이드를 끄면 underlay를 만들지 않는다.
- PageBackground의 바탕 View는 선택한 종이 색상을 유지하고, 가이드가 있을 때 화면용 SVG AST의 최상위 종이 사각형만 투명하게 복제한다. 단순히 SVG 뒤로 가이드를 옮겨 불투명 배경에 가려지는 문제를 피한다.
- 내용에 포함된 흰색 도형과 원본 캐시는 변경하지 않는다. 가이드가 없으면 기존 AST 재사용·색상 정책을 유지한다.
- 빈 속지에서도 바탕색 위에 가이드가 표시된다. 터치 입력을 가로채지 않는다.
- preparedXml 출력 경로에는 underlay를 넣지 않고 원본 배경을 유지한다. 썸네일·저장 데이터·PNG/PDF XML 색상 규칙은 바뀌지 않는다.

## 검증 (2026-10-21)

- 최초 검증 기준 develop: `017345a`. MR 준비 시 `2f68c98`까지 반영했다. 브랜치: `fix/fe/grid-below-template`.
- `cd frontend; node --test tests/grid-background.test.js tests/element-selection.test.js tests/templates.test.js`: **30개 통과**. 가로·세로 종이 분리, 빈/색상 속지, 가이드 끄기, 원본 캐시와 출력 XML 보존, 기존 선택·속지 회귀를 확인했다.
- 독립 Metro에서 실제 PageBackground·GridOverlay를 렌더링한 `node tests/grid-guide-browser.cjs` 통과. `node node_modules/expo/bin/cli start --offline --port 8094`를 먼저 실행한다. 다른 포트는 GRID_METRO_PORT, 다른 브라우저 실행 파일은 BROWSER_EXECUTABLE로 지정한다. 앱 저장소를 읽거나 쓰지 않는다.
- Edge Chromium, 1200×1100 viewport, 기기 배율 1에서 월간 가로 0.75배/흰색, 월간 세로 0.5배/크림색, 빈 크림색 속지를 비교했다.
- 가이드가 덮은 진한 글씨 픽셀: 가로 **196 → 0**, 세로 **99 → 0**. 격자 색상 픽셀은 두 경우 모두 남아 있고 빈 속지의 바탕색·격자도 확인했다. 페이지 오류 0건.
- 화면과 원시 결과: `frontend/.expo/grid-guide-results` (ignore 대상). 소수 배율의 격자는 안티앨리어싱을 고려한 색차로 확인한다.
- `node node_modules/expo/bin/cli export --platform ios --no-bytecode --output-dir .expo/grid-below-template-ios` 성공. iOS JS·에셋 번들 검사이며 설치 빌드나 실제 iPad 실행 결과는 아니다. `git diff --check` 통과.
- MR 준비 시 develop `2f68c98` 반영 후 같은 Node 테스트 30개를 재실행해 통과했고, `.expo/grid-template-mr-ios` 경로의 iOS 번들 생성도 성공했다.

## 남은 기기 확인

iPad에서 글씨 있는 월간/주간 속지와 빈 속지의 격자·보조선을 켜고 끄고 확대·이동한다. 글씨 가독성, 바탕색, 펜 입력·요소 선택이 유지되는지 확인한다. 브라우저 검증은 iPad의 실제 SVG 합성 검증을 대체하지 않는다.

구현은 MR 리뷰 대상이며 실제 iPad 확인 전까지 Jira는 진행 중으로 유지한다.
