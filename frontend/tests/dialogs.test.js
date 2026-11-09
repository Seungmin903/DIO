import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/shared/dialogs.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
});
// 호스트가 없을 때 쓰는 기본 창은 기록만 한다
function load() {
  const native = [], module = { exports: {} };
  const alert = { alert: (...args) => native.push(args) };
  new Function('require', 'module', 'exports', code)(id => (id === 'react-native' ? { Alert: alert, Platform: { OS: 'ios' } } : require(id)), module, module.exports);
  return { ...module.exports, native };
}

test('호스트가 없으면 기본 창으로 물어보고, 되돌릴 수 있는 동작은 위험 표시를 쓰지 않는다', () => {
  const { confirmAction, native } = load();
  confirmAction({ title: 't', message: 'm', confirmLabel: '휴지통으로', onConfirm() {}, danger: false });
  assert.equal(native[0][2][1].style, 'default');
  confirmAction({ title: 't', message: 'm', confirmLabel: '영구 삭제', onConfirm() {} });
  assert.equal(native[1][2][1].style, 'destructive');
});

test('호스트가 있으면 앱 창 요청으로 쌓고, 확인은 창을 닫은 뒤에 실행하며 다음 창이 이어진다', () => {
  const { confirmAction, notify, dialogStore, native } = load();
  const detach = dialogStore.attach();
  const log = [];
  confirmAction({ title: '영구 삭제할까요?', message: 'm', confirmLabel: '영구 삭제', onConfirm: () => { log.push(['confirm', dialogStore.getSnapshot()]); notify('실패', '안내'); } });
  assert.equal(native.length, 0);
  assert.equal(dialogStore.getSnapshot().kind, 'confirm');
  assert.equal(dialogStore.getSnapshot().danger, true);
  dialogStore.settle(true);
  // onConfirm 안에서 새 창을 띄워도 순서가 꼬이지 않는다: 확인 시점엔 앞 창이 이미 닫혀 있다
  assert.equal(log[0][1], null);
  assert.equal(dialogStore.getSnapshot().kind, 'notify');
  dialogStore.settle(false);
  assert.equal(dialogStore.getSnapshot(), null);
  // 취소는 onConfirm 을 부르지 않는다
  confirmAction({ title: 't', message: 'm', confirmLabel: 'x', onConfirm: () => log.push('no') });
  dialogStore.settle(false);
  assert.equal(log.length, 1);
  detach();
});

test('취소하면 onCancel 을 부른다(앱 창 · 기본 창 모두)', () => {
  const { confirmAction, dialogStore, native } = load();
  const log = [];
  confirmAction({ title: 't', message: 'm', confirmLabel: '공유하기', onConfirm: () => log.push('native-confirm'), onCancel: () => log.push('native-cancel'), danger: false });
  native[0][2][0].onPress();
  // 안드로이드에서 버튼 없이 닫히면 onDismiss 만 불린다: 그때도 취소로 본다
  native[0][3].onDismiss();
  const detach = dialogStore.attach();
  confirmAction({ title: 't', message: 'm', confirmLabel: '공유하기', onConfirm: () => log.push('confirm'), onCancel: () => log.push('cancel'), danger: false });
  dialogStore.settle(false);
  confirmAction({ title: 't', message: 'm', confirmLabel: '공유하기', onConfirm: () => log.push('confirm'), onCancel: () => log.push('cancel'), danger: false });
  dialogStore.settle(true);
  detach();
  assert.deepEqual(log, ['native-cancel', 'native-cancel', 'cancel', 'confirm']);
});

test('마지막 호스트가 떨어지면 남은 확인 창을 취소로 끝낸다', () => {
  const { confirmAction, notify, dialogStore } = load();
  const log = [];
  const first = dialogStore.attach(), second = dialogStore.attach();
  confirmAction({ title: 'a', message: 'm', confirmLabel: '확인', onConfirm: () => log.push('a-confirm'), onCancel: () => log.push('a-cancel') });
  notify('b', 'm');
  first();
  assert.deepEqual(log, []); // 다른 호스트가 아직 보여 준다
  second();
  assert.deepEqual(log, ['a-cancel']);
  assert.equal(dialogStore.getSnapshot(), null);
});
