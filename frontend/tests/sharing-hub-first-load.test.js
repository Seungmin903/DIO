import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const hub = read('src/sharing/SharingHub.js')

test('537: 공유 창은 참여자를 모를 때만 첫 로딩 동그라미 + 버튼 막기, 아는 때는 바로 보이고 뒤에서 새로 받는다', () => {
  assert.match(hub, /const blocking = !registered\.members\?\.length;[\s\S]{0,300}?if \(blocking\) \{ setBusy\(true\); setFirstLoad\(true\); \}/)
  // 동그라미는 공유 화면일 때만 버튼 자리에 그린다
  assert.match(hub, /\{firstLoad && screen === 'sharing' \? <ActivityIndicator accessibilityLabel="공유 정보 불러오는 중"/)
})

test('537 리뷰 !489: 첫 로딩 동그라미는 응답이 오면 늘 내리고, 버튼 막기는 그 요청이 마지막일 때만 푼다', () => {
  const start = hub.indexOf('runtime.getSharing(registered.id)')
  const block = hub.slice(start, hub.indexOf('} catch (error) {', start))
  // 실패해도 · 다른 동작이 job 을 올려도 finally 에서 동그라미를 내린다(job 조건 밖)
  assert.match(block, /\.finally\(\(\) => \{\s*if \(!blocking \|\| !alive\.current\) return;[\s\S]*?if \(loadToken === firstLoadToken\.current\) setFirstLoad\(false\);\s*if \(pending === job\.current\) setBusy\(false\);\s*\}\)/)
  // 동그라미는 올린 요청만 내린다(A 를 받는 중 B 를 열면 A 의 늦은 응답이 B 의 동그라미를 내리지 않게)
  assert.match(hub, /const firstLoadToken = useRef\(0\);/)
  assert.match(hub, /const loadToken = blocking \? \+\+firstLoadToken\.current : null;\s*(\/\/[^\n]*\n\s*)?if \(blocking\) \{ setBusy\(true\); setFirstLoad\(true\); \}/)
  assert.doesNotMatch(block, /pending === job\.current\) \{ setBusy\(false\); setFirstLoad\(false\); \}/)
  // 늦게 온 결과 · 실패는 마지막 요청일 때만 화면에 반영한다
  assert.match(block, /if \(alive\.current && pending === job\.current\) setDiary\(value\);/)
  assert.match(block, /if \(alive\.current && pending === job\.current\) \{ showFailure\(error\); setScreen\('invitations'\); \}/)
})

test('537: 참여자 ⋯ 를 누를 때 차단 목록을 아직 안 받았거나 실패했으면 그때 받는다(서버 연결일 때만)', () => {
  assert.match(hub, /if \(safety\?\.store\?\.mode === 'server' && \(status === 'idle' \|\| status === 'error'\)\) safety\.store\.refresh\(\);/)
  assert.match(hub, /onPress=\{\(\) => openMemberMenu\(member\)\}/)
})

test('537: 폰 공유 창은 루트가 아는 안전 영역 여백을 처음부터 써 뜬 뒤 아래로 튀지 않는다(편집기 안에 끼운 창은 예전대로)', () => {
  assert.match(hub, /<SafeFrame insets=\{embedded \? null : insets\} style=\{s\.backdrop\}>/)
  assert.match(hub, /function SafeFrame\(\{ insets, style, children \}\) \{\s*if \(!insets\) return <SafeAreaView style=\{style\}>\{children\}<\/SafeAreaView>;\s*return <View style=\{\[style, \{ paddingTop: insets\.top, paddingBottom: insets\.bottom, paddingLeft: insets\.left, paddingRight: insets\.right \}\]\}>/)
})

test('537 리뷰 !489: 태블릿 차단 목록 페이지는 창이 폰 배치로 줄면 마이페이지 처음으로 돌아간다', () => {
  const profile = read('src/diary/screens/ProfileScreen.js')
  assert.match(profile, /useEffect\(\(\) => \{ if \(compact && route === 'blocks'\) setRoute\('home'\); \}, \[compact, route\]\);/)
  // 페이지는 태블릿에서만 그리고, 폰은 앱의 차단 목록 화면을 연다
  assert.match(profile, /if \(route === 'blocks' && !compact && authenticatedUser && onOpenBlockedUsers\) return <BlockedUsersPage/)
  assert.match(profile, /onPress=\{compact \? onOpenBlockedUsers : \(\) => setRoute\('blocks'\)\}/)
  // 훅은 앞쪽(조건부 return 전)에 있어야 한다
  assert.ok(profile.indexOf("if (compact && route === 'blocks')") < profile.indexOf("if (route === 'password'"))
})

test('537 리뷰 !489: 역할을 모르는 신고 대상은 역할을 쓰지 않고(소유자를 편집자로 보이지 않게), 내 줄은 나 · 역할로 잇는다', () => {
  const safety = read('src/safety/SafetyScreen.js')
  assert.match(safety, /const roleLabel = member => member\.participation === 'PAST' \? '참여 종료' : member\.role === 'OWNER' \? '소유자' : member\.role \? '편집자' : '';/)
  assert.match(safety, /\{\[own && '나', roleLabel\(member\)\]\.filter\(Boolean\)\.join\(' · '\)\}/)
  assert.match(safety, /\{\[roleLabel\(target\), diaryTitle\]\.filter\(Boolean\)\.join\(' · '\)\}/)
})

test('596 리뷰 !489: 넓은 창의 라이선스 상세는 지금 검색 결과 안의 항목만 보인다', () => {
  const licenses = read('src/diary/components/ContentLicenses.js')
  assert.match(licenses, /const selected = wide \? entries\.find\(entry => entry\.id === selectedId\) \|\| entries\[0\] \|\| null : all\.find\(entry => entry\.id === selectedId\) \|\| null;/)
  // 소스 제공은 항목마다 '소스 받기' 줄로 남는다
  assert.match(licenses, /text=\{`소스 받기 · \$\{source\.fileName\}`\}/)
})

test('537 리뷰 !489: 증빙 사진 X 는 칸 안에 들어 안드로이드에서도 눌린다(사진 72 + 위 · 오른쪽 12 를 칸이 잡는다)', () => {
  const styles = read('src/safety/styles.js')
  assert.match(styles, /photos: \{ flexDirection: 'row', flexWrap: 'wrap' \},/)
  assert.match(styles, /photoCell: \{ width: 84, height: 84, paddingTop: 12, paddingRight: 12 \},/)
  assert.match(styles, /photoDelete: \{ position: 'absolute', top: 0, right: 0, width: 40, height: 40,/)
  assert.match(styles, /photoAdd: \{ width: 72, height: 72, marginTop: 12, marginRight: 12,/)
  assert.doesNotMatch(styles, /top: -12, right: -12/)
  // 입력 칸 모서리 주석은 실제 값(radius.lg = 12)과 같다
  assert.match(styles, /모서리 12\(radius\.lg\)/)
  assert.match(read('src/shared/theme.js'), /export const radius = \{ sm: 8, md: 10, lg: 12, xl: 16 \}/)
})
