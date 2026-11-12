// 장면 조립: 장면.html#<장면 이름> 으로 연다. 스크립트/렌더.py가 SCENES 이름을 읽어 차례로 찍는다.

// ---------- UI 층 (지금 앱과 같은 토큰 · 같은 자리) ----------
function railHTML(dark = false) {
  const c = dark ? '#E7EAF3' : '#0B1957', m = dark ? 'rgba(231,234,243,.62)' : 'rgba(11,25,87,.68)'
  return `<aside class="rail">
    <div class="ri top">${icon('menu', 22, c)}</div>
    <div class="ri on">${icon('book', 20, c)}</div><div class="ri">${icon('star', 20, m)}</div>
    <div class="ri">${icon('person', 20, m)}</div><div class="ri">${icon('trash', 20, m)}</div>
    <div class="ri">${icon('bell', 20, m)}<i class="dot"></i></div></aside>`
}
const FILTER_LABEL = { personal: '모든 다이어리', favorite: '즐겨찾기', shared: '공유 다이어리' }
function headerUI({ view = 'swipe', filter = 'personal', phone = false, dark = false }) {
  const c = dark ? '#E7EAF3' : '#0B1957', m = dark ? 'rgba(231,234,243,.7)' : 'rgba(11,25,87,.68)'
  const chips = ['personal', 'favorite', 'shared'].map((f) => `<div class="chip ${f === filter ? 'on' : ''}">${FILTER_LABEL[f]}</div>`).join('')
  return `${phone ? '<div class="statusbar"><span>9:41</span><span>●●● ▮</span></div>' : ''}
    <div class="h-title">${FILTER_LABEL[filter]}</div>
    <div class="viewsw"><div class="${view === 'swipe' ? 'on' : ''}">${icon('swap', 17, view === 'swipe' ? c : m)}${phone ? '' : '스와이프'}</div><div class="${view === 'grid' ? 'on' : ''}">${icon('grid', 16, view === 'grid' ? c : m)}${phone ? '' : '한눈에'}</div></div>
    <div class="chips">${chips}</div>
    <div class="acts">${phone ? `<div class="ib">${icon('search', 20, c)}</div><div class="ib">${moreIcon(20, c)}</div>` : `<div class="ib">${icon('search', 21, c)}</div><div class="ib">${moreIcon(21, c)}</div>`}</div>`
}
function infoCard(d, x, y, w, { count = '', shareNames = '' } = {}) {
  return `<div class="info" style="left:${x}px;top:${y}px;width:${w}px">
    <div class="grow"><div class="t">${d.title}${d.shared ? icon('people', 16, 'rgba(11,25,87,.68)') : ''}</div><div class="p">${d.pages}페이지${shareNames ? ` · ${shareNames}` : ''}</div></div>
    <div class="del">${icon('trash', 19, '#E5484D')}</div></div>`
}
// 다이어리를 가운데 x 기준으로 놓는다
const place = (html, cx, top, w, style = '') => `<div style="position:absolute;left:${cx - w / 2}px;top:${top}px;width:${w}px;${style}">${html}</div>`

// ---------- 스와이프 배치 ----------
// list: 다이어리 배열(끝에 {id:'new'} 가능), active: 가운데 번호, shift: 넘기는 중(0~1)
function swipeObjects({ list, active, phone = false, desk = true, shift = 0, sheen = true, ribbon = false, dimMode = 'gray', centerExtra = '' }) {
  const g = phone ? { cx: 195, cw: 212, ctop: 200, sw: 166, step: 222, far: 0 } : { cx: 602, cw: 250, ctop: 172, sw: 196, step: 290, far: 270 }
  const ch = g.cw * 246 / 185, sh = g.sw * 246 / 185
  const rots = desk ? { '-2': 6, '-1': -3.5, 1: 3, 2: -5 } : {}
  let out = ''
  list.forEach((d, i) => {
    const k = i - active - shift
    if (Math.abs(k) > 2.2) return
    const a = Math.min(1, Math.abs(k)) // 0 가운데 → 1 옆
    const w = g.cw + (g.sw - g.cw) * a
    const top = g.ctop + (ch - (w * 246 / 185)) / 2 * (desk ? 1 : 0) + (desk ? 0 : 30 * a)
    const cx = g.cx + Math.sign(k) * (Math.min(1, Math.abs(k)) * g.step + Math.max(0, Math.abs(k) - 1) * (g.step + (g.far || 0) - 20))
    const rot = desk ? (rots[Math.round(k)] ?? 0) * a : 0
    const gray = dimMode === 'gray' ? a * .9 : 0
    const filt = dimMode === 'gray' ? `filter:grayscale(${gray}) brightness(${1 + a * .04}) contrast(${1 - a * .14});` : dimMode === 'dark' ? `filter:brightness(${1 - a * .55}) saturate(${1 - a * .3});` : `opacity:${1 - a * .64};`
    const z = 10 - Math.round(Math.abs(k) * 3)
    const isCenter = a < .5
    out += place(cover(d, w, { lift: isCenter ? 1 : 0, rot, actions: a < .05, sheen: sheen && a < .05, ribbon: ribbon && d.fav }), cx, top, w, `${filt}z-index:${z}`)
  })
  return out + centerExtra
}
function swipeUI(d, { phone = false, total = 7, idx = 2, arrows = true, shareNames = '' } = {}) {
  if (phone) return `${d.id !== 'new' ? infoCard(d, 70, 504, 250, { shareNames }) : ''}<div class="count" style="left:195px;top:${d.id !== 'new' ? 580 : 540}px">${d.id !== 'new' ? `${idx} / ${total}` : '&nbsp;'}</div>`
  return `${arrows ? `<div class="arrow" style="left:22px;top:316px">${icon('chevL', 24, '#0B1957', { sw: 2.1 })}</div><div class="arrow" style="right:22px;top:316px">${icon('chevR', 24, '#0B1957', { sw: 2.1 })}</div>` : ''}
    ${d.id !== 'new' ? infoCard(d, 477, 530, 250, { shareNames }) : ''}
    ${d.id !== 'new' ? `<div class="count" style="left:602px;top:604px">${idx} / ${total}</div>` : ''}`
}

