// 화면 장면. 주소 해시 #<화면>|<안>|<기기> 로 연다. 예: 화면.html#로그인|지금|태블릿
// 화면 = 로그인 · 회원가입 · 홈 · 공방 · 내공간 · 휴지통,  안 = 지금 · A · B · C,  기기 = 태블릿 · 폰
// 안마다 달라지는 것은 SKINS[안] 의 값 · 장식(deco)뿐이고, 화면의 틀(위치 · 크기)은 지금 앱을 그대로 따른다.

const T = 'tablet', P = 'phone'
const isT = (k) => k === T

// ---------- 공통 틀 ----------
function railHtml(on) {
  const it = (id, ic) => `<div class="ri ${on === id ? 'on' : ''}">${icon(ic, 22, 'currentColor')}</div>`
  return `<div class="rail"><div class="ri top">${icon('menu', 22, '#0B1766')}<i class="dot"></i></div>${it('home', 'book')}${it('studio', 'palette')}${it('me', 'person')}${it('trash', 'trash')}</div>`
}
function tabsHtml(on) {
  const t = (id, ic, label) => `<div class="tb ${on === id ? 'on' : ''}">${icon(ic, 22)}<span>${label}</span></div>`
  return `<div class="tabs"><div class="tb bell">${icon('bell', 22, '#0B1766')}<i class="dot"></i></div>${t('home', 'book', '다이어리')}${t('studio', 'palette', '꾸미기<br>공방')}${t('me', 'person', '내 공간')}${t('trash', 'trash', '휴지통')}</div>`
}
// 기기 틀: 로그인 · 가입은 레일 · 탭이 없다
function shell(kind, skin, inner, { nav = null, bare = false, under = '', over = '' } = {}) {
  const sk = SKINS[skin] || SKINS.지금
  const cls = `device ${kind} skin-${sk.cls}`
  if (bare) return `<div class="${cls}"><div class="stage">${under}${inner}${over}</div></div>`
  if (kind === T) return `<div class="${cls}">${railHtml(nav)}<div class="stage">${under}${inner}${over}</div></div>`
  return `<div class="${cls}"><div class="stage">${under}${inner}${over}</div>${tabsHtml(nav)}</div>`
}
const at = (x, y, html, style = '') => `<div style="position:absolute;left:${x}px;top:${y}px;${style}">${html}</div>`
const box = (x, y, w, h, html = '', cls = '', style = '') => `<div class="${cls}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${style}">${html}</div>`

const SOC = {
  kakao: `<i style="background:#FEE500"><svg width="26" height="26" viewBox="0 0 24 24"><path fill="#191919" d="M12 3.5c-5 0-9 3.1-9 7 0 2.5 1.6 4.6 4.1 5.9l-1 3.7c-.1.3.2.5.5.3l4.4-2.9c.3 0 .7.1 1 .1 5 0 9-3.1 9-7s-4-7.1-9-7.1z"/></svg></i>`,
  google: `<i style="background:#fff;border:1px solid var(--border)"><svg width="24" height="24" viewBox="0 0 24 24"><path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.5z"/><path fill="#34A853" d="M12 22c2.8 0 5.1-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.700A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.200 13.600a6 6 0 0 1 0-3.800V7.100H2.700a10 10 0 0 0 0 9.200z"/><path fill="#EA4335" d="M12 6c1.500 0 2.900.5 4 1.600l3-3A10 10 0 0 0 2.700 7.100l3.500 2.700C7 7.800 9.300 6 12 6z"/></svg></i>`,
  apple: `<i style="background:#191919"><svg width="24" height="24" viewBox="0 0 24 24"><path fill="#fff" d="M16.4 12.700c0-2.500 2-3.600 2.100-3.700-1.200-1.700-3-1.900-3.600-2-1.500-.2-3 .9-3.800.9s-2-.9-3.300-.9C6 7 4.500 8 3.600 9.500c-1.800 3.100-.5 7.600 1.300 10.100.9 1.200 1.900 2.500 3.200 2.500 1.300-.1 1.800-.8 3.300-.8s2 .8 3.300.8c1.400 0 2.300-1.200 3.100-2.400 1-1.400 1.400-2.700 1.400-2.800-.1 0-2.800-1.100-2.800-4.200zM14 5.200c.7-.9 1.200-2 1-3.200-1 0-2.300.7-3 1.600-.7.800-1.200 2-1.100 3.100 1.200.1 2.400-.6 3.100-1.500z"/></svg></i>`,
}

