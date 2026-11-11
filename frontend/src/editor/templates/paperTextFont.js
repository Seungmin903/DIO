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
// 자리가 안 깨지는 이유:
// 원본 묶음은 어디서 시작해 어디서 끝나는지(x ~ end)가 윤곽에 박혀 있다. 그 폭을 textLength 로
// 그대로 넘기므로, 글꼴마다 글자 폭이 달라도 **차지하는 자리가 같다** — 줄바꿈도 넘침도 생기지 않는다.
// lengthAdjust="spacingAndGlyphs": 글자 사이만 늘리면(spacing) 폭이 많이 다를 때 글자가 겹친다.
// 글자까지 함께 늘리면 가로로 아주 조금 눌리지만 어느 글꼴에서도 자리가 지켜진다.
import { TEXT_FONTS } from '../utils/text.js'

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
// 원본 묶음에서 그대로 가져갈 속성(색 · 투명도 · data-*). 글자 자리를 정하는 것은 우리가 다시 쓴다.
const KEEP = /\s(?:fill|fill-opacity|opacity|data-[\w-]+)="[^"]*"/g
const attrOf = (text, name) => text.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null

/**
 * 묶음 하나 → <text> 한 줄. group 은 paperFont.js 의 readGroup 이 돌려주는 모양이다
 * ({ attrs, text, weight, s, x, y, end }). 그릴 수 없으면 null — 그러면 원본 윤곽을 그대로 둔다.
 *
 * x · y 는 원본 그대로다(y 는 기준선이라 <text> 의 y 와 같은 뜻이다). 폭은 textLength 로 묶는다.
 */
export function textFromGroup(group, fontId) {
  const picked = paperFontFamily(fontId, group.weight)
  if (!picked) return null
  // 앞뒤 공백은 자리만 차지한다. x 는 이미 첫 글자(공백 아님) 자리이고 end 도 뒤 공백을 뺀 자리다.
  const shown = group.text.join('').replace(/^ +/, '').replace(/ +$/, '')
  const width = round3(group.end - group.x)
  if (!shown || !(width > 0)) return null
  const size = round3(group.s * EM)
  const keep = (group.attrs.match(KEEP) ?? []).join('')
  const label = attrOf(group.attrs, 'aria-label')
  const faux = group.weight === 'B' && !picked.bold
  const fill = attrOf(group.attrs, 'fill')
  // Bold 글꼴이 없으면 같은 색 덧선으로 굵게 만든다(윤곽 교체 때와 같은 방식)
  const stroke = faux && fill ? ` stroke="${fill}" stroke-width="${round3(size * FAUX_BOLD / EM)}" stroke-linejoin="round"` : ''
  // 굵기는 **글꼴 이름**으로 정한다. font-weight 로 맡기면 기기가 굵게 흉내 내어 진짜 Bold 와 겹친다
  // — 데일리 플래너의 할 일 글(dayPlanner.js)이 쓰는 방식과 같게 400 으로 못 박는다.
  //
  // textLength · lengthAdjust 는 반드시 **<tspan> 에** 둔다. react-native-svg 는 글자를 TSpan 이
  // 그리는데, 그 값을 조상이 아니라 **자기 것에서만** 읽는다(android TSpanView.drawWrappedText).
  // <text> 에 두면 조용히 무시되어 자리가 깨진다. 검사 tests/paper-font.test.js 가 이것을 지킨다.
  return `<text x="${round3(group.x)}" y="${round3(group.y)}"${keep}`
    + (label == null ? '' : ` aria-label="${escapeXml(label)}"`)
    + ` font-family="${picked.family}, serif" font-size="${size}" font-weight="400"${stroke}`
    + ` xml:space="preserve">`
    + `<tspan textLength="${width}" lengthAdjust="spacingAndGlyphs">${escapeXml(shown)}</tspan></text>`
}