// ---------- 한눈에 배치 ----------
function gridObjects({ list, phone = false, rot = false, cols, w, gapx, x0, rows, plate = false, lift = 0, cropMarks = false, ribbon = false, labelDy = 12 }) {
  const g = phone ? { cols: 2, w: 150, gapx: 30, x0: 30, rows: [174, 432, 690] } : { cols: 4, w: 146, gapx: 64, x0: 214, rows: [158, 430] }
  cols = cols ?? g.cols; w = w ?? g.w; gapx = gapx ?? g.gapx; x0 = x0 ?? g.x0; rows = rows ?? g.rows
  const h = w * 246 / 185
  let o = '', u = ''
  list.forEach((d, i) => {
    const r = Math.floor(i / cols), c = i % cols
    if (r >= rows.length) return
    const x = x0 + c * (w + gapx), y = rows[r]
    o += place(cover(d, w, { lift, rot: rot ? [-1.5, 1, -.5, 1.8, .8, -1.2, 1.4, -1][i % 8] : 0, ribbon: ribbon && d.fav }), x + w / 2, y, w)
    if (cropMarks) o += [[-10, -10, 'border-left-width:1.5px;border-top-width:1.5px'], [w - 4, -10, 'border-right-width:1.5px;border-top-width:1.5px'], [-10, h - 4, 'border-left-width:1.5px;border-bottom-width:1.5px'], [w - 4, h - 4, 'border-right-width:1.5px;border-bottom-width:1.5px']].map(([dx, dy, s]) => `<div class="crop" style="left:${x + dx}px;top:${y + dy}px;${s}"></div>`).join('')
    if (d.id !== 'new') u += `<div class="glabel ${plate ? 'plate' : ''}" style="left:${x - (plate ? 2 : 0)}px;top:${y + h + labelDy}px;width:${w + (plate ? 4 : 0)}px"><b>${d.title}</b><span>${d.pages}페이지</span></div>`
  })
  return { o, u }
}

// ---------- 편집기 (전환 마지막) · 속지 내용 ----------
function pageContent(s = 1) {
  return `<div style="position:absolute;inset:0;padding:${36 * s}px ${34 * s}px;background:repeating-linear-gradient(180deg, transparent 0 ${31 * s}px, rgba(110,146,198,.22) ${31 * s}px ${32 * s}px) 0 ${92 * s}px/100% calc(100% - ${92 * s}px) no-repeat, #fff">
    <div class="hand" style="font-size:${34 * s}px;color:#2E3240;line-height:1">10월 28일 수요일</div>
    <div style="position:absolute;left:${40 * s}px;top:${110 * s}px;width:${170 * s}px;transform:rotate(-4deg)">${polaroid('dusk', '하굣길 하늘').replace('font-size:20px;line-height:34px', `font-size:${18 * s}px;line-height:${30 * s}px`)}</div>
    <div style="position:absolute;left:${88 * s}px;top:${98 * s}px;width:${80 * s}px;transform:rotate(-8deg)">${tapeStrip('butter', 80)}</div>
    <div class="hand" style="position:absolute;left:${230 * s}px;top:${128 * s}px;right:${26 * s}px;font-size:${24 * s}px;line-height:${32 * s}px;color:#33476B">오늘은 다 같이<br>매점 앞에서<br>사진 찍었다!<br>내일은 지후 차례 →</div>
    <img class="stick" src="소재/하트.png" style="position:absolute;left:${250 * s}px;top:${300 * s}px;width:${46 * s}px;transform:rotate(12deg)">
    <img class="stick" src="소재/반짝이.png" style="position:absolute;left:${300 * s}px;top:${290 * s}px;width:${38 * s}px">
    <div class="hand" style="position:absolute;left:${40 * s}px;top:${360 * s}px;right:${30 * s}px;font-size:${23 * s}px;line-height:${32 * s}px;color:#3B3F4A">민지: 사진 내가 붙였어 ㅎㅎ<br>디오: 목도리 했더니 덥더라</div></div>`
}
function editorHTML(d) {
  const tools = ['hand', 'cursor', 'lasso', '|', 'pen', 'marker', 'eraser', 'text', '|', 'sticker', 'tape', 'image', '|', 'grid']
  return `<div class="editor">
    <div class="bar">${icon('chevL', 22)}<svg width="36" height="36" viewBox="0 0 36 36"><path d="M8 6h9a12 12 0 0 1 0 24H8z" fill="none" stroke="#242424" stroke-width="5" stroke-linejoin="round"/><path d="M13 15h7M13 21h7" stroke="#242424" stroke-width="2.6" stroke-linecap="round"/><circle cx="29" cy="7" r="4" fill="#9FB6D9"/></svg>
      <span style="display:flex;align-items:center;gap:7px;margin-left:14px">${icon('panel', 20)}페이지</span>
      <span class="tab"><i style="background:${d.color}"></i>${d.title} ${icon('edit', 14)}</span>
      <span style="margin-left:auto;display:flex;align-items:center;gap:7px">${icon('layers', 20)}레이어</span>
      <span class="exportbtn">${icon('export', 18, '#fff')}내보내기</span></div>
    <div class="ribbon">${tools.map((t) => t === '|' ? '<div class="sep"></div>' : `<div class="${t === 'cursor' ? 'on' : ''}">${icon(t, 21)}</div>`).join('')}</div>
    <div class="page" style="left:430px;top:168px;width:420px;height:560px;overflow:hidden">${pageContent(1)}</div>
    <div class="undo">${icon('undo', 19, 'rgba(11,25,87,.68)')}${icon('redo', 19, 'rgba(11,25,87,.68)')}<span style="display:flex;gap:6px;align-items:center">${icon('check', 17, 'rgba(11,25,87,.68)')}자동 저장됨</span></div></div>`
}

