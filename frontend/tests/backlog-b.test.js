import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { justifiedParagraph, justifyBreaks, paragraphLabel } from '../src/shared/legalContent.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10));

test('지라 651: 회원 탈퇴 확인창은 공용 확인창 틀(오른쪽 위 X 없음, 취소 글자 + dangerStrong 채움)', () => {
  const screen = read('src/auth/ProfileEditScreen.js');
  const styles = read('src/auth/profileStyles.js');
  assert.match(screen, /const withdrawDialog = dialog === 'withdraw'/);
  assert.match(screen, /\{!discardDialog && !withdrawDialog && \(\s*<Pressable[\s\S]*?확인 창 닫기/);
  assert.match(screen, /s\.confirmDialog/);
  assert.match(screen, /탈퇴하기/);
  assert.match(styles, /confirmDialog: \{ width: 320, maxWidth: '100%', borderRadius: 12, padding: 20/);
  assert.match(styles, /confirmDanger: \{ backgroundColor: c\.dangerStrong \}/);
  assert.match(styles, /confirmActions: \{[^}]*justifyContent: 'flex-end'/);
  // 확인 문구 입력은 유지한다
  assert.match(screen, /withdrawText !== WITHDRAW_TEXT/);
});

test('지라 665: 옮기기 확인 · 완료 창은 확인창 버튼(취소 글자 + 채움, 완료는 확인 하나)', () => {
  const dialog = read('src/diary/components/GuestImportDialog.js');
  assert.doesNotMatch(dialog, /DioButton/);
  assert.match(dialog, /card: \{ width: 320/);
  assert.match(dialog, /<ActionButton label="나중에"/);
  assert.match(dialog, /<ActionButton filled label="확인"/);
});

test('지라 670: 탈퇴 완료 토스트는 앱 맨 위에서 띄운다', () => {
  const app = read('App.js');
  const profile = read('src/diary/screens/ProfileScreen.js');
  assert.match(app, /const withdrawSession = \(\) => \{ clearSession\(\); setAccountToast\(/);
  assert.match(app, /회원 탈퇴가 완료됐어요\./);
  assert.match(app, /onWithdrawn=\{withdrawSession\}/);
  assert.match(app, /<AccountToast key=\{accountToast\.key\}/);
  assert.match(profile, /onEndSession=\{onWithdrawn\}/);
});

test('지라 654: 설정 · 알림 설정 · 회원정보 수정의 태블릿 본문 폭과 좌우 여백이 같다', () => {
  const edit = read('src/auth/profileStyles.js');
  const notify = read('src/diary/screens/NotificationSettingsScreen.js');
  const profile = read('src/diary/screens/ProfileScreen.js');
  assert.match(edit, /railWide: \{ width: '100%', maxWidth: 1040/);
  assert.match(edit, /scroll: \{ flexGrow: 1, paddingHorizontal: 30/);
  assert.match(notify, /list: \{ width: '100%', maxWidth: 1040/);
  assert.match(notify, /scroll: \{[^}]*paddingHorizontal: 30/);
  assert.match(profile, /column: \{ width: '100%', maxWidth: 1040/);
  // 제목(머리줄)도 같은 칸 안에 있다
  assert.match(notify, /<View style=\{styles\.list\}>\s*<Header title=\{NOTIFICATION_SETTINGS_TITLE\}/);
});

test('개인정보 처리방침 등 법률 문서 화면은 상태 표시줄 영역까지 흰색 상단 바', () => {
  const legal = read('src/auth/LegalDocumentScreen.js');
  assert.match(legal, /height: insets\.top, backgroundColor: colors\.surface/);
  assert.match(legal, /edges=\{\['bottom', 'left', 'right'\]\}/);
});

test('처리방침: 안드로이드는 낱말 안은 붙이고 띄어쓰기 · 가운뎃점 뒤에서만 줄을 바꾸며, 본문은 왼쪽 맞춤(iOS 는 양쪽 맞춤)', () => {
  const ZW = String.fromCharCode(0x200B), WJ = String.fromCharCode(0x2060);
  // 낱말 가운데('신승 / 민')에서는 끊지 않고 '·' 뒤에서만 끊을 수 있다(지라 655)
  assert.equal(justifyBreaks('개인·정보 신승민', { os: 'android' }), `개${WJ}인${WJ}·${ZW}정${WJ}보 신${WJ}승${WJ}민`);
  assert.equal(justifyBreaks('Android·iOS 앱', { os: 'android' }), `Android${WJ}·${ZW}iOS 앱`);
  assert.equal(justifyBreaks('개인정보', { os: 'ios' }), '개인정보');
  // 줄바꿈 자리를 넣은 문단만 화면 읽기에 원문을 준다(링크 문단 · 제목 · iOS 는 없음)
  assert.equal(paragraphLabel({ type: 'paragraph', text: '개인정보 처리' }, 'android', '1. '), '1. 개인정보 처리');
  assert.equal(paragraphLabel({ type: 'paragraph', text: 'a', links: [{ label: 'a', url: 'b' }] }, 'android'), undefined);
  assert.equal(paragraphLabel({ type: 'heading', text: '1. 처리 원칙' }, 'android'), '1. 처리 원칙');
  assert.equal(paragraphLabel({ type: 'paragraph', text: 'a' }, 'ios'), undefined);
  assert.equal(justifyBreaks(undefined, { os: 'android' }), undefined);
  assert.equal(justifiedParagraph({ links: [{ label: 'a', url: 'b' }] }, 'android'), false);
  assert.equal(justifiedParagraph({ links: [{ label: 'a', url: 'b' }] }, 'ios'), true);
  assert.equal(justifiedParagraph({}, 'android'), false);
  assert.equal(justifiedParagraph({}, 'ios'), true);
});

test('탈퇴 토스트 타이머는 다시 그려져도 처음부터 다시 세지 않는다(최신 onDone 은 ref)', () => {
  const app = read('App.js');
  assert.match(app, /done\.current = onDone;/);
  assert.match(app, /setTimeout\(\(\) => done\.current\?\.\(\), 2000\); return \(\) => clearTimeout\(timer\); \}, \[message\]\);/);
});
