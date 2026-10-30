// 2안 햇살 책상 디벨롭 — 장면.html#<장면 이름>. 스크립트/렌더.py 가 아래 const NEW 의 이름을 읽어 찍는다.
// 앞선 목업(소품.js · 장면.js)의 UI 층 · 표지 · 소품을 그대로 쓰고, 여기서는 빛 · 바닥 · 캐릭터만 새로 그린다.

// ---------- 캐릭터 최종 시안 (디오 · 두리 · 둘이) ----------
const CH = (who, cls = '') => `<img class="chr ${cls}" src="소재/${who} 최종.svg" draggable="false">`
const stk = (who) => CH(who, 'stk') // 다이컷 스티커: 흰 테두리, 먹선 그대로
function acry(who = '둘이') { // 아크릴 스탠드
  return `<div style="position:relative;padding:6% 6% 0">
    <div style="position:relative;border-radius:22px;background:linear-gradient(135deg, rgba(255,255,255,.66), rgba(255,255,255,.16) 42%, rgba(255,255,255,.42));border:1.5px solid rgba(160,160,210,.7);box-shadow:inset 0 0 0 4px rgba(255,255,255,.35);padding:12% 9% 7%">
      ${CH(who).replace('class="chr ', 'style="filter:drop-shadow(0 0 0 #fff) drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff)" class="chr ')}
      <div style="position:absolute;left:8%;top:7%;width:7%;height:36%;border-radius:999px;background:rgba(255,255,255,.55)"></div></div>
    <div style="margin:-3% -3% 0;height:20px;border-radius:50%;background:linear-gradient(180deg, rgba(255,255,255,.8), rgba(214,214,236,.6));border:1.5px solid rgba(160,160,210,.7)"></div></div>`
}
// 서 있는 캐릭터 + 바닥 그림자(옆에서 본 C안)
function standing(who, x, feet, w, { lean = -46, len = .38 } = {}) {
  const r = { 디오: 2200 / 1930, 두리: 2540 / 2330, 둘이: 2540 / 4310 }[who], h = w * r
  return `<div class="contact" style="left:${x - w * .05}px;top:${feet - 12}px;width:${w * 1.1}px;height:22px"></div>
    <div class="cast" style="left:${x}px;top:${feet - h}px;width:${w}px;height:${h}px;transform-origin:50% 100%;transform:skewX(${lean}deg) scaleY(${len});opacity:.13;filter:brightness(0) blur(2px)">${CH(who)}</div>
    <div class="cast" style="left:${x}px;top:${feet - h}px;width:${w}px">${CH(who)}</div>`
}

// ---------- 빛 (SVG) ----------
// 블라인드 빛: 기울어진 판 하나를 가로 n줄로 자른다. k = 아래로 갈수록 오른쪽으로 밀리는 정도
function slats({ x, y, w, h, n = 10, gap = 9, k = .12 }) {
  const sh = (h - gap * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => {
    const y1 = y + i * (sh + gap), y2 = y1 + sh
    return `${x + (y1 - y) * k},${y1} ${x + w + (y1 - y) * k},${y1} ${x + w + (y2 - y) * k},${y2} ${x + (y2 - y) * k},${y2}`
  })
}
// 창틀 빛: 2 × 2 창
function panes({ x, y, w, h, k = .14, bar = 18 }) {
  const out = []
  const pw = (w - bar) / 2, ph = (h - bar) / 2
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const y1 = y + cy * (ph + bar), y2 = y1 + ph, x1 = x + cx * (pw + bar)
    out.push(`${x1 + (y1 - y) * k},${y1} ${x1 + pw + (y1 - y) * k},${y1} ${x1 + pw + (y2 - y) * k},${y2} ${x1 + (y2 - y) * k},${y2}`)
  }
  return out
}
const ellipse = (cx, cy, rx, ry, n = 48) => Array.from({ length: n }, (_, i) => `${(cx + rx * Math.cos(i / n * Math.PI * 2)).toFixed(1)},${(cy + ry * Math.sin(i / n * Math.PI * 2)).toFixed(1)}`).join(' ')
const whole = ({ x, y, w, h, k = .12 }) => `${x},${y} ${x + w},${y} ${x + w + h * k},${y + h} ${x + h * k},${y + h}`
// 창밖 화분의 잎 그림자
function leafG(x, y, s = 1, r = 0, c = '#000') {
  const lf = [[160, 120, -30, 1], [200, 200, 10, .9], [120, 240, 50, .8], [260, 120, -70, .7], [250, 260, 30, .7], [70, 150, -10, .65]]
  return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})" fill="${c}" stroke="${c}">${lf.map(([a, b, rr, ss]) => `<g transform="translate(${a} ${b}) rotate(${rr}) scale(${ss})"><path d="M0 0 C40 -30 110 -30 150 0 C110 30 40 30 0 0 Z" stroke="none"/><path d="M0 0 L-70 8" stroke-width="5" fill="none"/></g>`).join('')}</g>`
}
// 바닥 + 빛 + 잎 그림자 (세계 층)
function lightSVG({ W, H, base = 'none', light = '#FFF7E0', polys = [], glowPoly = '', glow = '', leaf = null, blur = 7, before = '', after = '', rot = '' }) {
  const b = uid('b'), g = uid('g'), l = uid('l')
  return `<svg class="light" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><filter id="${b}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter>
      <filter id="${g}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
      <filter id="${l}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${leaf?.blur ?? 4}"/></filter></defs>
    ${base !== 'none' ? `<rect width="100%" height="100%" fill="${base}"/>` : ''}${before}
    <g ${rot ? `transform="rotate(${rot})"` : ''}>${glow ? `<polygon points="${glowPoly}" fill="${glow}" filter="url(#${g})"/>` : ''}
    <g fill="${light}" filter="url(#${b})">${polys.map((p) => `<polygon points="${p}"/>`).join('')}</g></g>
    ${leaf ? `<g opacity="${leaf.o}" filter="url(#${l})">${leafG(leaf.x, leaf.y, leaf.s, leaf.r, leaf.c)}</g>` : ''}${after}</svg>`
}
// 빛 덮개(.fx): 다이어리 위에 얹혀 가운데 표지에만 블라인드 빛이 걸리고, 바깥은 라벤더 그늘
function fxSVG({ W, H, area = '', polys = [], shadeO = .1, lightO = .75, light = '#FFF0C4', rot = '' }) {
  const tr = rot ? `transform="rotate(${rot})"` : ''
  const b = uid('fb'), c = uid('fc')
  const shade = area ? `<div class="fs" style="opacity:${shadeO}"><svg width="${W}" height="${H}"><defs><filter id="${b}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="16"/></filter></defs>
    <g filter="url(#${b})"><path fill-rule="evenodd" fill="#8C89C4" ${tr} d="M-400 -400H${W + 400}V${H + 400}H-400Z M${area.split(' ').join(' L')}Z"/></g></svg></div>` : ''
  return `${shade}<div class="fl" style="opacity:${lightO}"><svg width="${W}" height="${H}"><defs><filter id="${c}"><feGaussianBlur stdDeviation="3"/></filter></defs><g fill="${light}" filter="url(#${c})" ${tr}>${polys.map((p) => `<polygon points="${p}"/>`).join('')}</g></svg></div>`
}