// ---------- 책상 (세계 층) ----------
const WORLD = {}
WORLD.pencil = (o = {}) => {
  const { phone, view, season, shared, empty } = o
  let p = ''
  if (phone) {
    p = view === 'grid'
      ? P(pen(), 210, 790, 230, -14) + P(tapeRoll('sky'), 18, 776, 92, 0) + P(clip(), 330, 150, 18, 20)
      : P(idcard(), -24, 640, 120, -14) + P(polaroid('sea', '7월의 바다'), 252, 666, 118, 8) + P(tapeRoll('sky'), 128, 700, 96, 0) + P(pen(), 120, 802, 260, -12) + P(clip(), 340, 160, 18, 24) + P(keyring(), 24, 150, 54, -18)
  } else if (view === 'grid') {
    p = P(stand('모아 기본'), 40, 170, 132, 0) + P(tapeRoll('sky'), 50, 448, 110, 0) + P(postit('#FFF1A8', ['오늘도', '한 장!']), 52, 592, 104, 0)
      + P(pen(), 912, 330, 330, 90) + P(pencil(), 960, 330, 300, 90) + P(eraser(), 1100, 230, 76, 90) + P(clip(), 1122, 470, 20, 0) + P(clip(), 1150, 470, 20, 0)
      + P(calendarPad('28', 'OCT', '수요일'), 1060, 580, 112, 0)
  } else if (empty) {
    p = P(idcard(), 26, 420, 150, -14) + P(postcard('To. 새 친구'), 140, 600, 210, 9) + P(tapeRoll('sky'), 420, 650, 116, 0) + P(pen(), 820, 676, 310, -24) + P(polaroid('sea', '7월의 바다'), 38, 160, 138, -7) + P(calendarPad(), 1052, 160, 112, 6) + P(postit('#FFF1A8', ['오늘도', '한 장!']), 1046, 470, 112, 5)
  } else {
    p = P(polaroid('sea', '7월의 바다'), 36, 152, 138, -7) + P(clip(), 236, 150, 20, 28)
      + P(idcard(), 24, 452, 150, -14) + P(postcard(shared ? 'To. 우리 반' : 'To. 2학년 3반'), 150, 610, 220, 9)
      + P(keyring('모아 행복'), 238, 486, 78, 20) + P(tapeRoll('sky'), 430, 650, 116, 0) + P(pencil(), 556, 722, 250, -5)
      + P(pen(), 836, 680, 320, -24) + P(postit('#FFF1A8', shared ? ['민지 · 어제', '사진 붙였어!'] : ['오늘도', '한 장!'], shared ? 18 : 22), 780, 600, 112, 4)
      + P(stand(shared ? '둘이 함께' : '디오 기본'), 1032, 486, shared ? 170 : 130, 0) + P(calendarPad(), 1056, 158, 106, 6)
      + (shared ? P(postit('#FAD3DC', ['지후 · 오늘', '내일은', '내 차례'], 18), 1074, 318, 96, 7) : '')
  }
  const accent = season ? SEASON[season](phone) : ''
  return `<div class="spot" style="left:${phone ? -40 : 300}px;top:${phone ? 150 : 90}px;width:${phone ? 470 : 600}px;height:${phone ? 470 : 560}px"></div><div class="props">${p}</div><div class="hatch"></div>${accent}`
}
// 계절 소품: 흑백 책상 위 색 하나(색 예산 1)
const SEASON = {
  spring: () => [[260, 120, 10], [520, 120, 50], [700, 640, -20], [960, 150, 70], [1120, 420, 20], [360, 560, 120], [100, 360, 60], [880, 520, 200]].map(([x, y, r]) => P(petal(), x, y, 26, r, { sd: false })).join('') + P(IMG('벚꽃'), 1090, 660, 80, -10, { cls: 'stick' }),
  summer: () => P(lemonade(), 1080, 360, 120, 0) + P(IMG('해'), 250, 140, 64, 0) + P(polaroid('sea', '여름 방학'), 1040, 600, 130, 8),
  autumn: () => [[250, 140, 20, 56], [960, 170, -30, 70], [380, 620, 40, 60], [1110, 450, 10, 64], [700, 690, -50, 50]].map(([x, y, r, w]) => P(IMG('단풍'), x, y, w, r)).join(''),
  winter: () => P(tangerine(), 1068, 380, 92, 0) + P(tangerine(), 1120, 450, 70, 30) + [[260, 140, 50], [990, 140, 40], [400, 640, 36], [720, 700, 44]].map(([x, y, w]) => P(IMG('눈송이'), x, y, w, 15, { sd: false })).join(''),
}
WORLD.sun = (o = {}) => {
  const { phone, view, time } = o
  let p = ''
  if (phone) p = P(plantTop(), 240, 640, 170, 0) + P(mug(), -20, 690, 130, 0) + P(pen('#6E92C6'), 110, 800, 240, -10) + P(tapeRoll('butter', 'dot'), 300, 156, 80, 0)
  else p = P(plantTop(), -40, 520, 230, 0) + P(mug(), 210, 650, 130, 0) + P(stand('모아 행복'), 1040, 470, 128, 0)
    + P(tapeRoll('butter', 'dot'), 1080, 160, 104, 0) + P(pen('#6E92C6'), 790, 690, 320, -20) + P(polaroid('forest', '산책'), 32, 150, 132, -6) + P(postit('#FFF1C2', ['물 주기', '잊지 말기'], 18), 470, 650, 104, -5)
    + P(stickerSheet(['하트', '해', '잎', '카메라']), 920, 120, 96, 12)
  const leaf = `<div class="leafsh" style="left:${phone ? -60 : -80}px;top:${phone ? 420 : 380}px;width:${phone ? 300 : 520}px">${leafShadow()}</div>`
  return `<div class="props">${p}</div><div class="blinds"></div><div class="glow"></div>${leaf}${time === 'night' ? '<div class="lamp"></div>' : ''}`
}
WORLD.mat = (o = {}) => {
  const { phone, view } = o
  const m = phone ? { l: 12, t: 160, r: 12, b: 16 } : { l: 26, t: 146, r: 26, b: 22 }
  const W = (phone ? 390 : 1204) - m.l - m.r
  const ruler_ = `<div class="ruler" style="left:18px">${Array.from({ length: Math.ceil(W / 100) }, (_, i) => `<span>${i * 5}</span>`).join('')}</div>`
  let p = ''
  if (phone) p = P(tapeRoll('pink'), 250, 640, 104, 0) + P(tapeRoll('mint', 'dot'), 300, 732, 80, 0) + P(scissors(), 10, 690, 170, -20) + P(tapeStrip('butter', 150), 30, 176, 110, -8, { sd: false }) + P(knife(), 120, 800, 220, -6)
  else if (view === 'grid') p = P(tapeRoll('pink'), 44, 172, 110, 0) + P(tapeRoll('mint', 'dot'), 66, 300, 84, 0) + P(tapeRoll('butter'), 52, 400, 96, 0) + P(scissors(), 30, 560, 160, -90)
    + P(stickerSheet(), 1060, 166, 112, 0) + P(ruler(300), 1112, 560, 300, 90, { style: 'transform-origin:0 0' }) + P(knife(), 1060, 520, 220, 90, { style: 'transform-origin:0 0' })
  else p = P(tapeRoll('pink'), 48, 176, 118, 0) + P(tapeRoll('mint', 'dot'), 150, 260, 86, 0) + P(scissors(), 40, 560, 190, -18)
    + P(stickerSheet(), 1050, 172, 112, 8) + P(ruler(360), 760, 690, 360, -4) + P(knife(), 300, 694, 240, 4) + P(tapeRoll('butter'), 1060, 560, 104, 0)
    + P(tapeStrip('lavender', 160, 'dot'), 236, 170, 130, -12, { sd: false }) + P(charSticker('모아 행복'), 1090, 420, 70, 10)
  return `<div class="mat" style="left:${m.l}px;top:${m.t}px;right:${m.r}px;bottom:${m.b}px">${ruler_}<div class="diag"></div></div><div class="props">${p}</div>`
}
WORLD.night = (o = {}) => {
  const { phone, view } = o
  let p = view === 'grid'
    ? P(lampTop(), -40, 120, 300, 0) + P(mug(), 1060, 600, 120, 0) + P(stand('모아 기본'), 1060, 170, 120, 0) + P(pen(), 60, 690, 300, -8)
    : P(lampTop(), -50, 90, 380, 0, { cls: 'lit' }) + P(mug(), 230, 640, 124, 0) + P(stand('모아 기본'), 1050, 480, 124, 0) + P(pen(), 820, 690, 310, -22)
      + P(postit('#FFF1A8', ['잘 자', '내일 또!'], 20), 790, 590, 104, 5, { cls: 'lit' }) + P(polaroid('night', '밤 산책'), 1040, 150, 128, 6) + P(tapeRoll('lavender', 'dot'), 470, 660, 104, 0)
  return `<div class="props">${p}</div>`
}
WORLD.persp = (o = {}) => {
  const { view } = o
  // 원근 판 위 소품 (판 좌표: 폭 1964 = 1204 + 380*2)
  const props = P(idcard(), 250, 10, 150, -14) + P(postcard('To. 2학년 3반'), 1700, 30, 230, 9) + P(polaroid('sea', '7월의 바다'), 860, 150, 130, -8)
    + P(pen(), 1100, 210, 340, -16) + P(tapeRoll('sky'), 640, 210, 110, 0) + P(calendarPad(), 1800, 190, 120, 6) + P(postit('#FFF1A8', ['오늘도', '한 장!']), 120, 200, 120, -8)
  const sideBooks = place(cover(byId('weekly'), 230, { lift: 0 }), 690, 60, 230, 'transform:rotate(-6deg)') + place(cover(byId('d2026'), 230, { lift: 0 }), 1290, 70, 230, 'transform:rotate(5deg)')
    + place(cover(byId('trip'), 230, { lift: 0 }), 460, 70, 230, 'transform:rotate(8deg);opacity:.9') + place(cover(byId('fan'), 230, { lift: 0 }), 1530, 80, 230, 'transform:rotate(-4deg)')
  // 앞쪽은 일부러 흐린 소품 하나만 둔다(심도)
  return `<div class="plane"><div class="props">${props}</div><div style="position:absolute;inset:0;filter:saturate(.45) contrast(.95)">${sideBooks}</div></div><div class="dof"></div><div class="fog"></div>
    ${P(stand('모아 기본'), 990, 300, 110, 0)}${P(stand('디오 기본'), 140, 290, 104, 0)}${P(pencil(), 760, 700, 420, -8, { style: 'filter:blur(5px) saturate(.4);opacity:.85' })}`
}
WORLD.min = (o = {}) => {
  const { phone, view } = o
  const m = phone ? { l: 14, t: 166, r: 14, b: 20 } : { l: 30, t: 148, r: 30, b: 24 }
  const p = phone ? P(tapeStrip('butter', 120), 26, 152, 84, -14, { sd: false }) + P(tapeStrip('sky', 120), 290, 152, 84, 12, { sd: false }) + P(pencil(), 120, 790, 220, -8) + P(charSticker('모아 행복'), 300, 740, 54, 8)
    : P(tapeStrip('butter', 140), 20, 134, 110, -14, { sd: false }) + P(tapeStrip('sky', 140), 1070, 134, 110, 12, { sd: false }) + P(pencil(), 820, 716, 260, -8) + P(charSticker('모아 행복'), 78, 668, 70, -8)
  return `<div class="paper" style="left:${m.l}px;top:${m.t}px;right:${m.r}px;bottom:${m.b}px"></div><div class="props">${p}</div>`
}
WORLD.bad = () => `<div class="props">${P(stand('모아 기본'), 40, 170, 150, 0) + P(stand('디오 기본'), 1030, 160, 150, 0) + P(tapeRoll('pink'), 380, 640, 130, 0) + P(tapeRoll('butter', 'dot'), 520, 690, 110, 0)
  + P(stickerSheet(['하트', '별', '풍선', '무지개', '해', '리본']), 980, 500, 130, 10) + P(postit('#FF8FB1', ['오늘도', '화이팅!!']), 820, 600, 120, 8) + P(postit('#8FD3FF', ['다꾸', '최고']), 120, 560, 120, -10)
  + P(polaroid('blossom', '봄봄'), 200, 420, 120, -12) + P(scissors('#4FC3F7'), 690, 650, 170, -14)}${[[300, 150], [880, 140], [700, 130]].map(([x, y]) => P(IMG('반짝이'), x, y, 50, 0)).join('')}</div>`