// ---------- 지금 앱 화면 ----------
function login(kind, skin) {
  const sk = SKINS[skin] || SKINS.지금
  const tab = isT(kind)
  const W = tab ? 520 : 358, H = tab ? 711 : 690
  const x = tab ? (1280 - W) / 2 : 16, y = tab ? 45 : 77
  const px = tab ? 40 : 24, iw = W - px * 2
  const body = `
    ${at(px, 40, logo(tab ? 53 : 52), `width:${iw}px;display:flex;justify-content:center`)}
    ${at(px, 108, `<div style="font-size:${tab ? 24 : 22}px;font-weight:800;letter-spacing:-.4px">DIO에 오신 걸 환영해요</div><div style="font-size:14px;font-weight:700;color:var(--muted);margin-top:8px">함께 기록하고, 추억을 나눠 보세요.</div>`, `width:${iw}px;text-align:center`)}
    ${at(px, 186, `<div class="flabel">이메일</div><div class="field">이메일을 입력해 주세요</div><div class="flabel" style="margin-top:18px">비밀번호</div><div class="field">비밀번호를 입력해 주세요 ${icon('eye', 22, '#0B1766')}</div><div class="btn off" style="margin-top:12px">로그인</div>`, `width:${iw}px`)}
    ${at(px, 438, `<div class="links">아이디 찾기<i></i>비밀번호 찾기<i></i>회원가입</div>`, `width:${iw}px`)}
    ${at(px, 495, `<div class="divider">간편 로그인</div>`, `width:${iw}px`)}
    ${at(px, 530, `<div class="social"><div class="sc">${SOC.kakao}카카오</div><div class="sc">${SOC.google}구글</div><div class="sc">${SOC.apple}애플</div></div>`, `width:${iw}px`)}
    ${at(px, 640, `<div class="guest">게스트로 시작하기</div>`, `width:${iw}px`)}`
  const card = `<div class="card" style="position:absolute;left:${x}px;top:${y}px;width:${W}px;height:${H}px;box-shadow:0 14px 36px rgba(11,23,102,.1)">${body}</div>`
  return shell(kind, skin, card, { bare: true, under: sk.under?.('로그인', kind) || '', over: sk.over?.('로그인', kind) || '' })
}

