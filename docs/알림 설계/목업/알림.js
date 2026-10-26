// DIO 알림 시안 공용 — 리스트 화면 · 종 버튼 · 알림 모달(안에서 '공유 요청'으로 넘어감)
// 각 안 HTML 이 window.V(배치 설정)를 정하고 이 파일을 불러온다.
const Q = new URLSearchParams(location.search)
const st = { open: Q.has('open'), view: Q.get('view') || 'main', rail: Q.get('rail') === 'open' ? 'expanded' : 'collapsed', phone: Q.has('phone'), empty: Q.has('empty'), filter: 'all', accepted: new Set(), declined: new Set(), read: false }

// ---------- 아이콘 (Icon.js 와 같은 규칙: 24 격자, 선 1.8, 둥근 끝) ----------
const P = {
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.6 2H4.9Z"/><path d="M10 20.2a2.1 2.1 0 0 0 4 0"/>',
  chevL: '<path d="M14.5 5 7.5 12l7 7"/>', chevR: '<path d="M9.5 5l7 7-7 7"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M6 4.5h10.5A1.5 1.5 0 0 1 18 6v13H7.5A1.5 1.5 0 0 0 6 20.5v-16Z"/><path d="M6 4.5v16M9 8h6"/>',
  star: '<path d="m12 3.8 2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8Z"/>',
  person: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.6-3.6 3.1-5.6 6.5-5.6s5.9 2 6.5 5.6"/>',
  trash: '<path d="M5.5 7.5h13M9 7.5V5.3c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v2.2M7.4 7.5 8.2 20h7.6l.8-12.5"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5"/><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.3c1.8.6 3 2.2 3.3 4.7"/>',
  personPlus: '<circle cx="10" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 3.1-5.6 6.5-5.6 1.5 0 2.8.4 3.9 1.1M18 13v6M15 16h6"/>',
  pen: '<path d="m5 19 3.7-.8L19 7.9a2.1 2.1 0 0 0-3-3L5.8 15.2 5 19Z"/>',
  heart: '<path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4Z"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M16 7l2 2M14 9l1.5 1.5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>', door: '<path d="M14 4H6.5v16H14M10 12h10M17 9l3 3-3 3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.8"/><path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', swap: '<path d="M5 8h12M14 5l3 3-3 3M19 16H7M10 13l-3 3 3 3"/>', grid: '<rect x="4.5" y="4.5" width="6" height="6" rx="1"/><rect x="13.5" y="4.5" width="6" height="6" rx="1"/><rect x="4.5" y="13.5" width="6" height="6" rx="1"/><rect x="13.5" y="13.5" width="6" height="6" rx="1"/>',
  inbox: '<path d="M4 13.5 6.5 5h11l2.5 8.5V19H4Z"/><path d="M4 13.5h4.5l1 2h5l1-2H20"/>',
}
const I = (n, s = 20, c = 'currentColor', w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${P[n]}</svg>`

// ---------- 데이터 (공유 다이어리 앱에 맞춘 알림 종류) ----------
const PEOPLE = { 하루: '#F6D3C4', 모아: '#CFE3D3', 소연: '#D9D0F0', 지수: '#F3E2B4' }
const REQUESTS = [
  { id: 'r1', who: '하루', diary: '여름 교환일기', color: '#F0B0AA', pattern: 'dot', perm: '편집 가능', members: 3, when: '10분 전' },
  { id: 'r2', who: '모아', diary: '직관 다이어리', color: '#2F6B4F', pattern: 'stripe', perm: '보기 가능', members: 5, when: '2시간 전' },
  { id: 'r3', who: '지수', diary: '우리 반 앨범', color: '#C3AEDD', pattern: 'linen', photo: 0, perm: '편집 가능', members: 12, when: '어제' },
]
const TYPE = { join: ['personPlus', '#6E92C6'], page: ['pen', '#4F74AE'], sticker: ['heart', '#E5484D'], perm: ['key', '#B4501B'], export: ['download', '#2F6B4F'], leave: ['door', '#596875'], link: ['link', '#6E92C6'] }
const NOTIFS = [
  { g: '오늘', who: '모아', type: 'join', text: '<b>모아</b>님이 <b>메모장</b> 초대를 수락했어요.', when: '5분 전', unread: true, thumb: ['cover', '#9DABD8'] },
  { g: '오늘', who: '하루', type: 'page', text: '<b>하루</b>님 외 1명이 <b>2026 다이어리</b>에 페이지 3장을 더했어요.', when: '1시간 전', unread: true, thumb: ['page', 'diary'], batch: true },
  { g: '오늘', who: '소연', type: 'sticker', text: '<b>소연</b>님이 내 페이지에 스티커 2개를 붙였어요.', when: '3시간 전', unread: true, thumb: ['page', 'scrap'] },
  { g: '이번 주', who: '소연', type: 'perm', text: '<b>소연</b>님이 <b>메모장</b>에서 내 권한을 <b>편집 가능</b>으로 바꿨어요.', when: '화요일', thumb: ['cover', '#9DABD8'] },
  { g: '이번 주', who: '소연', type: 'export', text: '<b>메모장</b>에서 내보내기를 허용했어요. 이제 이미지·PDF로 저장할 수 있어요.', when: '월요일', thumb: ['cover', '#9DABD8'] },
  { g: '이전', who: '지수', type: 'link', text: '초대 링크로 2명이 <b>위클리 플래너</b>에 들어왔어요.', when: '10월 12일', thumb: ['page', 'weekly'] },
  { g: '이전', who: '모아', type: 'leave', text: '<b>모아</b>님이 <b>위클리 플래너</b>에서 나갔어요.', when: '10월 9일', thumb: ['page', 'weekly'] },
]
const pending = () => REQUESTS.filter((r) => !st.accepted.has(r.id) && !st.declined.has(r.id))
const unreadCount = () => (st.read ? 0 : NOTIFS.filter((n) => n.unread).length) + pending().length

// ---------- 조각 ----------
const ava = (who, size = 40, type) => `<div class="ava" style="width:${size}px;height:${size}px;background:${PEOPLE[who] ?? '#EEF2F9'};font-size:${Math.round(size * .36)}px">${who[0]}${type ? `<span class="type" style="background:${TYPE[type][1]}">${I(TYPE[type][0], 11, '#fff', 2.4)}</span>` : ''}</div>`
const miniCover = (r, w = 44) => coverHTML({ color: r.color, pattern: r.pattern, photo: r.photo ?? null, title: ' ', style: 'none', stickers: [], band: true }, w)
const thumbOf = (n) => n.thumb[0] === 'cover' ? `<div style="width:40px">${coverHTML({ color: n.thumb[1], pattern: 'linen', title: ' ', style: 'none', stickers: [] }, 40)}</div>` : `<div class="pthumb">${pageSVG(n.thumb[1], { month: 10, year: 2026, day: 23 })}</div>`
const badge = (n, cls = '') => n ? `<span class="dot ${cls}">${n > 9 ? '9+' : n}</span>` : ''

function requestEntry() {
  const list = pending()
  if (!list.length) return ''
  const kind = V.request
  if (kind === 'stories') return `<div data-mark="2"><div class="row" style="padding:6px 8px 8px"><b style="font-size:14px">새로 공유받은 다이어리</b><span class="count">${list.length}</span><div class="grow"></div><button class="textbtn" data-go="req">모두 보기 ›</button></div>
    <div class="row" style="gap:14px;overflow:auto;padding:4px 8px 12px">${list.map((r) => `<button data-go="req" style="display:flex;flex-direction:column;align-items:center;gap:6px;width:84px">${miniCover(r, 70)}<span style="font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:84px">${r.diary}</span><span class="hint" style="margin-top:-4px">${r.who}님</span></button>`).join('')}</div></div>`
  if (kind === 'banner') return `<button class="reqrow" data-go="req" data-mark="2" style="background:linear-gradient(120deg,#DCE6F6,#EEF2F9 70%);padding:14px 16px">
      <div style="position:relative;width:92px;height:62px;flex:none">${list.slice(0, 3).map((r, i) => `<div style="position:absolute;left:${i * 22}px;top:${i % 2 ? 6 : 0}px;transform:rotate(${(i - 1) * 6}deg)">${miniCover(r, 44)}</div>`).join('')}</div>
      <div class="grow"><div style="font-weight:800;font-size:14.5px">새로 공유받은 다이어리 ${list.length}개</div><div class="hint" style="margin-top:3px">${list[0].who}님 외 ${list.length - 1}명이 함께 쓰자고 했어요</div></div><span class="btn small primary">확인하기</span></button>`
  // 기본: 인스타그램 '팔로우 요청'처럼 한 줄
  const covers = V.request === 'covers'
  return `<button class="reqrow" data-go="req" data-mark="2">
      <div class="stack">${list.slice(0, 3).map((r) => covers ? miniCover(r, 34) : ava(r.who, 36)).join('')}</div>
      <div class="grow"><div style="font-weight:800;font-size:14px">공유 요청</div><div class="hint" style="margin-top:2px">${list[0].who}님 외 ${list.length - 1}명이 다이어리를 함께 쓰자고 했어요</div></div>
      <span class="count">${list.length}</span>${I('chevR', 18, 'rgba(11,25,87,.5)')}</button>`
}
function mainView() {
  const groups = ['오늘', '이번 주', '이전']
  const list = st.empty ? [] : NOTIFS.filter((n) => st.filter === 'all' || (n.unread && !st.read))
  const rows = groups.map((g) => { const items = list.filter((n) => n.g === g); return items.length ? `<div class="group">${g}</div>${items.map((n) => `<button class="nrow ${n.unread && !st.read ? 'unread' : ''}" data-toast="다이어리를 열어 그 페이지로 가요. (시안)">${ava(n.who, V.density === 'compact' ? 34 : 40, n.type)}<div class="grow"><div class="txt">${n.text}</div><div class="time">${n.when}</div></div>${thumbOf(n)}</button>`).join('')}` : '' }).join('')
  const empty = `<div class="empty"><div class="ill">${I('bell', 32, 'rgba(11,25,87,.45)')}</div><b style="font-size:15px">새 알림이 없어요</b><div class="hint">친구가 다이어리를 꾸미거나 나를 초대하면 여기에 알려 드려요.</div></div>`
  const filter = V.filters ? `<div class="row" style="padding:2px 8px 6px"><button class="chip ${st.filter === 'all' ? 'on' : ''}" data-filter="all">전체</button><button class="chip ${st.filter === 'unread' ? 'on' : ''}" data-filter="unread">읽지 않음</button></div>` : ''
  return `<div class="mhead">${V.headIcon ? `<div class="iconbtn" style="background:var(--plate)">${I('bell', 20)}</div>` : ''}<h1 class="grow">알림</h1><button class="textbtn" data-act="readAll" ${st.read ? 'style="opacity:.4"' : ''}>모두 읽음</button><button class="iconbtn" data-act="close" aria-label="알림 닫기">${I('close', 20)}</button></div>
    <div class="mbody">${st.empty ? '' : requestEntry()}${filter}<div data-mark="3">${rows || empty}</div></div>`
}
function reqView() {
  const list = REQUESTS.filter((r) => !st.declined.has(r.id))
  const card = (r) => st.accepted.has(r.id)
    ? `<div class="invite" style="background:#F6F8FC">${miniCover(r, 54)}<div class="grow"><div style="font-weight:800;font-size:14px">${r.diary}</div><div class="hint" style="margin-top:3px">${I('check', 14, '#2F6B4F', 2.4).replace('display:block', 'display:inline-block;vertical-align:-2px')} 보관함에 넣었어요</div></div><button class="btn small ghost" data-toast="${r.diary}를 열어요. (시안)">열기</button></div>`
    : `<div class="invite">${miniCover(r, 54)}<div class="grow"><div class="txt" style="font-size:13px;font-weight:600;line-height:1.45"><b>${r.who}</b>님이 함께 쓰자고 했어요</div><div style="font-weight:800;font-size:14.5px;margin-top:2px">${r.diary}</div><div class="row" style="margin-top:6px;gap:6px"><span class="perm ${r.perm === '보기 가능' ? 'ro' : ''}">${r.perm}</span><span class="hint">${r.members}명이 쓰는 중 · ${r.when}</span></div></div>
       <div class="row acts" style="gap:6px;flex:none"><button class="btn small ghost" data-act="decline" data-id="${r.id}">거절</button><button class="btn small primary" data-act="accept" data-id="${r.id}">수락</button></div></div>`
  const grid = V.reqLayout === 'grid'
  const body = !list.length || st.empty ? `<div class="empty"><div class="ill">${I('inbox', 32, 'rgba(11,25,87,.45)')}</div><b style="font-size:15px">받은 공유 요청이 없어요</b><div class="hint">친구가 다이어리에 초대하면 여기에 모여요.</div></div>`
    : grid ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">${list.map((r) => `<div class="invite" style="flex-direction:column;align-items:stretch;margin:0;padding:14px">${'<div style="display:flex;justify-content:center;padding:6px 0 4px">' + miniCover(r, 96) + '</div>'}<div style="font-weight:800;font-size:14px;margin-top:6px">${r.diary}</div><div class="hint">${r.who}님 · ${r.members}명 · <span class="perm ${r.perm === '보기 가능' ? 'ro' : ''}">${r.perm}</span></div>${st.accepted.has(r.id) ? `<button class="btn small ghost" style="margin-top:8px">${I('check', 14, '#2F6B4F', 2.4)} 보관함에 넣었어요</button>` : `<div class="row" style="margin-top:8px"><button class="btn small ghost grow" data-act="decline" data-id="${r.id}">거절</button><button class="btn small primary grow" data-act="accept" data-id="${r.id}">수락</button></div>`}</div>`).join('')}</div>`
    : list.map(card).join('')
  return `<div class="mhead"><button class="iconbtn" data-go="main" aria-label="알림으로 돌아가기" data-mark="4">${I('chevL', 22)}</button><div class="grow"><h1 style="font-size:20px">공유 요청</h1><div class="sub">수락하면 내 보관함에 들어가요. 거절해도 상대에게 알리지 않아요.</div></div><button class="iconbtn" data-act="close" aria-label="알림 닫기">${I('close', 20)}</button></div>
    <div class="mbody" data-mark="5">${body}</div>`
}

