// 시안 공용: 아이콘 · 표지 · 책상 소품 (모두 HTML/SVG 문자열을 돌려준다)
const OL = '#2E3240'
let UID = 0
const uid = (p) => `${p}${++UID}`
const S = (vb, body, extra = '') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" ${extra}>${body}</svg>`

// ---------- 아이콘 (가이드 6장: 24 viewBox · 선만 · 둥근 끝 · 두께 1.8) ----------
const ICON = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  book: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18',
  star: 'M12 3.6l2.6 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.2 2.7 1-5.7-4.1-4 5.7-.8z',
  person: 'M12 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20c1-3.8 3.8-5.5 7-5.5s6 1.7 7 5.5',
  trash: 'M4 7h16M9.5 7V4.6h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  swap: 'M5 8h14l-3.5-3.5M19 16H5l3.5 3.5',
  grid: 'M5.5 4h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4A1.5 1.5 0 0 1 5.5 4zM14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4A1.5 1.5 0 0 1 14.5 4zM5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4A1.5 1.5 0 0 1 5.5 13zM14.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z',
  search: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM20 20l-4.6-4.6',
  edit: 'M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7zM13.6 6.6l3.8 3.8',
  chevL: 'M14.5 5.5L8 12l6.5 6.5', chevR: 'M9.5 5.5L16 12l-6.5 6.5',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c.7-3 3-4.5 6-4.5s5.3 1.5 6 4.5M16.5 11.2a2.4 2.4 0 1 0 0-4.8M17.5 14.6c2 .3 3.2 1.6 3.6 3.9',
  plus: 'M12 5v14M5 12h14',
  layers: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  panel: 'M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM9.5 5v14',
  export: 'M12 15V4.5M8 8.5l4-4 4 4M5 14v5h14v-5',
  hand: 'M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L5 15.5a1.6 1.6 0 0 1 2.6-1.8L8 14.5',
  cursor: 'M6 4l12 6.5-5.4 1.6L10.5 18z',
  lasso: 'M12 5c4.4 0 8 2.2 8 5s-3.6 5-8 5-8-2.2-8-5 3.6-5 8-5zM7 14.2c-1.4 1-1.5 2.8.4 3.8M7.3 18l-.8 2.5',
  pen: 'M4.5 19.5l1-4L16 5l3 3L8.5 18.5zM14 7l3 3',
  marker: 'M5 20h6M7.5 17.5l-1-1 9-9 3 3-9 9zM14 9l3 3M6.5 16.5l-1.5 3.5h3l1-1',
  eraser: 'M9 20h11M5.5 15.5l9-9a2 2 0 0 1 2.8 0l1.7 1.7a2 2 0 0 1 0 2.8L11 19H8.5z',
  text: 'M6 6.5V5h12v1.5M12 5v14M9.5 19h5',
  sticker: 'M20 12a8 8 0 1 1-8-8M20 12h-4a4 4 0 0 0-4-4V4M9 13.5c.8 1 2 1.5 3 1.5M9 10h.01M13 10h.01',
  tape: 'M11 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM11 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16 12v5h4',
  image: 'M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  undo: 'M9 8L5 12l4 4M5 12h9a5 5 0 0 1 0 10', redo: 'M15 8l4 4-4 4M19 12h-9a5 5 0 0 0 0 10',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.2l2.4 2.4 4.6-4.8',
}
const icon = (name, size = 20, color = 'currentColor', { fill = 'none', sw = 1.8 } = {}) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[name]}"/></svg>`
const moreIcon = (size = 21, color = '#0B1957') => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><circle cx="12" cy="5.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18.5" r="1.7"/></svg>`

// ---------- 다이어리 데이터 · 표지 ----------
const patternCss = (type, tone = 'light') => {
  const c = tone === 'dark' ? 'rgba(11,25,87,.12)' : 'rgba(255,255,255,.38)'
  return {
    none: 'none',
    linen: `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 5px)`,
    leather: `radial-gradient(${c} 1.2px, transparent 1.6px) 0 0/7px 7px`,
    dot: `radial-gradient(${c} 2.4px, transparent 2.8px) 0 0/14px 14px`,
    gingham: `repeating-linear-gradient(0deg, ${c} 0 8px, transparent 8px 16px), repeating-linear-gradient(90deg, ${c} 0 8px, transparent 8px 16px)`,
    stripe: `repeating-linear-gradient(90deg, ${c} 0 6px, transparent 6px 14px)`,
    grid: `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 12px)`,
  }[type]
}
const DIARIES = [
  { id: 'weekly', title: '위클리 플래너', color: '#F0B0AA', pattern: 'gingham', pages: 66 },
  { id: 'memo', title: '메모장', color: '#C3AEDD', pattern: 'gingham', pages: 48, fav: true },
  { id: 'd2026', title: '2026 다이어리', color: '#9DABD8', pattern: 'linen', pages: 78 },
  { id: 'trip', title: '제주 여행 일기', color: '#A9BFA6', pattern: 'stripe', pages: 24, shared: true },
  { id: 'fan', title: '덕질 기록', color: '#EBC56F', pattern: 'dot', pages: 112, fav: true },
  { id: 'read', title: '독서 노트', color: '#474F55', pattern: 'leather', pages: 30 },
  { id: 'class', title: '우리 반 교환일기', color: '#D9A87F', pattern: 'grid', pages: 18, shared: true },
]
const byId = (id) => DIARIES.find((d) => d.id === id)

// 표지 (앱 Cover.js와 같은 비율: 185 × 246, 등 4.9% · 고무줄 오른쪽 16.2% · 이름표 위 20.3%)
function cover(d, w, { lift = 0, gray = false, ghost = false, rot = 0, actions = false, sheen = false, ribbon = false, check = false, cls = '', thick = true } = {}) {
  const h = Math.round(w * 246 / 185), sx = w / 185
  const t = thick ? Math.max(2, Math.min(9, 1.5 + (d.pages ?? 20) / 16)) * Math.max(.7, sx) : 0
  if (d.id === 'new') {
    return `<div class="diary newbook lift${lift} ${cls}" style="width:${w}px;height:${h}px;--t:${3 * sx}px;transform:rotate(${rot}deg)">
      <div class="pages"></div><div class="sh"></div><div class="cv"><div class="spine" style="background:rgba(0,0,0,.05)"></div></div>
      <div class="wrapfilm"></div><div class="seal">${icon('plus', 15, '#4F74AE', { sw: 2.2 })}새 다이어리</div></div>`
  }
  return `<div class="diary lift${lift} ${gray ? 'gray' : ''} ${ghost ? 'ghost' : ''} ${cls}" style="width:${w}px;height:${h}px;--t:${t}px;transform:rotate(${rot}deg)">
    <div class="pages"></div><div class="sh"></div>
    <div class="cv" style="background:${patternCss(d.pattern, d.color === '#EAE3D4' ? 'dark' : 'light')}, ${d.color}">
      <div class="spine"></div><div class="band"></div>
      <div class="lab" style="padding:${10 * sx}px ${12 * sx}px"><b style="font-size:${Math.max(10, 15 * sx)}px">${d.title}</b><i style="font-size:${Math.max(7, 8.5 * sx)}px;letter-spacing:${1.4 * sx}px;margin-top:${6 * sx}px">DIARY · 2026</i></div>
      ${sheen ? '<div class="sheen"></div>' : ''}
    </div>
    ${ribbon ? `<div class="ribbon" style="right:${26 * sx}px"></div>` : ''}
    ${check ? '<div class="chk">✓</div>' : ''}
    ${actions ? `<div class="btns"><div>${icon('edit', 17)}</div><div>${icon('star', 18, d.fav ? '#E8AF45' : 'rgba(11,25,87,.68)', { fill: d.fav ? '#E8AF45' : 'none' })}</div></div>` : ''}
  </div>`
}

// ---------- 배치 도우미 ----------
// x, y = 왼쪽 위. w = 폭. 소품 문자열을 감싼다.
const P = (inner, x, y, w, rot = 0, { z = 0, sd = true, cls = '', style = '' } = {}) =>
  `<div class="prop ${sd ? 'sd' : ''} ${cls}" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg);z-index:${z};${style}">${inner}</div>`
