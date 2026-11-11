// 속지 SVG 에는 없지만 앱이 **실행 중에** 속지 위에 찍는 글자.
//
// 속지의 인쇄 글자는 글자 윤곽(path)이고, 글꼴을 바꾸면 paperFont.js 가 글꼴 표에서 윤곽을 찾아
// 바꿔 끼운다. 표는 속지 SVG 를 훑어서 만들기 때문에, **SVG 에 안 나오는 글자**는 아무도 넣어 주지
// 않는다 — 그러면 그 글자만 마루부리로 남는다(2026-11-11 실측: 그렇게 43글자가 빠져 있었다).
//
// 여기 적어 두면 두 곳이 같이 본다.
//   · scripts/generate-paper-fonts.py 가 표를 만들 때 함께 넣는다
//   · tests/paper-font-coverage.test.js 가 표에 들어갔는지 지킨다
export const PAPER_RUNTIME_CHARS = [...'0123456789ABCDEF#']
