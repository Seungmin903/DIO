# 2026 가로형 속지

제공받은 2026_다이어리_PNG_SVG 패키지의 SVG 중 가로형 138개만 포함한다.
원본 파일의 ID·윤곽선·1024×768 viewBox를 변경하지 않았다. 원본은 페이지마다 복제하지 않는다.

- 표지 1, 월 구분지 12, 먼슬리 12, 블록형 위클리 53, 저널형 위클리 53, 공용 속지 7
- 기본 문서는 블록형 78페이지이며 저널형 전환 UI는 제공하지 않는다.
- 카탈로그 버전: 1.0.0. ID·버전과 페이지 생성 순서는 src/editor/templates/data.js에 보관한다.
- SVG 글자는 윤곽선이므로 외부 폰트나 PNG 대체본을 로드하지 않는다.
- 각 SVG의 원본 metadata에는 DiaryPlanner 1.0.0 및 MaruBuri Regular/Bold, NAVER 출처가 포함돼 있다.
- 글꼴 출처: https://hangeul.naver.com/font

세로형, 원본 TTF, PNG는 포함하지 않는다. 향후 템플릿을 수정할 때는 새 버전으로 추가하고 기존 문서가 참조하는 버전의 SVG를 덮어쓰지 않는다.

## 속지 글꼴 (속지 설정에서 고른다)

속지의 인쇄 글자는 모두 MaruBuri 윤곽선이다(정적 속지 · 날짜 속지 · 스터디 / 데일리 플래너). 속지 설정(`paperAppearance.font`)에서 글꼴을 고르면 앱이 최종 SVG 의 글자 묶음(`<g aria-label>`)을 고른 글꼴의 윤곽으로 같은 크기 · 기준선 · 정렬로 다시 놓는다(`src/editor/templates/paperFont.js`). SVG 파일은 바꾸지 않는다.

- 글꼴 윤곽 표는 `scripts/generate-paper-fonts.py` 로 만든다(`src/editor/templates/paperFonts/`, 속지에 나오는 글자 116자). 글꼴을 더하려면 이 스크립트의 `FONTS` 와 `paperFont.js` 의 `PAPER_FONTS` · `TABLES` 에 넣고 다시 만든다.
- 굵기(Regular · Bold)는 원본 윤곽의 상자 크기로 알아낸다(원본 SVG 와 글꼴 파일의 윤곽은 모양은 같지만 시작점 · 순서가 달라 path 문자열로는 못 알아본다). Bold 가 없는 글꼴은 같은 색의 덧선으로 굵게 만든다. 기준점(시작 · 가운데 · 끝)은 같은 줄의 둥근 자리로 알아낸다.
- 글꼴을 고르지 않은 속지(기존 속지 전부)는 지금처럼 원본 윤곽을 그린다. 꾸미기 공방의 기본 속지 설정은 새 다이어리의 처음 값일 뿐이고, 다이어리 안에서 바꿀 때의 범위(이 페이지 · 모든 페이지 · 새 페이지만)는 그 다이어리 안에서 정한다.

## 날짜 속지는 앱에서 만든다

새 다이어리의 날짜 속지(표지 연도 · 월 구분지 · 먼슬리 · 위클리)는 연도별 SVG 를 더하지 않고, 같은 양식의 만년형 속지(`undated/`) 위에 날짜를 얹어 앱이 만든다(`src/editor/templates/dated.js`, ID 예: `dated-monthly-2027-03-portrait`).
글자 윤곽 · 커닝 · 글자 자리는 이 폴더의 2026 원본에서 뽑은 `src/editor/templates/datedGlyphs.js` 를 쓴다(`scripts/generate-dated-glyphs.py` 로 다시 만든다). 2026 원본 262장과 만든 속지는 글자 · 색 · 자리가 같은지 `tests/dated-templates.test.js` 가 확인한다.
2026 SVG 파일은 예전 다이어리 페이지가 가리키므로 지우지 않는다.

## 자유 노트 무늬

자유 노트의 모눈 · 도트(여백 없이 페이지 끝까지) 와 줄 노트의 선 색은 `scripts/generate-note-grids.py` 로 다시 만든다. 같은 ID 의 파일을 제자리에서 고치므로, 이미 이 속지를 쓰는 페이지도 새 무늬로 보인다.
