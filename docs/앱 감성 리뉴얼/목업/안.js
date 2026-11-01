// A · B · C 안 장면 (코덱스 명세 2026-10-31). 틀(레일 · 탭 · 제목 자리)은 화면.js 의 지금 앱과 같고, 값 · 장식만 바꾼다.
// 좌표는 코덱스 값을 따르되 오른쪽 여백이 어긋나는 곳은 지금 앱 여백(30)에 맞췄다. 표지는 앱 표지 비율(185:246)을 지켰다. — 내 판단
SKINS.A = { cls: 'a' }; SKINS.B = { cls: 'b' }; SKINS.C = { cls: 'c' }

const NOW = { ...SCREENS }
const ch = (w) => Math.round(w * 246 / 185)
const dim = (html, o) => `<div style="opacity:${o}">${html}</div>`
const GRAIN = '<div class="grain"></div>'
const card = (x, y, w, h, html = '', style = '') => `<div class="card" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${style}">${html}</div>`
const T_ = (s) => (s === 'A' ? 0 : s === 'B' ? 1 : 2)

// ---------- 로그인 · 가입 ----------
function authBody(kind, skin, signup) {
  const tab = isT(kind)
  const px = tab ? 40 : 32
  const fieldGap = signup ? 14 : tab ? 22 : 18
  const f = (label, ph, eye) => `<div class="flabel" style="margin-top:${fieldGap}px;margin-bottom:10px">${label}</div><div class="field">${ph}${eye ? icon('eye', 22, '#0B1766') : ''}</div>`
  const fields = signup
    ? `${f('이메일', '이메일을 입력해 주세요').replace(`margin-top:${fieldGap}px`, 'margin-top:0')}${f('비밀번호', '비밀번호를 입력해 주세요', 1)}${f('비밀번호 확인', '비밀번호를 다시 입력해 주세요', 1)}<div class="btn off" style="margin-top:16px">다음</div>`
    : `${f('이메일', '이메일을 입력해 주세요').replace(`margin-top:${fieldGap}px`, 'margin-top:0')}${f('비밀번호', '비밀번호를 입력해 주세요', 1)}<div class="btn off" style="margin-top:18px">로그인</div>`
  const tail = signup
    ? `<div style="margin-top:auto;padding-bottom:26px;text-align:center;font-size:13.5px;font-weight:700;color:var(--muted)">이미 계정이 있나요? <b style="color:var(--text);font-weight:800;margin-left:4px">로그인 화면으로</b></div>`
    : `<div class="links" style="margin-top:22px">아이디 찾기<i></i>비밀번호 찾기<i></i>회원가입</div>
       <div class="divider" style="margin-top:26px">간편 로그인</div>
       <div class="social" style="margin-top:20px"><div class="sc">${SOC.kakao}카카오</div><div class="sc">${SOC.google}구글</div><div class="sc">${SOC.apple}애플</div></div>
       <div class="guest" style="margin-top:22px">게스트로 시작하기</div>`
  const top = signup ? `<div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;padding-top:22px;margin-left:8px">${icon('chevL', 20, '#0B1766')}시작 화면</div>` : ''
  const logoH = 53
  return `<div style="position:absolute;inset:0;padding:${signup ? 0 : tab ? 44 : 36}px ${px}px 0;display:flex;flex-direction:column">
    ${top}
    <div style="display:flex;justify-content:center;margin-top:${signup ? 14 : 0}px">${logo(logoH)}</div>
    <div style="text-align:center;margin-top:18px;margin-bottom:${tab ? 28 : 22}px"><div style="font-size:${tab ? 24 : 22}px;font-weight:800;letter-spacing:-.4px">${signup ? '나만의 기록을 시작해요' : 'DIO에 오신 걸 환영해요'}</div></div>
    ${fields}${tail}</div>`
}
function authS(kind, skin, signup) {
  const tab = isT(kind)
  const S = skin
  const g = tab
    ? { A: [376, 52, 528, 696, 22], B: [376, 52, 528, 696, 26], C: [390, 60, 500, 680, 16] }[S]
    : signup
      ? { A: [18, 108, 354, 628, 28], B: [18, 108, 354, 628, 26], C: [18, 112, 354, 620, 16] }[S]
      : { A: [18, 96, 354, 656, 28], B: [18, 96, 354, 656, 26], C: [18, 100, 354, 648, 16] }[S]
  const [x, y, w, h, r] = g
  const bg = S === 'A' ? 'background:linear-gradient(135deg,#FFFFFF 0%,#F3F3F7 68%)' : S === 'B' ? 'background:radial-gradient(circle at 28% 10%,rgba(219,220,249,.34),transparent 28%),#F3F3F7' : ''
  const sh = S === 'A' ? '0 10px 26px rgba(11,23,102,.10)' : S === 'B' ? '0 10px 24px rgba(11,23,102,.11)' : '0 4px 12px rgba(11,23,102,.07)'
  const c = card(x, y, w, h, authBody(kind, S, signup), `border-radius:${r}px;box-shadow:${sh}`)
  let deco = ''
  if (S === 'A') deco = tab ? PROP('tape-butter', 88, -5, 'left:445px;top:30px;opacity:.7;z-index:5') : PROP('tape-butter', 84, -5, `left:236px;top:${y - 22}px;opacity:.7;z-index:5`)
  if (S === 'B') deco = tab
    ? PROP('polaroid-sky', 58, -8, 'left:328px;top:73px;opacity:.55;z-index:5') + PROP('tape-lavender', 50, -8, 'left:342px;top:58px;opacity:.62;z-index:6')
    : PROP('polaroid-sky', 54, -8, `left:2px;top:${y + 4}px;opacity:.55;z-index:5`) + PROP('tape-lavender', 46, -8, `left:14px;top:${y - 10}px;opacity:.62;z-index:6`)
  return shell(kind, S, `${S === 'A' ? GRAIN : ''}${c}${deco}`, { bare: true, under: bg ? `<div style="position:absolute;inset:0;${bg}"></div>` : '' })
}

