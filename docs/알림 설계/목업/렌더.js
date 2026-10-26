// 스티커 이미지 파일 이름 (코드용 식별자 → 스티커/ 폴더의 한글 파일 이름)
const STK_FILE = {"airplane": "비행기", "balloon": "풍선", "bear": "곰", "blossom": "벚꽃", "butterfly": "나비", "cake": "케이크", "camera": "카메라", "cat": "고양이", "gift": "선물", "glowstar": "반짝별", "headphone": "헤드폰", "heart": "하트", "leaf": "잎", "letter": "편지", "maple": "단풍", "moon": "달", "party": "파티", "pinkheart": "분홍하트", "rainbow": "무지개", "ribbon": "리본", "snowflake": "눈송이", "sparkles": "반짝이", "star": "별", "sun": "해", "sunflower": "해바라기", "twohearts": "두하트"};
// DIO 리뉴얼 시안 공용 — 데이터, 표지·속지 그리기, 작은 도우미
const $ = (s, el = document) => el.querySelector(s)
const h = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const COVER_COLORS = [['세이지', '#A9BFA6'], ['로즈', '#F0B0AA'], ['페리윙클', '#9DABD8'], ['머스터드', '#EBC56F'], ['라벤더', '#C3AEDD'], ['차콜', '#474F55'], ['카멜', '#D9A87F'], ['크림', '#EAE3D4']]
const PATTERNS = {
  none: ['없음', 'none'],
  linen: ['린넨', 'repeating-linear-gradient(0deg, rgba(11,25,87,.08) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(255,255,255,.25) 0 1px, transparent 1px 4px)'],
  leather: ['레더', 'radial-gradient(rgba(11,25,87,.10) 1.2px, transparent 1.6px) 0 0/7px 7px'],
  dot: ['도트', 'radial-gradient(rgba(255,255,255,.55) 2.4px, transparent 2.8px) 0 0/14px 14px'],
  gingham: ['깅엄', 'repeating-linear-gradient(0deg, rgba(255,255,255,.3) 0 8px, transparent 8px 16px), repeating-linear-gradient(90deg, rgba(255,255,255,.3) 0 8px, transparent 8px 16px)'],
  stripe: ['스트라이프', 'repeating-linear-gradient(90deg, rgba(255,255,255,.3) 0 6px, transparent 6px 14px)'],
}
// 편집기 텍스트 도구와 같은 글씨체
const FONTS = [
  ['gothic', '기본 고딕', "'Malgun Gothic', system-ui, sans-serif"],
  ['serif', '기본 명조', "'Batang', 'Nanum Myeongjo', serif"],
  ['nanumgothic', '나눔고딕', "'Nanum Gothic', sans-serif"],
  ['myeongjo', '나눔명조', "'Nanum Myeongjo', serif"],
  ['pen', '나눔손글씨 펜', "'Nanum Pen Script', cursive"],
  ['poor', '푸어스토리', "'Poor Story', cursive"],
]
const fontCss = (id) => (FONTS.find((f) => f[0] === id) ?? FONTS[0])[2]
const fontScale = (id) => (id === 'pen' ? 1.35 : id === 'poor' ? 1.12 : 1)
const PAPER_BG = [['화이트', '#FFFFFF'], ['크림', '#FFF8E7'], ['세이지', '#EDF3EA'], ['로즈', '#FBEFF0'], ['아이스 블루', '#EDF3FA'], ['웜 그레이', '#F1EFEB']]
const PAPER_INK = [['차콜', '#292929'], ['네이비', '#33476B'], ['브라운', '#72533E'], ['포레스트', '#486653'], ['플럼', '#75546F'], ['슬레이트', '#596875']]
const PAPER_FONTS = [['myeongjo', '명조 (지금 속지)'], ['nanumgothic', '고딕'], ['pen', '손글씨 펜'], ['poor', '푸어스토리']]
const STICKERS = ['sun', 'blossom', 'heart', 'sparkles', 'star', 'camera', 'balloon', 'leaf', 'cake', 'gift', 'snowflake', 'bear', 'pinkheart', 'sunflower', 'glowstar', 'twohearts', 'moon', 'headphone', 'party', 'ribbon', 'maple', 'rainbow', 'cat', 'butterfly', 'airplane', 'letter']
const PHOTOS = [
  ['노을', 'linear-gradient(180deg, #F6C9B8 0%, #F3D9C2 38%, #BFD3EA 70%, #8FB0DA 100%)'],
  ['숲', 'linear-gradient(160deg, #DCEBD0 0%, #9CC29A 45%, #4E7D5B 100%)'],
  ['모래', 'linear-gradient(170deg, #FBEFD9 0%, #F0D3A8 50%, #C99E6E 100%)'],
  ['밤하늘', 'radial-gradient(circle at 70% 25%, #FFF6C8 0 3%, transparent 4%), linear-gradient(180deg, #1F2A5A 0%, #3B4C8C 60%, #8A7DB8 100%)'],
  ['벚꽃', 'radial-gradient(circle at 20% 30%, #fff 0 6%, transparent 7%), radial-gradient(circle at 75% 60%, #fff 0 5%, transparent 6%), linear-gradient(180deg, #FDE3EA, #F7B9CB)'],
  ['바다', 'linear-gradient(180deg, #CFEAF6 0%, #8CCBE6 50%, #3E8DB8 100%)'],
]
// 테마 표지: 색·패턴·사진·스티커·제목 스타일을 한꺼번에
const COVER_THEMES = [
  { id: 'baseball', name: '야구 직관', badge: 'new', color: '#2F6B4F', pattern: 'stripe', photo: null, title: { font: 'nanumgothic', color: '#2F6B4F', pos: 'top', style: 'label' }, stickers: [['star', 70, 72, 16]], meta: '{year} SEASON' },
  { id: 'concert', name: '콘서트', color: '#7A4FB0', pattern: 'dot', photo: 3, title: { font: 'poor', color: '#FFFFFF', pos: 'bottom', style: 'none' }, stickers: [['headphone', 62, 18, 22], ['sparkles', 16, 22, 14]], meta: 'LIVE' },
  { id: 'musical', name: '뮤지컬·연극', color: '#A23B4E', pattern: 'linen', photo: null, title: { font: 'myeongjo', color: '#A23B4E', pos: 'middle', style: 'label' }, stickers: [['ribbon', 40, 70, 20]], meta: 'STAGE' },
  { id: 'travel', name: '여행', color: '#2C7C8C', pattern: 'none', photo: 5, title: { font: 'pen', color: '#FFFFFF', pos: 'top', style: 'none' }, stickers: [['airplane', 60, 60, 26]], meta: 'TRIP' },
  { id: 'halloween', name: '할로윈', badge: 'limit', until: '~10.31', color: '#D2691E', pattern: 'dot', photo: null, title: { font: 'poor', color: '#4A2A10', pos: 'middle', style: 'ribbon' }, stickers: [['moon', 62, 12, 22], ['maple', 14, 72, 18]], meta: 'HALLOWEEN' },
  { id: 'christmas', name: '크리스마스', badge: 'limit', until: '12월', color: '#B3343A', pattern: 'gingham', photo: null, title: { font: 'poor', color: '#B3343A', pos: 'top', style: 'label' }, stickers: [['snowflake', 18, 66, 16], ['gift', 62, 70, 20]], meta: 'XMAS' },
]

