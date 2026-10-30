// 지금 앱 홈 화면(feature/fe/layer, 2026-10-29) 그대로 + A안 코덱스 바탕.
// 값은 LibraryScreen · DiaryCard · Cover · CoverArt · diary/styles.js 와 실제 화면 캡처에서 옮겼다. 버튼 모양은 바꾸지 않는다.

const CX_DIR = '../이미지/코덱스'
const CUR = [
  { id: 'summer', title: '여름 방학', color: '#F0B0AA', pattern: 'gingham', pages: 24 },
  { id: 'fresh', title: '새 다이어리', color: '#95A5D6', pattern: 'linen', pages: 78 },
  { id: 'test', title: '테스트용 다이어리', color: '#A9BFA6', pattern: 'stripe', pages: 4, landscape: true },
]
const CUR_GRID = [
  { id: 'weekly', title: '위클리 플래너', color: '#F0B0AA', pattern: 'gingham', pages: 66 },
  { id: 'memo', title: '메모장', color: '#C3AEDD', pattern: 'gingham', pages: 48, fav: true },
  { id: 'fresh', title: '새 다이어리', color: '#95A5D6', pattern: 'linen', pages: 78 },
  { id: 'trip', title: '제주 여행 일기', color: '#A9BFA6', pattern: 'stripe', pages: 24, shared: true },
  { id: 'test', title: '테스트용 다이어리', color: '#EBC56F', pattern: 'dot', pages: 4, landscape: true },
  { id: 'read', title: '독서 노트', color: '#4A4F5C', pattern: 'dot', pages: 30 },
  { id: 'class', title: '우리 반 교환일기', color: '#E3A57A', pattern: 'grid', pages: 18, shared: true },
  { id: 'summer', title: '여름 방학', color: '#F2C9C4', pattern: 'linen', pages: 12 },
]
const INK = '#0B1957', MUTED = 'rgba(11,25,87,.68)', LINE = 'rgba(11,25,87,.16)'

// ---------- 표지 (CoverArt 기본값: 띠 라벨 · 세로 고무줄 · 등) ----------
// light = { name: '태블릿' | '폰', x, y, W, H, ox, oy } — 바탕 그림과 같은 자리의 빛 · 그늘을 표지 안에 잘라 얹는다
function nowCover(d, w, h, { actions = false, light = null, desk = false } = {}) {
  const s = Math.min(w, h) / 200
  const r = `${6 * s}px ${14 * s}px ${14 * s}px ${6 * s}px`
  const band = `color-mix(in srgb, ${d.color} 80%, #1C2233)`
  const lightImgs = light ? ['빛', '그늘'].map((k) => `<img src="${CX_DIR}/A안 ${k} ${light.name}.png" style="position:absolute;left:${light.ox - light.x}px;top:${light.oy - light.y}px;width:${light.W}px;height:${light.H}px;max-width:none;mix-blend-mode:${k === '빛' ? 'soft-light' : 'multiply'};opacity:${k === '빛' ? 1 : .16}">`).join('') : ''
  return `<div class="nc ${desk ? 'desk' : ''}" style="width:${w}px;height:${h}px;border-radius:${r}">
    <div class="ncClip" style="border-radius:${r};background:${patternCss(d.pattern, d.color === '#4A4F5C' ? 'light' : 'light')}, ${d.color}">
      <div class="ncSpine"></div>
      <div class="ncRibbon" style="padding:${15 * s}px 22%"><b style="font-size:${15 * s}px">${d.title}</b><i style="height:${Math.max(.75, .9 * s)}px;margin:${5 * s}px auto"></i><span style="font-size:${6.2 * s}px;letter-spacing:${.75 * s}px">DIARY · 2026</span></div>
    </div>
    <div class="ncBand" style="top:${1.25 * s}px;bottom:${1.25 * s}px;width:${9 * s}px;border-radius:${2.7 * s}px;background:${band}"></div>
    ${light ? `<div class="ncClip" style="border-radius:${r};background:none">${lightImgs}</div>` : ''}
    ${actions ? `<div class="ncActs"><div>${icon('edit', 17, INK)}</div><div>${icon('star', 18, d.fav ? '#E8AF45' : MUTED, { fill: d.fav ? '#E8AF45' : 'none' })}</div></div>` : ''}
  </div>`
}