// ---------- 다이어리 (물건 층) ----------
// align: 'center' 위에서 본 책상(기존) · 'bottom' 옆에서 본 책상(C안, 바닥선에 선다)
function swipe2({ list, active, shift = 0, phone = false, align = 'center', tilt = true, dim = 'shade', wallCast = false }) {
  const g = phone ? { cx: 195, cw: 212, ctop: 200, sw: 166, step: 222, far: 0 } : { cx: 602, cw: 250, ctop: 172, sw: 196, step: 290, far: 270 }
  const ch = g.cw * 246 / 185
  const rots = { '-2': 6, '-1': -3.5, 1: 3, 2: -5 }
  let out = ''
  list.forEach((d, i) => {
    const k = i - active - shift
    if (Math.abs(k) > 2.2) return
    const a = Math.min(1, Math.abs(k))
    const w = g.cw + (g.sw - g.cw) * a, h = w * 246 / 185
    const top = align === 'bottom' ? g.ctop + ch - h : g.ctop + (ch - h) / 2
    const cx = g.cx + Math.sign(k) * (Math.min(1, Math.abs(k)) * g.step + Math.max(0, Math.abs(k) - 1) * (g.step + (g.far || 0) - 20))
    const rot = tilt ? (rots[Math.round(k)] ?? 0) * a : 0
    const filt = dim === 'shade' ? `filter:saturate(${1 - a * .3}) brightness(${1 - a * .03})` : dim === 'soft' ? `filter:saturate(${1 - a * .45}) contrast(${1 - a * .08})` : ''
    const z = 10 - Math.round(Math.abs(k) * 3)
    if (align === 'bottom') {
      out += `<div class="contact" style="left:${cx - w * .56}px;top:${top + h - 12}px;width:${w * 1.16}px;height:24px;z-index:${z}"></div>`
      if (wallCast) out += `<div style="position:absolute;left:${cx - w / 2 + 16}px;top:${top - 8}px;width:${w}px;height:${h - 30}px;border-radius:6px 14px 14px 6px;background:rgba(var(--lavShadow),.13);filter:blur(10px);z-index:${z - 1}"></div>`
    }
    out += place(cover(d, w, { lift: a < .5 ? 1 : 0, rot, actions: a < .05, sheen: a < .05 }), cx, top, w, `${filt};z-index:${z}`)
  })
  return out
}

// ---------- 장면 틀 ----------
const DEV = { T: { W: 1204, H: 800 }, P: { W: 390, H: 844 } }
function scT({ cls, world, objects, fx = '', ui }) {
  return `<div class="device tablet sunlit ${cls}">${railHTML()}<main class="stage"><div class="world">${world}</div><div class="objects">${objects}</div><div class="fx">${fx}</div><div class="ui">${ui}</div></main></div>`
}
function scP({ cls, world, objects, fx = '', ui }) {
  return `<div class="device phone sunlit ${cls}"><main class="stage"><div class="world">${world}</div><div class="objects">${objects}</div><div class="fx">${fx}</div><div class="ui">${ui}</div></main></div>`
}
const LIST = SWIPE_LIST

