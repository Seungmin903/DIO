import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationPresentation } from '../src/notifications/notificationPresentation.js';
import { toServerNotification } from '../src/notifications/serverNotificationApi.js';
import { createNotificationApi, createInvitationGateway } from '../src/notifications/notificationApi.js';
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
test('공통 패널은 서버 모두 읽음을 숨기고 목 모두 읽음과 기본 동작을 유지한다', async () => {
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
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react-native') return require('react-native-web');
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
    for (const [store, expected] of [[serverStore, false], [mockStore, true]]) {
      await store.refresh();
      assert.equal(store.getSnapshot().canReadAll, expected);
      const html = renderToStaticMarkup(createElement(Panel, { model: { ...store.getSnapshot(), store } }));
      assert.equal(html.includes('aria-label="모두 읽음"'), expected);
      assert.ok(html.includes('aria-label="알림 새로고침"'));
      assert.ok(html.includes('aria-label="알림 삭제 '));
    }
    await mockStore.readAll();
    assert.equal(mockStore.getSnapshot().mutation.status, 'success');
    assert.equal(mockStore.getSnapshot().count.data.unreadCount, 0);
  } finally { mockStore.dispose(); serverStore.dispose(); }
});
