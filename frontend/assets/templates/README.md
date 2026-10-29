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

## 날짜 속지는 앱에서 만든다

새 다이어리의 날짜 속지(표지 연도 · 월 구분지 · 먼슬리 · 위클리)는 연도별 SVG 를 더하지 않고, 같은 양식의 만년형 속지(`undated/`) 위에 날짜를 얹어 앱이 만든다(`src/editor/templates/dated.js`, ID 예: `dated-monthly-2027-03-portrait`).
글자 윤곽 · 커닝 · 글자 자리는 이 폴더의 2026 원본에서 뽑은 `src/editor/templates/datedGlyphs.js` 를 쓴다(`scripts/generate-dated-glyphs.py` 로 다시 만든다). 2026 원본 262장과 만든 속지는 글자 · 색 · 자리가 같은지 `tests/dated-templates.test.js` 가 확인한다.
2026 SVG 파일은 예전 다이어리 페이지가 가리키므로 지우지 않는다.
