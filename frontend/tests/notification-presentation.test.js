import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationPresentation } from '../src/notifications/notificationPresentation.js';
import { toServerNotification } from '../src/notifications/serverNotificationApi.js';
import { createNotificationApi, createInvitationGateway, toNotification } from '../src/notifications/notificationApi.js';
import { createMockNotificationTransport } from '../src/notifications/mockNotificationTransport.js';
import { createNotificationStore } from '../src/notifications/notificationStore.js';

test('실서버 초대 종류와 목 호환 종류만 초대 문구·상세 동작을 제공한다', () => {
  for (const notificationType of ['DIARY_INVITE', 'DIARY_INVITED']) {
    const row = toServerNotification({ notification: { notificationId: '1', notificationType, createdAt: '2026-10-27T00:00:00Z' },
      invitation: { inviteId: 'invite', status: 'PENDING', canOpen: true } });
    assert.equal(notificationPresentation(row).canInspectInvitation, true); assert.equal(row.actionable, true);
  }
  const missing = toServerNotification({ notification: { notificationId: '1', notificationType: 'DIARY_INVITE', createdAt: 'date' }, invitation: null });
  assert.equal(notificationPresentation(missing).canInspectInvitation, false); assert.equal(missing.actionable, false);
});
test('일반·미지원 종류의 초대 payload는 무시하고 일반 문구로 표시한다', () => {
  for (const notificationType of ['MOCK_NOTICE', 'FUTURE_TYPE']) {
    const row = toServerNotification({ notification: { notificationId: '1', notificationType, createdAt: 'date' }, invitation: { broken: true } });
    assert.equal(row.notificationType, notificationType); assert.equal(row.inviteId, null); assert.equal(row.actionable, false);
    const presentation = notificationPresentation(row);
    assert.equal(presentation.title, '알림'); assert.equal(presentation.message, '새로운 알림이 도착했어요.'); assert.equal(presentation.invitation, false);
  }
});
test('일반/미지원 알림은 상세 gateway 없이 읽음·삭제하고 이전 초대 상세를 닫는다', async () => {
  for (const type of ['MOCK_NOTICE', 'FUTURE_TYPE']) {
    const mock = createMockNotificationTransport({ delay: 0 }); const api = createNotificationApi(mock.transport), gateway = createInvitationGateway(mock.transport);
    let lookups = 0;
    const store = createNotificationStore(api, { get: (...args) => { lookups++; return gateway.get(...args); } });
    await store.refresh(); await store.open(store.getSnapshot().items[0]); assert.equal(lookups, 1);
    const id = mock.addGeneral(type); await store.refresh(); const row = store.getSnapshot().items.find(item => item.id === id);
    const before = lookups; await store.open({ ...row, inviteId: 'forged' });
    assert.equal(lookups, before); assert.equal(store.getSnapshot().invitation.status, 'idle');
    assert.ok(mock.inspect().rows.find(item => item.notificationId === id).readAt);
    let moves = 0; await store.proceedToInvitation(() => moves++); assert.equal(moves, 0);
    await store.remove(id); assert.ok(!store.getSnapshot().items.some(item => item.id === id)); store.dispose();
  }
});

