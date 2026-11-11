// 속지 인쇄 글자를 **진짜 글꼴**로 그린다(글자 윤곽 표를 쓰지 않는다).
//
// 왜 바꾸나(2026-11-11 사용자: "그냥 글자를 표에 저장하는 방식인 게 이상한데",
// "설정한 글꼴로 글자를 속지용으로 쓰면 되잖아", "글꼴이 추가됐을 때도 대응이 되는 게 맞으니까"):
// 지금까지는 속지 글꼴을 바꿀 때 글자 윤곽(path)을 글꼴마다 떠 둔 표에서 찾아 바꿔 끼웠다. 그래서
//   · 속지에 새 글자가 들어오면 표에 없어 그 글자만 원본 글꼴로 남고(실측 43자가 그랬다)
//   · 새 글꼴은 표를 다시 뽑기 전에는 아예 못 쓰며
//   · 표 여섯 벌이 1.8MB 라 글자를 늘릴수록 앱이 커졌다.
// 진짜 글꼴로 그리면 **글자가 늘든 글꼴이 늘든 저절로 따라온다**.
//
// 글꼴 이름은 앱 글꼴 목록(utils/text.js 의 TEXT_FONTS)에서 그대로 가져온다 — 속지용으로 따로 적어
// 두면 글꼴을 더했을 때 또 한 곳을 빠뜨린다. 글자 도구가 쓰는 글꼴이면 속지도 쓸 수 있다.
//
// 자리가 안 깨지는 이유 — **넘칠 때만 글자 크기를 줄인다**(사용자 2026-11-11 "좁은 건 괜찮아",
// "넘칠 때만 안 넘칠 만큼 글꼴 작게 바꾸도록 하자"):
//  · 고른 글꼴로 썼을 때가 원래 자리보다 좁으면 그대로 둔다. 왼쪽에 붙어 조금 허전할 뿐 안 깨진다.
//  · 넓으면 딱 들어갈 만큼 글자 크기를 줄인다. 그래서 어떤 글꼴에서도 줄바꿈 · 넘침이 없다.
//
// 처음에는 textLength + lengthAdjust="spacingAndGlyphs" 로 폭을 묶으려 했는데,
// **react-native-svg 가 아직 그 속성을 적용하지 않는다**(android TextLayoutAlgorithm.java 에
// "TODO Apply 'textLength' attribute"). 2026-11-11 실기 측정에서 다섯 라벨 모두 자연 폭으로
// 그려지는 것을 확인했다. 나중에 지원되면 조용히 모양이 바뀌지 않도록 그 속성은 쓰지 않는다.
//
// 넓어지는 일이 실제로 있다: 마루부리 숫자가 좁아서, 나눔고딕 "11" 은 175% 가 된다.
import { TEXT_FONTS } from '../utils/text.js'
import PAPER_FONT_WIDTHS from './paperFontWidths.js'

/** 속지 글꼴 id → 앱 글꼴 이름 { family, bold }. bold 가 없으면 덧선으로 굵게 만든다. */
export function paperFontFamily(fontId, weight = 'R') {
  const font = TEXT_FONTS.find(one => one.id === fontId)
  if (!font?.family) return null
  return { family: weight === 'B' && font.boldFamily ? font.boldFamily : font.family, bold: Boolean(font.boldFamily) }
}

// 글자 윤곽은 1000 단위 em 이고 원본 scale(s)이 그 배율이다 → 글자 크기 = s x 1000
const EM = 1000
// Bold 글꼴이 따로 없을 때 덧선 굵기(1000 단위). 예전 윤곽 교체와 같은 값이라 두께가 달라 보이지 않는다.
const FAUX_BOLD = 40
const round3 = value => Math.round(value * 1000) / 1000
const escapeXml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// 원본 묶음에서 그대로 가져갈 속성(색 · 투명도 · 속지가 쓰는 data-*). 글자 자리를 정하는 것은 우리가
// 다시 쓰고, 치수(data-adv · data-w · data-fit)는 윤곽 묶음의 것이라 가져가지 않는다.
const METRICS = new Set(['data-adv', 'data-w', 'data-fit'])
const KEEP = /\s(fill|fill-opacity|opacity|data-[\w-]+)="[^"]*"/g
const attrOf = (text, name) => text.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null