// ---------- UI 층 ----------
function nowRail() {
  const it = (name, y, on = false, dot = false) => `<div class="nr ${on === true ? 'on' : on || ''}" style="top:${y - 23}px">${icon(name, 21, on === true ? INK : MUTED)}${dot ? '<i></i>' : ''}</div>`
  return `<aside class="nowRail"><div class="nr" style="top:22px">${icon('menu', 22, INK)}</div>${it('book', 130, true)}${it('star', 177)}${it('person', 225)}${it('trash', 271)}${it('bell', 323, 'soft', true)}</aside>`
}
function nowHeader({ view = 'carousel', filter = 'personal', phone = false }) {
  const chips = ['personal', 'favorite', 'shared'].map((f) => `<div class="nchip ${f === filter ? 'on' : ''}">${FILTER_LABEL[f]}</div>`).join('')
  const sw = (v, name, label) => `<div class="${view === v ? 'on' : ''}">${icon(name, name === 'swap' ? 18 : 17, MUTED)}${phone ? '' : `<span>${label}</span>`}</div>`
  return `${phone ? '<div class="statusbar"><span>9:41</span><span>●●● ▮</span></div>' : ''}
    <div class="nTitle">${FILTER_LABEL[filter]}</div>
    <div class="nSwitch">${sw('carousel', 'swap', '스와이프')}${sw('grid', 'grid', '한눈에')}</div>
    <div class="nChips">${chips}</div>
    <div class="nActs"><div>${icon('search', phone ? 21 : 22, INK)}</div><div>${moreIcon(phone ? 21 : 21, INK)}</div></div>`
}
const nowFab = (phone) => `<div class="nFab ${phone ? 'p' : ''}">${icon('plus', phone ? 24 : 26, '#fff', { sw: 2.2 })}</div>`
function nowInfo(d, x, y, w, { trash = true, faded = false, scale = 1 } = {}) {
  return `<div class="nInfo" style="left:${x}px;top:${y}px;width:${w}px;${faded ? 'opacity:.36;' : ''}">
    <div><b style="font-size:${14 * scale}px">${d.title}${d.shared ? icon('people', 15, MUTED) : ''}</b><span style="font-size:${12 * scale}px">${d.pages}페이지</span></div>
    ${trash ? `<em>${icon('trash', 19, '#E5484D')}</em>` : ''}</div>`
}

