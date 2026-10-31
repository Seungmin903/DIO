// 혼합안(H) — 색 규칙 v2 + 코덱스 검수(2026-10-31, 렌더 확인 후) 최종 권고. 'B 주안 + A 로그인 빛' 2안화.
// 로그인 A(흰 대각광 · 작은 테이프 1) · 홈 B(선택 표지 프레임 + 상시 ⋯ 버튼) · 공방 B(사진 2장 + 테이프 1) · 내 공간 B 배너 + C의 4px 상단 띠 · 휴지통 C의 절제 + B의 임박 칩 · 빈 홈 B · 빈 휴지통 A(두리 단독).
// 색: 메인 = UI 색상 계열(라벤더 50/100/200 · 경계 #D9DCEF), 보조 = 캐릭터 노랑(#FEF0BF 면 · #FBE5A3 테이프 · #B98208 점 · 고리). 핑크 · 민트 · 적색 계열은 쓰지 않는다. BI 토큰(primary · primaryStrong · 네이비)은 바꾸지 않는다.
// 클로드가 코덱스 값에서 바꾼 곳(내 판단): 알림 점·고리 #D69A1E → #B98208(흰색 위 2.47:1은 3:1 미달), 로그인 테이프 28×8 → 보이는 폭 약 40px(지금 앱 비율).
SKINS.H = { cls: 'a skin-h' } // A의 규칙을 바탕으로 .skin-h 에서 덮어쓴다
const HB = { page: '#F3F3F7', lav50: '#F0F1F9', lav100: '#DBDCF9', lav200: '#ABB1D8', line: '#D9DCEF', butter: '#FEF0BF', tape: '#FBE5A3', dot: '#B98208' }

function authH(kind, signup) {
  const tab = isT(kind)
  const g = tab ? [376, 52, 528, 696, 18] : signup ? [18, 108, 354, 628, 16] : [18, 96, 354, 656, 16]
  const [x, y, w, h, r] = g
  const c = card(x, y, w, h, authBody(kind, 'A', signup), `border-radius:${r}px`)
  const tape = PROP('tape-butter', 56, -5, `left:${tab ? 461 : 252}px;top:${y - 14}px;opacity:.72;z-index:5`)
  return shell(kind, 'H', `${GRAIN}${c}${tape}`, { bare: true, under: `<div style="position:absolute;inset:0;background:linear-gradient(135deg,#FFFFFF 0%,#F3F3F7 68%)"></div>` })
}

// 홈: 모든 표지가 얇은 프레임(2px #D9DCEF · .7)을 입고, 선택 표지만 3px 흰 프레임 + 그림자. 도구는 숨기되 선택 표지에 ⋯ 한 개를 상시 둔다(발견성).
function frameH(d, x, y, w, sel) {
  const bw = sel ? 3 : 2, inner = w - bw * 2, hh = ch(inner) + bw * 2
  const bg = sel ? '#FFFFFF' : 'rgba(217,220,239,.7)'
  const sh = sel ? 'box-shadow:0 8px 16px rgba(11,23,102,.12);' : ''
  return { hh, html: `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;border-radius:18px;background:${bg};${sh}"><div style="position:absolute;left:${bw}px;top:${bw}px">${cover(d, inner, { lift: 2 })}</div></div>` }
}
const moreBtn = (x, y) => `<div style="position:absolute;left:${x}px;top:${y}px;width:32px;height:32px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(11,23,102,.16);display:grid;place-items:center;z-index:8">${icon('more', 18, '#0B1766')}</div>`

function homeH(kind, state) {
  const tab = isT(kind)
  const [a, b, c] = [byId('read'), byId('memo'), byId('weekly')]
  let objs = ''
  if (state === 'empty') return homeS(kind, 'B', 'empty').replace('skin-b', 'skin-b skin-h')
  if (tab) {
    const side = 214, mid = Math.round(214 * 1.12)
    const fa = frameH(a, 134, 218, side, false), fc = frameH(c, 854, 218, side, false)
    const bottom = 218 + fa.hh
    const midH = ch(mid - 6) + 6, mx = Math.round(601 - mid / 2), my = bottom - midH
    const fb = frameH(b, mx, my, mid, true)
    const lab = (x, d) => dlabel(x, bottom + 14, d, 1, 1)
    objs = fa.html + fc.html + fb.html + moreBtn(mx + mid - 42, my + 10) + lab(134, a) + lab(854, c) + lab(mx, b)
      + `<div class="arrow" style="left:40px;top:384px">${icon('chevL', 22, '#0B1766')}</div><div class="arrow" style="right:40px;top:384px">${icon('chevR', 22, '#0B1766')}</div>`
  } else {
    const fb = frameH(a, 88, 292, 214, true)
    objs = fb.html + moreBtn(88 + 214 - 42, 302) + dlabel(88, 292 + fb.hh + 14, a, 1, 0)
  }
  return shell(kind, 'H', `${GRAIN}${objs}${homeHeadS(kind, 'A')}`, { nav: 'home', under: '<div class="desk"></div>' })
}