// ---------- A안 다듬은 나무 책상 ----------
const A = {
  world(phone) {
    const { W, H } = phone ? DEV.P : DEV.T
    const pl = phone ? slats({ x: -120, y: -60, w: 300, h: 560, n: 7, gap: 26, k: .7 }) : slats({ x: -160, y: -80, w: 560, h: 760, n: 8, gap: 30, k: .62 })
    const svg = lightSVG({ W, H, light: 'rgba(255,250,236,.62)', polys: pl, blur: 9, leaf: { x: phone ? -40 : -60, y: phone ? 520 : 440, s: phone ? .7 : 1.05, r: 10, c: '#5A4632', o: .1, blur: 5 } })
    const props = phone
      ? P(plantTop(), -64, 662, 186, 0) + P(mug(), 118, 744, 96, 0) + P(acry('둘이'), 232, 650, 150, 0)
      : P(plantTop(), -74, 566, 236, 0) + P(mug(), 188, 666, 116, 0) + P(acry('둘이'), 996, 452, 170, 0) + P(tapeRoll('lavender', 'dot'), 1078, 156, 96, 0) + P(pen('#8F92CC'), 800, 694, 300, -20)
    return svg + `<div class="props">${props}</div>`
  },
}
// ---------- B안 햇살 한 조각 ★ ----------
const B_GEO = { T: { x: 400, y: 108, w: 420, h: 560, n: 9, gap: 13, k: 0, rot: '-12 610 388' }, P: { x: 66, y: 160, w: 258, h: 470, n: 8, gap: 11, k: 0, rot: '-10 195 395' } }
const B = {
  world(phone, { time = 'noon', empty = false } = {}) {
    const { W, H } = phone ? DEV.P : DEV.T
    let geo = { ...(phone ? B_GEO.P : B_GEO.T) }
    let base = '#EDEDF4', light = '#FFF5DD', glow = 'rgba(254,240,191,.3)'
    let leaf = { x: phone ? 20 : 340, y: phone ? 120 : 70, s: phone ? .42 : .6, r: -8, c: '#BDBAE0', o: .55, blur: 3 }
    if (time === 'morning') { base = '#EEF0F6'; light = '#FBFCFF'; glow = 'rgba(226,234,250,.9)'; geo = { ...geo, rot: phone ? '10 195 395' : '12 610 388' }; leaf = { ...leaf, x: phone ? 230 : 820, r: 170, o: .38 } }
    if (time === 'night') {
      const lamp = `<radialGradient id="lampg" cx="${phone ? 195 : 602}" cy="${phone ? 340 : 330}" r="${phone ? 300 : 420}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE9B8" stop-opacity=".95"/><stop offset=".45" stop-color="#FCE7C4" stop-opacity=".45"/><stop offset="1" stop-color="#FCE7C4" stop-opacity="0"/></radialGradient>`
      return lightSVG({ W, H, base: '#DEDCEC', before: `<defs>${lamp}</defs><rect width="100%" height="100%" fill="url(#lampg)"/>`, polys: [] }) + `<div class="props">${B.props(phone, { night: true })}</div>`
    }
    const svg = lightSVG({ W, H, base, light, polys: slats(geo), glowPoly: whole(geo), glow, leaf, blur: 3, rot: geo.rot })
    return svg + `<div class="props">${empty ? '' : B.props(phone, { time })}</div>`
  },
  props(phone, { night = false, time } = {}) {
    if (phone) return P(acry('둘이'), 226, 650, 150, 0) + P(postit('#FFF4CC', ['오늘도', '한 장!'], 20), 26, 680, 96, -6) + P(stk('디오'), 92, 650, 44, 10, { sd: false })
    return P(acry('둘이'), 990, 446, 170, 0) + P(tapeRoll('lavender', 'dot'), 1078, 158, 92, 0) + P(postit('#FFF4CC', night ? ['잘 자', '내일 또!'] : ['오늘도', '한 장!'], 20), 170, 618, 104, -6)
      + P(stk('디오'), 250, 590, 52, 12, { sd: false }) + P(pen('#8F92CC'), 812, 700, 290, -18) + (night ? P(IMG('달'), 1100, 300, 54, 0, { sd: false, cls: 'stick' }) : '')
  },
  fx(phone, { time = 'noon' } = {}) {
    const { W, H } = phone ? DEV.P : DEV.T
    if (time === 'night') return fxSVG({ W, H, area: ellipse(phone ? 195 : 602, phone ? 360 : 360, phone ? 190 : 330, phone ? 260 : 300), polys: [], shadeO: .26 })
    let geo = { ...(phone ? B_GEO.P : B_GEO.T) }
    if (time === 'morning') geo = { ...geo, rot: phone ? '10 195 395' : '12 610 388' }
    return fxSVG({ W, H, rot: geo.rot, area: whole(geo), polys: slats(geo), shadeO: time === 'morning' ? .06 : .1, light: time === 'morning' ? '#FFFFFF' : '#FFE7A0', lightO: .85 })
  },
}
// ---------- C안 창가 (옆에서 본 책상) ----------
const C = {
  world(phone) {
    const { W, H } = phone ? DEV.P : DEV.T
    const deskY = phone ? 452 : 470
    const desk = `<rect y="${deskY}" width="100%" height="${H - deskY}" fill="#EFE6D8"/><rect y="${deskY}" width="100%" height="10" fill="#F7F0E5"/><rect y="${deskY - 1}" width="100%" height="1.5" fill="rgba(76,72,150,.12)"/>
      <rect y="${deskY + 10}" width="100%" height="${H - deskY}" fill="url(#deskfade)"/><defs><linearGradient id="deskfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6DCCB" stop-opacity=".0"/><stop offset="1" stop-color="#E3D7C4" stop-opacity=".7"/></linearGradient></defs>`
    const pn = phone ? panes({ x: 48, y: 70, w: 250, h: 330, k: -.12, bar: 12 }) : panes({ x: 120, y: 34, w: 560, h: 400, k: -.2, bar: 18 })
    const spill = phone ? slats({ x: 70, y: deskY + 14, w: 230, h: 80, n: 2, gap: 8, k: -.9 }) : slats({ x: 170, y: deskY + 14, w: 520, h: 90, n: 2, gap: 10, k: -1.2 })
    const svg = lightSVG({ W, H, base: '#EFEEF5', light: '#FFF4D6', polys: [...pn, ...spill], glowPoly: phone ? '40,60 320,60 320,420 40,420' : '100,20 720,20 720,440 100,440', glow: 'rgba(254,240,191,.35)', blur: 3, after: desk,
      leaf: { x: phone ? -50 : 30, y: phone ? 40 : -10, s: phone ? .6 : .9, r: 15, c: '#C2BFE3', o: .55 } })
    const props = phone
      ? standing('디오', 44, 776, 92) + standing('두리', 140, 778, 108) + P(cactusSide(), 300, 690, 62, 0, { sd: false })
      : standing('디오', 170, 712, 88) + standing('두리', 262, 714, 102) + P(cactusSide(), 1050, 382, 78, 0, { sd: false }) + `<div class="contact" style="left:1046px;top:486px;width:90px;height:18px"></div>`
        + P(sideMug(), 108, 430, 66, 0, { sd: false }) + `<div class="contact" style="left:102px;top:494px;width:86px;height:16px"></div>` + P(pencil('#DBDCF9'), 850, 700, 250, -3)
    return svg + `<div class="props">${props}</div>`
  },
}
function sideMug() {
  return S('0 0 90 100', `<path d="M66 34 C86 34 86 64 66 66" fill="none" stroke="#010101" stroke-width="9" stroke-linecap="round"/><path d="M66 34 C86 34 86 64 66 66" fill="none" stroke="#F7F7FC" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M8 20 H70 V82 a14 14 0 0 1 -14 14 H22 a14 14 0 0 1 -14 -14 Z" fill="#F7F7FC" stroke="#010101" stroke-width="3.5" stroke-linejoin="round"/>
    <rect x="9.5" y="42" width="59" height="16" fill="#DBDCF9"/><path d="M8 42 H70 M8 58 H70" stroke="#010101" stroke-width="2"/>
    <path d="M30 10 C26 4 34 0 30 -6 M46 12 C42 6 50 2 46 -4" stroke="#B7B4DE" stroke-width="3" fill="none" stroke-linecap="round"/>`, 'style="overflow:visible"')
}
// ---------- D안 햇살 카드 ----------
const D = {
  world(phone) {
    const m = phone ? { l: 12, t: 160, r: 12, b: 16 } : { l: 26, t: 146, r: 26, b: 22 }
    const { W, H } = phone ? DEV.P : DEV.T
    const cw = W - m.l - m.r, chh = H - m.t - m.b
    const pl = phone ? slats({ x: -150, y: -30, w: 250, h: 520, n: 6, gap: 26, k: .55 }) : slats({ x: -200, y: -60, w: 520, h: 720, n: 7, gap: 34, k: .55 })
    const svg = lightSVG({ W: cw, H: chh, base: '#F4EFEA', light: '#FFFBF1', polys: pl, glowPoly: phone ? '0,0 200,0 120,400 0,400' : '0,0 420,0 260,600 0,600', glow: 'rgba(254,240,191,.45)', blur: 4,
      leaf: { x: phone ? 200 : 820, y: phone ? -60 : -70, s: phone ? .55 : .85, r: 120, c: '#C9C6E6', o: .45 } })
    const tapes = phone
      ? P(tapeStrip('lavender', 120, 'dot'), 4, 148, 84, -14, { sd: false }) + P(tapeStrip('butter', 120), 300, 148, 84, 12, { sd: false }) + P(stk('디오'), 24, 728, 62, -8, { sd: false }) + P(stk('두리'), 312, 714, 58, 7, { sd: false })
      : P(tapeStrip('lavender', 140, 'dot'), 12, 134, 110, -14, { sd: false }) + P(tapeStrip('butter', 140), 1082, 134, 110, 12, { sd: false }) + P(stk('디오'), 76, 652, 82, -8, { sd: false }) + P(stk('두리'), 1062, 634, 82, 7, { sd: false })
    return `<div class="card" style="left:${m.l}px;top:${m.t}px;right:${m.r}px;bottom:${m.b}px">${svg}</div><div class="props">${tapes}</div>`
  },
}

