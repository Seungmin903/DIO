import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// SharingHub 는 무거워 순서 함수만 떼어 실행한다
const src = read('../src/sharing/SharingHub.js')
const fn = src.slice(src.indexOf('export function orderMembers'), src.indexOf('function Button({'))
const { orderMembers } = (() => { const code = babel.transformSync(fn, { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code; const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports); return m.exports })()

test('686: 공유 창 참여자 순서는 나 → 소유자 → 나머지(참여 순서)', () => {
  const members = [{ id: 'o', role: 'OWNER' }, { id: 'a', role: 'EDITOR' }, { id: 'me', role: 'EDITOR' }, { id: 'b', role: 'EDITOR' }]
  assert.deepEqual(orderMembers(members, 'me').map(m => m.id), ['me', 'o', 'a', 'b'])
  // 내가 소유자면 나 한 번만
  assert.deepEqual(orderMembers([{ id: 'me', role: 'OWNER' }, { id: 'a', role: 'EDITOR' }], 'me').map(m => m.id), ['me', 'a'])
  assert.deepEqual(orderMembers([], 'me'), [])
})

test('686: 프로필 동그라미는 모두 같은 크기, 소유자는 오른쪽 아래 금색 왕관, 내 줄은 오른쪽 연필', () => {
  assert.match(src, /orderMembers\(diary\.members, runtime\.self\.id\)\.map/)
  assert.match(src, /\{member\.role === 'OWNER' && <OwnerCrown \/>\}/)
  assert.match(src, /accessibilityLabel="이 다이어리 프로필 수정" style=\{\[s\.iconButton, s\.edgeIcon\]\}/)
  // 예전 내 것만 큰 동그라미(profileControl) · 전체 참여자 보기 · 가득 참 안내 줄은 공유 첫 화면에 없다
  const home = src.slice(src.indexOf("{screen === 'sharing' && diary && ("), src.indexOf("{screen === 'copy' && diary && <>"))
  assert.doesNotMatch(home, /s\.profileControl|label="전체 참여자 보기"|>소유자 포함 4명이 함께하고 있어요\.</)
  const styles = read('../src/sharing/styles.js')
  assert.match(styles, /avatar: \{\n    width: 40,\n    height: 40,/)
  const crown = read('../src/sharing/OwnerCrown.js')
  assert.match(crown, /import \{ STAR_GOLD \} from '\.\.\/shared\/FavoriteStar'/)
  assert.match(crown, /right: -4, bottom: -3/)
  assert.match(crown, /size = 15/)
  assert.doesNotMatch(crown, /borderRadius/, '받침 동그라미 없음')
})

test('686: 알림은 머리줄 X 왼쪽 종 아이콘(새 초대가 있으면 빨간 점), 큰 알림 박스 없음', () => {
  assert.match(src, /\{screen === 'sharing' && diary && <Pressable\s+accessibilityRole="button"\s+accessibilityLabel=\{`알림, \$\{noticeState\}`\}/)
  assert.match(src, /\{countValue > 0 && <View testID="sharing-notice-dot" style=\{s\.headerDot\} \/>\}/)
  assert.doesNotMatch(src, /s\.banner/)
})

test('686: 공유 창에 다이어리 제목 칸 없음 · 알림 화면 초대 카드에 더보기 링크 없음(상세는 카드를 눌러 연다)', () => {
  const home = src.slice(src.indexOf("{screen === 'sharing' && diary && ("), src.indexOf("{screen === 'copy' && diary && <>"))
  assert.doesNotMatch(home, /<DiarySummary/)
  assert.match(src, /<Text style=\{s\.invitationsLabel\}>받은 초대<\/Text>/)
  assert.doesNotMatch(src, /moreLink|초대 더보기/)
  assert.match(src, /accessibilityLabel=\{`\$\{row\.title\} 초대 상세`\}/)
  assert.match(src, /'정원이 다 차서 더 초대할 수 없어요\.'/)
})

test('686: 맨 아래 "완료" 없음(닫기는 X), "다이어리 열기"는 방금 초대를 수락한 다이어리에서만(열기 재시도)', () => {
  assert.match(src, /if \(!editingProfile\) setJoinedId\(result\.id\);/)
  assert.match(src, /\{joinedId === diary\.id && onOpenDiary && runtime\.canOpenDiary !== false && <Button\s+label="다이어리 열기"/)
  const home = src.slice(src.indexOf("{screen === 'sharing' && diary && ("), src.indexOf("{screen === 'copy' && diary && <>"))
  assert.doesNotMatch(home, /label="완료"|: '완료'}/)
})

test('686: 처리 중 도넛 없음 · 알림에서 보던 다이어리로는 기다림 없이 돌아간다', () => {
  assert.doesNotMatch(src, /accessibilityLabel="공유 요청 처리 중"/)
  assert.match(src, /if \(diary\?\.id === id\) \{\s+setScreen\('sharing'\); setError\(''\);/)
})

test('686: 참여자 ⋯ 는 다른 화면 대신 말풍선(신고하기 · 차단하기), 신고는 신고 화면을 바로 연다', () => {
  assert.match(src, /onPress=\{\(\) => openMemberMenu\(member\)\}/)
  assert.match(src, /\{ id: 'report', icon: 'flag', text: '신고하기'/)
  assert.match(src, /onOpenParticipants\(diary, member, 'report'\)/)
  assert.match(src, /id: 'block', icon: 'ban', danger: !isBlocked\(memberMenu\.member\), text: isBlocked\(memberMenu\.member\) \? '차단 해제' : '차단하기'/)
  assert.match(src, /safety\.store\.block\(current\.member, diary\.sharedDiaryId \|\| diary\.id\)/)
  const provider = read('../src/safety/SafetyProvider.js')
  assert.match(provider, /action === 'report' && target \? \{ kind: 'report', direct: true, diary, target, onClosed \}/)
  const screen = read('../src/safety/SafetyScreen.js')
  assert.match(screen, /if \(request\.direct\) \{ onClose\(\); return; \}/)
  const app = read('../App.js')
  assert.match(app, /safety\.openParticipants\(diary, \{ target, action, onClosed/)
})

test('686: 이메일 칸은 구분선 아래 초대 구역 · 보낸 초대 화면 없음 · 공유 창에서 들어온 알림 화면에는 ‹(이전 공유 화면)', () => {
  const home = src.slice(src.indexOf("{screen === 'sharing' && diary && ("), src.indexOf("{screen === 'copy' && diary && <>"))
  const section = home.indexOf('<View style={s.section}>')
  assert.ok(section > 0 && home.indexOf('accessibilityLabel="초대할 이메일"') > section, '이메일 칸이 구분선 구역 안')
  assert.doesNotMatch(src, /screen === 'email'|cancel-email|보낸 초대 새로고침/)
  assert.match(src, /\{screen !== 'sharing' && \(screen !== 'invitations' \|\| !!request\?\.diary\) && \(/)
})

test('686: 소유자는 참여자 ⋯ 말풍선에서 소유권 양도 · 다이어리에서 제외, 따로 관리 버튼 · 화면 없음', () => {
  assert.match(src, /isOwner && typeof runtime\.transferOwner === 'function' && \{ id: 'transfer', icon: 'crown', text: '소유권 양도'/)
  assert.match(src, /isOwner && \{ id: 'remove', icon: 'user-minus', danger: true, text: '다이어리에서 제외'/)
  assert.doesNotMatch(src, /accessibilityLabel="참여자 관리"|screen === 'members'/)
})

test('686: 초대 구역 = 이메일 주소로 초대 → [이메일 칸][초대] → 초대 링크로 초대 + 새로고침 → [링크 칸][복사] → 상태 줄(소유자만 링크)', () => {
  const home = src.slice(src.indexOf("{screen === 'sharing' && diary && ("), src.indexOf("{screen === 'copy' && diary && <>"))
  const order = ['>이메일 주소로 초대<', 'accessibilityLabel="초대할 이메일"', 'accessibilityLabel="이메일 초대 보내기"', '>초대 링크로 초대<', 'accessibilityLabel="초대 링크 다시 만들기"', 'accessibilityLabel="초대 링크 복사"', 's.inviteStatus']
    .map(key => home.indexOf(key))
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), order.join(','))
  assert.match(src, /const canLink = isOwner;/)
  assert.match(src, /style=\{\[s\.inviteEmailButton, \(busy \|\| isFull \|\| !emailReady\) && s\.disabled\]\}/)
  assert.match(src, /style=\{\[s\.inviteCopyButton, \(busy \|\| isFull\) && s\.disabled\]\}/)
  // 링크가 없거나 만료면 복사가 먼저 만든다. 소유자가 창을 열 때 링크가 없으면 한 번 만든다(콜드 스타트)
  assert.match(src, /if \(!usableLink\(current\)\) \{\s+current = await runtime\.createLink\(diary\.id\);/)
  assert.match(src, /if \(!owner \|\| diary\.members\.length >= MAX_SHARING_MEMBERS \|\| usable \|\| running\.current\) return;/)
  assert.match(src, /`초대 링크가 \$\{expiryClock\(diary\.linkExpiresAt\)\}에 만료돼요\.`/)
  assert.match(src, /question\?\.kind === 'relink' \? '초대 링크를 다시 만들까요\?'/)
  const styles = read('../src/sharing/styles.js')
  // 두 버튼은 같은 크기(높이 48 · 폭 72), 초대는 채움 · 복사는 테두리
  assert.match(styles, /inviteEmailButton: \{ minWidth: 72, height: 48,[^}]*backgroundColor: c\.primaryStrong/)
  assert.match(styles, /inviteCopyButton: \{ minWidth: 72, height: 48,[^}]*borderWidth: 1, borderColor: c\.primary, backgroundColor: c\.surface/)
  const bubble = read('../src/diary/components/DiaryActionBubble.js')
  assert.match(bubble, /color=\{action\.danger \? colors\.dangerStrong : colors\.text\}/)
})

test('686: 프로필 수정은 표지 · 큰 제목 없이 다이어리 이름 한 줄, 저장 버튼 글자는 "저장"(초대 수락은 표지 그대로)', () => {
  assert.match(src, /\{editingProfile \? \(\s*<View style=\{s\.profileDiaryLine\}>/)
  assert.match(src, /text=\{editingProfile \? '저장' : undefined\}/)
})

test('686: 알림 화면 새로고침은 머리줄 X 왼쪽, 도구 줄은 받은 초대 · 모두 읽음만', () => {
  assert.match(src, /\{screen === 'invitations' && <Pressable\s+accessibilityRole="button"\s+accessibilityLabel="새로고침"/)
  const toolbar = src.slice(src.indexOf('<View style={s.notificationToolbar}>'), src.indexOf('모두 읽음</Text>'))
  assert.doesNotMatch(toolbar, /새로고침/)
})

test('686: 사진 · 닉네임을 함께 고치는 칸의 이름은 "다이어리 프로필"', () => {
  assert.match(src, /<Text style=\{s\.label\}>다이어리 프로필<\/Text>/)
  assert.doesNotMatch(src, /<Text style=\{s\.label\}>다이어리 닉네임<\/Text>/)
})

test('686: 공유 창 참여자 줄 역할 글자는 소유자만(편집자는 적지 않는다)', () => {
  const home = src.slice(src.indexOf("{screen === 'sharing' && diary && ("), src.indexOf("{screen === 'copy' && diary && <>"))
  assert.doesNotMatch(home, /'소유자' : '편집자'/)
  assert.match(home, /\[member\.role === 'OWNER' && '소유자',/)
})

test('알림 새로고침 때 자리표시(빈 네모) · 스피너가 깜빡이지 않는다 — 처음 불러올 때만, 다시 받을 때는 이전 결과 그대로', () => {
  assert.doesNotMatch(src, /s\.skeleton/)
  assert.match(src, /\(list\.status === 'loading' \|\| list\.status === 'idle'\) && !list\.data && \(/)
  assert.match(src, /\{items\.length === 0 && list\.data && list\.status !== 'error' && \(/)
  const panel = read('../src/notifications/NotificationPanel.js')
  assert.match(panel, /\(list\.status === 'idle' \|\| list\.status === 'loading'\) && items\.length === 0 && !list\.data &&/)
  assert.match(panel, /\{items\.length === 0 && list\.data && list\.status !== 'error' && <View testID="notification-empty"/)
})

test('알림이 많으면 목록 칸만 창 안에서 스크롤하고 초대 링크 확인은 아래에 고정, 창 높이 고정 · 훅은 이른 return 위', () => {
  assert.match(src, /<FadeScroll testID="sharing-invitations-scroll" style=\{s\.invitationScroll\}/)
  assert.match(src, /const fixedHeight = screen === 'invitations' \? \(lockedHeight \|\| /)
  assert.match(src, /fixedHeight \? \{ height: fixedHeight \}/)
  // useWindowDimensions 는 if (!request) return null 보다 위(훅 순서가 바뀌면 창을 열 때 앱이 멈췄다)
  assert.ok(src.indexOf('useWindowDimensions().height') < src.indexOf('if (!request) return null'))
  const styles = read('../src/sharing/styles.js')
  assert.match(styles, /invitationScroll: \{ flex: 1, minHeight: 0 \}/)
})

test('655: 참여자를 빼는 동작은 파일 내보내기와 겹치지 않게 다이어리에서 제외라 부른다', () => {
  assert.match(src, /question\?\.kind === 'remove' \? `\$\{question\.member\.nickname\}님을 제외할까요\?`/)
  assert.match(src, /question\?\.kind === 'remove' \? '제외' :/)
  assert.match(src, /setToast\('참여자를 제외했어요\.'\)/)
  assert.doesNotMatch(src, /님을 내보낼까요|참여자를 내보냈어요|text: '내보내기'/)
})