// 공방: 결과 보드(사진 2장 + 테이프 1개, 높이 태블릿 176 · 폰 132) + 기능 타일. 타일은 색상각이 아니라 명도(라벤더 50 / 100 / 흰색 + 노랑 아이콘 면)로 구분한다.
function studioH(kind) {
  const tab = isT(kind)
  const ic = { f: icon('text', 34), s: icon('grid', 34), p: icon('crop', 34) }
  let inner = `<div class="h-title" ${tab ? 'style="top:44px"' : ''}>꾸미기 공방</div>`
  if (tab) {
    const board = `${PROP('polaroid-sky', 128, -4, 'left:412px;top:20px')}${PROP('polaroid-picnic', 128, 3, 'left:602px;top:24px;z-index:2')}${PROP('tape-lavender', 60, 5, 'left:448px;top:4px;z-index:5')}`
    inner += card(30, 130, 1142, 176, board, 'border-radius:18px;overflow:hidden;background:#FFFFFF')
      + sCard(30, 326, 214, 214, { bg: HB.lav50, icon: ic.f, ibg: 'rgba(255,255,255,.7)', title: '내 폰트 만들기', sub: '손글씨를 나만의 글꼴로', ty: 118, ts: 18, ss: 13, iy: 20 })
      + sCard(262, 326, 214, 214, { bg: HB.lav100, icon: ic.s, ibg: 'rgba(255,255,255,.7)', title: '스티커 시트 분리', sub: '시트 속 그림을 개별 스티커로', ty: 118, ts: 18, ss: 13, iy: 20, dim: .52, extra: '<div class="soon" style="right:16px;top:18px">준비 중</div>' })
      + sCard(494, 326, 214, 214, { bg: '#FFFFFF', icon: ic.p, ibg: HB.butter, title: '사진 속 대상 오리기', sub: '사진 속 원하는 대상만', ty: 118, ts: 18, ss: 13, iy: 20 })
      + at(742, 330, '<div class="sect" style="position:static;font-size:19px">내 폰트</div>') + card(742, 364, 430, 80, empt(PROP('polaroid-sky', 52, 0, 'position:static;opacity:.6'), '아직 만든 폰트가 없어요.', 18, 14), 'border-radius:18px')
      + at(742, 460, '<div class="sect" style="position:static;font-size:19px">내 스티커</div>') + card(742, 494, 430, 80, empt(PROP('polaroid-sky', 52, 0, 'position:static;opacity:.6'), '아직 스티커 폴더가 없어요.', 18, 14), 'border-radius:18px')
  } else {
    const board = `${PROP('polaroid-sky', 84, -4, 'left:96px;top:14px')}${PROP('polaroid-picnic', 84, 3, 'left:190px;top:18px;z-index:2')}${PROP('tape-lavender', 44, 5, 'left:118px;top:2px;z-index:5')}`
    inner += card(18, 96, 354, 132, board, 'border-radius:16px;overflow:hidden')
      + sCard(18, 244, 169, 150, { bg: HB.lav50, icon: ic.f, ibg: 'rgba(255,255,255,.7)', title: '내 폰트 만들기', sub: '', ty: 92, ts: 15, is: 50, iy: 16 })
      + sCard(203, 244, 169, 150, { bg: HB.lav100, icon: ic.s, ibg: 'rgba(255,255,255,.7)', title: '스티커 시트 분리', sub: '', ty: 92, ts: 15, is: 50, iy: 16, dim: .52 })
      + sCard(18, 410, 169, 150, { bg: '#FFFFFF', icon: ic.p, ibg: HB.butter, title: '사진 속 대상 오리기', sub: '', ty: 92, ts: 15, is: 50, iy: 16 })
      + card(203, 410, 169, 150, empt(PROP('polaroid-sky', 48, 0, 'position:static;opacity:.6'), '', 20, 50) + '<div style="position:absolute;left:20px;top:16px;font-size:16px;font-weight:800">내 보관함</div>', 'border-radius:16px')
  }
  return shell(kind, 'H', `${GRAIN}${inner}`, { nav: 'studio' })
}