const IMG = (name) => `<img src="소재/${name}.png" draggable="false">`

// ---------- 소품 ----------
function pen(color = '#3E4350') {
  return S('0 0 320 30', `
    <path d="M4 15 L30 8.5 H42 V21.5 H30 Z" fill="#C9CCD3" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M4 15 L12 13 V17 Z" fill="${OL}"/>
    <rect x="40" y="6.5" width="228" height="17" rx="8.5" fill="${color}" stroke="${OL}" stroke-width="1.6"/>
    <rect x="40" y="6.5" width="40" height="17" rx="6" fill="rgba(0,0,0,.18)"/>
    <path d="M86 10.5 H258" stroke="rgba(255,255,255,.45)" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="248" y="4.5" width="66" height="21" rx="10.5" fill="${color}" stroke="${OL}" stroke-width="1.6"/>
    <rect x="236" y="1" width="72" height="7" rx="3.5" fill="#E2E4E9" stroke="${OL}" stroke-width="1.4"/>`)
}
function pencil(body = '#F2C94C') {
  return S('0 0 300 26', `
    <path d="M4 13 L40 3.5 V22.5 Z" fill="#EBC9A0" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M4 13 L16 10 V16 Z" fill="#3A3A3A"/>
    <rect x="40" y="3.5" width="210" height="19" fill="${body}" stroke="${OL}" stroke-width="1.5"/>
    <path d="M40 9.8 H250 M40 16.2 H250" stroke="rgba(0,0,0,.14)" stroke-width="1.2"/>
    <rect x="250" y="2.5" width="22" height="21" fill="#C7CBD2" stroke="${OL}" stroke-width="1.5"/>
    <path d="M256 2.5 V23.5 M262 2.5 V23.5" stroke="rgba(0,0,0,.2)"/>
    <rect x="272" y="3.5" width="24" height="19" rx="6" fill="#F3A7B5" stroke="${OL}" stroke-width="1.5"/>`)
}
function eraser() {
  return S('0 0 130 60', `<rect x="2" y="4" width="126" height="52" rx="7" fill="#FAFAF7" stroke="${OL}" stroke-width="1.6"/>
    <rect x="44" y="4" width="70" height="52" fill="#6E92C6" stroke="${OL}" stroke-width="1.6"/>
    <text x="79" y="36" text-anchor="middle" font-family="Pretendard,sans-serif" font-weight="800" font-size="16" fill="#fff" letter-spacing="2">DIO</text>`)
}
function clip(color = '#9AA0AA') {
  return S('0 0 30 86', `<path d="M10 74 V20 a8 8 0 0 1 16 0 V64 a12 12 0 0 1 -24 0 V13 a10.5 10.5 0 0 1 21 0" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round"/>`)
}
// 편집기 테이프 팔레트 (디자인 가이드 2.4)
const TAPE = { pink: ['#FAD3DC', '#F59AB2'], butter: ['#FFF1C2', '#EFC04F'], mint: ['#E3F4EC', '#8FD3B6'], sky: ['#DCEBFA', '#6E92C6'], lavender: ['#ECE5FB', '#B39DED'], charcoal: ['#3E4350', '#F3F1EA'], ivory: ['#F3F1EA', '#3E4350'] }
function tapeRoll(kind = 'sky', motif = 'stripe') {
  const [a, b] = TAPE[kind], id = uid('tp')
  const pat = motif === 'dot' ? `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${a}"/><circle cx="6" cy="6" r="2.4" fill="${b}"/></pattern>`
    : `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="14" height="14" fill="${a}"/><rect width="5" height="14" fill="${b}"/></pattern>`
  return S('0 0 150 124', `<defs>${pat}</defs>
    <path d="M100 98 L146 112 L140 122 L92 108 Z" fill="url(#${id})" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round" opacity=".92"/>
    <circle cx="62" cy="62" r="58" fill="url(#${id})" stroke="${OL}" stroke-width="1.6"/>
    <circle cx="62" cy="62" r="50" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/>
    <circle cx="62" cy="62" r="34" fill="#E9DCC3" stroke="${OL}" stroke-width="1.6"/>
    <circle cx="62" cy="62" r="27" fill="rgba(60,50,40,.10)" stroke="${OL}" stroke-width="1.2"/>`)
}
function tapeStrip(kind = 'butter', w = 160, motif = 'stripe') {
  const [a, b] = TAPE[kind], id = uid('ts')
  const pat = motif === 'dot' ? `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${a}"/><circle cx="6" cy="6" r="2.2" fill="${b}"/></pattern>`
    : motif === 'plain' ? `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${a}"/></pattern>`
    : `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="14" height="14" fill="${a}"/><rect width="5" height="14" fill="${b}"/></pattern>`
  let zz = ''
  for (let y = 0; y <= 36; y += 6) zz += `${y % 12 === 0 ? 4 : 0},${y} `
  let zr = ''
  for (let y = 36; y >= 0; y -= 6) zr += `${w - (y % 12 === 0 ? 4 : 0)},${y} `
  return S(`0 0 ${w} 36`, `<defs>${pat}</defs><polygon points="${zz}${zr}" fill="url(#${id})" opacity=".88"/>`)
}
function postit(color = '#FFF1A8', lines = ['오늘도', '한 장!'], size = 22) {
  const tx = lines.map((l, i) => `<tspan x="16" dy="${i ? size * 1.1 : 0}">${l}</tspan>`).join('')
  return S('0 0 120 120', `<path d="M2 2 H118 V96 L96 118 H2 Z" fill="${color}" stroke="${OL}" stroke-width="1.2" stroke-opacity=".35"/>
    <path d="M118 96 L96 118 L100 100 Z" fill="rgba(0,0,0,.10)"/>
    <rect x="2" y="2" width="116" height="22" fill="rgba(0,0,0,.035)"/>
    <text x="16" y="${44 + (lines.length < 3 ? 6 : 0)}" font-family="'Nanum Pen Script',cursive" font-size="${size + 6}" fill="#3B3F4A">${tx}</text>`)
}
const PHOTOS = {
  sea: 'linear-gradient(180deg, #CFEAF6 0%, #8CCBE6 55%, #3E8DB8 56%, #E9DCC0 80%, #DCCCA8 100%)',
  dusk: 'linear-gradient(180deg, #F6C9B8 0%, #F3D9C2 38%, #BFD3EA 70%, #8FB0DA 100%)',
  forest: 'linear-gradient(160deg, #DCEBD0 0%, #9CC29A 45%, #4E7D5B 100%)',
  blossom: 'radial-gradient(circle at 25% 30%, #fff 0 7%, transparent 8%), radial-gradient(circle at 72% 58%, #fff 0 6%, transparent 7%), radial-gradient(circle at 50% 80%, #fff 0 5%, transparent 6%), linear-gradient(180deg, #FDE3EA, #F7B9CB)',
  night: 'radial-gradient(circle at 72% 26%, #FFF6C8 0 5%, transparent 6%), linear-gradient(180deg, #1F2A5A 0%, #3B4C8C 60%, #8A7DB8 100%)',
}
function polaroid(photo = 'sea', cap = '7월의 바다') {
  return `<div style="background:#FDFDFB;padding:7% 7% 0;border:1px solid rgba(0,0,0,.12);border-radius:2px">
    <div style="aspect-ratio:1;background:${PHOTOS[photo]};border:1px solid rgba(0,0,0,.08)"></div>
    <div class="hand" style="font-size:20px;line-height:34px;color:#3B3F4A;text-align:center">${cap}</div></div>`
}
function postcard(to = 'To. 우리 반') {
  return `<div style="aspect-ratio:1.5;background:#FBF8F1;border:1px solid rgba(0,0,0,.18);border-radius:3px;position:relative;padding:10% 8%">
    <div style="position:absolute;right:7%;top:9%;width:20%;aspect-ratio:.85;border:1.5px dashed rgba(46,50,64,.55);display:grid;place-items:center">${IMG('하트').replace('<img', '<img style="width:62%"')}</div>
    <div class="hand" style="font-size:20px;color:#3B3F4A;line-height:1">${to}</div>
    ${[0, 1, 2, 3].map((i) => `<div style="position:absolute;left:8%;right:${i < 2 ? 36 : 10}%;top:${44 + i * 13}%;border-top:1.5px solid rgba(46,50,64,.25)"></div>`).join('')}
    <div style="position:absolute;left:52%;top:26%;bottom:10%;border-left:1.5px solid rgba(46,50,64,.18)"></div></div>`
}
function idcard() {
  return `<div style="position:relative">
    <svg viewBox="0 0 60 70" style="position:absolute;left:36%;top:-19%;width:28%;overflow:visible"><circle cx="30" cy="20" r="16" fill="none" stroke="#A9AEB8" stroke-width="5"/><rect x="22" y="38" width="16" height="30" rx="5" fill="#C9CDD4" stroke="${OL}" stroke-width="1.4"/></svg>
    <div style="aspect-ratio:.66;background:#FCFCFA;border:1px solid rgba(0,0,0,.2);border-radius:10px;overflow:hidden;position:relative">
      <div style="height:15%;background:#6E92C6;color:#fff;font:800 11px/1 Pretendard;letter-spacing:1.5px;display:flex;align-items:center;justify-content:center">DIO DIARY CLUB</div>
      <div style="position:absolute;left:50%;top:13%;transform:translateX(-50%);width:16%;height:6%;border-radius:0 0 8px 8px;background:#E6E9EF;border:1px solid rgba(0,0,0,.18)"></div>
      <div style="margin:12% auto 0;width:56%;aspect-ratio:.82;background:#EEF2F9;border:1px solid rgba(0,0,0,.12);display:grid;place-items:end center;overflow:hidden">${IMG('모아 행복').replace('<img', '<img style="width:86%;margin-bottom:-6%"')}</div>
      <div style="text-align:center;font:800 15px Pretendard;color:#2E3240;margin-top:7%">디 오</div>
      <div style="text-align:center;font:600 9px Pretendard;color:#8A8F9A;letter-spacing:1px;margin-top:3%">MEMBER · SINCE 2026</div>
      ${[0, 1].map((i) => `<div style="margin:${i ? 4 : 8}% 14% 0;border-top:1.5px solid rgba(46,50,64,.18)"></div>`).join('')}
    </div></div>`
}
function stand(who = '모아 기본', plate = true) {
  return `<div style="position:relative;padding:8% 8% 0">
    <div style="position:relative;border-radius:22px;${plate ? 'background:linear-gradient(135deg, rgba(255,255,255,.62), rgba(255,255,255,.14) 42%, rgba(255,255,255,.4));border:1.5px solid rgba(150,165,190,.75);box-shadow:inset 0 0 0 4px rgba(255,255,255,.35);' : ''}padding:10% 8% 6%">
      ${IMG(who).replace('<img', '<img style="width:100%;display:block;filter:drop-shadow(0 0 0 #fff) drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff)"')}
      <div style="position:absolute;left:14%;top:6%;width:9%;height:40%;border-radius:999px;background:rgba(255,255,255,.5)"></div></div>
    <div style="margin:-3% -4% 0;height:22px;border-radius:50%;background:linear-gradient(180deg, rgba(255,255,255,.75), rgba(200,210,225,.55));border:1.5px solid rgba(150,165,190,.75)"></div></div>`
}
function keyring(who = '모아 행복') {
  return `<div style="position:relative">
    <svg viewBox="0 0 80 110" style="width:46%;margin-left:27%;display:block;overflow:visible">
      <circle cx="40" cy="28" r="24" fill="none" stroke="#B8BDC6" stroke-width="7"/><circle cx="40" cy="28" r="24" fill="none" stroke="#6F7480" stroke-width="1.2"/>
      ${[0, 1, 2].map((i) => `<ellipse cx="40" cy="${60 + i * 15}" rx="5" ry="8" fill="none" stroke="#9AA0AA" stroke-width="3"/>`).join('')}</svg>
    <div style="margin-top:-6%;border-radius:20px;background:linear-gradient(135deg, rgba(255,255,255,.7), rgba(255,255,255,.2));border:1.5px solid rgba(150,165,190,.8);padding:10%">${IMG(who).replace('<img', '<img style="width:100%;display:block"')}</div></div>`
}
function mug() {
  return S('0 0 150 124', `<path d="M112 46 C140 44 140 84 112 82" fill="none" stroke="${OL}" stroke-width="9" stroke-linecap="round"/><path d="M112 46 C140 44 140 84 112 82" fill="none" stroke="#F4F1EA" stroke-width="6" stroke-linecap="round"/>
    <circle cx="62" cy="62" r="56" fill="#F4F1EA" stroke="${OL}" stroke-width="1.6"/><circle cx="62" cy="62" r="46" fill="#7A5236" stroke="${OL}" stroke-width="1.2"/>
    <circle cx="62" cy="62" r="40" fill="none" stroke="#B88C66" stroke-width="5" opacity=".7"/>
    <path d="M62 78 C40 62 48 46 62 56 C76 46 84 62 62 78 Z" fill="#E9D5BC"/>`)
}
function calendarPad(day = '28', month = 'OCT', week = '수요일') {
  return `<div style="aspect-ratio:.9;background:#FCFCFA;border:1px solid rgba(0,0,0,.2);border-radius:6px;overflow:hidden;position:relative;text-align:center">
    <div style="height:16%;background:#3E4350;display:flex;gap:14%;justify-content:center;align-items:center">${'<i style="width:7px;height:7px;border-radius:50%;background:#C9CDD4;display:block"></i>'.repeat(4)}</div>
    <div style="font:800 13px Pretendard;letter-spacing:2px;color:#C8423F;margin-top:6%">${month}</div>
    <div style="font:800 54px/1 Pretendard;color:#2E3240;letter-spacing:-2px">${day}</div>
    <div class="hand" style="font-size:20px;color:#5B606C">${week}</div>
    <div style="position:absolute;left:0;right:0;bottom:-3px;height:8px;background:repeating-linear-gradient(90deg,#E6E6E3 0 5px,transparent 5px 9px)"></div></div>`
}
function stamp(text = 'DIO') {
  return S('0 0 120 120', `<g fill="none" stroke="#C8423F" opacity=".72"><circle cx="60" cy="60" r="54" stroke-width="4"/><circle cx="60" cy="60" r="44" stroke-width="1.6"/></g>
    <text x="60" y="66" text-anchor="middle" font-family="Pretendard" font-weight="800" font-size="24" fill="#C8423F" opacity=".72" letter-spacing="2">${text}</text>
    <text x="60" y="88" text-anchor="middle" font-family="Pretendard" font-weight="700" font-size="10" fill="#C8423F" opacity=".72">2026.10.28</text>
    <text x="60" y="40" text-anchor="middle" font-family="Pretendard" font-weight="700" font-size="10" fill="#C8423F" opacity=".72">오늘의 한 장</text>`)
}
function scissors(color = '#F59AB2') {
  return S('0 0 200 110', `<path d="M92 50 L196 18 L198 26 L100 60 Z" fill="#D5D8DE" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M92 60 L196 92 L192 98 L96 70 Z" fill="#C3C7CE" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/>
    <ellipse cx="46" cy="30" rx="38" ry="24" fill="none" stroke="${OL}" stroke-width="15"/><ellipse cx="46" cy="30" rx="38" ry="24" fill="none" stroke="${color}" stroke-width="12"/>
    <ellipse cx="46" cy="82" rx="38" ry="24" fill="none" stroke="${OL}" stroke-width="15"/><ellipse cx="46" cy="82" rx="38" ry="24" fill="none" stroke="${color}" stroke-width="12"/>
    <path d="M80 40 L100 52 M80 72 L100 60" stroke="${OL}" stroke-width="10" stroke-linecap="round"/><path d="M80 40 L100 52 M80 72 L100 60" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="99" cy="56" r="5" fill="#9AA0AA" stroke="${OL}" stroke-width="1.4"/>`)
}
function stickerSheet(list = ['하트', '별', '벚꽃', '반짝이', '카메라', '리본']) {
  return `<div style="aspect-ratio:.72;background:#FFFFFF;border:1px solid rgba(0,0,0,.14);border-radius:10px;padding:10% 9%;display:grid;grid-template-columns:repeat(2,1fr);gap:10% 12%;align-content:start;background-image:linear-gradient(rgba(110,146,198,.08) 1px,transparent 1px);background-size:100% 18px">
    ${list.map((s, i) => `<img class="stick" src="소재/${s}.png" style="width:100%;transform:rotate(${[-8, 6, -3, 10, -6, 4][i % 6]}deg)">`).join('')}
    <div class="hand" style="grid-column:1/3;font-size:17px;color:#8A8F9A;text-align:center;margin-top:-4%">DIO STICKER</div></div>`
}
function leafShadow() {
  const leaf = (x, y, r, s) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C40 -30 110 -30 150 0 C110 30 40 30 0 0 Z"/><path d="M0 0 L-60 6" stroke="#000" stroke-width="5"/></g>`
  return S('0 0 420 360', `<g fill="#000">${leaf(160, 120, -30, 1)}${leaf(200, 200, 10, .9)}${leaf(120, 240, 50, .8)}${leaf(260, 120, -70, .7)}${leaf(250, 260, 30, .7)}</g>`)
}
function plantTop() {
  const leaves = [0, 52, 104, 156, 208, 260, 312].map((a, i) => `<g transform="rotate(${a} 80 80)"><path d="M80 80 C70 50 74 22 80 10 C86 22 90 50 80 80 Z" fill="${i % 2 ? '#7FA884' : '#6A9672'}" stroke="${OL}" stroke-width="1.3"/></g>`).join('')
  return S('0 0 160 160', `<circle cx="80" cy="80" r="52" fill="#D9A87F" stroke="${OL}" stroke-width="1.6"/><circle cx="80" cy="80" r="44" fill="#7A5A45"/>${leaves}`)
}
function cactusSide() {
  return S('0 0 100 150', `<path d="M50 20 C68 20 72 40 72 70 L72 92 L28 92 L28 70 C28 40 32 20 50 20 Z" fill="#8FB59A" stroke="${OL}" stroke-width="1.8"/>
    <path d="M72 62 C86 60 88 48 86 38" fill="none" stroke="${OL}" stroke-width="12" stroke-linecap="round"/><path d="M72 62 C86 60 88 48 86 38" fill="none" stroke="#8FB59A" stroke-width="9" stroke-linecap="round"/>
    <circle cx="50" cy="20" r="6" fill="#F59AB2" stroke="${OL}" stroke-width="1.4"/>
    <path d="M20 90 H80 L74 146 H26 Z" fill="#E8B892" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/><rect x="16" y="86" width="68" height="14" rx="3" fill="#D9A07A" stroke="${OL}" stroke-width="1.8"/>`)
}
function lampTop() {
  return S('0 0 300 300', `<circle cx="70" cy="70" r="46" fill="#3E4350" stroke="#1C1F27" stroke-width="2"/><circle cx="70" cy="70" r="12" fill="#5A6070"/>
    <path d="M70 70 L170 110 L230 190" fill="none" stroke="#5A6070" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="236" cy="200" rx="56" ry="40" transform="rotate(35 236 200)" fill="#4A5060" stroke="#1C1F27" stroke-width="2"/>
    <ellipse cx="240" cy="206" rx="34" ry="22" transform="rotate(35 240 206)" fill="#FFF3D6"/>`)
}
function ruler(w = 340) {
  let t = ''
  for (let i = 0; i <= (w - 20) / 8; i++) t += `<path d="M${10 + i * 8} 0 V${i % 5 === 0 ? 14 : 8}" stroke="#2E3240" stroke-width="1" opacity=".6"/>`
  return S(`0 0 ${w} 44`, `<rect x="0.5" y="0.5" width="${w - 1}" height="43" rx="4" fill="rgba(235,242,250,.78)" stroke="rgba(46,50,64,.5)"/>${t}`)
}
function knife() {
  return S('0 0 260 26', `<path d="M4 13 L26 6 L40 6 L40 20 L26 20 Z" fill="#D5D8DE" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/><rect x="40" y="5" width="210" height="16" rx="5" fill="#FFF1C2" stroke="${OL}" stroke-width="1.5"/><rect x="40" y="5" width="22" height="16" fill="#3E4350"/>`)
}
const petal = (c = '#F7B9CB') => S('0 0 30 30', `<path d="M15 2 C24 8 26 20 15 28 C4 20 6 8 15 2 Z" fill="${c}" stroke="rgba(0,0,0,.12)"/><path d="M15 2 L13 7 L17 7 Z" fill="#fff" opacity=".9"/>`)
function tangerine() {
  return S('0 0 100 100', `<circle cx="50" cy="54" r="40" fill="#F5A04A" stroke="${OL}" stroke-width="1.6"/><circle cx="38" cy="40" r="10" fill="rgba(255,255,255,.25)"/><path d="M50 16 C58 4 74 6 78 12 C68 18 58 18 50 16 Z" fill="#6A9672" stroke="${OL}" stroke-width="1.4"/>`)
}
function lemonade() {
  return S('0 0 120 120', `<circle cx="60" cy="60" r="50" fill="rgba(255,248,200,.85)" stroke="${OL}" stroke-width="1.6"/><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="3"/>
    <circle cx="74" cy="48" r="20" fill="#FFF09A" stroke="#E5C440" stroke-width="3"/>${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M74 48 L${74 + 16 * Math.cos(a * Math.PI / 180)} ${48 + 16 * Math.sin(a * Math.PI / 180)}" stroke="#E5C440" stroke-width="1.5"/>`).join('')}
    <rect x="30" y="20" width="8" height="70" rx="4" transform="rotate(-30 34 55)" fill="#F59AB2" stroke="${OL}" stroke-width="1.2"/>`)
}
const charSticker = (who = '모아 행복') => `<img class="stick" src="소재/${who}.png" style="width:100%">`