// ---------- 표지 ----------
// st: { color, pattern, photo(null | index | dataURL), photoX, photoY, photoZoom, title, meta, font, tcolor, tsize, pos, align, style('label'|'none'|'ribbon'), band, stickers:[{id,name,x,y,size}] }
function coverHTML(st, width, { interactive = false, selected = null } = {}) {
  const hgt = Math.round(width * 246 / 185), s = width / 185
  const photo = st.photo == null ? '' : typeof st.photo === 'number'
    ? `<div class="bgimg" style="background:${PHOTOS[st.photo][1]};transform:scale(${st.photoZoom ?? 1}) translate(${st.photoX ?? 0}%,${st.photoY ?? 0}%)"></div>`
    : `<div class="bgimg" style="background-image:url(${st.photo});background-position:${50 - (st.photoX ?? 0)}% ${50 - (st.photoY ?? 0)}%;background-size:${(st.photoZoom ?? 1) * 100}% auto"></div>`
  const tsize = (st.tsize ?? 16) * s * fontScale(st.font)
  const top = { top: '16%', middle: '40%', bottom: '68%' }[st.pos ?? 'top']
  const align = st.align ?? 'left'
  const inner = `<div class="t" style="font-family:${fontCss(st.font)};color:${st.tcolor ?? '#3B3F4A'};font-size:${tsize}px;text-align:${align}">${h(st.title || '새 다이어리')}</div>${st.style === 'none' ? '' : `<div class="m" style="font-size:${Math.max(7, 8.5 * s)}px;text-align:${align}">${h(st.meta ?? 'DIARY')}</div>`}`
  const title = `<div class="title ${selected === 'title' ? 'sel' : ''}" data-part="title" style="top:${top}"><div class="${st.style === 'label' ? 'label' : st.style === 'ribbon' ? 'ribbon' : ''}" style="${st.style === 'none' ? 'text-shadow:0 1px 8px rgba(0,0,0,.25)' : ''}">${inner}</div></div>`
  const stickers = (st.stickers ?? []).map((k) => `<div class="stk ${selected === k.id ? 'sel' : ''}" data-part="${k.id}" style="left:${k.x}%;top:${k.y}%;width:${k.size * s * 2.2}px"><img src="스티커/${STK_FILE[k.name] ?? k.name}.png" style="width:100%;display:block;pointer-events:none"><span class="x" data-remove="${k.id}">✕</span></div>`).join('')
  return `<div class="cover" data-cover style="width:${width}px;height:${hgt}px;background:${PATTERNS[st.pattern ?? 'none'][1]}, ${st.color}">${photo}<div class="spine"></div>${st.band === false ? '' : '<div class="band"></div>'}${title}${stickers}</div>`
}