// ---------- 장면 조립 ----------
const swipeScene = (opt, { phone = false, active = 1, shift = 0, filter, align = 'center', dim = 'shade', wallCast = false, tilt = true, fx = '', world, cls = '' } = {}) => {
  const d = LIST[active]
  const objs = swipe2({ list: LIST, active, shift, phone, align, dim, wallCast, tilt })
  const ui = headerUI({ view: 'swipe', phone, filter }) + swipeUI(d, { phone, idx: active + 1, total: 7 })
  return (phone ? scP : scT)({ cls: `${opt} ${cls}`, world, objects: objs, fx, ui })
}
function emptyB(phone) {
  const slot = phone ? { x: 89, y: 200, w: 212 } : { x: 477, y: 172, w: 250 }
  const h = slot.w * 246 / 185
  const ui = headerUI({ phone }) + `<div style="position:absolute;left:${slot.x}px;top:${slot.y + h * .34}px;width:${slot.w}px;text-align:center"><div style="font-size:17px;font-weight:800">다이어리가 없어요</div>
    <div style="margin:16px auto 0;width:${phone ? 168 : 180}px;height:48px;border-radius:14px;background:#4F74AE;color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px">${icon('plus', 18, '#fff', { sw: 2.2 })}새 다이어리</div></div>`
  const objs = `<div style="position:absolute;left:${slot.x}px;top:${slot.y}px;width:${slot.w}px;height:${h}px;border:2.5px dashed rgba(76,72,150,.3);border-radius:6px 14px 14px 6px;background:rgba(255,255,255,.4)"></div>`
    + (phone ? P(acry('둘이'), 120, 560, 150, 0) : P(acry('둘이'), 740, 380, 150, 0))
  return (phone ? scP : scT)({ cls: 't-b', world: B.world(phone, { empty: true }), objects: objs, fx: B.fx(phone), ui })
}
function gridB(phone) {
  const { W, H } = phone ? DEV.P : DEV.T
  const geo = phone ? { x: 20, y: 150, w: 300, h: 420, k: .1, bar: 14 } : { x: 250, y: 96, w: 660, h: 560, k: .14, bar: 22 }
  const pn = panes(geo)
  const world = lightSVG({ W, H, base: '#EEEEF5', light: '#FFF7DF', polys: pn, glowPoly: whole({ ...geo }), glow: 'rgba(254,240,191,.35)', blur: 3, leaf: { x: phone ? -30 : 190, y: phone ? 130 : 60, s: phone ? .45 : .6, r: -8, c: '#BDBAE0', o: .5, blur: 3 } })
    + `<div class="props">${phone ? '' : P(acry('둘이'), 1022, 470, 156, 0) + P(tapeRoll('lavender', 'dot'), 64, 196, 88, 0) + P(postit('#FFF4CC', ['오늘도', '한 장!'], 20), 52, 540, 100, -6)}</div>`
  const { o, u } = gridObjects({ list: GRID_LIST, phone })
  return (phone ? scP : scT)({ cls: 't-b', world, objects: o, fx: fxSVG({ W, H, polys: pn, lightO: .6 }), ui: headerUI({ view: 'grid', phone }) + u })
}
// 전환: 빛이 빠지면 그늘색이 곧 편집기 바탕
function liftB(step) {
  const world = `<div style="position:absolute;inset:0;opacity:${step === 1 ? .35 : 0};filter:blur(4px)">${B.world(false)}</div><div style="position:absolute;inset:0;background:#F1F3F7;opacity:${step === 1 ? .6 : 1}"></div>`
  return scT({ cls: 't-b', world, objects: place(cover(byId('memo'), 300, { lift: 1, sheen: true }), 602, 150, 300), ui: `<div style="opacity:.16">${headerUI({})}</div>` })
}