// 내 공간: B의 사진 + 로고 카드 배너(사진 2장 · 폭 54 · 테이프 1) + C의 4px 상단 띠. 배너 면은 라벤더 50(버터 큰 면 폐기).
function meH(kind) {
  const tab = isT(kind)
  let inner = `<div class="h-title" ${tab ? 'style="top:44px"' : ''}>내 공간</div>`
  const loginBtn = (x, y, w, h) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:12px;background:#606BB2;color:#fff;display:grid;place-items:center;font-size:14px;font-weight:800">로그인·회원가입</div>`
  const band = '<div style="position:absolute;left:0;top:0;width:100%;height:4px;background:#D9DCEF;opacity:.9"></div>'
  // 사진 두 장은 각각 폭 54, 가운데 D 카드가 사진보다 한 단계 위(크고 8px 높음), 겹침 20px, 테이프는 가운데에만
  const cluster = (x, y) => {
    const mid = 72, sd = 54, ov = 20
    return `${PROP('polaroid-sky', sd, -6, `left:${x}px;top:${y + 8}px;opacity:.9`)}${PROP('polaroid-picnic', sd, 5, `left:${x + sd + mid - 2 * ov}px;top:${y + 8}px;opacity:.9`)}<div class="pol-frame" style="left:${x + sd - ov}px;top:${y}px;width:${mid}px;height:${Math.round(mid * 1.15)}px;border-radius:5px;z-index:3"><div class="avatar" style="position:absolute;left:5px;top:5px;right:5px;bottom:${Math.round(mid * .2)}px;border-radius:3px;font-size:30px;background:#DBDCF9">D</div></div>${PROP('tape-lavender', 44, -4, `left:${x + sd - ov + mid / 2 - 22}px;top:${y - 12}px;z-index:5`)}`
  }
  if (tab) {
    inner += card(30, 130, 1142, 120, `${band}${cluster(60, 20)}<div style="position:absolute;left:230px;top:40px;font-size:24px;font-weight:800;letter-spacing:-.4px">방문자님의 기록 공간</div>${loginBtn(956, 36, 156, 48)}`, 'background:#F0F1F9;border-radius:18px;overflow:hidden')
      + card(30, 268, 1142, 150, `<div style="position:absolute;left:300px;top:26px">${miniCover('memo', 72)}</div><div style="position:absolute;left:394px;top:62px;font-size:15px;font-weight:700">만든 다이어리 <b style="font-size:22px;margin-left:6px">6</b></div><div style="position:absolute;left:700px;top:26px">${miniCover('trip', 72)}</div><div style="position:absolute;left:794px;top:62px;font-size:15px;font-weight:700">즐겨찾기 <b style="font-size:22px;margin-left:6px">0</b></div>`, 'border-radius:18px')
      + listCards(true, 30, 438, 1142, 'A')
  } else {
    inner += card(18, 80, 354, 166, `${band}${cluster(24, 22)}<div style="position:absolute;left:184px;top:34px;font-size:18px;font-weight:800;letter-spacing:-.3px;right:14px;line-height:26px">방문자님의<br>기록 공간</div>${loginBtn(20, 106, 314, 48)}`, 'background:#F0F1F9;border-radius:16px;overflow:hidden')
      + card(18, 262, 354, 130, `<div style="position:absolute;left:30px;top:18px">${miniCover('memo', 58)}</div><div style="position:absolute;left:100px;top:48px;font-size:13px;font-weight:700">만든 다이어리<br><b style="font-size:22px">6</b></div><div style="position:absolute;left:210px;top:18px">${miniCover('trip', 58)}</div><div style="position:absolute;left:280px;top:48px;font-size:13px;font-weight:700">즐겨찾기<br><b style="font-size:22px">0</b></div>`, 'border-radius:16px')
      + listCards(false, 18, 408, 354, 'A')
  }
  return shell(kind, 'H', `${GRAIN}${inner}`, { nav: 'me' })
}

// 휴지통: 표지는 원색을 거의 그대로(saturate .78) — 사용자 콘텐츠를 비활성처럼 보이게 하지 않는다. 표지 위 삭제 아이콘은 없다. 남은 날짜는 진행 고리 + 칩(3일 이하 버터 칩).
function trashH(kind, empty) {
  if (empty) return trashS(kind, 'A', true).replace('skin-a', 'skin-a skin-h')
  const tab = isT(kind)
  const a = byId('class'), b = { ...byId('trip'), color: '#9FC2C9', pattern: 'linen' }
  const one = (d, x, y, w, days, hot) => `<div style="position:absolute;left:${x}px;top:${y}px;filter:saturate(.78)">${cover(d, w, { lift: 0 })}</div>
      <div class="dlabel" style="left:${x}px;top:${y + ch(w) + 14}px"><b style="font-size:16px;font-weight:800;line-height:22px">${d.title}</b><span class="tag-days ${hot ? 'hot' : ''}" style="display:block;margin-top:2px"><span class="ring2" style="--p:${hot ? .1 : .96}"></span>${days}일 후 영구 삭제</span></div>`
  let inner = `<div class="h-title" ${tab ? 'style="top:44px"' : ''}>휴지통</div><div class="pill" style="right:${tab ? 30 : 18}px;top:${tab ? 40 : 18}px;width:88px;height:${tab ? 48 : 44}px">선택</div>`
  inner += tab ? one(a, 72, 150, 172, 29, false) + one(b, 366, 150, 172, 3, true) : one(a, 40, 112, 126, 28, false) + one(b, 224, 112, 126, 2, true)
  return shell(kind, 'H', `${GRAIN}${inner}`, { nav: 'trash' })
}

const wrapH = (name, fn) => { const prev = SCREENS[name]; SCREENS[name] = (k, sk) => (sk === '혼합' ? fn(k) : prev(k, sk)) }
wrapH('로그인', (k) => authH(k, false))
wrapH('회원가입', (k) => authH(k, true))
wrapH('홈', (k) => homeH(k, ''))
wrapH('공방', studioH)
wrapH('내공간', meH)
wrapH('휴지통', (k) => trashH(k, false))
wrapH('홈빈', (k) => homeH(k, 'empty'))
wrapH('휴지통빈', (k) => trashH(k, true))