function signup(kind, skin) {
  const sk = SKINS[skin] || SKINS.지금
  const W = 358, H = 622, x = 16, y = 111, px = 24, iw = W - px * 2
  const body = `
    ${at(px + 8, 22, `<span style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800">${icon('chevL', 20, '#0B1766')}시작 화면</span>`)}
    ${at(px, 62, logo(52), `width:${iw}px;display:flex;justify-content:center`)}
    ${at(px, 138, `<div style="font-size:22px;font-weight:800;letter-spacing:-.4px">나만의 기록을 시작해요</div><div style="font-size:13.5px;font-weight:700;color:var(--muted);margin-top:8px">이메일로 DIO 계정을 만들어 주세요.</div>`, `width:${iw}px;text-align:center`)}
    ${at(px, 200, `<div class="flabel">이메일</div><div class="field" style="height:49px">이메일을 입력해 주세요</div><div class="flabel" style="margin-top:14px">비밀번호</div><div class="field" style="height:49px">비밀번호를 입력해 주세요 ${icon('eye', 22, '#0B1766')}</div><div class="flabel" style="margin-top:14px">비밀번호 확인</div><div class="field" style="height:49px">비밀번호를 다시 입력해 주세요 ${icon('eye', 22, '#0B1766')}</div><div class="btn off" style="margin-top:10px;height:48px">다음</div>`, `width:${iw}px`)}
    ${at(px, 560, `<div style="text-align:center;font-size:13.5px;font-weight:700;color:var(--muted)">이미 계정이 있나요? <b style="color:var(--text);font-weight:800;margin-left:4px">로그인 화면으로</b></div>`, `width:${iw}px`)}`
  const card = `<div class="card" style="position:absolute;left:${x}px;top:${y}px;width:${W}px;height:${H}px;box-shadow:0 14px 36px rgba(11,23,102,.1)">${body}</div>`
  return shell(kind, skin, card, { bare: true, under: sk.under?.('회원가입', kind) || '', over: sk.over?.('회원가입', kind) || '' })
}

function homeHead(kind, title = '모든 다이어리') {
  const tab = isT(kind)
  return `<div class="h-title">${title}</div>
    <div class="segsw"><div class="on">${icon('swap', 18, '#0B1766')}${tab ? '스와이프' : ''}</div><div>${icon('grid', 18, 'rgba(11,23,102,.68)')}${tab ? '한눈에' : ''}</div></div>
    <div class="chips"><div class="on">모든 다이어리</div><div>즐겨찾기</div><div>내 다이어리</div><div>공유 다이어리</div></div>
    ${tab ? `<div class="ib" style="right:83px;top:105px">${icon('search', 22, '#0B1766')}</div><div class="ib" style="right:30px;top:105px">${icon('more', 22, '#0B1766')}</div>`
      : `<div class="ib" style="left:18px;top:124px">${icon('search', 22, '#0B1766')}</div><div class="ib" style="left:70px;top:124px">${icon('more', 22, '#0B1766')}</div>`}
    <div class="fab">${icon('plus', 28, '#fff', { sw: 2 })}</div>`
}

function home(kind, skin) {
  const sk = SKINS[skin] || SKINS.지금
  const tab = isT(kind)
  const [a, b, c] = [byId('read'), byId('memo'), byId('weekly')]
  let objs
  if (tab) {
    objs = at(142, 240, cover(a, 198, { lift: 0 }), '') + at(861, 240, cover(c, 198, { lift: 0 }), '')
      + at(475, 202, cover(b, 250, { lift: 1, actions: true }), '')
      + at(112, 526, `<div class="dlabel"><b>독서 노트</b><span>1페이지</span></div>`) + at(881, 526, `<div class="dlabel"><b>위클리 플래너</b><span>1페이지</span></div>`)
      + at(437, 560, `<div class="dlabel"><b style="font-size:16px">메모장</b><span>1페이지</span></div>`)
      + `<div class="arrow" style="left:40px;top:384px">${icon('chevL', 22, '#0B1766')}</div><div class="arrow" style="right:40px;top:384px">${icon('chevR', 22, '#0B1766')}</div>`
  } else {
    objs = at(90, 292, cover(a, 210, { lift: 1, actions: true }), '') + at(57, 594, `<div class="dlabel"><b style="font-size:16px">독서 노트</b><span>1페이지</span></div>`)
  }
  const under = sk.under?.('홈', kind) || `<div class="desk"></div>`
  return shell(kind, skin, objs + homeHead(kind) + (sk.over?.('홈', kind) || ''), { nav: 'home', under })
}

function studio(kind, skin) {
  const sk = SKINS[skin] || SKINS.지금
  const tab = isT(kind)
  const item = (x, y, w, h, ic, name, sub, st, dis) => `<div class="card mcard ${dis ? 'dis' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="mi">${icon(ic, 34, 'currentColor')}</div>${st && !dis ? '' : ''}<div style="position:absolute;left:20px;top:106px"><h3>${name}</h3><p>${sub}</p></div>${st ? `<div class="st">${st}</div>` : ''}${dis ? '' : `<div class="go">${icon('chevR', 20, '#0B1766')}</div>`}</div>`
  let inner
  if (tab) {
    inner = `<div class="h-title">꾸미기 공방</div>`
      + item(30, 127, 369, 217, 'text', '내 폰트 만들기', '손글씨를 나만의 글꼴로', '')
      + item(416, 127, 369, 217, 'grid', '스티커 시트 분리', '시트 속 그림을 개별 스티커로', '개발 빌드에서 사용 가능', true)
      + item(802, 127, 369, 217, 'crop', '사진 속 대상 오리기', '사진 속 원하는 대상만', '미리보기 · AI 분리·저장 미연결')
      + at(30, 370, `<div class="sect" style="position:static">내 폰트</div>`) + at(1100, 372, `<b style="font-size:14px;font-weight:800">폰트 관리</b>`)
      + at(30, 436, `<div class="empty" style="position:static">아직 만든 폰트가 없어요.</div>`)
      + at(30, 490, `<div class="sect" style="position:static">내 스티커</div>`) + at(30, 546, `<div class="empty" style="position:static">아직 스티커 폴더가 없어요.</div>`)
  } else {
    inner = `<div class="h-title">꾸미기 공방</div>`
      + item(18, 96, 354, 185, 'text', '내 폰트 만들기', '손글씨를 나만의 글꼴로', '')
      + item(18, 299, 354, 216, 'grid', '스티커 시트 분리', '시트 속 그림을 개별 스티커로', '개발 빌드에서 사용 가능', true)
      + item(18, 532, 354, 216, 'crop', '사진 속 대상 오리기', '사진 속 원하는 대상만', '미리보기 · AI 분리·저장 미연결')
  }
  return shell(kind, skin, inner + (sk.over?.('공방', kind) || ''), { nav: 'studio', under: sk.under?.('공방', kind) || '' })
}