// ---------- 리스트 화면 ----------
function bellButton(where) {
  const n = unreadCount()
  if (where === 'item') return `<button class="item ${st.open ? 'on' : ''}" data-act="bell" aria-label="알림" data-mark="1">${I('bell', 20)}<span class="lbl grow" style="text-align:left">알림</span>${n ? `<span class="xonly count">${n}</span>` : ''}${n ? `<span class="conly dot" style="right:2px;top:4px">${n}</span>` : ''}</button>`
  return `<button class="railBtn ${st.open ? 'on' : ''}" data-act="bell" aria-label="알림${n ? ` ${n}개` : ''}" data-mark="1">${I('bell', 22)}${badge(n)}</button>`.replace('class="dot "', 'class="dot" style="right:4px;top:4px"')
}
function rail() {
  const ex = st.rail === 'expanded', b = V.bell
  const logo = `<svg width="${32 * 746 / 836}" height="32" viewBox="6 -16 746 836" fill="none"><path d="M431 106C408 96 383 94 350 94H72V754H350C534 754 686 622 686 424C686 357 664 297 624 251" stroke="#242424" stroke-width="132" stroke-linecap="round" stroke-linejoin="round"/><rect x="218" y="356" width="277" height="44" rx="22" fill="#242424"/><rect x="218" y="452" width="195" height="44" rx="22" fill="#242424"/><circle cx="607" cy="74" r="90" fill="#9FB6D9"/></svg>`
  const toggle = `<button class="railBtn" data-act="rail" aria-label="${ex ? '메뉴 접기' : '메뉴 펼치기'}">${I('menu', 24)}</button>`
  const head = ex
    ? `<div class="brandRow">${logo}<div class="row" style="gap:2px">${b === 'top' ? bellButton() : ''}${toggle}</div></div>`
    : `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px">${toggle}${b === 'top' ? bellButton() : ''}</div>`
  const create = `<button class="create" data-toast="새 다이어리 (시안)" style="${ex ? '' : 'width:48px'}">${I('plus', 21, '#fff')}${ex ? '<span>새 다이어리</span>' : ''}</button>`
  const createRow = b === 'create' ? `<div class="row" style="gap:8px;${ex ? '' : 'flex-direction:column'}">${ex ? `<div class="grow">${create}</div>` : create}${bellButton()}</div>` : create
  const item = (icon, label, on) => `<button class="item ${on ? 'on' : ''}">${I(icon, 20)}<span class="lbl">${label}</span></button>`
  const news = b === 'item' ? `<div class="section">소식</div>${bellButton('item')}` : ''
  const bottom = b === 'bottom' ? `<div style="margin-top:auto;display:flex;${ex ? 'gap:8px;align-items:center' : 'flex-direction:column;gap:6px'}">${bellButton()}${ex ? '<span style="font-weight:700;color:var(--muted)">알림</span>' : ''}</div>` : ''
  return `<aside class="rail ${st.rail}">${head}${createRow}${news}<div class="section">보관함</div>${item('book', '모든 다이어리', true)}${item('star', '즐겨찾기')}${item('person', '내 공간')}${item('trash', '휴지통')}${bottom}</aside>`
}
function library() {
  const covers = [
    { t: '테스트', c: '#9DABD8', p: 'linen' }, { t: '메모장', c: '#474F55', p: 'leather', shared: 3 }, { t: '2026 다이어리', c: '#EBC56F', p: 'gingham', shared: 2 },
  ]
  return `<main class="main"><div class="row"><div class="title grow">모든 다이어리</div><div class="row" style="background:rgba(255,255,255,.72);border-radius:16px;padding:4px"><span class="chip on" style="height:36px;border:0;box-shadow:0 1px 3px rgba(11,25,87,.14)">${I('swap', 16)} 스와이프</span><span class="chip" style="background:none">${I('grid', 16)} 한눈에</span></div></div>
    <div class="chips"><span class="chip on">모든 다이어리</span><span class="chip">즐겨찾기</span></div>
    <div class="shelf">${covers.map((d, i) => `<div class="card" style="opacity:${i === 1 ? 1 : .55};transform:scale(${i === 1 ? 1.04 : .86})">${coverHTML({ color: d.c, pattern: d.p, title: d.t, meta: 'DIARY · 2026', style: 'label', font: 'gothic', tcolor: '#3B3F4A', stickers: [] }, i === 1 ? 238 : 200)}<div class="row">${d.t}${d.shared ? `<span class="shared">${I('users', 14)} ${d.shared}명</span>` : ''}</div></div>`).join('')}</div></main>`
}
function phone() {
  const n = unreadCount()
  const tabs = [['book', '다이어리', true], ['star', '즐겨찾기'], ['person', '내 공간'], ['trash', '휴지통']]
  if (V.phoneBell === 'tab') tabs.splice(3, 0, ['bell', '알림'])
  return `<div class="phone"><div style="padding:22px 18px"><div class="row"><div class="title grow" style="font-size:30px;margin:0">모든 다이어리</div>${V.phoneBell === 'header' ? `<button class="railBtn" style="background:#fff;box-shadow:var(--card)" data-act="bell" aria-label="알림" data-mark="1">${I('bell', 22)}${n ? `<span class="dot" style="right:2px;top:2px">${n}</span>` : ''}</button>` : ''}</div>
    <div class="chips" style="margin-top:14px"><span class="chip on">모든 다이어리</span><span class="chip">즐겨찾기</span></div>
    <div style="display:flex;justify-content:center;margin-top:90px">${coverHTML({ color: '#474F55', pattern: 'leather', title: '메모장', meta: 'DIARY · 2026', style: 'label', font: 'gothic', tcolor: '#3B3F4A', stickers: [] }, 200)}</div></div>
    <div class="tabbar">${tabs.map(([ic, l, on]) => `<div class="${on ? 'on' : ''}" ${ic === 'bell' ? 'data-act="bell" data-mark="1" style="position:relative;cursor:pointer"' : ''}>${I(ic, 20)}${l}${ic === 'bell' && n ? `<span class="dot" style="right:14px;top:4px">${n}</span>` : ''}</div>`).join('')}</div>
    ${st.open ? `<div class="scrim" style="position:absolute" data-act="close"></div><div class="sheet narrow"><div class="grab"></div><div class="views">${views()}</div></div>` : ''}</div>`
}
const views = () => `<div class="view ${st.view === 'main' ? '' : 'off-left'}">${mainView()}</div><div class="view ${st.view === 'req' ? '' : 'off-right'}">${reqView()}</div>`
function modal() {
  if (!st.open) return ''
  const railW = st.rail === 'expanded' ? 218 : 78, c = V.container
  const box = c === 'popover' ? `left:${railW + 12}px;top:16px;bottom:16px;width:440px;border-radius:24px`
    : c === 'side' ? 'right:0;top:0;bottom:0;width:460px;border-radius:28px 0 0 28px'
      : `left:50%;top:50%;width:${V.width ?? 560}px;height:${V.height ?? 680}px;max-height:calc(100vh - 48px);transform:translate(-50%,-50%)`
  const arrow = c === 'popover' ? `<div style="position:fixed;z-index:22;left:${railW + 5}px;top:${V.bell === 'item' ? (st.rail === 'expanded' ? 216 : 190) : 130}px;width:14px;height:14px;background:#fff;transform:rotate(45deg);border-radius:2px"></div>` : ''
  return `<div class="scrim" data-act="close" style="${c === 'popover' ? 'background:rgba(11,25,87,.12)' : ''}"></div>${arrow}<div class="modal ${c === 'center' ? '' : 'narrow'}" role="dialog" aria-label="알림" style="${box}${c === 'center' ? ';animation:none' : ''}"><div class="views">${views()}</div></div>`
}
function render() {
  document.body.innerHTML = st.phone
    ? `<div style="display:grid;place-items:center;height:100vh;background:#E9EBF0">${phone()}</div>`
    : `<div class="app">${rail()}${library()}</div>${modal()}`
  document.body.insertAdjacentHTML('beforeend', `<div class="toast" id="toast"></div><div class="vnote" ${Q.has('shot') ? 'hidden' : ''}>${V.name} · 종을 누르고, 맨 위 줄을 눌러 보세요 · <a href="?phone=1" style="color:inherit">폰</a> · <a href="?" style="color:inherit">태블릿</a></div>`)
  if (Q.has('mark')) setTimeout(marks, 350)
}
function marks() {
  const allow = (Q.get('mark') || '').split(',').filter(Boolean)
  for (const el of document.querySelectorAll('[data-mark]')) {
    const n = el.dataset.mark; if (allow.length && !allow.includes(n)) continue
    let r = el.getBoundingClientRect(); if (!r.width) continue
    if (el.closest('.view.off-left, .view.off-right')) continue
    // 스크롤 안에 있으면 보이는 만큼만 표시
    const clip = el.closest('.mbody')?.getBoundingClientRect()
    if (clip) { const top = Math.max(r.top, clip.top + 4), bottom = Math.min(r.bottom, clip.bottom - 4); r = { left: r.left, width: r.width, top, height: bottom - top } }
    const m = document.createElement('div'); m.className = 'mk'; Object.assign(m.style, { left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px' })
    const b = document.createElement('div'); b.className = 'mkn'; b.textContent = n; Object.assign(b.style, { left: Math.max(2, r.left - 15) + 'px', top: Math.max(2, r.top - 15) + 'px' })
    document.body.append(m, b)
  }
}
let tt
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2000) }
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'), act = e.target.closest('[data-act]'), f = e.target.closest('[data-filter]'), ts = e.target.closest('[data-toast]')
  if (go) { st.view = go.dataset.go; return render() }
  if (f) { st.filter = f.dataset.filter; return render() }
  if (act) {
    const a = act.dataset.act, id = act.dataset.id
    if (a === 'bell') { st.open = !st.open; st.view = 'main' }
    if (a === 'close') st.open = false
    if (a === 'rail') st.rail = st.rail === 'expanded' ? 'collapsed' : 'expanded'
    if (a === 'readAll') { st.read = true; toast('모든 알림을 읽었어요.') }
    if (a === 'accept') { st.accepted.add(id); toast('보관함에 넣었어요.') }
    if (a === 'decline') { st.declined.add(id); toast('요청을 거절했어요.') }
    render(); return
  }
  if (ts) toast(ts.dataset.toast)
})
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) { if (st.view !== 'main') st.view = 'main'; else st.open = false; render() } })
window.addEventListener('load', () => { render(); document.body.dataset.ready = '1' })
