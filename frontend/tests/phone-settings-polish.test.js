import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('597: 회원 탈퇴는 마이페이지 계정 구역 로그아웃 아래 목록 줄, 누르면 탈퇴 창만 뜬다', () => {
  const profile = read('../src/diary/screens/ProfileScreen.js')
  assert.match(profile, /<SettingSection title="계정">\{accountRow\}\{passwordRow\}\{logout\}\{withdrawRow\}<\/SettingSection>/) // 로그인 계정 · 비밀번호 변경은 지라 842에 프로필 수정 화면에서 옮겨 왔다
  assert.match(profile, /accessibilityLabel="회원 탈퇴" onPress=\{\(\) => setWithdrawing\(true\)\} style=\{local\.linkRow\}/)
  assert.match(profile, /<WithdrawDialog service=\{editService\}/)
  assert.doesNotMatch(profile, /<DioButton variant="ghost" outline label="로그아웃"/)
  // 프로필 수정 화면은 없앴다(지라 842). 탈퇴 창만 따로 남는다
  assert.equal(existsSync(new URL('../src/auth/ProfileEditScreen.js', import.meta.url)), false)
  assert.match(read('../src/auth/WithdrawDialog.js'), /accessibilityLabel="탈퇴하기"/)
})

test('598: 폰 차단한 사용자 머리줄은 화면 바탕색(위쪽이 두 색으로 갈리지 않게)', () => {
  assert.match(read('../src/safety/styles.js'), /phoneHeader: \{ backgroundColor: c\.surfaceSoft \}/)
  assert.match(read('../src/safety/SafetyScreen.js'), /<View style=\{\[s\.header, isPhone && s\.phoneHeader\]\}>/)
})

test('알림 설정 마케팅 정보 수신은 구역 제목(SettingTitle) + 구분선 있는 동의 줄', () => {
  const screen = read('../src/diary/screens/NotificationSettingsScreen.js')
  assert.match(screen, /<SettingTitle>마케팅 정보 수신<\/SettingTitle>/)
  const terms = read('../src/diary/components/TermsConsentSection.js')
  assert.match(terms, /row: \{ minHeight: 48,[^}]*borderBottomWidth: 1, borderBottomColor: colors\.cardBorder \}/)
  assert.match(terms, /label: \{ color: colors\.text, fontSize: 16, lineHeight: 22, fontWeight: '600' \}/)
})

test('설정 줄은 모두 48 · 이름 16/600 · cardBorder, 구역 맨 아래 줄 밑 구분선은 감춘다', () => {
  const row = read('../src/diary/components/SettingRow.js')
  assert.match(row, /sectionBody: \{ overflow: 'hidden' \}/)
  assert.match(row, /sectionRows: \{ marginBottom: -2 \}/)
  const profile = read('../src/diary/screens/ProfileScreen.js')
  assert.match(profile, /linkRow: \{ minHeight: 48, paddingVertical: 8,[^}]*borderBottomColor: colors\.cardBorder \}/)
  const info = read('../src/diary/components/AppInformation.js')
  assert.doesNotMatch(info, /minHeight: (56|64|72)/)
  assert.match(info, /label: \{ color: C\.ink, fontSize: 16, lineHeight: 22, fontWeight: '600' \}/)
})

test('투명 모달은 상태 · 내비게이션 막대까지 덮고, 안드로이드는 내용을 화면 크기 판에 고정한다(뜰 때 튀지 않게)', () => {
  const modal = read('../src/editor/components/controls/EditorModal.js')
  assert.match(modal, /const cover = statusBarTranslucent \?\? transparent/)
  assert.match(modal, /navigationBarTranslucent=\{navigationBarTranslucent \?\? \(cover && transparent\)\}/)
  assert.match(modal, /const pinned = transparent && Platform\?\.OS === 'android'/)
  assert.match(modal, /width: screen\.width, height: screen\.height/)
})
