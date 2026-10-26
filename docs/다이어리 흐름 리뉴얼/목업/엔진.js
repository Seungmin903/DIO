// 네 안이 함께 쓰는 상태 · 옵션 부품 · 동작. 안마다 다른 것은 배치뿐이다.
// 구역(병렬로 어디로든 이동): basic(이름 · 방향) · cover(표지) · paper(속지) · style(속지 스타일)
const Q = new URLSearchParams(location.search)
const S = {
  screen: Q.get('screen') || 'create', section: Q.get('section') || 'basic',
  name: '2026 다이어리', orient: 'portrait',
  cover: null, sel: null, el: 'base', stickerTab: 'nature', stickerQ: '',
  paperId: 'year', group: 'planner',
  period: { year: 2026, start: 1, months: 12, weekStart: 1 }, count: 50, dateStamp: true,
  style: { bg: '#FFFFFF', ink: '#292929', font: 'myeongjo' }, scope: 'all',
  add: { paperId: 'weekly', group: 'planner', pos: 'after', count: 1, month: 0, months: 1, week: 0, weeks: 1, days: 1 },
}
const defaultCover = () => ({
  enabled: true, kind: 'plain', color: '#9DABD8', pattern: { type: 'linen', tone: 'dark' }, photo: 0,
  band: { on: true, dir: 'v', pos: 'near', color: '#7D88B5' }, plate: 'paper',
  title: { text: '', font: 'gothic', size: 17, color: '#3B3F4A', anchor: 'tl', useName: true },
  subtitle: { on: true, text: 'DIARY · 2026', size: 8, color: '#9A9DA6' }, stickers: [],
})
S.cover = defaultCover()
// 수정 화면이 다루는 다이어리
const EDIT_DIARY = { name: '봄의 기록', orient: 'landscape', paperId: 'diary', period: '2026.03 – 2027.02', cover: { ...defaultCover(), kind: 'photo', photo: 4, plate: 'none', band: { on: true, dir: 'h', pos: 'near', color: '#FFFFFF' }, title: { text: '', font: 'pen', size: 22, color: '#FFFFFF', anchor: 'bl', useName: true }, subtitle: { on: true, text: '우리의 봄', size: 9, color: '#FFFFFF' }, stickers: [{ id: 'k1', name: 'blossom', x: 80, y: 22, size: 16, rot: 0 }] } }
function enterScreen(sc) {
  S.screen = sc; S.sel = null
  if (sc === 'edit') { S.name = EDIT_DIARY.name; S.orient = EDIT_DIARY.orient; S.paperId = EDIT_DIARY.paperId; S.cover = structuredClone(EDIT_DIARY.cover); S.section = 'cover'; S.el = 'base' }
  if (sc === 'create') { S.name = '2026 다이어리'; S.orient = 'portrait'; S.paperId = 'year'; S.group = 'planner'; S.cover = defaultCover(); S.section = 'basic' }
  if (sc === 'add') { S.orient = 'landscape'; S.section = 'paper' }
}
enterScreen(S.screen); if (Q.get('section')) S.section = Q.get('section')
const curPaper = () => paperById(S.screen === 'add' ? S.add.paperId : S.paperId)
const titleText = () => (S.cover.title.useName ? S.name : S.cover.title.text)
const coverView = () => ({ ...S.cover, title: { ...S.cover.title, text: titleText() } })
const paperOpts = (o = {}) => ({ orient: S.orient, bg: S.style.bg, ink: S.style.ink, font: S.style.font, weekStart: S.period.weekStart, ...o })
const thumb = (p, o = {}) => pageBox(p.kinds[0], paperOpts({ year: S.period.year, month: S.period.start, dated: p.type !== 'note', ...o }))
const plan = () => pagePlan(paperById(S.paperId), { ...S.period, count: S.count, dateStamp: S.dateStamp })