// ---------- 재시안: 위에서 내려다본 쿨톤 데스크 ----------
// 창틀빛은 정오에 가장 반듯하고, 아침·노을에는 각도와 길이만 바꾼다.
// 소품은 모두 가장자리에 두어 표지보다 먼저 읽히지 않게 한다.
function guestDayRail(phone, day = '10월 29일') {
  const w = phone ? 196 : 220
  const x = phone ? (390 - w) / 2 : (1204 - w) / 2
  const y = phone ? 694 : 684
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:40px;border-radius:14px;background:rgba(255,255,255,.92);border:1px solid rgba(11,25,87,.16);box-shadow:0 6px 16px -10px rgba(11,25,87,.28);display:flex;align-items:center;justify-content:space-around;z-index:31;font-size:12px;font-weight:700;color:#0B1957"><span style="color:rgba(11,25,87,.68)">게스트</span><span style="width:1px;height:16px;background:rgba(11,25,87,.12)"></span><span style="font-size:18px;line-height:1">‹</span><span>${day}</span><span style="font-size:18px;line-height:1">›</span></div>`
}
function coolDesk(phone, kind = 'noon') {
  const { W, H } = phone ? DEV.P : DEV.T
  const g = phone
    ? { x: 58, y: 128, w: 270, h: 500, k: .08, bar: 13 }
    : { x: 394, y: 88, w: 430, h: 610, k: .06, bar: 18 }
  let base = '#EEF1F7', light = '#FFF4D3', glow = 'rgba(254,240,191,.30)', leaf = { x: phone ? 4 : 220, y: phone ? 36 : 26, s: phone ? .36 : .52, r: -12, c: '#B8C2DB', o: .36, blur: 3 }
  let frame = panes(g), fx = panes(g)
  if (kind === 'morning') {
    base = '#F0F4F9'; light = '#F9FCFF'; glow = 'rgba(221,233,249,.7)'
    g.x = phone ? -28 : 56; g.y = phone ? 128 : 68; g.k = -.22
    frame = panes(g); fx = panes(g); leaf = { ...leaf, x: phone ? 252 : 930, r: 155, o: .28 }
  }
  if (kind === 'sunset') {
    base = '#E7E8F1'; light = '#FFE8C4'; glow = 'rgba(255,213,169,.35)'
    g.x = phone ? 112 : 694; g.y = phone ? 56 : 8; g.h = phone ? 610 : 760; g.k = -.16
    frame = panes(g); fx = panes(g); leaf = { ...leaf, x: phone ? 42 : 112, y: phone ? 520 : 456, r: 32, o: .3 }
  }
  if (kind === 'night') {
    const lamp = `<radialGradient id="desk-lamp" cx="${phone ? 195 : 602}" cy="${phone ? 322 : 330}" r="${phone ? 300 : 410}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE1A1" stop-opacity=".98"/><stop offset=".34" stop-color="#FFDEAA" stop-opacity=".60"/><stop offset="1" stop-color="#F7D9B0" stop-opacity="0"/></radialGradient>`
    const lampBody = phone
      ? `<g transform="translate(26 602)"><ellipse cx="44" cy="57" rx="42" ry="12" fill="#A6A3CB" opacity=".28"/><path d="M45 43 L65 16" stroke="#F7F7FC" stroke-width="9" stroke-linecap="round"/><path d="M45 43 L65 16" stroke="#7A78A5" stroke-width="2" stroke-linecap="round"/><path d="M47 7 C59 -4 78 2 82 16 L62 24 C57 17 51 13 47 7Z" fill="#F7F7FC" stroke="#7A78A5" stroke-width="2"/><ellipse cx="64" cy="18" rx="13" ry="5" fill="#FFE1A1" opacity=".92"/><ellipse cx="40" cy="48" rx="24" ry="8" fill="#F7F7FC" stroke="#7A78A5" stroke-width="2"/></g>`
      : `<g transform="translate(120 578)"><ellipse cx="58" cy="75" rx="56" ry="14" fill="#77769D" opacity=".25"/><path d="M58 57 L86 17" stroke="#F7F7FC" stroke-width="11" stroke-linecap="round"/><path d="M58 57 L86 17" stroke="#7A78A5" stroke-width="2.5" stroke-linecap="round"/><path d="M62 5 C78 -10 101 -3 108 17 L82 29 C75 20 68 12 62 5Z" fill="#F7F7FC" stroke="#7A78A5" stroke-width="2.5"/><ellipse cx="86" cy="22" rx="18" ry="7" fill="#FFE1A1" opacity=".96"/><ellipse cx="52" cy="63" rx="31" ry="10" fill="#F7F7FC" stroke="#7A78A5" stroke-width="2.5"/></g>`
    const world = lightSVG({ W, H, base: '#C9CBE0', before: `<defs>${lamp}</defs><rect width="100%" height="100%" fill="url(#desk-lamp)"/>${lampBody}`, polys: [] })
    const props = phone
      ? P(acry('둘이'), 258, 624, 116, 0) + P(tapeRoll('lavender', 'dot'), 26, 692, 68, 0)
      : P(acry('둘이'), 1012, 448, 150, 0) + P(tapeRoll('lavender', 'dot'), 1052, 126, 86, 0) + P(pen('#8F92CC'), 806, 708, 276, -16)
    return { world: world + `<div class="props">${props}</div>`, fx: fxSVG({ W, H, area: ellipse(phone ? 195 : 602, phone ? 352 : 362, phone ? 176 : 292, phone ? 254 : 312), polys: [], shadeO: .18 }) }
  }
  const world = lightSVG({ W, H, base, light, polys: frame, glowPoly: whole(g), glow, leaf, blur: 3 })
  const props = phone
    ? P(acry('둘이'), 258, 620, 116, 0) + P(postit('#F7F2CD', ['오늘의', '기록'], 20), 18, 690, 78, -5) + P(tapeRoll('lavender', 'dot'), 274, 160, 64, 0)
    : P(acry('둘이'), 1010, 446, 150, 0) + P(tapeRoll('lavender', 'dot'), 1054, 126, 86, 0) + P(postit('#F7F2CD', ['오늘의', '기록'], 20), 144, 614, 92, -5) + P(pen('#8F92CC'), 806, 708, 276, -16)
  return { world: world + `<div class="props">${props}</div>`, fx: fxSVG({ W, H, area: whole(g), polys: fx, shadeO: .08, light: kind === 'morning' ? '#FFFFFF' : light, lightO: .72 }) }
}
function coolDeskScene(kind, label, day) {
  const desk = coolDesk(false, kind)
  const ui = headerUI({ view: 'swipe', filter: 'shared' }) + swipeUI(LIST[1], { idx: 2, total: 7 }) + guestDayRail(false, day)
  return scT({ cls: `t-b cool-desk ${label}`, world: desk.world, objects: swipe2({ list: LIST, active: 1 }), fx: desk.fx, ui })
}