// ---------- 스와이프 (태블릿) ----------
const LIGHT_T = { name: '태블릿', W: 1204, H: 803, ox: 0, oy: -1.5 }
const LIGHT_P = { name: '폰', W: 563, H: 844, ox: -130, oy: 0 }
// side: 'fade' 지금처럼 투명도 .36 · 'shade' 책상 위에서는 투명 대신 채도 · 밝기만 낮춘다(나무가 표지를 비쳐 보이지 않게)
function nowSwipe({ list = CUR, active = 1, desk = true, lightOn = true, chars = true, bg = 'A안 바탕 태블릿', side = desk ? 'shade' : 'fade' } = {}) {
  let objs = '', ui = ''
  list.forEach((d, i) => {
    const k = i - active
    if (Math.abs(k) > 1) return
    if (k === 0) {
      const w = 244, h = 325, x = 602 - w / 2, y = 187
      objs += `<div style="position:absolute;left:${x}px;top:${y}px;z-index:5">${nowCover(d, w, h, { actions: true, desk, light: desk && lightOn ? { ...LIGHT_T, x, y } : null })}</div>`
      ui += nowInfo(d, 443, 524, 330, { scale: 1.06 })
    } else {
      const cx = 602 + k * 350, bottom = 481
      const [w, h] = d.landscape ? [259, 194] : [200, 267]
      const x = cx - w / 2, y = bottom - h
      objs += `<div style="position:absolute;left:${x}px;top:${y}px;${side === 'fade' ? 'opacity:.36' : 'filter:saturate(.5) brightness(.97) contrast(.9)'};z-index:3">${nowCover(d, w, h, { desk, light: desk && lightOn ? { ...LIGHT_T, x, y } : null })}</div>`
      ui += nowInfo(d, cx - 133, bottom + 9, 267, { trash: false, faded: true, scale: .9 })
    }
  })
  const world = desk && bg ? `<div class="nBg" style="background-image:url('${CX_DIR}/${bg}.png')"></div>${chars ? P(acry('둘이'), 984, 572, 120, 0) : ''}` : ''
  ui += `<div class="arrow" style="left:34px;top:359px">${icon('chevL', 24, INK, { sw: 2.1 })}</div><div class="arrow" style="left:1122px;top:359px">${icon('chevR', 24, INK, { sw: 2.1 })}</div>
    <div class="nCount" style="top:592px">${active + 1} / ${list.length}</div>${nowFab(false)}`
  return `<div class="device tablet now ${desk ? 'deskOn' : ''}">${nowRail()}<main class="stage"><div class="world">${world}</div><div class="objects">${objs}</div><div class="ui">${nowHeader({})}${ui}</div></main></div>`
}
// ---------- 한눈에 (태블릿) ----------
function nowGrid({ desk = true, bg = 'A안 바탕 태블릿 소품 없음', lightOn = true } = {}) {
  let objs = '', ui = ''
  const cw = 208.8
  CUR_GRID.forEach((d, i) => {
    const r = Math.floor(i / 5), c = i % 5
    const x0 = 30 + c * (cw + 20), y0 = 186 + r * (cw + 58 + 34)
    const [w, h] = d.landscape ? [cw, cw * .75] : [cw * .75, cw]
    const x = x0 + (cw - w) / 2, y = y0 + cw - h
    objs += `<div style="position:absolute;left:${x}px;top:${y}px">${nowCover(d, w, h, { actions: true, desk: true, light: desk && lightOn ? { ...LIGHT_T, x, y } : null })}</div>`
    ui += nowInfo(d, x0 + 4, y0 + cw + 10, cw - 8)
  })
  const world = desk && bg ? `<div class="nBg" style="background-image:url('${CX_DIR}/${bg}.png')"></div>${P(acry('둘이'), 790, 540, 150, 0)}` : ''
  return `<div class="device tablet now ${desk ? 'deskOn' : ''}">${nowRail()}<main class="stage"><div class="world">${world}</div><div class="objects">${objs}</div><div class="ui">${nowHeader({ view: 'grid' })}${ui}${nowFab(false)}</div></main></div>`
}
// ---------- 폰 ----------
function nowPhone({ desk = true } = {}) {
  const d = CUR[1], w = 213, h = 284, x = 195 - w / 2, y = 196
  const objs = `<div style="position:absolute;left:${x}px;top:${y}px">${nowCover(d, w, h, { actions: true, desk, light: desk ? { ...LIGHT_P, x, y } : null })}</div>`
  const world = desk ? `<div class="nBg" style="background-image:url('${CX_DIR}/A안 바탕 폰.png');background-position:75% 50%"></div>` : ''
  const ui = nowHeader({ phone: true }) + nowInfo(d, 74, 490, 242) + `<div class="nCount" style="left:195px;top:556px">2 / 3</div>${nowFab(true)}`
  return `<div class="device phone now ${desk ? 'deskOn' : ''}"><main class="stage"><div class="world">${world}</div><div class="objects">${objs}</div><div class="ui">${ui}</div></main></div>`
}

