// 시안 공용: 아이콘 · 표지 · 캐릭터 · 스티커 (모두 HTML/SVG 문자열을 돌려준다)
// 아이콘은 가이드 6장 규칙: 24 viewBox · 선만 · 둥근 끝 · 두께 1.8
const ICON = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  book: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7h6M9 11h6',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.6-2 4-4 4h-2c-1.3 0-1.9 1.4-1.2 2.4l.3.5c.6.9 0 2.1-1.1 2.1zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17.5 11h.01',
  person: 'M12 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20c1-3.8 3.8-5.5 7-5.5s6 1.7 7 5.5',
  trash: 'M4 7h16M9.5 7V4.6h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  star: 'M12 3.6l2.6 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.2 2.7 1-5.7-4.1-4 5.7-.8z',
  swap: 'M5 8h14l-3.5-3.5M19 16H5l3.5 3.5',
  grid: 'M5.5 4h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4A1.5 1.5 0 0 1 5.5 4zM14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4A1.5 1.5 0 0 1 14.5 4zM5.5 13h4A1.5 1.5 0 0 1 11 14.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4A1.5 1.5 0 0 1 5.5 13zM14.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z',
  search: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM20 20l-4.6-4.6',
  edit: 'M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7zM13.6 6.6l3.8 3.8',
  chevL: 'M14.5 5.5L8 12l6.5 6.5', chevR: 'M9.5 5.5L16 12l-6.5 6.5',
  plus: 'M12 5v14M5 12h14',
  text: 'M6 6.5V5h12v1.5M12 5v14M9.5 19h5',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  undo: 'M9 8L5 12l4 4M5 12h9a5 5 0 0 1 0 10',
  restore: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  more: '',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  image: 'M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  sticker: 'M20 12a8 8 0 1 1-8-8M20 12h-4a4 4 0 0 0-4-4V4M9 13.5c.8 1 2 1.5 3 1.5M9 10h.01M13 10h.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c.7-3 3-4.5 6-4.5s5.3 1.5 6 4.5M16.5 11.2a2.4 2.4 0 1 0 0-4.8M17.5 14.6c2 .3 3.2 1.6 3.6 3.9',
  chevRs: 'M9 6l6 6-6 6',
}
const icon = (name, size = 22, color = 'currentColor', { fill = 'none', sw = 1.8 } = {}) =>
  name === 'more'
    ? `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><circle cx="12" cy="5.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18.5" r="1.7"/></svg>`
    : `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[name]}"/></svg>`

// 로고: 둥근 D + 오른쪽 위 테마 원 (assets/brand/dio-logo.svg 를 단순화한 근사. 색은 가이드 값 그대로)
const logo = (h = 48) => `<img class="logo" src="에셋/dio-logo.svg" style="height:${h}px;width:auto" draggable="false">`

// ---------- 표지 (앱 Cover.js 비율 185 × 246) ----------
const patternCss = (type, tone = 'light') => {
  const c = tone === 'dark' ? 'rgba(11,23,102,.12)' : 'rgba(255,255,255,.38)'
  return {
    none: 'none',
    linen: `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 5px)`,
    dot: `radial-gradient(${c} 2.4px, transparent 2.8px) 0 0/14px 14px`,
    gingham: `repeating-linear-gradient(0deg, ${c} 0 8px, transparent 8px 16px), repeating-linear-gradient(90deg, ${c} 0 8px, transparent 8px 16px)`,
    stripe: `repeating-linear-gradient(90deg, ${c} 0 6px, transparent 6px 14px)`,
    grid: `repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 12px)`,
  }[type]
}
const DIARIES = [
  { id: 'read', title: '독서 노트', color: '#474F55', pattern: 'dot', pages: 30 },
  { id: 'memo', title: '메모장', color: '#C3AEDD', pattern: 'gingham', pages: 48, fav: true },
  { id: 'weekly', title: '위클리 플래너', color: '#F0B0AA', pattern: 'grid', pages: 66 },
  { id: 'trip', title: '제주 여행 일기', color: '#A9BFA6', pattern: 'stripe', pages: 24, shared: true },
  { id: 'd2026', title: '새 다이어리', color: '#9DABD8', pattern: 'linen', pages: 78 },
  { id: 'summer', title: '여름 방학', color: '#F0B0AA', pattern: 'gingham', pages: 12 },
  { id: 'class', title: '우리 반 교환일기', color: '#D9A87F', pattern: 'grid', pages: 18, shared: true },
  { id: 'fan', title: '덕질 기록', color: '#EBC56F', pattern: 'dot', pages: 112, fav: true },
]
const byId = (id) => DIARIES.find((d) => d.id === id)

function cover(d, w, { lift = 0, gray = false, rot = 0, actions = false, check = false, cls = '', style = '' } = {}) {
  const h = Math.round(w * 246 / 185), sx = w / 185
  const t = Math.max(2, Math.min(9, 1.5 + (d.pages ?? 20) / 16)) * Math.max(.7, sx)
  return `<div class="diary lift${lift} ${gray ? 'gray' : ''} ${cls}" style="width:${w}px;height:${h}px;--t:${t}px;transform:rotate(${rot}deg);${style}">
    <div class="pages"></div><div class="sh"></div>
    <div class="cv" style="background:${patternCss(d.pattern)}, ${d.color}">
      <div class="spine"></div><div class="band"></div>
      <div class="lab" style="padding:${10 * sx}px ${12 * sx}px"><b style="font-size:${Math.max(10, 15 * sx)}px">${d.title}</b><i style="font-size:${Math.max(7, 8.5 * sx)}px;letter-spacing:${1.4 * sx}px;margin-top:${6 * sx}px">DIARY · 2026</i></div>
    </div>
    ${check ? `<div class="chk">${icon('check', 16, '#fff', { sw: 2.6 })}</div>` : ''}
    ${actions ? `<div class="btns"><div>${icon('edit', 17, '#0B1766')}</div><div>${icon('trash', 17, '#E04D6F')}</div></div><div class="favstar">${icon('star', 20, '#fff', { sw: 1.8 })}</div>` : ''}
  </div>`
}

// ---------- 캐릭터 · 스티커 (최종 시안 벡터 · 편집기 스티커 그대로) ----------
const CHAR = (name = '디오', w = 80, style = '') => `<img class="char" src="소재/${name} 최종.svg" style="width:${w}px;${style}" draggable="false">`
const STK = (name, w = 40, rot = 0, style = '') => `<img class="stk" src="소재/${name}.png" style="width:${w}px;transform:rotate(${rot}deg);${style}" draggable="false">`
const PROP = (name, w, rot = 0, style = '') => `<img class="prop" src="에셋/${name}.png" style="width:${w}px;transform:rotate(${rot}deg);${style}" draggable="false">`