// ---------- 재배치: 생성 배경 + 최종 마스코트 벡터 ----------
// 질감은 래스터 배경에 맡기고, 디오·두리는 원본 SVG로 얹어 비율과 선을 고정한다.
function premiumProps(n) {
  const die = (who, x, y, w, r) => P(stk(who), x, y, w, r, { sd: false })
  if (n === 1) return die('디오', 46, 518, 76, -8) + die('두리', 1028, 236, 68, 7)
  if (n === 2) return die('디오', 82, 604, 70, -7) + die('두리', 1048, 238, 64, 7)
  if (n === 3) return die('디오', 54, 578, 72, -7) + die('두리', 1010, 230, 66, 8)
  return die('디오', 52, 212, 68, -6) + die('두리', 1034, 238, 64, 8)
}
function premiumScene(n, name) {
  const file = ['01-폴라로이드', '02-키캡', '03-종이굿즈', '04-투명필통'][n - 1]
  const window = lightSVG({ W: DEV.T.W, H: DEV.T.H, light: 'rgba(255,241,196,.18)', polys: panes({ x: 354, y: 92, w: 500, h: 600, k: .02, bar: 20 }), blur: 11 })
  const world = `<div class="premium-world" style="background-image:url('소재/재시안-고급소품/${file}.png')"></div>${window}`
  const ui = headerUI({ view: 'swipe', filter: 'shared' }) + swipeUI(LIST[1], { idx: 2, total: 7 }) + guestDayRail(false, '10월 29일')
  return scT({ cls: `t-b premium premium-${n}`, world, objects: swipe2({ list: LIST, active: 1 }) + premiumProps(n), ui })
}