// ---------- 속지 (400×300 SVG, 날짜는 계산해서 그린다) ----------
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
// 양력 공휴일만 (음력 설·추석·부처님오신날은 연도별 데이터 필요)
const HOLIDAYS = new Set(['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'])
const isHoliday = (d) => HOLIDAYS.has(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
function txt(x, y, s, size, o = {}) { return `<text x="${x}" y="${y}" font-size="${size}" fill="${o.fill ?? 'var(--ink)'}" font-weight="${o.w ?? 400}" text-anchor="${o.a ?? 'start'}" ${o.op ? `opacity="${o.op}"` : ''}>${h(s)}</text>` }
const line = (x1, y1, x2, y2, op = 0.25, w = 0.8) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-opacity="${op}" stroke-width="${w}"/>`
const rect = (x, y, w, hh, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${o.rx ?? 3}" fill="${o.fill ?? 'none'}" stroke="var(--ink)" stroke-opacity="${o.op ?? 0.3}" stroke-width="0.8" ${o.dash ? 'stroke-dasharray="3 2"' : ''}/>`
const lines = (x, y, w, n, gap = 14) => Array.from({ length: n }, (_, i) => line(x, y + i * gap, x + w, y + i * gap, 0.18)).join('')

function pageSVG(kind, o = {}) {
  const year = o.year ?? 2026, month = o.month ?? 1, ws = o.weekStart ?? 1, dated = o.dated !== false
  const ink = o.ink ?? '#292929', bg = o.bg ?? '#FFFFFF', ff = fontCss(o.font ?? 'myeongjo'), hol = o.holidays !== false
  const red = '#D0443F'
  let b = ''
  const dayColor = (d, dow) => (hol && (dow === 0 || isHoliday(d))) ? red : dow === 6 ? '#3A62B0' : 'var(--ink)'
  if (kind === 'cover-page') {
    b += txt(30, 150, dated ? String(year) : '', 46, { w: 400 }) + txt(30, 180, '노트 제목', 8, { op: 0.6 }) + line(78, 178, 190, 178) + txt(30, 250, '이름', 7, { op: 0.6 }) + line(52, 250, 190, 250) + txt(30, 268, '기간', 7, { op: 0.6 }) + line(52, 268, 190, 268)
  } else if (kind === 'divider') {
    b += txt(30, 140, dated ? `${month}월` : '__월', 52, { w: 700 }) + txt(32, 162, MONTH_EN[month - 1], 10, { op: 0.55, w: 700 }) + (dated ? txt(32, 178, String(year), 9, { op: 0.45 }) : '') + line(30, 190, 160, 190)
  } else if (kind === 'monthly') {
    b += txt(20, 34, dated ? `${month}월` : '__월', 20, { w: 700 }) + (dated ? txt(70, 34, String(year), 9, { op: 0.5 }) : '')
    const x0 = 20, y0 = 50, cw = 360 / 7, rh = 38
    for (let i = 0; i < 7; i++) { const dow = (ws + i) % 7; b += txt(x0 + i * cw + 4, y0 - 4, DOW[dow], 7, { fill: dow === 0 && hol ? red : dow === 6 ? '#3A62B0' : 'var(--ink)', op: 0.8 }) }
    const first = new Date(year, month - 1, 1), off = (first.getDay() - ws + 7) % 7
    for (let r = 0; r <= 6; r++) b += line(x0, y0 + r * rh, x0 + 360, y0 + r * rh, 0.22)
    for (let c = 0; c <= 7; c++) b += line(x0 + c * cw, y0, x0 + c * cw, y0 + 6 * rh, 0.12)
    if (dated) for (let i = 0; i < 42; i++) {
      const d = new Date(year, month - 1, 1 - off + i), inMonth = d.getMonth() === month - 1
      b += txt(x0 + (i % 7) * cw + 4, y0 + Math.floor(i / 7) * rh + 11, String(d.getDate()), 7.5, { fill: dayColor(d, d.getDay()), op: inMonth ? 0.95 : 0.3 })
    }
  } else if (kind === 'weekly' || kind === 'weekly-journal') {
    const base = new Date(year, month - 1, 1 + 7 * (o.week ?? 0)), start = new Date(base); start.setDate(base.getDate() - ((base.getDay() - ws + 7) % 7))
    const end = new Date(start); end.setDate(start.getDate() + 6)
    b += txt(200, 26, dated ? `${start.getMonth() + 1}월 ${Math.ceil((start.getDate() + new Date(start.getFullYear(), start.getMonth(), 1).getDay()) / 7)}주차` : '__월 __주차', 12, { w: 700, a: 'middle' })
    if (dated) b += txt(380, 26, `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`, 6.5, { a: 'end', op: 0.55 })
    const cols = kind === 'weekly' ? 4 : 2, rows = kind === 'weekly' ? 2 : 4, cw = 360 / cols, rh = 248 / rows
    for (let i = 0; i < cols * rows; i++) {
      const x = 20 + (i % cols) * cw, y = 38 + Math.floor(i / cols) * rh
      b += rect(x + 2, y + 2, cw - 4, rh - 4, { op: 0.18, rx: 2 })
      if (i < 7) { const d = new Date(start); d.setDate(start.getDate() + i); b += txt(x + 7, y + 14, dated ? `${d.getDate()} ${DOW[d.getDay()]}` : DOW[(ws + i) % 7], 7.5, { fill: dayColor(d, d.getDay()), w: 700 }) } else b += txt(x + 7, y + 14, 'MEMO', 7, { op: 0.5, w: 700 })
      b += lines(x + 7, y + 26, cw - 14, Math.floor((rh - 32) / 13), 13)
    }
  } else if (kind === 'diary') {
    const d = new Date(year, month - 1, o.day ?? 23)
    b += txt(20, 30, dated ? `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${DOW[d.getDay()]})` : '____. __. __ (  )', 12, { w: 700 })
    b += rect(250, 16, 60, 20, { op: 0.25 }) + txt(256, 29, '날씨 ☀ ☁ ☂', 6.5, { op: 0.7 }) + rect(316, 16, 64, 20, { op: 0.25 }) + txt(322, 29, '기분 ☺ ☹', 6.5, { op: 0.7 })
    b += rect(20, 46, 150, 110, { op: 0.25, dash: true }) + txt(95, 104, '사진', 8, { a: 'middle', op: 0.4 }) + lines(185, 60, 195, 7, 14) + lines(20, 176, 360, 8, 14)
  } else if (kind === 'daily') {
    b += txt(20, 30, '하루 계획', 12, { w: 700 }) + txt(380, 30, dated ? `${month}월 23일` : '__월 __일', 8, { a: 'end', op: 0.6 })
    for (let i = 0; i < 16; i++) { b += txt(22, 54 + i * 15, String(6 + i).padStart(2, '0'), 6.5, { op: 0.6 }) + line(38, 50 + i * 15, 200, 50 + i * 15, 0.15) }
    b += txt(220, 52, 'TO DO', 8, { w: 700, op: 0.7 }) + Array.from({ length: 9 }, (_, i) => rect(220, 60 + i * 16, 8, 8, { op: 0.4, rx: 1.5 }) + line(234, 68 + i * 16, 380, 68 + i * 16, 0.18)).join('') + txt(220, 222, 'NOTE', 8, { w: 700, op: 0.7 }) + lines(220, 236, 160, 4, 13)
  } else if (kind === 'scrap') {
    b += txt(20, 30, '사진·스크랩', 12, { w: 700 }) + rect(20, 44, 170, 130, { op: 0.25, dash: true }) + rect(205, 44, 175, 62, { op: 0.25, dash: true }) + rect(205, 112, 175, 62, { op: 0.25, dash: true }) + lines(20, 196, 360, 6, 14)
  } else if (kind.startsWith('note')) {
    const t = kind.split('-')[1]
    if (t === 'ruled') b += lines(20, 40, 360, 18, 14.5)
    if (t === 'grid') { for (let x = 20; x <= 380; x += 12) b += line(x, 20, x, 280, 0.13); for (let y = 20; y <= 280; y += 12) b += line(20, y, 380, y, 0.13) }
    if (t === 'dots') for (let x = 26; x < 380; x += 13) for (let y = 26; y < 280; y += 13) b += `<circle cx="${x}" cy="${y}" r=".9" fill="var(--ink)" fill-opacity=".35"/>`
  } else b += themeSVG(kind, { year, month, dated })
  return `<svg viewBox="0 0 400 300" style="--ink:${ink};font-family:${ff}"><rect width="400" height="300" fill="${bg}"/>${b}</svg>`
}
function themeSVG(kind, { year, dated }) {
  const T = {
    baseball: ['⚾ 직관 기록', '#2F6B4F'], soccer: ['⚽ 축구 직관', '#1F5FA8'], concert: ['🎤 콘서트 기록', '#7A4FB0'], musical: ['🎭 관극 일기', '#A23B4E'],
    travel: ['✈️ 여행 기록', '#2C7C8C'], halloween: ['🎃 Halloween', '#D2691E'], christmas: ['🎄 Christmas', '#B3343A'], season: ['⚾ 시즌 승패 달력', '#2F6B4F'], setlist: ['🎵 셋리스트', '#7A4FB0'],
  }[kind] ?? ['기록', '#6E92C6']
  const c = T[1]
  let b = `<text x="20" y="30" font-size="13" font-weight="700" fill="${c}">${h(T[0])}</text><line x1="20" y1="40" x2="380" y2="40" stroke="${c}" stroke-opacity=".4"/>`
  const box = (x, y, w, hh, label) => rect(x, y, w, hh, { op: 0.35, dash: true }) + (label ? txt(x + 5, y + 12, label, 7, { op: 0.6 }) : '')
  if (kind === 'baseball' || kind === 'soccer') {
    b += ['날짜', '구장', '상대팀', '좌석'].map((l, i) => box(20 + i * 91, 50, 85, 26, l)).join('')
    if (kind === 'baseball') { for (let i = 0; i < 11; i++) { b += `<rect x="${20 + i * 32.7}" y="88" width="31" height="16" fill="${c}" fill-opacity=".1"/><rect x="${20 + i * 32.7}" y="106" width="31" height="16" fill="${c}" fill-opacity=".05"/>`; b += txt(35 + i * 32.7, 99, i < 9 ? String(i + 1) : i === 9 ? 'R' : 'H', 7, { a: 'middle', fill: c }) } }
    else b += `<rect x="20" y="88" width="360" height="34" rx="4" fill="${c}" fill-opacity=".08"/>` + txt(200, 111, '0  :  0', 16, { a: 'middle', w: 700, fill: c })
    b += box(20, 134, 140, 140, '티켓 붙이기') + lines(175, 148, 205, 9, 14)
  } else if (kind === 'concert' || kind === 'setlist') {
    b += box(20, 52, 150, 110, '티켓·포스터') + txt(185, 62, '셋리스트', 8, { w: 700, fill: c }) + Array.from({ length: 10 }, (_, i) => txt(185, 80 + i * 13, `${i + 1}.`, 7, { op: 0.5 }) + line(198, 81 + i * 13, 380, 81 + i * 13, 0.15)).join('') + lines(20, 190, 360, 6, 14)
  } else if (kind === 'musical') {
    b += ['공연명', '캐스트', '좌석'].map((l, i) => box(20 + i * 121, 50, 115, 26, l)).join('') + box(20, 88, 120, 90, '티켓') + lines(155, 100, 225, 6, 14) + lines(20, 196, 360, 6, 14)
  } else if (kind === 'travel') {
    b += box(20, 50, 230, 120, '사진') + ['DAY 1', '경로', '지출'].map((l, i) => box(262, 50 + i * 41, 118, 36, l)).join('') + lines(20, 190, 360, 6, 14)
  } else if (kind === 'season') {
    for (let r = 0; r < 5; r++) for (let col = 0; col < 7; col++) { const x = 20 + col * 51.4, y = 50 + r * 46; b += rect(x + 1, y + 1, 49, 44, { op: 0.18, rx: 2 }); b += `<circle cx="${x + 38}" cy="${y + 12}" r="6" fill="${(r * 7 + col) % 3 ? c : '#D0443F'}" fill-opacity=".18"/>` }
  } else {
    b += `<text x="20" y="66" font-size="20" fill="${c}" font-family="'Poor Story', cursive">${kind === 'halloween' ? 'Trick or Treat' : 'Merry Christmas'}</text>` + box(20, 80, 170, 120, '') + lines(205, 92, 175, 8, 14) + lines(20, 220, 360, 4, 14) + txt(372, 284, kind === 'halloween' ? '👻🦇' : '⛄🎁', 18, { a: 'end' })
  }
  if (dated) b += txt(380, 30, String(year), 8, { a: 'end', op: 0.5 })
  return b
}
const pageBox = (kind, o) => `<div class="page">${pageSVG(kind, o)}</div>`

// 속지 이름
const KIND_NAMES = { 'cover-page': '첫 장 표지', divider: '월 구분', monthly: '월간 달력', weekly: '주간 · 블록형', 'weekly-journal': '주간 · 저널형', diary: '일기', daily: '하루 계획', scrap: '사진·스크랩', 'note-plain': '무지', 'note-ruled': '줄', 'note-grid': '모눈', 'note-dots': '도트', baseball: '직관 기록', soccer: '축구 직관', season: '승패 달력', concert: '콘서트 기록', setlist: '셋리스트', musical: '관극 일기', travel: '여행 기록', halloween: '할로윈', christmas: '크리스마스' }
const DATED_KINDS = new Set(['cover-page', 'divider', 'monthly', 'weekly', 'weekly-journal', 'diary', 'daily'])

let toastTimer
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000) }