// ---------- 입력 부품 ----------
const chipB = (on, act, v, label, extra = '') => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${h(v)}" ${extra}>${label}</button>`
const segB = (cur, act, items, cls = '') => `<div class="seg ${cls}">${items.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`
const sw2 = (on, act, v = '') => `<button class="switch ${on ? 'on' : ''}" data-act="${act}" data-v="${v}" aria-pressed="${on}"></button>`
/** 숫자: − [직접 입력] + (단위) */
const numField = (val, key, unit = '', min = 1, max = 999) => `<div class="numf"><button data-step="${key}" data-v="-1" data-min="${min}" data-max="${max}">−</button><input type="number" inputmode="numeric" value="${val}" min="${min}" max="${max}" data-num="${key}"><button data-step="${key}" data-v="1" data-min="${min}" data-max="${max}">＋</button>${unit ? `<span>${unit}</span>` : ''}</div>`
/** 색: 견본 + # HEX 직접 입력 + 색 고르기 */
const colorField = (cur, key, list) => `<div class="colf"><div class="row" style="gap:6px">${list.map(([n, c]) => `<button class="swatch ${String(cur).toLowerCase() === c.toLowerCase() ? 'on' : ''}" title="${n}" style="background:${c}" data-color="${key}" data-v="${c}"></button>`).join('')}</div><label class="hex"><span class="dotc" style="background:${cur}"><input type="color" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000'}" data-pick="${key}"></span>#<input value="${String(cur).replace('#', '')}" maxlength="6" data-hex="${key}" spellcheck="false"></label></div>`
const anchorGrid = (cur, act) => `<div class="anchor" role="radiogroup" aria-label="위치">${ANCHORS.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" title="${l}" aria-label="${l}" data-act="${act}" data-v="${v}"><i></i></button>`).join('')}</div>`
const row = (k, body) => `<div class="optrow"><span class="k">${k}</span><div class="v">${body}</div></div>`
const badgeOf = (p) => (p.badge ? `<span class="badge new">${p.badge}</span>` : p.until ? `<span class="badge limit">${p.until}</span>` : p.rec ? '<span class="badge rec">추천</span>' : '') + (p.type === 'planner' ? '<span title="날짜형" class="cal">📅</span>' : '')

// 값 읽기 · 쓰기 (key = 'cover.title.size' 처럼 점 경로)
const getK = (k) => k.split('.').reduce((o, p) => o?.[p], S)
const setK = (k, v) => { const ps = k.split('.'), last = ps.pop(); ps.reduce((o, p) => o[p], S)[last] = v }

// ---------- 구역별 옵션 ----------
function basicOptions() {
  return `${row('이름', `<input class="input" data-name value="${h(S.name)}" maxlength="24">`)}
    ${S.screen === 'edit' ? row('방향', `<span class="pill">${S.orient === 'landscape' ? '가로' : '세로'} · 만든 뒤에는 바꿀 수 없어요</span>`) : row('방향', `${segB(S.orient, 'orient', [['portrait', '▯ 세로'], ['landscape', '▭ 가로']])}<span class="hint">표지와 속지에 모두 적용돼요</span>`)}`
}
/** 표지 요소 목록: 바탕 · 고무줄 · 라벨 · 제목 · 소제목 · 스티커. 사진 표지는 색 · 패턴이 없다 */
const COVER_ELEMENTS = () => [
  ['base', S.cover.kind === 'photo' ? '사진' : '바탕', S.cover.kind === 'photo' ? '사진 바꾸기 · 위치' : `${COVER_COLORS.find(([, c]) => c.toLowerCase() === S.cover.color.toLowerCase())?.[0] ?? S.cover.color} · ${PATTERNS.find(([v]) => v === S.cover.pattern.type)[1]}`, null],
  ['band', '고무줄', S.cover.band.on ? (S.cover.band.dir === 'v' ? '세로' : '가로') : '꺼짐', 'band.on'],
  ['title', '제목', S.cover.title.text || S.cover.title.useName ? FONTS.find((f) => f[0] === S.cover.title.font)[1] : '꺼짐', null],
  ['subtitle', '소제목', S.cover.subtitle.on ? S.cover.subtitle.text : '꺼짐', 'subtitle.on'],
  ['plate', '라벨', { paper: '종이 라벨', ribbon: '띠지', none: '없음' }[S.cover.plate], null],
  ['stickers', '스티커', S.cover.stickers.length ? `${S.cover.stickers.length}개` : '없음', null],
]
function coverKindOptions() {
  return segB(S.cover.enabled ? S.cover.kind : 'none', 'coverKind', [['none', '표지 없음'], ['plain', '색 · 패턴'], ['photo', '사진']], 'full')
}
function elementOptions(el) {
  const c = S.cover
  if (el === 'base' && c.kind === 'photo') return `${row('사진', `<label class="chip" style="cursor:pointer">＋ 내 사진<input type="file" accept="image/*" hidden data-file="photo"></label>${PHOTOS.map(([n, g], i) => `<button class="swatch sq ${c.photo === i ? 'on' : ''}" title="${n}" style="background:${g}" data-act="photo" data-v="${i}"></button>`).join('')}`)}<div class="hint" style="padding-left:76px">사진 표지에는 색 · 패턴이 없어요. 제목 · 고무줄 · 스티커만 더해요</div>`
  if (el === 'base') return `${row('바탕색', colorField(c.color, 'cover.color', COVER_COLORS))}
    ${row('패턴', `<div class="row" style="gap:6px">${PATTERNS.map(([v, l]) => chipB(c.pattern.type === v, 'pattern', v, l)).join('')}</div>`)}
    ${c.pattern.type !== 'none' ? row('패턴 색', segB(['dark', 'light'].includes(c.pattern.tone) ? c.pattern.tone : 'custom', 'ptone', [['dark', '어둡게'], ['light', '밝게']])) : ''}`
  if (el === 'band') return `${row('고무줄', `${sw2(c.band.on, 'toggle', 'cover.band.on')}`)}${c.band.on ? `${row('방향', segB(c.band.dir, 'bandDir', [['v', '세로'], ['h', '가로']]))}${row('자리', segB(c.band.pos, 'bandPos', [['near', c.band.dir === 'v' ? '오른쪽' : '아래쪽'], ['center', '가운데']]))}${row('색', colorField(c.band.color, 'cover.band.color', [['네이비', '#7D88B5'], ['흰색', '#FFFFFF'], ['먹색', '#3B3F4A'], ['빨강', '#C8423F'], ['카멜', '#B5835A']]))}` : ''}`
  if (el === 'title') return `${row('글', `<label class="chip ${c.title.useName ? 'on' : ''}" data-act="toggle" data-v="cover.title.useName" style="cursor:pointer">다이어리 이름 쓰기</label>${c.title.useName ? '' : `<input class="input sm" data-text="cover.title.text" value="${h(c.title.text)}" placeholder="표지 제목" maxlength="24">`}`)}
    ${row('글씨체', `<div class="row" style="gap:6px">${FONTS.map(([id, l, css]) => chipB(c.title.font === id, 'tfont', id, l, `style="font-family:${css};${id === 'pen' ? 'font-size:16px' : ''}"`)).join('')}</div>`)}
    ${row('크기', numField(c.title.size, 'cover.title.size', 'pt', 8, 48))}
    ${row('색', colorField(c.title.color, 'cover.title.color', INK_COLORS))}
    ${row('위치', `${anchorGrid(c.title.anchor, 'anchor')}<span class="hint">9곳 중에서 골라요<br>소제목은 제목 아래에 붙어요</span>`)}`
  if (el === 'subtitle') return `${row('소제목', sw2(c.subtitle.on, 'toggle', 'cover.subtitle.on'))}${c.subtitle.on ? `${row('글', `<input class="input sm" data-text="cover.subtitle.text" value="${h(c.subtitle.text)}" maxlength="30">`)}${row('크기', numField(c.subtitle.size, 'cover.subtitle.size', 'pt', 6, 24))}${row('색', colorField(c.subtitle.color, 'cover.subtitle.color', [['회색', '#9A9DA6'], ...INK_COLORS]))}` : ''}`
  if (el === 'plate') return `${row('라벨', segB(c.plate, 'plate', [['paper', '종이 라벨'], ['ribbon', '띠지'], ['none', '없음']]))}<div class="hint" style="padding-left:76px">제목 · 소제목 뒤에 까는 판이에요</div>`
  if (el === 'stickers') return stickerPicker()
  return ''
}
/** 편집기 스티커 보관함과 같은 모양: 찾기 · 묶음 탭 · 격자. 눌러서 붙이고 표지에서 끌어 옮긴다 */
function stickerPicker() {
  const tab = STICKER_TABS.find(([id]) => id === S.stickerTab), q = S.stickerQ.trim()
  const list = q ? [...new Set(STICKER_TABS.flatMap(([, , l]) => l))].filter((n) => n.includes(q)) : tab[2]
  return `<div class="stkpick"><input class="input sm" placeholder="스티커 찾기" data-stickerq value="${h(S.stickerQ)}"><div class="row" style="gap:6px;flex-wrap:nowrap;overflow-x:auto">${STICKER_TABS.map(([id, l]) => chipB(!q && S.stickerTab === id, 'stab', id, l)).join('')}</div>
    <div class="grid g5" style="gap:6px">${list.map((n) => `<button class="tile" style="padding:6px" data-act="addSticker" data-v="${n}"><img src="스티커/${STK_FILE[n] ?? n}.png" style="width:100%;aspect-ratio:1;object-fit:contain" draggable="false"></button>`).join('')}</div>
    <div class="hint">편집기의 스티커 보관함과 같아요. 표지에서 끌어 옮기고, 모서리로 크기를 바꿔요</div></div>`
}
/** 속지: 세로 묶음 목록(4안) + 그 묶음의 속지 */
function groupList(target = 'new') {
  const st = target === 'add' ? S.add : S
  return `<nav class="vcats">${GROUPS.map((g) => `<button class="${st.group === g.id ? 'on' : ''}" data-act="${target === 'add' ? 'addGroup' : 'group'}" data-v="${g.id}"><span class="ic">${g.icon}</span><span><b>${g.name}</b><i>${g.desc}</i></span></button>`).join('')}</nav>`
}
function paperGrid(target = 'new', cols = 2) {
  const st = target === 'add' ? S.add : S
  return `<div class="grid g${cols}" style="gap:10px">${papersIn(st.group).map((p) => `<button class="pcard ${st.paperId === p.id ? 'on' : ''}" style="width:auto" data-act="${target === 'add' ? 'addPaper' : 'paper'}" data-v="${p.id}">${thumb(p, target === 'add' ? addPreviewOpts() : {})}<span class="nm">${p.name} ${badgeOf(p)}</span>${p.sub ? `<span class="sb">${p.sub}</span>` : ''}</button>`).join('')}</div>`
}
/** 2층: 고른 속지에 필요한 옵션만 */
function contextOptions(p = paperById(S.paperId)) {
  const o = optionsFor(p), pr = S.period, out = []
  if (o.period) {
    out.push(row('연도', numField(pr.year, 'period.year', '년', 2024, 2040)))
    out.push(row('시작 달', numField(pr.start, 'period.start', '월', 1, 12)))
    out.push(row('기간', `${numField(pr.months, 'period.months', '개월', 1, 24)}${segB(pr.months, 'months', [[3, '3'], [6, '6'], [12, '12']])}`))
    if (o.weekStart) out.push(row('주 시작', segB(pr.weekStart, 'weekStart', [[1, '월요일'], [0, '일요일']])))
  }
  if (o.count) out.push(row('장수', `${numField(S.count, 'count', '장', 1, 400)}${segB(S.count, 'countPick', COUNT_STEPS.map((n) => [n, String(n)]))}`))
  if (o.dateStamp) out.push(row('날짜', `${sw2(S.dateStamp, 'toggle', 'dateStamp')}<span class="hint">페이지마다 날짜를 미리 적어요</span>`))
  return `<div class="ctx appear"><div class="sec">${o.period ? `📅 ${periodLabel(pr)} · ${plan().length - 1}장` : `${p.name} · ${S.count}장`}</div>${out.join('')}</div>`
}
function styleOptions(p = curPaper(), { scope = S.screen === 'edit' } = {}) {
  const o = optionsFor(p)
  return `${row('종이 색', colorField(S.style.bg, 'style.bg', PAPER_BG))}
    ${o.lineColor ? row('선 · 글씨', colorField(S.style.ink, 'style.ink', PAPER_INK)) : ''}
    ${o.font ? row('글씨체', `<div class="row" style="gap:6px">${PAPER_FONTS.map(([id, l]) => chipB(S.style.font === id, 'sfont', id, l, `style="font-family:${fontCss(id)};${id === 'pen' ? 'font-size:16px' : ''}"`)).join('')}</div>`) : `<div class="hint" style="padding-left:76px">${p.name}에는 인쇄된 글씨가 없어 글씨체가 없어요</div>`}
    ${scope ? row('적용', segB(S.scope, 'scope', [['all', '모든 페이지'], ['new', '새 페이지부터']])) : ''}`
}
/** 새 페이지: 날짜형은 날짜, 아니면 자리 + 장수 */
function addOptions() {
  const a = S.add, p = paperById(a.paperId), out = []
  if (p.type === 'planner') {
    const k = p.kinds[0]
    if (k === 'monthly' || p.set) out.push(row('날짜', `<select data-select="add.month">${Array.from({ length: 14 }, (_, i) => { const m = ((10 + i) % 12) + 1, y = 2026 + Math.floor((10 + i) / 12); return `<option value="${i}" ${a.month === i ? 'selected' : ''}>${y}년 ${m}월부터</option>` }).join('')}</select>${numField(a.months, 'add.months', '개월', 1, 12)}`))
    else if (k.startsWith('weekly')) out.push(row('날짜', `${segB(a.week, 'addWeek', [[0, '다음 주'], [1, '그다음 주']])}${numField(a.weeks, 'add.weeks', '주', 1, 12)}`))
    else out.push(row('날짜', `<span class="pill">10월 24일 (토)부터</span>${numField(a.days, 'add.days', '일', 1, 31)}`))
    out.push(`<div class="hint" style="padding-left:76px">날짜 순서에 맞는 자리에 저절로 들어가요</div>`)
  } else {
    out.push(row('자리', segB(a.pos, 'addPos', [['after', '이 페이지 뒤'], ['end', '맨 끝'], ['before', '이 페이지 앞']])))
    out.push(row('장수', numField(a.count, 'add.count', '장', 1, 50)))
  }
  return `<div class="ctx appear">${out.join('')}</div>`
}
const addSummary = () => { const a = S.add, p = paperById(a.paperId); if (p.type !== 'planner') return `${p.name} ${a.count}장 · ${({ after: '이 페이지 뒤', end: '맨 끝', before: '이 페이지 앞' })[a.pos]}`; const k = p.kinds[0]; return k.startsWith('weekly') ? `${p.name} ${a.weeks}주` : k === 'daily' ? `${p.name} ${a.days}일` : `${p.name} ${a.months}개월` }
const addPreviewOpts = () => { const m0 = 10 + S.add.month; return { year: 2026 + Math.floor(m0 / 12), month: (m0 % 12) + 1, week: S.add.week + 4, day: 24 } }

// ---------- 미리보기: 지금 고치는 것만 ----------
function coverPreview(maxW, maxH) {
  const land = S.orient === 'landscape', w = Math.round(Math.min(maxW, land ? maxH * 4 / 3 : maxH * 3 / 4))
  return coverHTML(coverView(), w, { orient: S.orient, sel: S.sel, interactive: true })
}
function paperPreview(maxW, maxH, kind, o) {
  const land = S.orient === 'landscape', w = Math.round(Math.min(maxW, land ? maxH * 4 / 3 : maxH * 3 / 4))
  return `<div style="width:${w}px" class="paperShadow">${pageBox(kind, paperOpts(o))}</div>`
}
const sectionSummary = (sec) => ({
  basic: `${S.orient === 'landscape' ? '가로' : '세로'} · ${S.name || '이름 없음'}`,
  cover: S.cover.enabled ? (S.cover.kind === 'photo' ? '사진 표지' : '색 · 패턴 표지') : '표지 없음',
  paper: `${curPaper().name}${optionsFor(curPaper()).period ? ' · ' + periodLabel(S.period) : ' · ' + S.count + '장'}`,
  style: `${PAPER_BG.find(([, c]) => c === S.style.bg)?.[0] ?? S.style.bg} · ${PAPER_FONTS.find(([id]) => id === S.style.font)?.[1]}`,
})[sec]
const SECTIONS = () => S.screen === 'add' ? [['paper', '속지', '📄'], ['style', '속지 스타일', '🖋']] : [['basic', '기본', '✏️'], ['cover', '표지', '📕'], ...(S.screen === 'edit' ? [] : [['paper', '속지', '📄']]), ['style', '속지 스타일', '🖋']]

// ---------- 동작 ----------
const ACT = {
  section: (v) => { S.section = v; S.sel = null }, el: (v) => { S.el = v; S.sel = v === 'title' || v === 'subtitle' ? 'title' : null },
  orient: (v) => { S.orient = v },
  coverKind: (v) => { if (v === 'none') { S.cover.enabled = false; return } S.cover.enabled = true; S.cover.kind = v; if (v === 'photo' && S.el === 'base') S.el = 'base'; if (v === 'photo') { S.cover.plate = 'none'; S.cover.title.color = '#FFFFFF' } else if (S.cover.plate === 'none') { S.cover.plate = 'paper'; S.cover.title.color = '#3B3F4A' } },
  pattern: (v) => { S.cover.pattern.type = v }, ptone: (v) => { S.cover.pattern.tone = v },
  photo: (v) => { S.cover.photo = Number(v) },
  bandDir: (v) => { S.cover.band.dir = v }, bandPos: (v) => { S.cover.band.pos = v }, plate: (v) => { S.cover.plate = v },
  tfont: (v) => { S.cover.title.font = v }, anchor: (v) => { S.cover.title.anchor = v },
  toggle: (k) => setK(k, !getK(k)),
  stab: (v) => { S.stickerTab = v; S.stickerQ = '' },
  addSticker: (n) => { const id = 's' + Date.now(); S.cover.stickers.push({ id, name: n, x: 40 + Math.random() * 25, y: 45 + Math.random() * 25, size: 14, rot: 0 }); S.sel = id },
  group: (v) => { S.group = v; S.paperId = papersIn(v)[0].id }, paper: (v) => { S.paperId = v; S.group = paperById(v).group },
  months: (v) => { S.period.months = Number(v) }, weekStart: (v) => { S.period.weekStart = Number(v) }, countPick: (v) => { S.count = Number(v) },
  sfont: (v) => { S.style.font = v }, scope: (v) => { S.scope = v },
  addGroup: (v) => { S.add.group = v; S.add.paperId = papersIn(v)[0].id }, addPaper: (v) => { S.add.paperId = v; S.add.group = paperById(v).group },
  addPos: (v) => { S.add.pos = v }, addWeek: (v) => { S.add.week = Number(v) },
  go: (v) => { enterScreen(v); history.replaceState(null, '', '?screen=' + v) },
  toast: (v) => toast(v),
}
let RENDER = () => {}, RENDER_STAGE = () => RENDER()
document.addEventListener('click', (e) => {
  const st = e.target.closest('[data-step]')
  if (st) { const k = st.dataset.step, v = Math.max(+st.dataset.min, Math.min(+st.dataset.max, Number(getK(k)) + Number(st.dataset.v))); setK(k, v); RENDER(); return }
  const col = e.target.closest('[data-color]')
  if (col) { setK(col.dataset.color, col.dataset.v); RENDER(); return }
  if (e.target.closest('[data-remove]')) { const id = e.target.closest('[data-remove]').dataset.remove; S.cover.stickers = S.cover.stickers.filter((k) => k.id !== id); S.sel = null; RENDER(); return }
  const el = e.target.closest('[data-act]'); if (!el) return
  e.preventDefault(); ACT[el.dataset.act]?.(el.dataset.v); RENDER()
})
document.addEventListener('change', (e) => {
  const t = e.target
  if (t.dataset.num) { setK(t.dataset.num, Math.max(+t.min, Math.min(+t.max, Number(t.value) || +t.min))); RENDER() }
  if (t.dataset.select) { setK(t.dataset.select, Number(t.value)); RENDER() }
  if (t.dataset.hex && /^[0-9a-f]{6}$/i.test(t.value)) { setK(t.dataset.hex, '#' + t.value.toUpperCase()); RENDER() }
  if (t.dataset.pick) { setK(t.dataset.pick, t.value.toUpperCase()); RENDER() }
  if (t.dataset.file === 'photo' && t.files[0]) { const fr = new FileReader(); fr.onload = () => { S.cover.photo = fr.result; RENDER() }; fr.readAsDataURL(t.files[0]) }
})
document.addEventListener('input', (e) => {
  const t = e.target
  if (t.dataset.name != null) { S.name = t.value; RENDER_STAGE() }
  if (t.dataset.text) { setK(t.dataset.text, t.value); RENDER_STAGE() }
  if (t.dataset.stickerq != null) { S.stickerQ = t.value; RENDER(); const i = $('[data-stickerq]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length) }
})
// 표지 위 스티커: 끌어 옮기기 · 모서리로 크기 · 누르면 고르기 (편집기와 같은 손놀림)
let drag = null
document.addEventListener('pointerdown', (e) => {
  const cover = e.target.closest('[data-cover]'); if (!cover || e.target.closest('[data-remove]')) return
  const r = cover.getBoundingClientRect(), rs = e.target.closest('[data-resize]'), part = e.target.closest('[data-part]')?.dataset.part
  if (rs) { const k = S.cover.stickers.find((x) => x.id === rs.dataset.resize); drag = { k, r, sx: e.clientX, size: k.size, mode: 'size' }; return }
  if (part === 'title') { S.sel = 'title'; ACT.el?.('title'); if (S.section !== 'cover') S.section = 'cover'; RENDER(); return }
  if (part) { const k = S.cover.stickers.find((x) => x.id === part); S.sel = part; S.el = 'stickers'; drag = { k, r, sx: e.clientX, sy: e.clientY, x: k.x, y: k.y, mode: 'move' }; RENDER(); return }
  S.sel = null; RENDER()
})
window.addEventListener('pointermove', (e) => {
  if (!drag) return
  if (drag.mode === 'size') drag.k.size = Math.max(6, Math.min(50, drag.size + (e.clientX - drag.sx) / drag.r.width * 60))
  else { drag.k.x = Math.max(0, Math.min(100, drag.x + (e.clientX - drag.sx) / drag.r.width * 100)); drag.k.y = Math.max(0, Math.min(100, drag.y + (e.clientY - drag.sy) / drag.r.height * 100)) }
  RENDER_STAGE()
})
window.addEventListener('pointerup', () => { if (drag) { drag = null; RENDER() } })
const switcher = (concept) => `<nav class="switcher"><span class="lbl">${concept}</span>${[['create', '새 다이어리'], ['edit', '다이어리 수정'], ['add', '새 페이지']].map(([v, l]) => `<a href="#" class="${S.screen === v ? 'on' : ''}" data-act="go" data-v="${v}">${l}</a>`).join('')}</nav>`
const topbar = () => { const t = { create: '새 다이어리', edit: '다이어리 수정', add: '새 페이지' }[S.screen], p = { create: '만들기', edit: '저장', add: '추가' }[S.screen]; return `<header class="topbar"><button class="cancel" data-act="toast" data-v="취소했어요. (시안)">취소</button><span class="ttl">${t}</span><div class="grow"></div><button class="btn primary" style="width:150px" data-act="toast" data-v="${p}했어요. (시안)">${p}</button></header>` }