// ---------- 시트 ----------
function colorSheet() {
  const pair = (a, an, b, bn, t, s) => `<div class="c"><div style="display:flex;height:150px"><div style="flex:1;background:${a};display:flex;align-items:flex-end;padding:10px;font-size:12px;font-weight:800">${an}</div><div style="flex:1;background:${b};display:flex;align-items:flex-end;padding:10px;font-size:12px;font-weight:800">${bn}</div></div><div class="tx">${t}<small>${s}</small></div></div>`
  return `<div class="sheet" style="height:480px"><h2>색은 캐릭터와 앱에서 가져온다</h2><div class="sub">햇살 책상의 네 가지 색은 모두 이미 있는 색의 한 걸음 옆이다. 새 색 토큰을 만들지 않는다.</div>
    <div class="sw">
      ${pair('#EEEEF5', '그늘 #EDEDF4', '#F1F3F7', '앱 바탕 #F1F3F7', '그늘 = 앱 바탕', '빛이 빠지면 곧 편집기 바탕이 된다. 온도 차이가 없다.')}
      ${pair('#FFF7DF', '햇빛 #FFF5DD', '#FEF0BF', '디오 #FEF0BF', '햇빛 = 디오', '디오 몸 색을 흰색 쪽으로. 빛이 닿은 곳이 가운데 다이어리.')}
      ${pair('rgba(76,72,150,.34)', '그림자 남보라', '#DBDCF9', '두리 목도리 #DBDCF9', '그림자 = 두리', '그림자 색을 갈색이 아닌 남보라로. 앱 그림자(#0B1957)와 같은 쪽이라 버튼 그림자와 한 빛이 된다.')}
      ${pair('#FFFFFF', '버튼 흰', '#0B1957', '<span style="color:#fff">글자 #0B1957</span>', '버튼 = 그대로', '칩 · 보기 전환 · 검색 · 정보 카드는 theme.js 그대로. 바탕이 앱 색에 가까워 따로 손볼 것이 없다.')}
    </div></div>`
}
function charSheet() {
  const cell = (inner, t, s, bg = '#EEEEF5') => `<div class="c"><div style="height:300px;position:relative;background:${bg};overflow:hidden">${inner}</div><div class="tx">${t}<small>${s}</small></div></div>`
  return `<div class="sheet sunlit" style="height:560px"><h2>캐릭터 최종 시안을 책상에 놓는 네 가지 방법</h2><div class="sub">그림은 하나도 새로 그리지 않았다. 최종 시안 SVG를 잘라 세 가지 물건(스탠드 · 스티커 · 피규어)으로만 바꿔 쓴다.</div>
    <div class="sw">
      ${cell(`<div class="prop sd" style="left:50%;top:40px;width:200px;transform:translateX(-50%)">${acry('둘이')}</div>`, '아크릴 스탠드 · A · B안', '위에서 본 책상에 서 있을 수 있는 유일한 방법. 정면 그림 그대로.')}
      ${cell(`<div class="prop" style="left:60px;top:60px;width:110px;transform:rotate(-8deg)">${stk('디오')}</div><div class="prop" style="left:200px;top:80px;width:110px;transform:rotate(7deg)">${stk('두리')}</div>`, '다이컷 스티커 · B · D안', '편집기 스티커와 같은 흰 테두리. 디오 감정 스티커 팩과 이어진다.', '#F4EFEA')}
      ${cell(`<svg width="100%" height="300" style="position:absolute;inset:0"><rect y="200" width="100%" height="100" fill="#EFE6D8"/></svg>${standing('디오', 90, 250, 100)}${standing('두리', 200, 252, 118)}`, '서 있는 피규어 · C안', '옆에서 본 책상에서만. 바닥 그림자 + 긴 그림자 한 방향.', '#F3F2F8')}
      ${cell(`<div style="position:absolute;left:50%;top:46px;width:160px;transform:translateX(-50%)">${CH('디오')}</div><div style="position:absolute;left:0;right:0;bottom:24px;text-align:center;font-size:16px;font-weight:800">다이어리가 없어요</div>`, '쓰지 않는 곳', '버튼 · 칩 · 정보 카드 안에는 넣지 않는다(UI 층). 빈 화면 그림은 기존 EmptyState 자리만.', '#fff')}
    </div></div>`
}