/**
 * 고른 글꼴로 이 글자들을 썼을 때의 폭(글자 크기 1000 기준). 폭을 모르는 글자가 하나라도 있으면 null
 * — 그러면 줄이지 않고 그 글꼴 자연 폭으로 둔다(좁든 넓든 손대지 않는 쪽이 안전하다).
 */
export function naturalWidth(fontId, weight, text) {
  const table = PAPER_FONT_WIDTHS[fontId]
  const widths = (weight === 'B' && table?.B) ? table.B : table?.R
  if (!widths) return null
  let sum = 0
  for (const ch of text) {
    const one = widths[ch]
    if (one == null) return null
    sum += one
  }
  return sum
}

/**
 * 묶음 하나 → <text> 한 줄. group 은 paperFont.js 의 readGroup 이 돌려주는 모양이다
 * ({ attrs, text, weight, s, x, y, end }). 그릴 수 없으면 null — 그러면 원본 윤곽을 그대로 둔다.
 *
 * x · y 는 원본 그대로다(y 는 기준선이라 <text> 의 y 와 같은 뜻이다). 폭은 자리를 넘을 때만 글자 크기로 맞춘다.
 */
export function textFromGroup(group, fontId) {
  const picked = paperFontFamily(fontId, group.weight)
  if (!picked) return null
  // 앞뒤 공백은 자리만 차지한다. x 는 이미 첫 글자(공백 아님) 자리이고 end 도 뒤 공백을 뺀 자리다.
  const shown = group.text.join('').replace(/^ +/, '').replace(/ +$/, '')
  const width = round3(group.end - group.x)
  if (!shown || !(width > 0)) return null
  // 넘칠 때만 글자 크기를 줄인다. 좁은 것은 그대로 둔다.
  // 견주는 자리는 **원래 글자 폭이 아니라 오른쪽으로 쓸 수 있는 폭**(data-fit)이다. 원래 폭을 기준
  // 삼으면 마루부리 숫자가 유난히 좁아 "1" 이 든 라벨마다 줄어들고, 옆 숫자와 크기가 달라진다
  // (2026-11-11 실측: 나눔고딕에서 4,984 중 3,116 묶음이 줄어들었다).
  const room = group.fit ?? width
  const full = group.s * EM
  const natural = naturalWidth(fontId, group.weight, shown)
  const naturalAt = natural == null ? null : (natural * full) / EM
  const size = round3(naturalAt != null && naturalAt > room ? (full * room) / naturalAt : full)
  const keep = [...group.attrs.matchAll(KEEP)].filter(one => !METRICS.has(one[1])).map(one => one[0]).join('')
  const label = attrOf(group.attrs, 'aria-label')
  const faux = group.weight === 'B' && !picked.bold
  const fill = attrOf(group.attrs, 'fill')
  // Bold 글꼴이 없으면 같은 색 덧선으로 굵게 만든다(윤곽 교체 때와 같은 방식)
  const stroke = faux && fill ? ` stroke="${fill}" stroke-width="${round3(size * FAUX_BOLD / EM)}" stroke-linejoin="round"` : ''
  // 굵기는 **글꼴 이름**으로 정한다. font-weight 로 맡기면 기기가 굵게 흉내 내어 진짜 Bold 와 겹친다
  // — 데일리 플래너의 할 일 글(dayPlanner.js)이 쓰는 방식과 같게 400 으로 못 박는다.
  return `<text x="${round3(group.x)}" y="${round3(group.y)}"${keep}`
    + (label == null ? '' : ` aria-label="${escapeXml(label)}"`)
    + ` font-family="${picked.family}, serif" font-size="${size}" font-weight="400"${stroke}`
    + ` xml:space="preserve">${escapeXml(shown)}</text>`
}