function me(kind, skin) {
  const sk = SKINS[skin] || SKINS.지금
  const tab = isT(kind)
  let inner
  if (tab) {
    inner = `<div class="h-title">내 공간</div>
      <div class="banner" style="left:30px;top:111px;width:1142px;height:120px"><div class="av">D</div><h2 style="left:107px;top:41px;line-height:38px">방문자님의 기록 공간</h2><div class="cta" style="right:30px;top:38px">로그인·회원가입</div></div>
      <div class="card" style="position:absolute;left:30px;top:252px;width:1142px;height:105px"><div class="stat" style="left:0;top:20px;width:100%"><div><b>6</b><span>만든 다이어리</span></div><div style="border-left:1px solid var(--border)"><b>0</b><span>즐겨찾기</span></div></div></div>
      <div class="card" style="position:absolute;left:30px;top:374px;width:1142px;height:128px;padding:0 20px"><div style="position:absolute;left:20px;top:22px;font-size:19px;font-weight:800">환경 설정</div><div style="position:absolute;left:20px;top:72px;font-size:15px;font-weight:700">홈 책상 빛</div><div class="seg2" style="position:absolute;right:20px;top:54px"><div class="on">실시간</div><div>조명 없음</div></div></div>
      <div class="card" style="position:absolute;left:30px;top:524px;width:1142px;height:270px"><div style="position:absolute;left:28px;top:24px;font-size:19px;font-weight:800">앱 정보</div>
        <div class="row" style="left:28px;right:28px;top:78px;height:40px"><span>개인정보 처리방침</span>${icon('chevR', 20, '#0B1766')}</div>
        <div style="position:absolute;left:28px;right:28px;top:122px;height:1px;background:var(--border)"></div>
        <div class="row" style="left:28px;right:28px;top:136px;height:56px"><span>문의 이메일<br><small style="font-weight:600;color:var(--muted);font-size:14px">dioapp.official@gmail.com</small></span><div class="btn soft" style="width:64px;height:44px;font-size:13px;border-radius:14px">복사</div></div>
        <div style="position:absolute;left:28px;right:28px;top:208px;height:1px;background:var(--border)"></div>
        <div class="row" style="left:28px;right:28px;top:222px;height:40px"><span>오픈소스 및 콘텐츠 라이선스</span>${icon('chevR', 20, '#0B1766')}</div></div>`
  } else {
    inner = `<div class="h-title">내 공간</div>
      <div class="banner" style="left:18px;top:80px;width:354px;height:120px;border-radius:26px"><div class="av" style="left:20px;top:30px">D</div><h2 style="left:115px;top:26px;font-size:20px">방문자님의 기록 공간</h2><div class="cta" style="left:115px;top:66px;height:44px">로그인·회원가입</div></div>
      <div class="card" style="position:absolute;left:18px;top:220px;width:354px;height:106px"><div class="stat" style="left:0;top:20px;width:100%"><div><b>6</b><span>만든 다이어리</span></div><div style="border-left:1px solid var(--border)"><b>0</b><span>즐겨찾기</span></div></div></div>
      <div class="card" style="position:absolute;left:18px;top:348px;width:354px;height:298px"><div style="position:absolute;left:24px;top:24px;font-size:19px;font-weight:800">앱 정보</div>
        <div class="row" style="left:24px;right:24px;top:72px;height:44px"><span>개인정보 처리방침</span>${icon('chevR', 20, '#0B1766')}</div>
        <div style="position:absolute;left:24px;right:24px;top:122px;height:1px;background:var(--border)"></div>
        <div class="row" style="left:24px;right:24px;top:134px;height:56px"><span>문의 이메일<br><small style="font-weight:600;color:var(--muted);font-size:14px">dioapp.official@gmail.com</small></span><div class="btn soft" style="width:64px;height:44px;font-size:13px;border-radius:14px">복사</div></div>
        <div style="position:absolute;left:24px;right:24px;top:200px;height:1px;background:var(--border)"></div>
        <div class="row" style="left:24px;right:24px;top:214px;height:44px"><span>오픈소스 및 콘텐츠 라이선스</span>${icon('chevR', 20, '#0B1766')}</div></div>`
  }
  return shell(kind, skin, inner + (sk.over?.('내공간', kind) || ''), { nav: 'me', under: sk.under?.('내공간', kind) || '' })
}