// ---------- 장면 목록 ----------
const L = (ids) => ids.map((id) => (id === 'new' ? { id: 'new' } : byId(id)))
const SWIPE_LIST = L(['weekly', 'memo', 'd2026', 'trip', 'fan', 'read', 'class', 'new'])
const GRID_LIST = L(['weekly', 'memo', 'd2026', 'trip', 'fan', 'read', 'class', 'new'])

function tabletScene({ theme, world, objects, ui, dark = false, cls = '' }) {
  return `<div class="device tablet t-${theme} ${cls}">${railHTML(dark)}<main class="stage"><div class="world">${world}</div><div class="objects">${objects}</div><div class="ui">${ui}</div></main></div>`
}
function phoneScene({ theme, world, objects, ui, cls = '' }) {
  return `<div class="device phone t-${theme} ${cls}"><main class="stage"><div class="world">${world}</div><div class="objects">${objects}</div><div class="ui">${ui}</div></main></div>`
}
const swipeT = (theme, o = {}) => {
  const active = o.active ?? 1, d = SWIPE_LIST[active]
  return tabletScene({ theme, dark: theme === 'night', cls: o.cls ?? '',
    world: (o.world ?? WORLD[theme])({ view: 'swipe', ...o }),
    objects: swipeObjects({ list: SWIPE_LIST, active, shift: o.shift ?? 0, dimMode: o.dimMode ?? (theme === 'night' ? 'dark' : 'gray'), ribbon: o.ribbon, desk: o.desk ?? true }),
    ui: headerUI({ view: 'swipe', dark: theme === 'night', filter: o.filter }) + swipeUI(d, { idx: active + 1, total: 7, shareNames: o.shareNames }) })
}
const swipeP = (theme, o = {}) => {
  const active = o.active ?? 1, d = SWIPE_LIST[active]
  return phoneScene({ theme, cls: o.cls ?? '', world: WORLD[theme]({ phone: true, view: 'swipe', ...o }),
    objects: swipeObjects({ list: SWIPE_LIST, active, phone: true, dimMode: theme === 'night' ? 'dark' : 'gray' }),
    ui: headerUI({ view: 'swipe', phone: true }) + swipeUI(d, { phone: true, idx: active + 1, total: 7 }) })
}
const gridT = (theme, o = {}) => {
  const { o: objs, u } = gridObjects({ list: GRID_LIST, plate: o.plate, rot: o.rot, lift: 0, cropMarks: o.cropMarks, ...(o.grid ?? {}) })
  return tabletScene({ theme, dark: theme === 'night', cls: o.cls ?? '', world: (o.world ?? WORLD[theme])({ view: 'grid', ...o }), objects: objs + (o.extra ?? ''), ui: headerUI({ view: 'grid', dark: theme === 'night' }) + u })
}
const gridP = (theme, o = {}) => {
  const { o: objs, u } = gridObjects({ list: GRID_LIST, phone: true, plate: o.plate, rot: o.rot })
  return phoneScene({ theme, world: WORLD[theme]({ phone: true, view: 'grid', ...o }), objects: objs, ui: headerUI({ view: 'grid', phone: true }) + u })
}