const NEW = {
  // 오후 3시 고정 · 에셋 배치만 달리한 고급 소품안
  '고급 소품 1 폴라로이드': () => premiumScene(1, '폴라로이드'),
  '고급 소품 2 키캡': () => premiumScene(2, '키캡'),
  '고급 소품 3 종이굿즈': () => premiumScene(3, '종이굿즈'),
  '고급 소품 4 투명필통': () => premiumScene(4, '투명필통'),
  // 재시안: 네 안 모두 탑뷰·쿨톤 책상. 게스트는 아래 날짜 레일을 슬라이드해 지난 기록을 본다.
  '재시안 1 아침 창틀': () => coolDeskScene('morning', 'cool-morning', '10월 29일'),
  '재시안 2 정오 창틀': () => coolDeskScene('noon', 'cool-noon', '10월 29일'),
  '재시안 3 노을 창틀': () => coolDeskScene('sunset', 'cool-sunset', '10월 28일'),
  '재시안 4 밤 조명': () => coolDeskScene('night', 'cool-night', '10월 27일'),
  // 네 가지 방향 (태블릿)
  'A안 기본': () => swipeScene('t-a', { world: A.world(false), dim: 'soft' }),
  'B안 기본': () => swipeScene('t-b', { world: B.world(false), fx: B.fx(false) }),
  'C안 기본': () => swipeScene('t-c', { world: C.world(false), align: 'bottom', tilt: false, wallCast: true }),
  'D안 기본': () => swipeScene('t-d', { world: D.world(false), dim: 'soft' }),
  // 폰
  'A안 폰': () => swipeScene('t-a', { phone: true, world: A.world(true), dim: 'soft' }),
  'B안 폰': () => swipeScene('t-b', { phone: true, world: B.world(true), fx: B.fx(true) }),
  'C안 폰': () => swipeScene('t-c', { phone: true, world: C.world(true), align: 'bottom', tilt: false, wallCast: true }),
  'D안 폰': () => swipeScene('t-d', { phone: true, world: D.world(true), dim: 'soft' }),
  // B안 깊게
  'B안 넘기는 중': () => swipeScene('t-b', { world: B.world(false), fx: B.fx(false), shift: .45 }),
  'B안 새 다이어리': () => swipeScene('t-b', { world: B.world(false), fx: B.fx(false), active: 7 }),
  'B안 아침': () => swipeScene('t-b', { world: B.world(false, { time: 'morning' }), fx: B.fx(false, { time: 'morning' }) }),
  'B안 밤': () => swipeScene('t-b', { cls: 'night', world: B.world(false, { time: 'night' }), fx: B.fx(false, { time: 'night' }) }),
  'B안 한눈에': () => gridB(false),
  'B안 폰 한눈에': () => gridB(true),
  'B안 빈 책상': () => emptyB(false),
  'B안 폰 빈 책상': () => emptyB(true),
  'B안 공유 탭': () => swipeScene('t-b', { world: B.world(false), fx: B.fx(false), active: 6, filter: 'shared' }),
  'B안 전환 1': () => swipeScene('t-b', { world: B.world(false), fx: B.fx(false) }),
  'B안 전환 2': () => liftB(1),
  'B안 전환 3': () => liftB(2),
  'B안 전환 4': () => `<div class="device tablet" style="display:block">${editorHTML(byId('memo'))}</div>`,
  // A안 코덱스판 — 지금 앱 화면 기준
  'A2 지금': () => nowSwipe({ desk: false }),
  'A2 기본': () => nowSwipe(),
  'A2 맨 앞': () => nowSwipe({ active: 0 }),
  'A2 빛 덮개 없음': () => nowSwipe({ lightOn: false }),
  'A2 옆 표지 투명': () => nowSwipe({ side: 'fade' }),
  'A2 한눈에': () => nowGrid(),
  'A2 한눈에 지금': () => nowGrid({ desk: false }),
  'A2 폰': () => nowPhone(),
  'A2 폰 지금': () => nowPhone({ desk: false }),
  // 코덱스 시안 밑그림 (아이보리 단색 + 버튼 처리)
  '밑그림 U0': () => refSwipe('U0'),
  '밑그림 U1': () => refSwipe('U1'),
  '밑그림 U2': () => refSwipe('U2'),
  '밑그림 U3': () => refSwipe('U3'),
  '밑그림 폰 U0': () => refSwipe('U0', true),
  '밑그림 폰 U1': () => refSwipe('U1', true),
  '밑그림 폰 U2': () => refSwipe('U2', true),
  '밑그림 폰 U3': () => refSwipe('U3', true),
  '밑그림 한눈에 U3': () => refGrid('U3'),
  '밑그림 폰 한눈에 U3': () => refGrid('U3', true),
  // 시트
  '색 근거': colorSheet,
  '캐릭터 쓰임': charSheet,
}
for (const k of Object.keys(SCENES)) delete SCENES[k]
Object.assign(SCENES, NEW)