// ---------- 홈 ----------
function homeHeadS(kind, skin) {
  const tab = isT(kind)
  const ib = skin === 'C' ? 48 : 52
  return `<div class="h-title" style="${tab ? 'top:44px' : ''}">모든 다이어리</div>
    <div class="segsw"><div class="on">${icon('swap', 18, '#0B1766')}${tab ? '스와이프' : ''}</div><div>${icon('grid', 18, 'rgba(11,23,102,.68)')}${tab ? '한눈에' : ''}</div></div>
    <div class="chips" style="${tab ? 'top:106px' : 'top:72px'}"><div class="on">모든 다이어리</div><div>즐겨찾기</div><div>내 다이어리</div><div>공유 다이어리</div></div>
    ${tab ? `<div class="ib" style="right:${30 + ib + 10}px;top:${skin === 'C' ? 106 : 104}px">${icon('search', 22, '#0B1766')}</div><div class="ib" style="right:30px;top:${skin === 'C' ? 106 : 104}px">${icon('more', 22, '#0B1766')}</div>`
      : `<div class="ib" style="left:18px;top:128px">${icon('search', 22, '#0B1766')}</div><div class="ib" style="left:${18 + ib + 10}px;top:128px">${icon('more', 22, '#0B1766')}</div>`}
    <div class="fab">${icon('plus', 28, '#fff', { sw: 2 })}</div>`
}
// B: 흰 테두리 6px 인화 프레임
function framedCover(d, x, y, w, { lift = 0, avatars = false } = {}) {
  const bw = 6, inner = w - bw * 2, hh = ch(inner) + bw * 2
  const av = avatars ? [['#DBDCF9', '지'], ['#FEF0BF', '하'], ['#ABB1D8', '민']].map((a, i) => `<div style="position:absolute;left:${bw + 12 + i * 16}px;bottom:${bw + 12}px;width:24px;height:24px;border-radius:50%;background:${a[0]};border:2px solid #fff;display:grid;place-items:center;font-size:10px;font-weight:800;color:#0B1766;z-index:7">${a[1]}</div>`).join('') : ''
  return `<div class="pol-frame" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px;border-radius:20px;${lift ? 'box-shadow:0 14px 26px rgba(11,23,102,.16)' : ''}"><div style="position:absolute;left:${bw}px;top:${bw}px">${cover(d, inner, { lift: 2 })}</div>${av}</div>`
}
function dlabel(x, y, d, big, tab) {
  return `<div class="dlabel" style="left:${x}px;top:${y}px"><b style="font-size:${big ? (tab ? 18 : 20) : 17}px;font-weight:800;line-height:24px">${d.title}</b><span style="font-size:${tab ? 14 : 15}px;font-weight:600;line-height:20px">1페이지</span></div>`
}
function homeS(kind, skin, state) {
  const tab = isT(kind)
  const [a, b, c] = [byId('read'), byId('memo'), byId('weekly')]
  let objs = ''
  if (state === 'empty') {
    // 빈 책상: 캐릭터(버터 + 라벤더)가 색 규칙에 가장 자연스러운 그림이다. 코덱스 명세 2026-10-31(색 규칙 v2)
    const cx = tab ? 601 : 195, cw = tab ? 230 : 200, chh = Math.round(cw * 2540 / 4310)
    let ty = 450
    if (skin === 'A') { objs = CHAR('둘이', cw, `left:${cx - cw / 2}px;top:320px`) + PROP('tape-butter', 64, -6, `left:${cx + cw / 2 - 58}px;top:312px;opacity:.9`); ty = 320 + chh + 30 }
    else if (skin === 'B') { objs = `<div class="pol-frame" style="left:${cx - cw / 2 - 14}px;top:304px;width:${cw + 28}px;height:${chh + 60}px;border-radius:6px;transform:rotate(-2deg)">${CHAR('둘이', cw, 'left:14px;top:14px')}</div>` + PROP('tape-lavender', 56, -4, `left:${cx - 28}px;top:292px;z-index:5`); ty = 304 + chh + 60 + 24 }
    else { objs = CHAR('디오', 96, `left:${cx - 48}px;top:318px`) + `<div style="position:absolute;left:${cx - 60}px;top:${318 + Math.round(96 * 2540 / 2330) + 10}px;width:120px;height:1px;background:#ABB1D8"></div>`; ty = 450 }
    objs += `<div class="empty-title" style="left:${cx - 100}px;width:200px;top:${ty}px">다이어리가 없어요</div>`
  } else if (tab) {
    if (skin === 'B') {
      objs = framedCover(a, 131, 220, 220) + framedCover(c, 851, 220, 220) + framedCover(b, 471, 180, 260, { lift: 1, avatars: true })
        + PROP('tape-lavender', 56, 4, 'left:514px;top:170px;opacity:.7;z-index:9')
        + dlabel(131, 540, a, 1, 1) + dlabel(851, 540, c, 1, 1) + dlabel(471, 556, b, 1, 1)
    } else if (skin === 'C') {
      const w = 212, hh = ch(w)
      objs = [[185, a], [495, b], [805, c]].map(([x, d]) => at(x, 218, cover(d, w, { lift: 0 })) + dlabel(x, 218 + hh + 16, d, 0, 1)).join('')
    } else {
      objs = at(134, 218, cover(a, 214, { lift: 0 })) + at(854, 218, cover(c, 214, { lift: 0 })) + at(477, 188, cover(b, 248, { lift: 1 }))
        + dlabel(134, 218 + ch(214) + 18, a, 1, 1) + dlabel(854, 218 + ch(214) + 18, c, 1, 1) + dlabel(477, 188 + ch(248) + 18, b, 1, 1)
    }
    objs += `<div class="arrow" style="left:40px;top:384px">${icon('chevL', 22, '#0B1766')}</div><div class="arrow" style="right:40px;top:384px">${icon('chevR', 22, '#0B1766')}</div>`
    if (state === 'tools') {
      const bx = 477 + 248 + 8
      objs += `<div class="ib" style="left:${bx}px;top:188px;position:absolute;width:44px;height:44px;border-radius:14px;background:#fff;box-shadow:0 4px 10px rgba(11,23,102,.14)">${icon('edit', 20, '#0B1766')}</div><div class="ib" style="left:${bx}px;top:240px;position:absolute;width:44px;height:44px;border-radius:14px;background:#fff;box-shadow:0 4px 10px rgba(11,23,102,.14)">${icon('trash', 20, '#0B1766')}</div>`
    }
  } else {
    if (skin === 'B') objs = framedCover(a, 88, 292, 214, { lift: 1, avatars: true }) + dlabel(88, 292 + ch(214 - 12) + 12 + 20, a, 1, 0)
    else if (skin === 'C') objs = at(90, 284, cover(a, 210, { lift: 0 })) + dlabel(90, 284 + ch(210) + 20, a, 0, 0)
    else objs = at(90, 292, cover(a, 210, { lift: 1 })) + dlabel(90, 292 + ch(210) + 20, a, 1, 0)
  }
  return shell(kind, skin, `${objs}${homeHeadS(kind, skin)}`, { nav: 'home', under: '<div class="desk"></div>' })
}