function trash(kind, skin) {
  const sk = SKINS[skin] || SKINS.지금
  const tab = isT(kind)
  const a = byId('class'), b = { ...byId('trip'), color: '#9FC2C9', pattern: 'linen' }
  let inner
  if (tab) {
    inner = `<div class="h-title">휴지통</div><div class="pill" style="right:30px;top:40px;height:43px;border-radius:16px">선택</div>`
      + at(83, 112, cover(a, 162)) + at(374, 112, cover(b, 162))
      + at(30, 341, `<div class="dlabel" style="position:static"><b>우리 반 교환일기</b><span class="t-days">29일 후 영구 삭제</span></div>`)
      + at(321, 341, `<div class="dlabel" style="position:static"><b>제주 여행 일기</b><span class="t-days hot">3일 후 영구 삭제</span></div>`)
  } else {
    inner = `<div class="h-title">휴지통</div><div class="pill" style="right:18px;top:18px;height:43px">선택</div>`
      + at(40, 80, cover(a, 125)) + at(226, 80, cover(b, 125))
      + at(18, 340, `<div class="dlabel" style="position:static"><b>우리 반 교환일기</b><span class="t-days">28일 후 영구 삭제</span></div>`)
      + at(204, 340, `<div class="dlabel" style="position:static"><b>제주 여행 일기</b><span class="t-days hot">2일 후 영구 삭제</span></div>`)
  }
  return shell(kind, skin, inner + (sk.over?.('휴지통', kind) || ''), { nav: 'trash', under: sk.under?.('휴지통', kind) || '' })
}

// ---------- 안(skin) 정의 — 지금 외의 안은 코덱스 수치로 채운다 ----------
const SKINS = {
  지금: { cls: 'now' },
}

const SCREENS = { 로그인: login, 회원가입: signup, 홈: home, 공방: studio, 내공간: me, 휴지통: trash }

function render() {
  const raw = decodeURIComponent(location.hash.slice(1)) || '로그인|지금|태블릿'
  const [screen, skin, dev] = raw.split('|')
  const kind = dev === '폰' ? P : T
  document.getElementById('root').innerHTML = SCREENS[screen](kind, skin)
}
window.addEventListener('hashchange', render)
