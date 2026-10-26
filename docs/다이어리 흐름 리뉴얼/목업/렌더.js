// 스티커 이미지 파일 이름 (코드용 식별자 → 스티커/ 폴더의 한글 파일 이름)
const STK_FILE = {"airplane": "비행기", "balloon": "풍선", "bear": "곰", "blossom": "벚꽃", "butterfly": "나비", "cake": "케이크", "camera": "카메라", "cat": "고양이", "gift": "선물", "glowstar": "반짝별", "headphone": "헤드폰", "heart": "하트", "leaf": "잎", "letter": "편지", "maple": "단풍", "moon": "달", "party": "파티", "pinkheart": "분홍하트", "rainbow": "무지개", "ribbon": "리본", "snowflake": "눈송이", "sparkles": "반짝이", "star": "별", "sun": "해", "sunflower": "해바라기", "twohearts": "두하트"};
// 시안 공용: 데이터 · 표지 그리기(방향 · 요소별) · 속지 그리기(방향 · 날짜 계산) · 작은 도우미
const $ = (s, el = document) => el.querySelector(s)
const h = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
let toastTimer
function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000) }

const COVER_COLORS = [['세이지', '#A9BFA6'], ['로즈', '#F0B0AA'], ['페리윙클', '#9DABD8'], ['머스터드', '#EBC56F'], ['라벤더', '#C3AEDD'], ['차콜', '#474F55'], ['카멜', '#D9A87F'], ['크림', '#EAE3D4']]
const PATTERNS = [['none', '없음'], ['linen', '린넨'], ['leather', '레더'], ['dot', '도트'], ['gingham', '깅엄'], ['stripe', '스트라이프'], ['grid', '체크']]
const patternCss = (type, tone) => {
  const c = tone === 'dark' ? 'rgba(11,25,87,.12)' : tone === 'light' ? 'rgba(255,255,255,.38)' : tone
  return {
    none: 'none',
    linen: `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 5px)`,
    leather: `radial-gradient(${c} 1.2px, transparent 1.6px) 0 0/7px 7px`,
    dot: `radial-gradient(${c} 2.4px, transparent 2.8px) 0 0/14px 14px`,
    gingham: `repeating-linear-gradient(0deg, ${c} 0 8px, transparent 8px 16px), repeating-linear-gradient(90deg, ${c} 0 8px, transparent 8px 16px)`,
    stripe: `repeating-linear-gradient(90deg, ${c} 0 6px, transparent 6px 14px)`,
    grid: `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 12px)`,
  }[type] ?? 'none'
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
const fontScale = (id) => (id === 'pen' ? 1.35 : id === 'poor' ? 1.1 : 1)
const PAPER_BG = [['화이트', '#FFFFFF'], ['크림', '#FFF8E7'], ['세이지', '#EDF3EA'], ['로즈', '#FBEFF0'], ['아이스 블루', '#EDF3FA'], ['웜 그레이', '#F1EFEB']]
const PAPER_INK = [['차콜', '#292929'], ['네이비', '#33476B'], ['브라운', '#72533E'], ['포레스트', '#486653'], ['플럼', '#75546F'], ['슬레이트', '#596875']]
const PAPER_FONTS = [['myeongjo', '명조'], ['nanumgothic', '고딕'], ['pen', '손글씨 펜'], ['poor', '푸어스토리']]
const INK_COLORS = [['흰색', '#FFFFFF'], ['먹색', '#3B3F4A'], ['네이비', '#0B1957'], ['파랑', '#4F74AE'], ['빨강', '#C8423F'], ['초록', '#2F6B4F']]
// 편집기 스티커 보관함과 같은 묶음 (시안은 Fluent Emoji 일부)
const STICKER_TABS = [
  ['fav', '즐겨찾기', ['heart', 'star', 'sparkles', 'blossom']],
  ['nature', '자연', ['sun', 'moon', 'blossom', 'leaf', 'maple', 'sunflower', 'snowflake', 'rainbow']],
  ['love', '마음', ['heart', 'pinkheart', 'twohearts', 'sparkles', 'glowstar', 'star']],
  ['things', '물건', ['camera', 'balloon', 'gift', 'cake', 'ribbon', 'headphone', 'letter', 'airplane', 'party']],
  ['animal', '동물', ['bear', 'cat', 'butterfly']],
]
const PHOTOS = [
  ['노을', 'linear-gradient(180deg, #F6C9B8 0%, #F3D9C2 38%, #BFD3EA 70%, #8FB0DA 100%)'],
  ['숲', 'linear-gradient(160deg, #DCEBD0 0%, #9CC29A 45%, #4E7D5B 100%)'],
  ['모래', 'linear-gradient(170deg, #FBEFD9 0%, #F0D3A8 50%, #C99E6E 100%)'],
  ['밤하늘', 'radial-gradient(circle at 70% 25%, #FFF6C8 0 3%, transparent 4%), linear-gradient(180deg, #1F2A5A 0%, #3B4C8C 60%, #8A7DB8 100%)'],
  ['벚꽃', 'radial-gradient(circle at 20% 30%, #fff 0 6%, transparent 7%), radial-gradient(circle at 75% 60%, #fff 0 5%, transparent 6%), linear-gradient(180deg, #FDE3EA, #F7B9CB)'],
  ['바다', 'linear-gradient(180deg, #CFEAF6 0%, #8CCBE6 50%, #3E8DB8 100%)'],
]
const ANCHORS = [['tl', '왼쪽 위'], ['tc', '가운데 위'], ['tr', '오른쪽 위'], ['ml', '왼쪽 가운데'], ['mc', '한가운데'], ['mr', '오른쪽 가운데'], ['bl', '왼쪽 아래'], ['bc', '가운데 아래'], ['br', '오른쪽 아래']]

// ---------- 표지 ----------
// c = { enabled, kind:'plain'|'photo', color, pattern:{type,tone}, photo, band:{on,dir:'v'|'h',pos:'near'|'center',color},
//       plate:'paper'|'ribbon'|'none', title:{text,font,size,color,anchor}, subtitle:{on,text,size,color}, stickers:[{id,name,x,y,size,rot}] }
const coverSize = (w, orient) => (orient === 'landscape' ? { w, h: Math.round(w * 3 / 4) } : { w, h: Math.round(w * 4 / 3) })
function coverHTML(c, width, { orient = 'portrait', sel = null, interactive = false } = {}) {
  const { w, h: hh } = coverSize(width, orient), s = w / 200
  if (!c.enabled) return `<div class="cover nocover" style="width:${w}px;height:${hh}px"><div><b>표지 없음</b><span>첫 장부터 시작해요<br>표지는 나중에 언제든 더할 수 있어요</span></div></div>`
  const bg = c.kind === 'photo'
    ? (typeof c.photo === 'number' ? PHOTOS[c.photo][1] : `center/cover no-repeat url(${c.photo})`)
    : `${patternCss(c.pattern.type, c.pattern.tone)}, ${c.color}`
  const band = c.band.on ? (c.band.dir === 'v'
    ? `<div class="band" style="top:0;bottom:0;width:${Math.max(3, 7 * s)}px;${c.band.pos === 'center' ? 'left:50%' : 'right:15%'};background:${c.band.color}"></div>`
    : `<div class="band" style="left:0;right:0;height:${Math.max(3, 7 * s)}px;${c.band.pos === 'center' ? 'top:50%' : 'bottom:14%'};background:${c.band.color}"></div>`) : ''
  const a = c.title.anchor, v = a[0], hz = a[1]
  const pos = `${v === 't' ? 'top:11%' : v === 'm' ? 'top:50%;transform:translateY(-50%)' : 'bottom:11%'};${hz === 'l' ? 'left:11%;text-align:left' : hz === 'c' ? 'left:11%;right:11%;text-align:center' : 'right:11%;text-align:right'};${hz !== 'c' ? 'max-width:78%' : ''}`
  const ts = c.title.size * s * fontScale(c.title.font)
  const plateStyle = c.plate === 'paper' ? 'background:rgba(255,253,248,.96);border-radius:4px;padding:6% 8%;box-shadow:0 1px 2px rgba(0,0,0,.08)' : c.plate === 'ribbon' ? 'background:rgba(255,255,255,.86);padding:4% 8%' : ''
  const title = (c.title.text || c.subtitle.on) ? `<div class="cv-title ${sel === 'title' ? 'sel' : ''}" data-part="title" style="position:absolute;${pos};${c.plate === 'ribbon' && hz === 'c' ? 'left:0;right:0' : ''}"><div style="${plateStyle};display:inline-block;${c.plate === 'ribbon' && hz === 'c' ? 'display:block' : ''}">
      ${c.title.text ? `<div style="font-family:${fontCss(c.title.font)};font-size:${ts}px;color:${c.title.color};font-weight:700;line-height:1.15;word-break:keep-all;overflow-wrap:anywhere">${h(c.title.text)}</div>` : ''}
      ${c.subtitle.on && c.subtitle.text ? `<div style="font-size:${Math.max(7, c.subtitle.size * s)}px;color:${c.subtitle.color};font-weight:800;letter-spacing:.12em;margin-top:${4 * s}px">${h(c.subtitle.text)}</div>` : ''}
    </div></div>` : ''
  const stickers = (c.stickers ?? []).map((k) => `<div class="stk ${sel === k.id ? 'sel' : ''}" data-part="${k.id}" style="left:${k.x}%;top:${k.y}%;width:${k.size * s * 2}px;transform:translate(-50%,-50%) rotate(${k.rot ?? 0}deg)"><img src="스티커/${STK_FILE[k.name] ?? k.name}.png" draggable="false">${interactive && sel === k.id ? '<span class="hd del" data-remove="' + k.id + '">✕</span><span class="hd rs" data-resize="' + k.id + '"></span>' : ''}</div>`).join('')
  return `<div class="cover" data-cover style="width:${w}px;height:${hh}px;background:${bg}"><div class="spine"></div>${band}${title}${stickers}</div>`
}

// ---------- 속지 (가로 400×300, 세로 300×400 · 날짜는 계산) ----------
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const HOLIDAYS = new Set(['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25']) // 양력만
const isHoliday = (d) => HOLIDAYS.has(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
const txt = (x, y, s, size, o = {}) => `<text x="${x}" y="${y}" font-size="${size}" fill="${o.fill ?? 'var(--ink)'}" font-weight="${o.w ?? 400}" text-anchor="${o.a ?? 'start'}" ${o.op ? `opacity="${o.op}"` : ''}>${h(s)}</text>`
const ln = (x1, y1, x2, y2, op = 0.25) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-opacity="${op}" stroke-width="0.8"/>`
const rc = (x, y, w, hh, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${o.rx ?? 3}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'var(--ink)'}" stroke-opacity="${o.op ?? 0.3}" stroke-width="0.8" ${o.dash ? 'stroke-dasharray="3 2"' : ''}/>`
const lines = (x, y, w, n, gap = 14) => Array.from({ length: Math.max(0, n) }, (_, i) => ln(x, y + i * gap, x + w, y + i * gap, 0.18)).join('')
const THEME = { baseball: ['⚾ 직관 기록', '#2F6B4F'], soccer: ['⚽ 축구 직관', '#1F5FA8'], concert: ['🎤 콘서트 기록', '#7A4FB0'], musical: ['🎭 관극 일기', '#A23B4E'], travel: ['✈️ 여행 기록', '#2C7C8C'], halloween: ['🎃 Halloween', '#D2691E'], christmas: ['🎄 Christmas', '#B3343A'] }

function pageSVG(kind, o = {}) {
  const P = o.orient === 'portrait', W = P ? 300 : 400, H = P ? 400 : 300, M = 20, IW = W - 2 * M
  const year = o.year ?? 2026, month = o.month ?? 1, ws = o.weekStart ?? 1, dated = o.dated !== false
  const ink = o.ink ?? '#292929', bg = o.bg ?? '#FFFFFF', hol = o.holidays !== false, red = '#D0443F'
  const dayColor = (d) => (hol && (d.getDay() === 0 || isHoliday(d))) ? red : d.getDay() === 6 ? '#3A62B0' : 'var(--ink)'
  let b = ''
  if (kind === 'cover-page') b += txt(M + 10, H * 0.5, dated ? String(year) : '', 44) + txt(M + 10, H * 0.5 + 26, '노트 제목', 8, { op: 0.6 }) + ln(M + 58, H * 0.5 + 24, M + 170, H * 0.5 + 24)
  else if (kind === 'divider') b += txt(M + 10, H * 0.48, dated ? `${month}월` : '__월', 50, { w: 700 }) + txt(M + 12, H * 0.48 + 22, MONTH_EN[month - 1], 10, { op: 0.55, w: 700 }) + ln(M + 10, H * 0.48 + 34, M + 140, H * 0.48 + 34)
  else if (kind === 'monthly') {
    b += txt(M, 34, dated ? `${month}월` : '__월', 20, { w: 700 }) + (dated ? txt(M + 50, 34, String(year), 9, { op: 0.5 }) : '')
    const y0 = 50, cw = IW / 7, rh = (H - y0 - M) / 6
    for (let i = 0; i < 7; i++) { const dw = (ws + i) % 7; b += txt(M + i * cw + 4, y0 - 4, DOW[dw], 7, { fill: dw === 0 && hol ? red : dw === 6 ? '#3A62B0' : 'var(--ink)', op: 0.8 }) }
    for (let r = 0; r <= 6; r++) b += ln(M, y0 + r * rh, M + IW, y0 + r * rh, 0.22)
    for (let c = 0; c <= 7; c++) b += ln(M + c * cw, y0, M + c * cw, y0 + 6 * rh, 0.12)
    if (dated) { const off = (new Date(year, month - 1, 1).getDay() - ws + 7) % 7; for (let i = 0; i < 42; i++) { const d = new Date(year, month - 1, 1 - off + i); b += txt(M + (i % 7) * cw + 4, y0 + Math.floor(i / 7) * rh + 11, String(d.getDate()), 7.5, { fill: dayColor(d), op: d.getMonth() === month - 1 ? 0.95 : 0.3 }) } }
  } else if (kind === 'weekly' || kind === 'weekly-journal') {
    const base = new Date(year, month - 1, 1 + 7 * (o.week ?? 0)), start = new Date(base); start.setDate(base.getDate() - ((base.getDay() - ws + 7) % 7))
    b += txt(W / 2, 26, dated ? `${start.getMonth() + 1}월 ${Math.ceil((start.getDate() + new Date(start.getFullYear(), start.getMonth(), 1).getDay()) / 7)}주차` : '__월 __주차', 12, { w: 700, a: 'middle' })
    const cols = kind === 'weekly' ? (P ? 2 : 4) : (P ? 1 : 2), rows = 8 / cols, cw = IW / cols, rh = (H - 38 - M) / rows
    for (let i = 0; i < cols * rows; i++) {
      const x = M + (i % cols) * cw, y = 38 + Math.floor(i / cols) * rh
      b += rc(x + 2, y + 2, cw - 4, rh - 4, { op: 0.18, rx: 2 })
      if (i < 7) { const d = new Date(start); d.setDate(start.getDate() + i); b += txt(x + 7, y + 14, dated ? `${d.getDate()} ${DOW[d.getDay()]}` : DOW[(ws + i) % 7], 7.5, { fill: dayColor(d), w: 700 }) } else b += txt(x + 7, y + 14, 'MEMO', 7, { op: 0.5, w: 700 })
      b += lines(x + 7, y + 26, cw - 14, Math.floor((rh - 32) / 13), 13)
    }
  } else if (kind === 'diary') {
    const d = new Date(year, month - 1, o.day ?? 23)
    b += txt(M, 30, dated ? `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${DOW[d.getDay()]})` : '____. __. __ (  )', 12, { w: 700 })
    b += rc(W - M - 118, 16, 56, 20, { op: 0.25 }) + txt(W - M - 112, 29, '날씨 ☀ ☁ ☂', 6.5, { op: 0.7 }) + rc(W - M - 58, 16, 58, 20, { op: 0.25 }) + txt(W - M - 52, 29, '기분 ☺ ☹', 6.5, { op: 0.7 })
    const ph = P ? 130 : 110
    b += rc(M, 46, P ? IW : 150, ph, { op: 0.25, dash: true }) + txt(M + (P ? IW : 150) / 2, 46 + ph / 2, '사진', 8, { a: 'middle', op: 0.4 })
    b += P ? lines(M, 46 + ph + 20, IW, Math.floor((H - 46 - ph - 30) / 14), 14) : lines(185, 60, IW - 165, 7, 14) + lines(M, 176, IW, 8, 14)
  } else if (kind === 'daily') {
    b += txt(M, 30, '하루 계획', 12, { w: 700 }) + txt(W - M, 30, dated ? `${month}월 23일` : '__월 __일', 8, { a: 'end', op: 0.6 })
    const tw = P ? IW : IW * 0.5, rows = Math.floor((H - 70) / 15)
    for (let i = 0; i < Math.min(rows, P ? 12 : 16); i++) b += txt(M + 2, 54 + i * 15, String(6 + i).padStart(2, '0'), 6.5, { op: 0.6 }) + ln(M + 18, 50 + i * 15, M + tw, 50 + i * 15, 0.15)
    if (!P) b += txt(M + IW * 0.55, 52, 'TO DO', 8, { w: 700, op: 0.7 }) + Array.from({ length: 9 }, (_, i) => rc(M + IW * 0.55, 60 + i * 16, 8, 8, { op: 0.4, rx: 1.5 }) + ln(M + IW * 0.55 + 14, 68 + i * 16, W - M, 68 + i * 16, 0.18)).join('')
    else b += txt(M, 54 + 12 * 15 + 10, 'TO DO', 8, { w: 700, op: 0.7 }) + Array.from({ length: 6 }, (_, i) => rc(M, 54 + 12 * 15 + 18 + i * 16, 8, 8, { op: 0.4, rx: 1.5 }) + ln(M + 14, 54 + 12 * 15 + 26 + i * 16, W - M, 54 + 12 * 15 + 26 + i * 16, 0.18)).join('')
  } else if (kind === 'scrap') {
    b += txt(M, 30, '사진·스크랩', 12, { w: 700 }) + (P ? rc(M, 44, IW, 150, { op: 0.25, dash: true }) + rc(M, 204, IW / 2 - 6, 90, { op: 0.25, dash: true }) + rc(M + IW / 2 + 6, 204, IW / 2 - 6, 90, { op: 0.25, dash: true }) + lines(M, 316, IW, 5, 14)
      : rc(M, 44, 170, 130, { op: 0.25, dash: true }) + rc(205, 44, 175, 62, { op: 0.25, dash: true }) + rc(205, 112, 175, 62, { op: 0.25, dash: true }) + lines(M, 196, IW, 6, 14))
  } else if (kind.startsWith('note')) {
    const t = kind.split('-')[1]
    if (t === 'ruled') b += lines(M, 40, IW, Math.floor((H - 50) / 14.5), 14.5)
    if (t === 'grid') { for (let x = M; x <= W - M; x += 12) b += ln(x, M, x, H - M, 0.13); for (let y = M; y <= H - M; y += 12) b += ln(M, y, W - M, y, 0.13) }
    if (t === 'dots') for (let x = M + 6; x < W - M; x += 13) for (let y = M + 6; y < H - M; y += 13) b += `<circle cx="${x}" cy="${y}" r=".9" fill="var(--ink)" fill-opacity=".35"/>`
  } else {
    const [tt, c] = THEME[kind] ?? ['기록', '#6E92C6']
    const box = (x, y, w, hh, label) => rc(x, y, w, hh, { op: 0.35, dash: true }) + (label ? txt(x + 5, y + 12, label, 7, { op: 0.6 }) : '')
    b += `<text x="${M}" y="30" font-size="13" font-weight="700" fill="${c}">${h(tt)}</text>` + `<line x1="${M}" y1="40" x2="${W - M}" y2="40" stroke="${c}" stroke-opacity=".4"/>`
    const labels = { baseball: ['날짜', '구장', '상대팀', '좌석'], soccer: ['날짜', '경기장', '상대팀', '좌석'], concert: ['날짜', '공연장', '좌석'], musical: ['공연명', '캐스트', '좌석'], travel: ['DAY', '경로', '지출'] }[kind]
    if (labels) { const bw = IW / labels.length; b += labels.map((l, i) => box(M + i * bw, 50, bw - 6, 26, l)).join('') }
    if (kind === 'baseball') for (let i = 0; i < 11; i++) b += `<rect x="${M + i * IW / 11}" y="86" width="${IW / 11 - 2}" height="16" fill="${c}" fill-opacity=".1"/>` + txt(M + i * IW / 11 + IW / 22, 97, i < 9 ? String(i + 1) : i === 9 ? 'R' : 'H', 7, { a: 'middle', fill: c })
    if (kind === 'halloween' || kind === 'christmas') b += `<text x="${M}" y="70" font-size="20" fill="${c}" font-family="'Poor Story', cursive">${kind === 'halloween' ? 'Trick or Treat' : 'Merry Christmas'}</text>` + txt(W - M, H - M, kind === 'halloween' ? '👻🦇' : '⛄🎁', 18, { a: 'end' })
    const top = kind === 'baseball' ? 112 : 86
    b += box(M, top, P ? IW : IW * 0.42, P ? 110 : H - top - 30, kind === 'travel' ? '사진' : '티켓 · 사진') + (P ? lines(M, top + 126, IW, Math.floor((H - top - 140) / 14), 14) : lines(M + IW * 0.46, top + 12, IW * 0.54, Math.floor((H - top - 40) / 14), 14))
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="--ink:${ink};font-family:${fontCss(o.font ?? 'myeongjo')}"><rect width="${W}" height="${H}" fill="${bg}"/>${b}</svg>`
}
const pageBox = (kind, o = {}) => `<div class="page ${o.orient === 'portrait' ? 'portrait' : ''}">${pageSVG(kind, o)}</div>`
const KIND_NAMES = { 'cover-page': '첫 장', divider: '월 구분', monthly: '월간 달력', weekly: '주간 · 블록', 'weekly-journal': '주간 · 저널', diary: '일기', daily: '하루 계획', scrap: '사진·스크랩', 'note-plain': '무지', 'note-ruled': '줄', 'note-grid': '모눈', 'note-dots': '도트', baseball: '직관 기록', soccer: '축구 직관', concert: '콘서트', musical: '관극 일기', travel: '여행 기록', halloween: '할로윈', christmas: '크리스마스' }
