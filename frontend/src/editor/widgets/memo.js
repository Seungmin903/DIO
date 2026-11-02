// 메모 위젯: 앱에 기본으로 들어 있는 메모지. 종이 그림(memoArt.js)을 도형 오브젝트(type: 'shape')로 붙여
// 도형의 글 편집(두 번 눌러 쓰기) · 서식을 그대로 쓴다. 종이 색 = fill, 무늬 색 = borderColor.
// 그림이라 비율을 지켜 모서리로만 크기를 바꾼다. 줄이 있는 종이는 글 줄 높이를 줄 간격에 맞춘다.
import { createShape } from '../utils/editorShapes'
import { MEMO_ARTS } from './memoArt'

export const memoStyleOf = (id) => MEMO_ARTS.find((art) => art.id === id) ?? MEMO_ARTS[0]

/** 보관함 칸에서 고르는 메모 목록 */
export const MEMO_ITEMS = MEMO_ARTS.map((art) => ({ kind: 'memo', memo: art.id, name: art.name }))

export function createMemo(item, center) {
  const art = memoStyleOf(item.memo)
  // 줄 간격(step)이 곧 글 한 줄 높이가 되게 글자 크기 · 줄 간격 배수를 정한다
  const fontSize = art.rule ? Math.round(art.rule.step / 1.4) : 16
  const text = { fontSize, ...(art.rule && { lineSpacing: art.rule.step / fontSize }), align: art.textArea.align, verticalAlign: art.textArea.valign === 'middle' ? 'middle' : 'top' }
  return { ...createShape({ shape: `memo-${art.id}`, fill: art.paper, borderColor: art.line, borderWidth: 0, ...text }, center), art: art.id, name: item.name ?? art.name }
}