// ---------- 코덱스 시안용 밑그림: 아이보리 단색 바탕 + 버튼 처리 4가지 ----------
// ui: 'U0' 지금 그대로 · 'U1' 떠 있는 레일 · 'U2' 떠 있는 레일 + 오른쪽 위 버튼을 한 막대로 · 'U3' 떠 있는 레일 + 반투명 유리 버튼
function refHeader(ui, phone, view = 'carousel') {
  if (ui !== 'U2') return nowHeader({ phone, view })
  const chips = ['personal', 'favorite', 'shared'].map((f) => `<div class="nchip ${f === 'personal' ? 'on' : ''}">${FILTER_LABEL[f]}</div>`).join('')
  return `${phone ? '<div class="statusbar"><span>9:41</span><span>●●● ▮</span></div>' : ''}<div class="nTitle">${FILTER_LABEL.personal}</div><div class="nChips">${chips}</div>
    <div class="nBar"><div class="on">${icon('swap', 18, MUTED)}${phone ? '' : '<span>스와이프</span>'}</div><div>${icon('grid', 17, MUTED)}${phone ? '' : '<span>한눈에</span>'}</div><i></i><div class="ic">${icon('search', 21, INK)}</div><div class="ic">${moreIcon(21, INK)}</div></div>`
}
// 폰 아래 탭 (BottomTabs: 흰 막대 모서리 24 · 알림 + 4칸). 떠 있는 처리(U1~U3)에서는 막대 뒤 단색 띠를 없애 책상이 이어진다
function nowTabs() {
  const t = (name, label, on = false) => `<div class="${on ? 'on' : ''}">${icon(name, 21, on ? INK : 'rgba(11,25,87,.5)')}<span>${label}</span></div>`
  return `<div class="nTabsWrap"><div class="nTabs"><div class="bell">${icon('bell', 21, MUTED)}<i></i></div>${t('book', '다이어리', true)}${t('star', '즐겨찾기')}${t('person', '내 공간')}${t('trash', '휴지통')}</div></div>`
}
function refSwipe(ui = 'U0', phone = false) {
  const cls = `ref ${ui} ${ui === 'U0' ? '' : 'float'}`
  if (phone) {
    const d = CUR[1], w = 213, h = 284, x = 195 - w / 2, y = 196
    return `<div class="device phone now ${cls}"><main class="stage"><div class="world"></div><div class="objects"><div style="position:absolute;left:${x}px;top:${y}px">${nowCover(d, w, h, { actions: true, desk: true })}</div></div>
      <div class="ui">${refHeader(ui, true)}${nowInfo(d, 74, 490, 242)}<div class="nCount" style="left:195px;top:556px">2 / 3</div>${nowFab(true)}${nowTabs()}</div></main></div>`
  }
  return nowSwipe({ desk: true, lightOn: false, chars: false, bg: null }).replace('class="device tablet now deskOn"', `class="device tablet now deskOn ${cls}"`).replace(nowHeader({}), refHeader(ui, false))
}

// 한눈에 보기 밑그림 (태블릿: 5열 · 폰: 2열 47.5%, styles.js grid · gridCompact)
function refGrid(ui = 'U3', phone = false) {
  const cls = `ref ${ui} ${ui === 'U0' ? '' : 'float'}`
  if (!phone) return nowGrid({ desk: true, bg: null, lightOn: false }).replace('class="device tablet now deskOn"', `class="device tablet now deskOn ${cls}"`).replace(nowHeader({ view: 'grid' }), refHeader(ui, false, 'grid'))
  let objs = '', ui_ = ''
  const cw = 168
  CUR_GRID.slice(0, 4).forEach((d, i) => {
    const r = Math.floor(i / 2), c = i % 2
    const x0 = 18 + c * (cw + 18), y0 = 178 + r * (cw + 54 + 22)
    const [w, h] = d.landscape ? [cw, cw * .75] : [cw * .75, cw]
    const x = x0 + (cw - w) / 2, y = y0 + cw - h
    objs += `<div style="position:absolute;left:${x}px;top:${y}px">${nowCover(d, w, h, { actions: true, desk: true })}</div>`
    ui_ += nowInfo(d, x0 + 4, y0 + cw + 8, cw - 8)
  })
  return `<div class="device phone now deskOn ${cls}"><main class="stage"><div class="world"></div><div class="objects">${objs}</div><div class="ui">${refHeader(ui, true, 'grid')}${ui_}${nowFab(true)}${nowTabs()}</div></main></div>`
}