// 2안 한눈에: 진열 선반
function shelfWorld() {
  const shelf = (y) => `<div style="position:absolute;left:150px;right:150px;top:${y}px;height:16px;background:linear-gradient(180deg,#E9DCC6,#D8C6A8);border-radius:3px;box-shadow:0 10px 16px -6px rgba(90,70,40,.35)"></div><div style="position:absolute;left:150px;right:150px;top:${y + 16}px;height:6px;background:#C9B492;border-radius:0 0 3px 3px"></div>`
  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#F6F1EA,#EFE7DB)"></div><div class="blinds"></div><div class="glow"></div>${shelf(380)}${shelf(672)}
    <div class="props">${P(cactusSide(), 166, 286, 66, 0, { sd: false })}${P(stand('모아 행복'), 1024, 248, 96, 0, { sd: false })}${P(tapeRoll('butter', 'dot'), 172, 610, 66, 0, { sd: false })}${P(stand('디오 기본'), 1028, 540, 90, 0, { sd: false })}</div>`
}
// 층 구조 도해
function layerSheet() {
  const plane = (inner, y, label, sub, bg = 'transparent', border = '2px dashed rgba(11,25,87,.3)') => `
    <div style="position:absolute;left:150px;top:${y}px;width:720px;height:478px;transform:rotateX(58deg) rotateZ(-34deg);transform-style:preserve-3d">
      <div style="position:absolute;inset:0;background:${bg};border:${border};border-radius:14px;overflow:hidden"><div style="position:absolute;left:0;top:0;width:1204px;height:800px;transform:scale(.598);transform-origin:0 0">${inner}</div></div></div>
    <div style="position:absolute;left:1000px;top:${y + 180}px;width:540px"><div style="font-size:24px;font-weight:800;color:#0B1957">${label}</div><div style="font-size:15px;line-height:1.6;color:rgba(11,25,87,.72);margin-top:6px">${sub}</div></div>`
  const worldOnly = `<div class="t-pencil" style="position:absolute;inset:0"><div class="world">${WORLD.pencil({ view: 'swipe' })}</div></div>`
  const objOnly = `<div class="t-pencil" style="position:absolute;inset:0">${swipeObjects({ list: SWIPE_LIST, active: 1 })}</div>`
  const uiOnly = `<div style="position:absolute;inset:0">${headerUI({ view: 'swipe' })}${swipeUI(SWIPE_LIST[1], { idx: 2, total: 7 })}</div>`
  return `<div class="sheet" style="height:1240px;position:relative;perspective:2400px;overflow:hidden">
    <h2>세 겹으로 나눈다</h2><div class="sub">감성은 맨 아래 한 겹에만. 위 두 겹은 편집 화면과 같은 규칙을 그대로 쓴다.</div>
    ${plane(uiOnly, 30, '③ UI 층 — 버튼 · 글자', '편집기와 <b>같은 토큰</b>(theme.js) · 같은 글꼴 · 같은 모서리.<br>책상 그림 위에 글자를 바로 올리지 않고 흰 판 위에 둔다.')}
    ${plane(objOnly, 330, '② 물건 층 — 다이어리', '사용자가 고른 색. 화면에서 <b>가장 진한 색</b>은 여기만.<br>진짜 그림자(두 겹)와 페이지 두께. 누르면 편집기로 이어진다.', 'transparent')}
    ${plane(worldOnly, 630, '① 세계 층 — 책상', '채도 낮게 · 대비 낮게 · <b>누르지 않음</b> · 움직이지 않음.<br>편집기로 들어가면 가장 먼저 사라지는 층.', '#E6E6E3', '2px solid rgba(11,25,87,.12)')}
  </div>`
}
// 소품 도감
function propSheet() {
  const items = [
    ['회원증', '좀비고의 학생증 자리', idcard(), 100, -8], ['엽서', '공유 다이어리 · 초대', postcard(), 200, 6], ['폴라로이드', '사진 넣기 예고', polaroid('sea', '7월의 바다'), 130, -6], ['아크릴 스탠드 · 모아', '캐릭터 = 굿즈', stand('모아 기본'), 110, 0], ['아크릴 스탠드 · 디오', '공유 탭 · 친구', stand('디오 기본'), 110, 0],
    ['아크릴 키링', '작은 캐릭터 노출', keyring('모아 행복'), 70, 14], ['마스킹테이프 롤', '편집기 테이프 팔레트', tapeRoll('sky'), 120, 0], ['테이프 조각', '종이 고정 · 이름표', tapeStrip('pink', 160, 'dot'), 170, -6], ['포스트잇', '짧은 한 줄 (손글씨)', postit(), 110, 4], ['펜', '마지막으로 쓴 다이어리 위', pen(), 250, -18],
    ['연필', '최소안의 유일한 소품', pencil(), 240, -10], ['지우개', '브랜드 DIO 각인', eraser(), 120, -8], ['클립', '정리 · 놀링', clip(), 22, 30], ['머그컵', '햇살 · 밤 책상', mug(), 120, 0], ['탁상 달력', '오늘 날짜 = 실제 정보', calendarPad(), 100, 4],
    ['도장', '오늘의 한 장 완성', stamp(), 110, -10], ['가위', '작업 매트', scissors(), 170, -14], ['스티커 시트', '편집기 스티커 그대로', stickerSheet(), 96, 6], ['화분', '햇살 책상', plantTop(), 130, 0], ['스탠드 조명', '밤 책상', lampTop(), 170, 0],
  ]
  return `<div class="sheet"><h2>소품 도감</h2><div class="sub">모두 앱 안에 실제로 있는 재료(테이프 팔레트 · 스티커 · 캐릭터 · 날짜)에서 왔다. 1안에서는 같은 소품이 연필선 흑백으로 바뀐다.</div>
    <div class="cells" style="grid-template-columns:repeat(5,1fr)">${items.map(([n, s, html, w, r]) => `<div class="cell" style="height:250px"><div class="desk" style="display:grid;place-items:center"><div class="prop sd" style="position:relative;width:${w}px;transform:rotate(${r}deg)">${html}</div></div><div class="cap">${n}<small>${s}</small></div></div>`).join('')}</div></div>`
}
// 표지 디테일
function coverSheet() {
  const desk = (inner, h = 330) => `<div class="desk" style="height:${h}px;bottom:auto;background:#ECEAE5">${inner}</div>`
  const c = [
    ['페이지 두께 = 페이지 수', '8 · 48 · 120페이지. 숫자 없이 두께로 먼저 보인다', place(cover({ ...byId('trip'), pages: 8 }, 92), 70, 84, 92) + place(cover({ ...byId('memo'), pages: 48 }, 92), 180, 84, 92) + place(cover({ ...byId('fan'), pages: 120 }, 92), 290, 84, 92)],
    ['즐겨찾기 = 책갈피 끈', '별 버튼은 그대로 두고, 표지 아래로 끈이 내려온다', place(cover(byId('memo'), 150, { ribbon: true, actions: true }), 190, 50, 150)],
    ['공유 = 이름 테이프', '함께 쓰는 사람 이름을 마스킹테이프에 손글씨로', place(cover(byId('class'), 150), 190, 50, 150) + `<div style="position:absolute;left:96px;top:56px;width:150px;transform:rotate(-8deg)">${tapeStrip('mint', 150)}<div class="hand" style="position:absolute;inset:0;text-align:center;font-size:21px;line-height:36px;color:#2E3240">민지 · 지후 외 2</div></div>`],
    ['마지막으로 쓴 다이어리 = 펜', '어제 쓰던 다이어리 위에 펜이 놓여 있다', place(cover(byId('d2026'), 150), 190, 50, 150) + P(pen(), 96, 150, 230, -28)],
    ['새 다이어리 = 비닐 포장', '맨 끝 카드. 뜯지 않은 새 노트', place(cover({ id: 'new' }, 150), 190, 50, 150)],
    ['편집 모드 = 체크 스티커', '선택한 표지에 동그란 체크 스티커', place(cover(byId('weekly'), 150, { check: true }), 190, 50, 150)],
    ['오늘 쓴 다이어리 = 도장', '오늘 한 장을 채우면 표지 모서리에 도장', place(cover(byId('fan'), 150), 190, 50, 150) + P(stamp(), 220, 190, 86, -12, { sd: false })],
    ['사진 표지 = 코팅 반사', '가운데 다이어리에만 비스듬한 빛 한 줄', place(cover({ ...byId('d2026'), color: '#8FB0DA' }, 150, { sheen: true }), 190, 50, 150)],
  ]
  return `<div class="sheet"><h2>표지 디테일 — 정보가 물건의 모양으로</h2><div class="sub">글자나 배지를 더하지 않고, 이미 있는 정보를 다이어리라는 물건의 상태로 보여 준다.</div>
    <div class="cells" style="grid-template-columns:repeat(4,1fr)">${c.map(([n, s, inner]) => `<div class="cell" style="height:400px">${desk(`<div class="props" style="position:absolute;inset:0">${inner}</div>`)}<div class="cap" style="bottom:14px">${n}<small>${s}</small></div></div>`).join('')}</div></div>`
}

const SCENES = {
  // 1안 연필 책상
  '1안 기본': () => swipeT('pencil'),
  '1안 넘기는 중': () => swipeT('pencil', { shift: .45 }),
  '1안 새 다이어리': () => swipeT('pencil', { active: 7 }),
  '1안 한눈에': () => gridT('pencil'),
  '1안 폰': () => swipeP('pencil'),
  '1안 폰 한눈에': () => gridP('pencil'),
  '1안 공유 탭': () => swipeT('pencil', { active: 6, filter: 'shared', shared: true, shareNames: '민지 · 지후 외 2명' }),
  '1안 빈 책상': () => tabletScene({ theme: 'pencil', world: WORLD.pencil({ empty: true }),
    objects: `<div style="position:absolute;left:477px;top:180px;width:250px;height:332px;border:2.5px dashed rgba(11,25,87,.28);border-radius:6px 14px 14px 6px;background:rgba(255,255,255,.35)"></div>${P(stand('모아 행복'), 740, 330, 120, 0)}`,
    ui: headerUI({}) + `<div style="position:absolute;left:477px;top:250px;width:250px;text-align:center"><div style="font-size:17px;font-weight:800">다이어리가 없어요</div><div style="font-size:13px;line-height:20px;color:rgba(11,25,87,.68);margin-top:6px">새 다이어리를 만들어<br>기록을 시작해 보세요.</div>
      <div style="margin:18px auto 0;width:190px;height:48px;border-radius:14px;background:#4F74AE;color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px">${icon('plus', 18, '#fff', { sw: 2.2 })}새 다이어리</div></div>` }),
  '계절 봄': () => swipeT('pencil', { season: 'spring' }),
  '계절 여름': () => swipeT('pencil', { season: 'summer' }),
  '계절 가을': () => swipeT('pencil', { season: 'autumn' }),
  '계절 겨울': () => swipeT('pencil', { season: 'winter' }),
  // 2안 햇살 책상
  '2안 기본': () => swipeT('sun'),
  '2안 아침': () => swipeT('sun', { cls: 'morning' }),
  '2안 밤': () => swipeT('sun', { cls: 'night', time: 'night' }),
  '2안 한눈에': () => gridT('sun', { world: shelfWorld, grid: { rows: [182, 474], x0: 254, gapx: 52, w: 150, labelDy: 34 }, plate: true }),
  '2안 폰': () => swipeP('sun'),
  // 3안 다꾸 작업 매트
  '3안 기본': () => swipeT('mat'),
  '3안 한눈에': () => gridT('mat', { cropMarks: true, grid: { x0: 240, gapx: 60, w: 140, rows: [180, 446] }, plate: true }),
  '3안 폰': () => swipeP('mat'),
  // 4안 밤의 스탠드
  '4안 기본': () => swipeT('night'),
  '4안 한눈에': () => gridT('night', { cls: 'lightson' }),
  // 5안 원근 책상
  '5안 기본': () => tabletScene({ theme: 'persp', world: WORLD.persp({}),
    objects: `<div class="contact" style="left:420px;top:500px;width:360px;height:80px"></div>${place(cover(byId('memo'), 270, { lift: 1, actions: true, sheen: true }), 602, 150, 270)}`,
    ui: headerUI({}) + `<div class="arrow" style="left:22px;top:316px">${icon('chevL', 24, '#0B1957', { sw: 2.1 })}</div><div class="arrow" style="right:22px;top:316px">${icon('chevR', 24, '#0B1957', { sw: 2.1 })}</div>${infoCard(byId('memo'), 477, 548, 250)}<div class="count" style="left:602px;top:622px">2 / 7</div>` }),
  '5안 한눈에': () => gridT('sun', { world: () => `<div class="props">${P(idcard(), 46, 400, 120, 0)}${P(pen(), 912, 330, 330, 90)}${P(pencil(), 960, 330, 300, 90)}${P(tapeRoll('sky'), 1074, 540, 100, 0)}${P(polaroid('sea', '7월의 바다'), 40, 170, 130, 0)}${P(clip(), 1100, 600, 20, 0)}${P(clip(), 1130, 600, 20, 0)}</div><div class="glow"></div>` }),
  // 6안 종이 한 장
  '6안 기본': () => swipeT('min', { dimMode: 'fade', desk: false }),
  '6안 한눈에': () => gridT('min'),
  '6안 폰': () => swipeP('min'),
  // 비교 · 전환
  'X 예시': () => tabletScene({ theme: 'bad', world: WORLD.bad(),
    objects: swipeObjects({ list: SWIPE_LIST, active: 1, desk: true, dimMode: 'none', sheen: false }),
    ui: headerUI({}) + `<div class="rawlab" style="left:602px;top:520px">메모장<small>48페이지</small></div><div class="rawlab" style="left:312px;top:486px;font-size:20px">위클리 플래너</div><div class="rawlab" style="left:892px;top:486px;font-size:20px">2026 다이어리</div>` }),
  '전환 1': () => swipeT('pencil'),
  '전환 2': () => tabletScene({ theme: 'pencil', world: `<div style="position:absolute;inset:0;filter:blur(3px);opacity:.75">${WORLD.pencil({})}</div><div style="position:absolute;inset:0;background:rgba(241,243,247,.35)"></div>`,
    objects: `<div style="opacity:.25">${swipeObjects({ list: SWIPE_LIST, active: 1, centerExtra: '' }).replace(/z-index:10/, 'z-index:10;visibility:hidden')}</div>${place(cover(byId('memo'), 300, { lift: 1, sheen: true }), 602, 150, 300)}`,
    ui: `<div style="opacity:.18">${headerUI({})}</div>` }),
  '전환 3': () => tabletScene({ theme: 'pencil', world: `<div style="position:absolute;inset:0;filter:blur(6px);opacity:.5">${WORLD.pencil({})}</div><div style="position:absolute;inset:0;background:rgba(241,243,247,.72)"></div>`,
    objects: `<div style="position:absolute;left:182px;top:130px;width:840px;height:560px;display:flex;filter:drop-shadow(0 30px 30px rgba(20,25,50,.25))">
      <div style="width:420px;height:560px;border-radius:14px 4px 4px 14px;background:${patternCss('gingham')}, #B39FD0;position:relative"><div style="position:absolute;inset:14px 0 14px 14px;background:#F6F2EA;border-radius:8px 0 0 8px;box-shadow:inset -14px 0 20px -10px rgba(0,0,0,.18)"></div></div>
      <div style="width:420px;height:560px;position:relative;border-radius:0 4px 4px 0;overflow:hidden;box-shadow:inset 14px 0 20px -12px rgba(0,0,0,.2)">${pageContent(1)}</div></div>`,
    ui: '' }),
  '전환 4': () => `<div class="device tablet" style="display:block">${editorHTML(byId('memo'))}</div>`,
  '폰 전환 비교': () => '',
  // 시트
  '층 구조': layerSheet,
  '소품 도감': propSheet,
  '표지 디테일': coverSheet,
}
delete SCENES['폰 전환 비교']

function render() {
  const name = decodeURIComponent(location.hash.slice(1)) || '1안 기본'
  document.getElementById('root').innerHTML = (SCENES[name] ?? (() => `<p>없는 장면: ${name}</p>`))()
  document.title = name
}
window.addEventListener('hashchange', render)
