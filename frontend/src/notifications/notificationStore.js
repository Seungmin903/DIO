import { createDiaryQuery } from '../diary/services/diaryQuery.js';
import { canOpenInvitation } from './invitationAccess.js';
import { isInvitationNotification } from './notificationPresentation.js';
import { notificationErrorNotice } from './notificationErrorNotice.js';

// 한 로그인 세션에 한 저장소. 목록과 공유 진입점은 같은 count를 구독한다.
export function createNotificationStore(api, invitations) {
  const list = createDiaryQuery(options => api.list(options));
  const count = createDiaryQuery(options => api.count(options));
  const invitation = createDiaryQuery((id, options) => invitations.get(id, options));
  const more = createDiaryQuery(options => api.list(options));
  let items = [], nextCursor = null, active = true, generation = 0, pageGeneration = 0, controller, pending;
  let selectedInviteId = null, invitationGeneration = 0;
  let mutation = { status: 'idle', error: null, canRetry: false };
  let snapshot;
  const listeners = new Set();
  const publish = () => {
    const first = list.getSnapshot();
    snapshot = { list: first, count: count.getSnapshot(), invitation: invitation.getSnapshot(), more: more.getSnapshot(),
      items, nextCursor, canReadAll: typeof api.readAll === 'function',
      mutation };
    listeners.forEach(listener => listener());
  };
  [list, count, invitation, more].forEach(query => query.subscribe(publish));
  const refreshList = async () => {
    if (!active) return;
    const page = ++pageGeneration;
    more.reset();
    await list.run();
    if (active && page === pageGeneration && list.getSnapshot().status === 'success') {
      // 성공한 새 첫 페이지로만 교체한다. 실패하면 더 보기 결과와 커서도 보존한다.
      items = list.getSnapshot().data.items; nextCursor = list.getSnapshot().data.nextCursor; publish();
    }
  };
  const refreshInvitation = async () => {
    if (!active || !selectedInviteId) return;
    invitationGeneration += 1;
    await invitation.run(selectedInviteId);
  };
  const refreshAll = async (includeInvitation) => {
    if (active) await Promise.all([refreshList(), count.run(), includeInvitation ? refreshInvitation() : undefined]);
  };
  const refresh = () => refreshAll(true);
  const retryAllowed = query => query.getSnapshot().status !== 'error' || notificationErrorNotice(query.getSnapshot().error).canRetry;
  const mutate = async command => {
    if (!active || mutation.status === 'saving' || (pending && command !== pending)) return;
    pending = command;
    const request = generation;
    controller = new AbortController();
    mutation = { status: 'saving', error: null, canRetry: false }; publish();
    try {
      const options = { signal: controller.signal };
      if (command.kind === 'read') await api.read(command.id, options);
      else if (command.kind === 'remove') await api.remove(command.id, options);
      else await api.readAll(command.id, options);
      if (!active || request !== generation) return;
      pending = null;
      // 조회 실패는 쓰기 실패로 바꾸지 않는다. 성공 안내와 조회 재시도를 분리한다.
      await refreshAll(false);
      if (!active || request !== generation) return;
      mutation = { status: 'success', error: null, canRetry: false }; publish();
    } catch (error) {
      if (!active || request !== generation || error.name === 'AbortError') return;
      const canRetry = ![400, 401, 403, 404, 409, 410, 422].includes(error.status);
      if (!canRetry) pending = null;
      mutation = { status: 'error', error, canRetry }; publish();
    }
  };
  publish();
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh, refreshList, refreshNotifications: () => refreshAll(false),
    refreshCount: () => active && retryAllowed(count) && count.getSnapshot().status !== 'loading' && count.run(),
    async loadMore() {
      if (!active || !retryAllowed(more) || !retryAllowed(list) || list.getSnapshot().status === 'loading' || more.getSnapshot().status === 'loading' || !snapshot.nextCursor) return;
      const request = generation, page = pageGeneration, cursor = snapshot.nextCursor;
      await more.run({ cursor });
      if (active && request === generation && page === pageGeneration && more.getSnapshot().status === 'success') {
        const result = more.getSnapshot().data;
        items = [...new Map(items.concat(result.items).map(row => [row.id, row])).values()];
        nextCursor = result.nextCursor; publish();
      }
    },
    open(row) {
      if (!active || mutation.status === 'saving' || pending) return;
      // 과거 알림 payload 대신 공유 측의 현재 상태로 이동 여부를 판단한다.
      selectedInviteId = isInvitationNotification(row) ? row.inviteId : null;
      invitation.reset();
      const detail = refreshInvitation();
      return Promise.all([detail, row.readAt ? Promise.resolve() : mutate({ kind: 'read', id: row.id })]);
    },
    closeInvitation() { selectedInviteId = null; invitationGeneration += 1; invitation.reset(); },
    retryInvitation: () => retryAllowed(invitation) && refreshInvitation(),
    async proceedToInvitation(onReady) {
      if (!active || !selectedInviteId || invitation.getSnapshot().status !== 'success') return;
      const id = selectedInviteId;
      const work = refreshInvitation(), request = invitationGeneration;
      await work;
      const result = invitation.getSnapshot();
      if (active && selectedInviteId === id && request === invitationGeneration && result.status === 'success'
        && result.data?.inviteId === id && canOpenInvitation(result.data)) onReady(result.data);
    },
    remove: id => mutate({ kind: 'remove', id }),
    readAll() { if (typeof api.readAll !== 'function') return; const id = list.getSnapshot().data?.items[0]?.id; if (id) return mutate({ kind: 'readAll', id }); },
    retryMutation: () => pending && mutate(pending),
    dismissMutation() { if (!pending && mutation.status !== 'saving') { mutation = { status: 'idle', error: null, canRetry: false }; publish(); } },
    activate() { active = true; },
    dispose() { active = false; generation += 1; pageGeneration += 1; invitationGeneration += 1; selectedInviteId = null; controller?.abort(); pending = null; items = []; nextCursor = null; mutation = { status: 'idle', error: null, canRetry: false }; [list, count, invitation, more].forEach(query => query.reset()); },
  };
}

// AppState와 브라우저 표시 상태를 받아 비활성 중에는 타이머를 만들지 않는다.
export function startNotificationRefresh(store, { subscribe, isActive, intervalMs = 30000, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  let timer, previous, stopped = false;
  const update = () => {
    if (stopped) return;
    const current = isActive();
    if (current === previous) return;
    previous = current;
    if (timer !== undefined) clearIntervalFn(timer);
    timer = undefined;
    if (current) {
      store.refresh();
      timer = setIntervalFn(() => { if (!stopped && isActive()) store.refreshCount(); }, intervalMs);
    }
  };
  const unsubscribe = subscribe(update); update();
  return () => { stopped = true; unsubscribe(); if (timer !== undefined) clearIntervalFn(timer); };
}