// ---------- 꾸미기 공방 ----------
const sCard = (x, y, w, h, o) => `<div class="card" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${o.bg ? `background:${o.bg};` : ''}${o.dim ? `opacity:${o.dim};` : ''}overflow:visible">
  ${o.head || ''}<div class="mi" style="position:absolute;left:22px;top:${o.iy ?? 22}px;width:${o.is ?? 64}px;height:${o.is ?? 64}px;border-radius:18px;background:${o.ibg || 'var(--pale)'};color:var(--strong);display:grid;place-items:center">${o.icon}</div>
  <div style="position:absolute;left:22px;top:${o.ty}px;right:22px"><div style="font-size:${o.ts ?? 20}px;font-weight:800;letter-spacing:-.3px">${o.title}</div><div style="font-size:${o.ss ?? 14}px;font-weight:600;color:var(--muted);margin-top:4px">${o.sub}</div></div>
  ${o.soon ? `<div class="soon" style="left:22px;bottom:16px">준비 중</div>` : ''}${o.go ? `<div style="position:absolute;right:20px;top:${(o.iy ?? 22) + 22}px">${icon('chevR', 20, '#0B1766')}</div>` : ''}${o.extra || ''}</div>`
const empt = (ic, text, x, y) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:center;gap:14px;font-size:14px;font-weight:700;color:var(--muted)">${ic}${text}</div>`
const rules = (k, x, y) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;flex-direction:column;gap:4px">${'<div style="width:28px;height:3px;border-radius:2px;background:#ABB1D8"></div>'.repeat(k === 'f' ? 1 : k === 's' ? 2 : 3)}</div>`
function studioS(kind, skin) {
  const tab = isT(kind)
  let inner = `<div class="h-title" ${tab ? 'style="top:44px"' : ''}>꾸미기 공방</div>`
  const ic = { f: icon('text', 34), s: icon('grid', 34), p: icon('crop', 34) }
  if (skin === 'A') {
    if (tab) {
      const prev = `<div style="position:absolute;left:384px;top:50px;width:148px;height:148px">${PROP('polaroid-picnic', 148, -3, 'left:0;top:0')}${PROP('sticker-heart', 52, 8, 'left:96px;top:6px;z-index:2')}${PROP('tape-butter', 70, -6, 'left:36px;top:-12px;z-index:3;opacity:.9')}</div>`
      inner += sCard(30, 160, 558, 246, { bg: '#FFFFFF', ibg: '#F0F1F9', icon: ic.f, title: '내 폰트 만들기', sub: '손글씨를 나만의 글꼴로', ty: 118, ts: 22, ss: 15, go: 1, extra: prev })
        + sCard(612, 160, 268, 246, { ibg: '#DBDCF9', icon: ic.s, title: '스티커 시트 분리', sub: '시트 속 그림을 개별 스티커로', ty: 118, dim: .48, soon: 1 })
        + sCard(904, 160, 268, 246, { ibg: '#F0F1F9', icon: ic.p, title: '사진 속 대상 오리기', sub: '사진 속 원하는 대상만', ty: 118, go: 1 })
        + PROP('tape-butter', 72, -4, 'left:54px;top:146px;opacity:.62;z-index:6')
        + at(30, 428, '<div class="sect" style="position:static;font-size:21px;letter-spacing:-.3px">내 폰트</div>') + at(1090, 432, '<b style="font-size:14px;font-weight:800">폰트 관리</b>')
        + card(30, 466, 1142, 112, empt(PROP('bookmark', 42, 0, 'position:static'), '아직 만든 폰트가 없어요.', 30, 36), 'border-radius:18px')
        + at(30, 602, '<div class="sect" style="position:static;font-size:21px;letter-spacing:-.3px">내 스티커</div>')
        + card(30, 640, 1142, 112, empt(PROP('sticker-heart', 38, 0, 'position:static'), '아직 스티커 폴더가 없어요.', 30, 36), 'border-radius:18px')
    } else {
      const prev = `<div style="position:absolute;right:20px;top:36px;width:110px;height:110px">${PROP('polaroid-picnic', 110, -3, 'left:0;top:0')}${PROP('sticker-heart', 40, 8, 'left:70px;top:0;z-index:2')}${PROP('tape-butter', 54, -6, 'left:24px;top:-10px;z-index:3;opacity:.9')}</div>`
      inner += sCard(18, 96, 354, 200, { bg: '#FFFFFF', ibg: '#F0F1F9', icon: ic.f, title: '내 폰트 만들기', sub: '손글씨를 나만의 글꼴로', ty: 112, ts: 21, ss: 14, extra: prev })
        + sCard(18, 312, 169, 164, { ibg: '#DBDCF9', icon: ic.s, title: '스티커 시트 분리', sub: '', ty: 100, ts: 15, dim: .48, soon: 1, is: 54 })
        + sCard(203, 312, 169, 164, { ibg: '#F0F1F9', icon: ic.p, title: '사진 속 대상 오리기', sub: '', ty: 100, ts: 15, is: 54 })
        + at(18, 496, '<div class="sect" style="position:static;font-size:19px">내 폰트</div>') + card(18, 530, 169, 112, empt(PROP('bookmark', 34, 0, 'position:static'), '', 24, 38), 'border-radius:18px')
        + at(203, 496, '<div class="sect" style="position:static;font-size:19px">내 스티커</div>') + card(203, 530, 169, 112, empt(PROP('sticker-heart', 32, 0, 'position:static'), '', 24, 38), 'border-radius:18px')
        + PROP('tape-butter', 60, -4, 'left:40px;top:84px;opacity:.62;z-index:6')
    }
  } else if (skin === 'B') {
    if (tab) {
      const board = `${PROP('polaroid-sky', 190, -4, 'left:330px;top:22px')}${PROP('polaroid-picnic', 190, 3, 'left:560px;top:30px;z-index:2')}${PROP('sticker-heart', 56, 10, 'left:506px;top:24px;z-index:4')}${PROP('tape-butter', 70, -6, 'left:730px;top:30px;z-index:5')}${PROP('tape-lavender', 64, 5, 'left:380px;top:6px;z-index:5')}${PROP('star-clip', 38, 8, 'left:770px;top:170px;z-index:5')}`
      inner += card(30, 124, 1142, 250, board, 'border-radius:26px;overflow:hidden')
        + sCard(30, 392, 214, 214, { bg: '#F0F1F9', icon: ic.f, ibg: 'rgba(255,255,255,.7)', title: '내 폰트 만들기', sub: '손글씨를 나만의 글꼴로', ty: 118, ts: 18, ss: 13, iy: 20 })
        + sCard(262, 392, 214, 214, { bg: '#DBDCF9', icon: ic.s, ibg: 'rgba(255,255,255,.7)', title: '스티커 시트 분리', sub: '시트 속 그림을 개별 스티커로', ty: 118, ts: 18, ss: 13, iy: 20, dim: .52, extra: '<div class="soon" style="right:16px;top:18px">준비 중</div>' })
        + sCard(494, 392, 214, 214, { bg: '#FFFFFF', icon: ic.p, ibg: '#FEF0BF', title: '사진 속 대상 오리기', sub: '사진 속 원하는 대상만', ty: 118, ts: 18, ss: 13, iy: 20 })
        + at(742, 396, '<div class="sect" style="position:static;font-size:19px">내 폰트</div>') + card(742, 430, 430, 80, empt(PROP('polaroid-sky', 52, 0, 'position:static;opacity:.6'), '아직 만든 폰트가 없어요.', 18, 14), 'border-radius:20px')
        + at(742, 526, '<div class="sect" style="position:static;font-size:19px">내 스티커</div>') + card(742, 560, 430, 80, empt(PROP('polaroid-sky', 52, 0, 'position:static;opacity:.6'), '아직 스티커 폴더가 없어요.', 18, 14), 'border-radius:20px')
    } else {
      const board = `${PROP('polaroid-sky', 130, -4, 'left:24px;top:20px')}${PROP('polaroid-picnic', 130, 3, 'left:170px;top:26px;z-index:2')}${PROP('sticker-heart', 44, 10, 'left:140px;top:20px;z-index:4')}${PROP('tape-butter', 56, -6, 'left:276px;top:14px;z-index:5')}${PROP('tape-lavender', 50, 5, 'left:60px;top:6px;z-index:5')}`
      inner += card(18, 96, 354, 190, board, 'border-radius:26px;overflow:hidden')
        + sCard(18, 302, 169, 150, { bg: '#F0F1F9', icon: ic.f, ibg: 'rgba(255,255,255,.7)', title: '내 폰트 만들기', sub: '', ty: 92, ts: 15, is: 50, iy: 16 })
        + sCard(203, 302, 169, 150, { bg: '#DBDCF9', icon: ic.s, ibg: 'rgba(255,255,255,.7)', title: '스티커 시트 분리', sub: '', ty: 92, ts: 15, is: 50, iy: 16, dim: .52 })
        + sCard(18, 468, 169, 150, { bg: '#FFFFFF', icon: ic.p, ibg: '#FEF0BF', title: '사진 속 대상 오리기', sub: '', ty: 92, ts: 15, is: 50, iy: 16 })
        + card(203, 468, 169, 150, empt(PROP('polaroid-sky', 48, 0, 'position:static;opacity:.6'), '', 20, 50) + '<div style="position:absolute;left:20px;top:16px;font-size:16px;font-weight:800">내 보관함</div>', 'border-radius:22px')
    }
  } else {
    const sw = { f: '<div style="font-size:34px;font-weight:800;letter-spacing:-1px">Aa</div>', s: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;width:60px">${['sticker-heart', 'star-clip', 'tape-butter', 'tape-lavender'].map((n) => `<img src="에셋/${n}.png" style="width:27px;height:27px;object-fit:contain">`).join('')}</div>`, p: '<div style="width:60px;height:60px;border:2px dashed var(--secondary);border-radius:8px;position:relative"><div style="position:absolute;inset:10px;background:var(--pale);border-radius:4px"></div></div>' }
    if (tab) {
      const mk = (x, k, title, sub, dimv, soon) => card(x, 140, 368, 220, `${rules(k, 22, 18)}<div style="position:absolute;left:22px;top:44px;width:96px;height:96px;border-radius:12px;background:var(--pale);display:grid;place-items:center;color:var(--text)">${sw[k]}</div><div style="position:absolute;left:22px;top:158px"><div style="font-size:19px;font-weight:800">${title}</div><div style="font-size:13px;font-weight:700;color:var(--muted);margin-top:3px">${sub}</div></div>${soon ? '<div class="soon" style="right:20px;top:16px">준비 중</div>' : ''}`, `${dimv ? `opacity:${dimv};` : ''}`)
      inner += mk(30, 'f', '내 폰트 만들기', '손글씨를 나만의 글꼴로') + mk(418, 's', '스티커 시트 분리', '시트 속 그림을 개별 스티커로', .44, 1) + mk(806, 'p', '사진 속 대상 오리기', '사진 속 원하는 대상만')
        + PROP('binder-clip', 40, -8, 'left:100px;top:127px;opacity:.72;z-index:6')
        + at(30, 392, '<div class="sect" style="position:static;font-size:20px">내 폰트</div>') + `<div style="position:absolute;left:30px;right:30px;top:430px;height:1px;background:var(--border)"></div>` + at(30, 446, `<div style="display:flex;gap:10px">${'<div style="width:64px;height:64px;border:1.5px dashed rgba(11,23,102,.22);border-radius:10px"></div>'.repeat(6)}<div style="margin-left:14px;align-self:center;font-size:14px;font-weight:700;color:var(--muted)">아직 만든 폰트가 없어요.</div></div>`)
        + at(30, 548, '<div class="sect" style="position:static;font-size:20px">내 스티커</div>') + `<div style="position:absolute;left:30px;right:30px;top:586px;height:1px;background:var(--border)"></div>` + at(30, 602, `<div style="display:flex;gap:10px">${'<div style="width:64px;height:64px;border:1.5px dashed rgba(11,23,102,.22);border-radius:10px"></div>'.repeat(6)}<div style="margin-left:14px;align-self:center;font-size:14px;font-weight:700;color:var(--muted)">아직 스티커 폴더가 없어요.</div></div>`)
    } else {
      const mk = (y, k, title, dimv, soon) => card(18, y, 354, 150, `${rules(k, 20, 16)}<div style="position:absolute;left:20px;top:40px;width:84px;height:84px;border-radius:12px;background:var(--pale);display:grid;place-items:center;color:var(--text)">${sw[k]}</div><div style="position:absolute;left:124px;top:56px;font-size:18px;font-weight:800;right:16px">${title}</div>${soon ? '<div class="soon" style="left:124px;top:92px">준비 중</div>' : ''}`, dimv ? `opacity:${dimv}` : '')
      inner += mk(96, 'f', '내 폰트 만들기') + mk(262, 's', '스티커 시트 분리', .44, 1) + mk(428, 'p', '사진 속 대상 오리기')
    }
  }
  return shell(kind, skin, `${skin === 'A' ? GRAIN : ''}${inner}`, { nav: 'studio' })
}

// ---------- 내 공간 ----------
function listCards(tab, x, y, w, skin) {
  const r = skin === 'C' ? 16 : 18, rh = skin === 'C' ? 60 : 64
  const row = (label, right) => `<div style="height:${rh}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${skin === 'C' ? 24 : 22}px;font-size:15px;font-weight:700;border-bottom:1px solid var(--border)">${label}${right}</div>`
  const chev = icon('chevR', 20, '#0B1766')
  const env = card(x, y, w, 96, `<div style="position:absolute;left:22px;top:16px;font-size:17px;font-weight:800">환경 설정</div><div style="position:absolute;left:22px;bottom:14px;font-size:15px;font-weight:700">홈 책상 빛</div><div class="seg2" style="position:absolute;right:20px;bottom:10px"><div class="on">실시간</div><div>조명 없음</div></div>`, `border-radius:${r}px`)
  const info = card(x, y + 112, w, rh * 3 + 56, `<div style="padding:18px 22px 4px;font-size:17px;font-weight:800">앱 정보</div>${row('개인정보 처리방침', chev)}${row('문의 이메일 <small style="font-weight:600;color:var(--muted);margin-left:10px">dioapp.official@gmail.com</small>', '<div class="btn soft" style="width:56px;height:36px;font-size:12.5px;border-radius:12px">복사</div>')}${row('오픈소스 및 콘텐츠 라이선스', chev)}`, `border-radius:${r}px;overflow:hidden`)
  return env + info
}
const miniCover = (id, w) => cover(byId(id), w, { lift: 0 })
function meS(kind, skin) {
  const tab = isT(kind)
  let inner = `<div class="h-title" ${tab ? 'style="top:44px"' : ''}>내 공간</div>`
  const loginBtn = (x, y, w, h, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${skin === 'C' ? 12 : 16}px;background:#606BB2;color:#fff;display:grid;place-items:center;font-size:14px;font-weight:800;${extra}">로그인·회원가입</div>`
  if (tab) {
    if (skin === 'A') {
      inner += card(30, 130, 1142, 132, `<div class="avatar" style="position:absolute;left:30px;top:34px;width:64px;height:64px;border-radius:20px;font-size:32px">D</div><div style="position:absolute;left:116px;top:46px;font-size:24px;font-weight:800;letter-spacing:-.4px">방문자님의 기록 공간</div>${loginBtn(956, 42, 156, 48)}`, 'background:#F0F1F9;border-radius:22px')
        + PROP('bookmark', 46, 8, 'left:944px;top:117px;opacity:.68;z-index:6')
        + card(30, 280, 1142, 150, `<div style="position:absolute;left:300px;top:26px">${miniCover('memo', 72)}</div><div style="position:absolute;left:394px;top:62px;font-size:15px;font-weight:700">만든 다이어리 <b style="font-size:22px;margin-left:6px">6</b></div><div style="position:absolute;left:700px;top:26px">${miniCover('trip', 72)}</div><div style="position:absolute;left:794px;top:62px;font-size:15px;font-weight:700">즐겨찾기 <b style="font-size:22px;margin-left:6px">0</b></div>`, 'border-radius:22px')
        + listCards(true, 30, 450, 1142, 'A')
    } else if (skin === 'B') {
      inner += card(30, 124, 1142, 190, `${PROP('polaroid-sky', 104, -6, 'left:60px;top:34px;opacity:.85')}${PROP('polaroid-picnic', 104, 4, 'left:160px;top:40px;opacity:.85')}<div class="pol-frame" style="left:106px;top:26px;width:112px;height:128px;border-radius:6px;transform:rotate(-2deg);z-index:3"><div class="avatar" style="position:absolute;left:10px;top:10px;width:92px;height:92px;border-radius:4px;font-size:36px;background:#DBDCF9">D</div></div>${PROP('tape-lavender', 56, -4, 'left:122px;top:14px;z-index:5')}
        <div style="position:absolute;left:300px;top:44px;font-size:24px;font-weight:800;letter-spacing:-.4px">방문자님의 기록 공간</div><div style="position:absolute;left:300px;top:100px;display:flex;gap:10px"><span style="height:32px;padding:0 14px;border-radius:16px;background:#DBDCF9;display:grid;place-items:center;font-size:13px;font-weight:800">다이어리 6</span><span style="height:32px;padding:0 14px;border-radius:16px;background:#F0F1F9;display:grid;place-items:center;font-size:13px;font-weight:800">즐겨찾기 0</span></div>${loginBtn(956, 70, 156, 48)}`, 'border-radius:26px')
        + listCards(true, 30, 336, 1142, 'B')
    } else {
      inner += card(30, 130, 1142, 118, `<div style="position:absolute;left:0;top:0;width:100%;height:6px;background:#ABB1D8"></div><div class="avatar" style="position:absolute;left:30px;top:36px;width:56px;height:56px;border-radius:14px;font-size:28px">D</div><div style="position:absolute;left:108px;top:46px;font-size:22px;font-weight:800;letter-spacing:-.3px">방문자님의 기록 공간</div>${loginBtn(968, 38, 144, 44)}`, 'border-radius:16px;overflow:hidden;background:#F0F1F9')
        + card(30, 266, 1142, 92, `<div class="stat" style="left:0;top:14px;width:100%"><div><b style="font-size:24px">6</b><span style="font-size:14px;font-weight:600">만든 다이어리</span></div><div style="border-left:1px solid var(--border)"><b style="font-size:24px">0</b><span style="font-size:14px;font-weight:600">즐겨찾기</span></div></div>`, 'border-radius:16px')
        + listCards(true, 30, 378, 1142, 'C')
    }
  } else {
    if (skin === 'A') {
      inner += card(18, 80, 354, 168, `<div class="avatar" style="position:absolute;left:20px;top:24px;width:58px;height:58px;border-radius:18px;font-size:30px">D</div><div style="position:absolute;left:92px;top:40px;font-size:20px;font-weight:800;letter-spacing:-.3px">방문자님의 기록 공간</div>${loginBtn(20, 104, 314, 48)}`, 'background:#F0F1F9;border-radius:22px')
        + PROP('bookmark', 40, 8, 'left:316px;top:66px;opacity:.68;z-index:6')
        + card(18, 264, 354, 130, `<div style="position:absolute;left:30px;top:18px">${miniCover('memo', 58)}</div><div style="position:absolute;left:100px;top:48px;font-size:13px;font-weight:700">만든 다이어리<br><b style="font-size:22px">6</b></div><div style="position:absolute;left:210px;top:18px">${miniCover('trip', 58)}</div><div style="position:absolute;left:280px;top:48px;font-size:13px;font-weight:700">즐겨찾기<br><b style="font-size:22px">0</b></div>`, 'border-radius:22px')
        + listCards(false, 18, 410, 354, 'A').replace(/top:(\d+)px/, 'top:$1px')
    } else if (skin === 'B') {
      inner += card(18, 80, 354, 232, `${PROP('polaroid-sky', 84, -6, 'left:26px;top:30px;opacity:.85')}${PROP('polaroid-picnic', 84, 4, 'left:230px;top:34px;opacity:.85')}<div class="pol-frame" style="left:122px;top:20px;width:110px;height:124px;border-radius:6px;transform:rotate(-2deg);z-index:3"><div class="avatar" style="position:absolute;left:9px;top:9px;width:92px;height:92px;border-radius:4px;font-size:36px;background:#DBDCF9">D</div></div>${PROP('tape-lavender', 52, -4, 'left:148px;top:8px;z-index:5')}<div style="position:absolute;left:0;right:0;top:152px;text-align:center;font-size:19px;font-weight:800;letter-spacing:-.3px">방문자님의 기록 공간</div><div style="position:absolute;left:0;right:0;top:184px;display:flex;gap:8px;justify-content:center"><span style="height:30px;padding:0 12px;border-radius:15px;background:#DBDCF9;display:grid;place-items:center;font-size:12.5px;font-weight:800">다이어리 6</span><span style="height:30px;padding:0 12px;border-radius:15px;background:#F0F1F9;display:grid;place-items:center;font-size:12.5px;font-weight:800">즐겨찾기 0</span></div>`, 'border-radius:26px')
        + `<div style="position:absolute;left:18px;top:324px;width:354px">${''}</div>` + listCards(false, 18, 328, 354, 'B')
    } else {
      inner += card(18, 80, 354, 150, `<div style="position:absolute;left:0;top:0;width:100%;height:6px;background:#ABB1D8"></div><div class="avatar" style="position:absolute;left:20px;top:30px;width:52px;height:52px;border-radius:14px;font-size:26px">D</div><div style="position:absolute;left:86px;top:42px;font-size:19px;font-weight:800;letter-spacing:-.3px">방문자님의 기록 공간</div>${loginBtn(20, 92, 314, 44)}`, 'border-radius:16px;overflow:hidden;background:#F0F1F9')
        + card(18, 246, 354, 88, `<div class="stat" style="left:0;top:12px;width:100%"><div><b style="font-size:24px">6</b><span style="font-size:13.5px;font-weight:600">만든 다이어리</span></div><div style="border-left:1px solid var(--border)"><b style="font-size:24px">0</b><span style="font-size:13.5px;font-weight:600">즐겨찾기</span></div></div>`, 'border-radius:16px')
        + listCards(false, 18, 350, 354, 'C')
    }
  }
  return shell(kind, skin, `${skin === 'A' ? GRAIN : ''}${inner}`, { nav: 'me' })
}

// ---------- 휴지통 ----------
function trashCover(skin, d, x, y, w, days, hot, tab) {
  const ratio = hot ? 0.1 : 0.96
  const cap = `<span class="ring" style="--p:${ratio}"></span>${days}일 후 영구 삭제`
  if (skin === 'B') {
    const bw = 5, inner = w - bw * 2, hh = ch(inner) + bw * 2
    return `<div class="pol-frame" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px;border-radius:18px"><div style="position:absolute;left:${bw}px;top:${bw}px;filter:grayscale(.72) saturate(.38)">${cover(d, inner, { lift: 2 })}</div><div class="stamp ${hot ? 'hot' : ''}" style="left:${bw}px;right:${bw}px;bottom:${bw}px;border-radius:0 0 12px 4px">${days}일 후 영구 삭제</div></div>
      <div class="dlabel" style="left:${x}px;top:${y + hh + 12}px"><b style="font-size:15px;font-weight:800">${d.title}</b></div>`
  }
  const filt = skin === 'A' ? 'filter:saturate(.38) brightness(1.05);opacity:.82' : 'filter:grayscale(.85);opacity:.74'
  const lab = skin === 'A' ? `<div class="lab-dot" style="left:${x + w - 36}px;top:${y + 8}px">${icon('trash', 15, '#6B6F85')}</div>` : ''
  const frame = skin === 'C' ? 'outline:1px solid rgba(11,23,102,.2);outline-offset:0;border-radius:6px 14px 14px 6px;' : ''
  return `<div style="position:absolute;left:${x}px;top:${y}px;${filt};${frame}">${cover(d, w, { lift: skin === 'C' ? 2 : 0 })}</div>${lab}
    <div class="dlabel" style="left:${x}px;top:${y + ch(w) + 14}px"><b style="font-size:${skin === 'C' ? 17 : 16}px;font-weight:800;line-height:22px">${d.title}</b><span class="tag-days ${hot ? 'hot' : ''}" style="display:block;margin-top:2px">${cap}</span></div>`
}
function trashS(kind, skin, empty) {
  const tab = isT(kind)
  const a = byId('class'), b = { ...byId('trip'), color: '#9FC2C9', pattern: 'linen' }
  let inner = `<div class="h-title" ${tab ? 'style="top:44px"' : ''}>휴지통</div><div class="pill" style="right:${tab ? 30 : 18}px;top:${tab ? 40 : 18}px;width:88px;height:${tab ? 48 : 44}px;${skin === 'C' ? 'border-radius:12px' : ''}">선택</div>`
  if (empty) {
    const cx = tab ? 601 : 195
    if (skin === 'A') inner += `<div style="position:absolute;left:${cx - 90}px;top:276px;width:180px;height:130px;border-radius:24px;background:#F0F1F9"></div>` + CHAR('디오', 84, `left:${cx - 42}px;top:290px`)
    else if (skin === 'B') inner += CHAR('둘이', 170, `left:${cx - 85}px;top:300px`) + PROP('tape-butter', 52, -8, `left:${cx + 40}px;top:292px;opacity:.9`)
    else inner += CHAR('디오', 84, `left:${cx - 42}px;top:300px`) + `<div style="position:absolute;left:${cx - 50}px;top:402px;width:100px;height:1px;background:#ABB1D8"></div>`
    inner += `<div class="empty-title" style="left:${cx - 110}px;width:220px;top:${tab ? 428 : 424}px">휴지통이 비어 있어요</div>`
  } else if (tab) {
    const w = skin === 'A' ? 172 : skin === 'B' ? 176 : 170
    inner += trashCover(skin, a, 72, 150, w, 29, false, true) + trashCover(skin, b, 366, 150, w, 3, true, true)
    if (skin === 'C') inner += `<div class="chk-sq" style="left:${72 + w - 38}px;top:158px"></div><div class="chk-sq" style="left:${366 + w - 38}px;top:158px"></div>`
  } else {
    inner += trashCover(skin, a, 40, 112, 126, 28, false, false) + trashCover(skin, b, 224, 112, 126, 2, true, false)
  }
  return shell(kind, skin, `${skin === 'A' ? GRAIN : ''}${inner}`, { nav: 'trash' })
}

const mk = (nowFn, skinFn) => (k, s) => (s === '지금' ? nowFn(k, s) : skinFn(k, s))
SCREENS.로그인 = mk(NOW.로그인, (k, s) => authS(k, s, false))
SCREENS.회원가입 = mk(NOW.회원가입, (k, s) => authS(k, s, true))
SCREENS.홈 = mk(NOW.홈, (k, s) => homeS(k, s, ''))
SCREENS.공방 = mk(NOW.공방, studioS)
SCREENS.내공간 = mk(NOW.내공간, meS)
SCREENS.휴지통 = mk(NOW.휴지통, (k, s) => trashS(k, s, false))
SCREENS.홈도구 = (k, s) => homeS(k, s, 'tools')
SCREENS.홈빈 = (k, s) => homeS(k, s, 'empty')
SCREENS.휴지통빈 = (k, s) => trashS(k, s, true)