// Expo가 사용하는 Babel로 JSX만 변환하고 실제 RN Web 컴포넌트를 렌더링한다.
// 별도 UI 테스트 라이브러리나 앱 진입점 변경 없이 같은 패널의 어댑터별 노출을 검증한다.
test('공통 패널은 서버와 목 모두 읽음과 기본 동작을 제공한다', async () => {
  const { createRequire } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createServerNotificationApi } = await import('../src/notifications/serverNotificationApi.js');
  const require = createRequire(import.meta.url);
  const expoRequire = createRequire(require.resolve('expo/package.json'));
  const { transformSync } = expoRequire('@babel/core');
  const panelUrl = new URL('../src/notifications/NotificationPanel.js', import.meta.url);
  const panelRequire = createRequire(panelUrl);
  const { code } = transformSync(readFileSync(panelUrl, 'utf8'), {
    babelrc: false, configFile: false,
    plugins: [[expoRequire.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
      expoRequire.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const stylesModule = { exports: {} };
  const stylesCode = transformSync(readFileSync(new URL('../src/sharing/styles.js', import.meta.url), 'utf8'), { babelrc: false, configFile: false,
    plugins: [expoRequire.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('require', 'module', 'exports', stylesCode)(name => name === 'react-native' ? require('react-native-web') : panelRequire(name.endsWith('.js') ? name : `${name}.js`), stylesModule, stylesModule.exports);
  const notices = [];
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react-native') return require('react-native-web');
    if (name === '../shared/dialogs') return { notify: (...args) => notices.push(args) };
    if (name === '../sharing/styles') return stylesModule.exports;
    if (name === '../diary/components/Cover') return { default: () => null, __esModule: true };
    if (name === '../shared/AppIcon') return { default: () => null, __esModule: true };
    if (name.startsWith('.')) return panelRequire(name.endsWith('.js') ? name : `${name}.js`);
    return panelRequire(name);
  }, module, module.exports);
  const Panel = module.exports.default;
  const mock = createMockNotificationTransport({ delay: 0 });
  const mockStore = createNotificationStore(createNotificationApi(mock.transport), createInvitationGateway(mock.transport));
  const serverApi = createServerNotificationApi(async ({ path }) => path.endsWith('unread-count')
    ? { unreadCount: 1 } : { items: [{ notification: { notificationId: '1', notificationType: 'NOTICE', createdAt: 'date', readAt: null }, invitation: null }], hasNext: false, nextCursor: null });
  const serverStore = createNotificationStore(serverApi, {});
  try {
    for (const [store, expected] of [[serverStore, true], [mockStore, true]]) {
      await store.refresh();
      assert.equal(store.getSnapshot().canReadAll, expected);
      const html = renderToStaticMarkup(createElement(Panel, { model: { ...store.getSnapshot(), store } }));
      assert.equal(html.includes('aria-label="모두 읽음"'), expected);
      assert.ok(html.includes('aria-label="알림 새로고침"'));
      assert.ok(html.includes('aria-label="알림 삭제 '));
      const row = store.getSnapshot().items[0];
      for (const readAt of [null, '2026-11-04T00:00:00Z']) {
        const rendered = renderToStaticMarkup(createElement(Panel, { model: { ...store.getSnapshot(), store, items: [{ ...row, readAt }] } }));
        assert.ok(rendered.includes(`${notificationPresentation(row).title}, ${readAt ? '읽음' : '안 읽음'}`));
      }
    }
    for (const actor of ['', null, undefined, '다른 사용자', '하루']) {
      const snapshot = mockStore.getSnapshot();
      const row = { ...snapshot.items[0], actor };
      const tree = Panel({ model: { ...snapshot, items: [row], store: mockStore } });
      const walk = node => {
        if (!node || typeof node !== 'object') return;
        const children = [node.props?.children].flat(Infinity);
        if (node.type === require('react-native-web').View) assert.equal(children.includes(''), false);
        children.forEach(walk);
      };
      walk(tree);
      const html = renderToStaticMarkup(createElement(Panel, { model: { ...snapshot, items: [row], store: mockStore } }));
      assert.equal(html.includes('다이어리 초대가 도착했어요.'), false);
      assert.equal(html.includes('하루님의 초대'), actor === '하루');
      assert.equal(html.includes('다른 사용자님의 초대'), actor === '다른 사용자');
    }
    await mockStore.readAll();
    assert.equal(mockStore.getSnapshot().mutation.status, 'success');
    assert.equal(mockStore.getSnapshot().count.data.unreadCount, 0);
  } finally { mockStore.dispose(); serverStore.dispose(); }
});

test('초대 확인은 열 수 있는 초대면 안쪽 상세 카드 없이 곧장 수락 화면으로 넘기고, 끝난 초대는 카드에 남긴다', async () => {
  const { createRequire } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  const require = createRequire(import.meta.url);
  const expoRequire = createRequire(require.resolve('expo/package.json'));
  const { transformSync } = expoRequire('@babel/core');
  const panelUrl = new URL('../src/notifications/NotificationPanel.js', import.meta.url);
  const panelRequire = createRequire(panelUrl);
  const { code } = transformSync(readFileSync(panelUrl, 'utf8'), { babelrc: false, configFile: false,
    plugins: [[expoRequire.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expoRequire.resolve('@babel/plugin-transform-modules-commonjs')] });
  const stylesModule = { exports: {} };
  const stylesCode = transformSync(readFileSync(new URL('../src/sharing/styles.js', import.meta.url), 'utf8'), { babelrc: false, configFile: false,
    plugins: [expoRequire.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('require', 'module', 'exports', stylesCode)(name => name === 'react-native' ? require('react-native-web') : panelRequire(name.endsWith('.js') ? name : `${name}.js`), stylesModule, stylesModule.exports);
  const notices = [];
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'react-native' ? require('react-native-web')
    : name === '../shared/dialogs' ? { notify: (...args) => notices.push(args) }
    : name === '../sharing/styles' ? stylesModule.exports
    : name === '../diary/components/Cover' ? { default: () => null, __esModule: true }
    : name === '../shared/AppIcon' ? { default: () => null, __esModule: true }
    : name.startsWith('.') ? panelRequire(name.endsWith('.js') ? name : `${name}.js`) : panelRequire(name), module, module.exports);
  const Panel = module.exports.default;
  const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
  const mock = createMockNotificationTransport({ delay: 0, pageSize: 10 });
  const store = createNotificationStore(createNotificationApi(mock.transport), createInvitationGateway(mock.transport));
  await store.refresh();
  const press = async (row, onInvitationReady) => {
    const tree = Panel({ model: { ...store.getSnapshot(), store }, onInvitationReady });
    await nodes(tree).find(n => n.props?.label === `초대 확인 ${row.id}`).props.onPress();
  };
  const rows = store.getSnapshot().items;
  const pending = rows.find(row => row.status === 'PENDING'), expired = rows.find(row => row.status === 'EXPIRED');
  for (const callback of [undefined, () => {}]) {
    for (const data of [{ status: 'PENDING', canOpen: true }, { status: 'ACCEPTED', canOpen: false }]) {
      const tree = Panel({ model: { ...store.getSnapshot(), store, invitation: { status: 'success', data } }, onInvitationReady: callback });
      assert.equal(nodes(tree).some(node => node.props?.label === '초대 화면으로 이동'), false);
    }
  }
  const moved = [];
  await press(pending, value => moved.push(value.inviteId));
  assert.deepEqual(moved, [pending.inviteId]);
  assert.equal(store.getSnapshot().invitation.status, 'idle'); // 안쪽 상세 카드는 닫혀 있다
  await press(expired, value => moved.push(value.inviteId));
  assert.deepEqual(moved, [pending.inviteId]);
  assert.equal(store.getSnapshot().invitation.status, 'success');
  // 전달 가드·취소·예외로 이동하지 않아도 성공 상태만으로 목록을 잠그지 않는다.
  for (const scenario of ['guarded', 'mismatch', 'proceed-error', 'open-error', 'callback-error', 'async-callback-error', 'aborted']) {
    let snapshot = { ...store.getSnapshot(), invitation: { status: 'idle', data: null }, mutation: { status: 'idle' } };
    const fakeStore = {
      getSnapshot: () => snapshot,
      open: async () => { snapshot = { ...snapshot, invitation: { status: 'success', data: { inviteId: pending.inviteId, status: 'PENDING', canOpen: true } } }; if (scenario === 'open-error') throw Error('cancel'); },
      proceedToInvitation: async ready => { if (scenario === 'proceed-error') throw Error('cancel'); if (scenario === 'mismatch') ready({ inviteId: 'another' }); if (scenario === 'callback-error' || scenario === 'async-callback-error') await ready({ inviteId: pending.inviteId }); if (scenario === 'aborted') throw Object.assign(Error('cancel'), { name: 'AbortError' }); },
      closeInvitation: () => { snapshot = { ...snapshot, invitation: { status: 'idle' } }; },
    };
    const beforeNotices = notices.length;
    const ready = scenario === 'async-callback-error' ? async () => { throw Error('navigation failed'); } : () => { throw Error('navigation failed'); };
    const tree = Panel({ model: { ...snapshot, items: [pending], store: fakeStore }, onInvitationReady: ready });
    await nodes(tree).find(n => n.props?.label === `초대 확인 ${pending.id}`).props.onPress();
    assert.equal(notices.length - beforeNotices, ['proceed-error', 'callback-error', 'async-callback-error'].includes(scenario) ? 1 : 0, scenario);
    if (notices.length > beforeNotices) assert.deepEqual(notices.at(-1), ['초대 화면을 열지 못했어요', '잠시 후 초대 확인을 다시 눌러 주세요.']);
    const after = Panel({ model: { ...snapshot, items: [pending], store: fakeStore }, onInvitationReady: ready });
    for (const label of [`초대 확인 ${pending.id}`, `알림 삭제 ${pending.id}`, '모두 읽음']) assert.equal(nodes(after).find(n => n.props?.label === label).props.disabled, false, scenario);
    assert.equal(nodes(after).some(n => n.props?.children === '초대를 확인하고 있어요.'), false, scenario);
  }
  store.dispose();
});

test('발신자 미상은 데이터에서 null로 표현하고 실제 닉네임 다른 사용자는 숨기지 않는다', () => {
  const server = toServerNotification({ notification: { notificationId: '1', notificationType: 'DIARY_INVITE', createdAt: 'date' }, invitation: null });
  assert.equal(server.actor, null);
  const base = { notificationId: '1', type: 'DIARY_INVITED', invitation: { inviteId: 'i', status: 'PENDING' } };
  for (const nickname of ['', '   ', null, undefined]) assert.equal(toNotification({ ...base, actor: { nickname } }).actor, null);
  const named = toNotification({ ...base, actor: { nickname: '다른 사용자' } });
  assert.equal(notificationPresentation(named).message, '다른 사용자님의 초대');
});
