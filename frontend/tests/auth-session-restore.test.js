import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthApi } from '../src/auth/authApi.js';
import { createSecureSessionStore } from '../src/auth/secureSessionStore.js';
import { SESSION_EXPIRED_MESSAGE } from '../src/auth/sessionExpiry.js';

const baseUrl = 'https://api.example/api';
const user = { userId: '7', email: 'member@example.com', nickname: '회원' };
const tokens = n => ({ user, accessToken: `access${n}`, refreshToken: `refresh${n}`, expiresIn: 900 });
const response = (data, status = 200) => ({ status, ok: status < 400, json: async () => data });
function fixture() {
  const rows = new Map(), writes = [];
  const keychain = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
    getItemAsync: async key => rows.get(key),
    setItemAsync: async (key, value, options) => { writes.push({ key, value, options }); rows.set(key, value); },
    deleteItemAsync: async key => { rows.delete(key); },
  };
  return { rows, writes, sessionStore: createSecureSessionStore(keychain) };
}
const login = api => api.login({ email: user.email, password: 'Password123!' });

test('expired refresh emits one session-bound notification for concurrent requests, then existing login recovers', async () => {
  let clock = 0, refreshCalls = 0;
  const events = [], f = fixture();
  const api = createAuthApi({ baseUrl, now: () => clock, sessionStore: f.sessionStore, fetchImpl: async url => {
    if (url.endsWith('/login')) return response(tokens(1));
    refreshCalls++;
    return response({ code: 'INVALID_TOKEN', detail: 'server-specific copy' }, 401);
  } });
  await login(api);
  const oldKey = api.getSessionKey(), unsubscribe = api.subscribeSessionExpired(event => events.push(event));
  clock = 900000;
  const outcomes = await Promise.allSettled([1, 2, 3].map(() => api.getAccessToken({ userId: '7', sessionKey: oldKey })));
  assert.equal(refreshCalls, 1);
  assert.deepEqual(events, [{ userId: '7', sessionKey: oldKey }]);
  assert.ok(outcomes.every(item => item.status === 'rejected' && item.reason.status === 401 && item.reason.message === SESSION_EXPIRED_MESSAGE));
  assert.equal(api.getCurrentUserId(), null);
  assert.equal(api.isSessionExpired(oldKey), true);
  assert.equal(api.getMemberSessionKey('7'), oldKey);
  assert.equal(f.rows.size, 0);
  await login(api);
  assert.notEqual(api.getSessionKey(), oldKey);
  assert.equal(api.isSessionExpired(oldKey), false);
  assert.equal(api.getMemberSessionKey('7'), api.getSessionKey());
  assert.equal(await api.getAccessToken({ userId: '7', sessionKey: api.getSessionKey() }), 'access1');
  unsubscribe();
  await assert.rejects(api.refresh(), { code: 'INVALID_TOKEN' });
  assert.equal(events.length, 1);
});

test('network, proxy, development gate and successful rotation never signal session expiry', async () => {
  for (const failure of [null, {status: 403, code: 'INVALID_TOKEN'}, {status: 401, code: 'ACCESS_DENIED'}, {status: 401, code: 'INVALID_TOKEN', basic: true}, {status: 503}, 'network']) {
    const events = [];
    const api = createAuthApi({ baseUrl, fetchImpl: async url => {
      if (url.endsWith('/login') || !failure) return response(tokens(1));
      if (failure === 'network') throw new Error('offline');
      return {...response({code: failure.code}, failure.status), headers: {get: name => name === 'WWW-Authenticate' && failure.basic ? 'Basic realm="DIO Development"' : null}};
    } });
    await login(api);
    api.subscribeSessionExpired(event => events.push(event));
    await api.refresh().catch(() => {});
    assert.deepEqual(events, []);
    assert.equal(api.getCurrentUserId(), '7');
  }
});

test('late invalid refresh cannot clear or redirect a newer login', async () => {
  let finish;
  const api = createAuthApi({ baseUrl, fetchImpl: async url => url.endsWith('/login') ? response(tokens(1))
    : new Promise(resolve => { finish = resolve; }) });
  await login(api);
  const events = [];
  api.subscribeSessionExpired(event => events.push(event));
  const pending = api.refresh();
  await new Promise(resolve => setImmediate(resolve));
  await login(api);
  const key = api.getSessionKey();
  finish(response({code: 'INVALID_TOKEN'}, 401));
  await assert.rejects(pending, {code: 'INVALID_TOKEN'});
  assert.equal(api.getSessionKey(), key);
  assert.deepEqual(events, []);
});

test('process restart restores via refresh, rotates securely and keeps access tokens out of storage', async () => {
  const f = fixture();
  await login(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response(tokens(1)) }));
  assert.deepEqual(JSON.parse(f.writes[0].value), { refreshToken: 'refresh1', provider: 'email', userId: '7' });
  assert.equal(f.writes[0].options.keychainAccessible, 'device-only');
  let calls = 0;
  const restarted = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async (url, request) => {
    calls++; assert.equal(url, `${baseUrl}/v1/auth/refresh`);
    assert.deepEqual(JSON.parse(request.body), { refreshToken: 'refresh1' });
    return response(tokens(2));
  } });
  const [a, b] = await Promise.all([restarted.restoreSession(), restarted.restoreSession()]);
  assert.deepEqual(a, b); assert.equal(a.mode, 'authenticated'); assert.equal(calls, 1);
  assert.equal(await restarted.getAccessToken({ userId: '7', sessionKey: restarted.getSessionKey() }), 'access2');
  assert.equal(JSON.parse(f.writes.at(-1).value).refreshToken, 'refresh2');
});

test('startup refresh can finish after five seconds using the normal fifteen-second request limit', async t => {
  const f = fixture();
  await login(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response(tokens(1)) }));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started, finish, signal;
  const waiting = new Promise(resolve => { started = resolve; });
  const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async (_, request) => {
    signal = request.signal; started();
    return new Promise((resolve, reject) => {
      finish = resolve;
      signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    });
  } });
  const restoring = api.restoreSession(); await waiting;
  t.mock.timers.tick(6000);
  assert.equal(signal.aborted, false);
  finish(response(tokens(2)));
  assert.equal((await restoring).userId, '7');
  assert.equal(JSON.parse(f.writes.at(-1).value).refreshToken, 'refresh2');
});

test('startup refresh aborts after fifteen seconds while retaining saved credentials', async t => {
  const f = fixture();
  await login(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response(tokens(1)) }));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started, signal;
  const waiting = new Promise(resolve => { started = resolve; });
  const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async (_, request) => {
    signal = request.signal; started();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }));
  } });
  const failure = assert.rejects(api.restoreSession(), /서버에 연결하지 못했어요/);
  await waiting;
  t.mock.timers.tick(14999); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); await failure;
  assert.equal(signal.aborted, true);
  assert.equal(api.getCurrentUserId(), null);
  assert.equal(f.rows.size, 1);
});

test('temporary network failures retain credentials; expired sessions remove them', async () => {
  const f = fixture();
  await login(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response(tokens(1)) }));
  await assert.rejects(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => { throw new Error('offline'); } }).restoreSession());
  assert.equal(f.rows.size, 1);
  await assert.rejects(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response({ code: 'INVALID_TOKEN' }, 401) }).restoreSession());
  assert.equal(f.rows.size, 0);
});

test('logout during restoration cannot bring a logged-out account back', async () => {
  const f = fixture();
  await login(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response(tokens(1)) }));
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const restoring = api.restoreSession(); await waiting;
  await api.logout(); release(response(tokens(2)));
  assert.equal(await restoring, null); assert.equal(api.getCurrentUserId(), null); assert.equal(f.rows.size, 0);
});

test('API environments are isolated and corrupt records are removed', async () => {
  const f = fixture();
  await f.sessionStore.save(baseUrl, { refreshToken: 'a', provider: 'google', userId: '7' });
  assert.equal(await f.sessionStore.load('https://other.example/api'), null);
  f.rows.set([...f.rows.keys()][0], '{broken');
  assert.equal(await f.sessionStore.load(baseUrl), null); assert.equal(f.rows.size, 0);
});

test('social provider survives restart and logout clears rotated credentials', async () => {
  const f = fixture();
  const first = createAuthApi({ baseUrl, sessionStore: f.sessionStore, googleSignIn: async () => ({ idToken: 'google' }), fetchImpl: async () => response(tokens(1)) });
  await first.social('google', { ageConfirmed: true });
  const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async url => url.endsWith('/logout') ? response(null, 204) : response(tokens(2)) });
  assert.equal((await api.restoreSession()).provider, 'google');
  await api.logout(); assert.equal(f.rows.size, 0);
});

test('refresh persists rotation, while password change and withdrawal delete saved credentials', async () => {
  for (const action of ['changePassword', 'withdraw']) {
    const f = fixture();
    const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async url =>
      url.endsWith('/login') ? response(tokens(1)) : url.endsWith('/refresh') ? response(tokens(2)) : response(null, 204) });
    const view = await login(api);
    await api.refresh(); assert.equal(JSON.parse(f.writes.at(-1).value).refreshToken, 'refresh2');
    if (action === 'withdraw') await api.withdraw(view);
    else await api.changePassword(view, { currentPassword: 'Password123!', password: 'Changed456!', confirmation: 'Changed456!' });
    assert.equal(f.rows.size, 0); assert.equal(api.getCurrentUserId(), null);
  }
});

test('storage write failure never falls back to plaintext persistence', async () => {
  const api = createAuthApi({ baseUrl, sessionStore: { save: async () => { throw new Error('locked'); }, clear: async () => {} },
    fetchImpl: async () => response(tokens(1)) });
  await assert.rejects(login(api), { code: 'SESSION_STORAGE_UNAVAILABLE' });
  assert.equal(api.getCurrentUserId(), null);
});

test('development gateway authentication failure retains the member refresh credential', async () => {
  const f = fixture();
  await login(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response(tokens(1)) }));
  const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => ({ ...response(null, 401), headers: { get: () => 'Basic realm="dev"' } }) });
  await assert.rejects(api.restoreSession(), { code: 'DEVELOPMENT_ACCESS_REQUIRED' });
  assert.equal(f.rows.size, 1);
});

test('no saved credential does not send a refresh request', async () => {
  const f = fixture();
  for (const sessionStore of [null, f.sessionStore]) {
    const api = createAuthApi({ baseUrl, sessionStore, fetchImpl: async () => { assert.fail('unexpected request'); } });
    assert.equal(await api.restoreSession(), null);
  }
});

test('another account logging in wins over a late startup refresh response', async () => {
  const f = fixture();
  await login(createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async () => response(tokens(1)) }));
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const nextUser = { ...user, userId: '8', email: 'other@example.com' };
  const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async url => {
    if (url.endsWith('/refresh')) { started(); return new Promise(resolve => { release = resolve; }); }
    return response({ ...tokens(3), user: nextUser });
  } });
  const restoring = api.restoreSession(); await waiting;
  await api.login({ email: nextUser.email, password: 'Password123!' });
  release(response(tokens(2))); assert.equal(await restoring, null);
  assert.equal(api.getCurrentUserId(), '8');
  assert.equal(JSON.parse(f.writes.at(-1).value).refreshToken, 'refresh3');
});

for (const action of ['withdraw', 'changePassword', 'completePasswordReset', 'logout']) {
  test(`${action}: secure deletion failure preserves server success and cancels local work first`, async t => {
    const warnings = [], calls = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    let deleting, rejectDelete, canceled = 0;
    const enteredDelete = new Promise(resolve => { deleting = resolve; });
    const api = createAuthApi({ baseUrl, sessionStore: {
      save: async () => {},
      clear: async () => { deleting(); await new Promise((_, reject) => { rejectDelete = reject; }); },
    }, fetchImpl: async url => {
      calls.push(url);
      if (url.endsWith('/login')) return response(tokens(1));
      if (url.endsWith('/password-reset-verifications')) return response({ resetToken: 'reset-secret', expiresIn: 600 });
      return response(null, 204);
    } });
    const view = await login(api);
    await api.verifyPasswordReset(user.email, '123456');
    const cancel = api.cancelPending;
    api.cancelPending = (...args) => { canceled++; return cancel(...args); };
    const operation = action === 'withdraw' ? api.withdraw(view)
      : action === 'changePassword' ? api.changePassword(view, { currentPassword: 'Password123!', password: 'Changed456!', confirmation: 'Changed456!' })
      : action === 'completePasswordReset' ? api.completePasswordReset({ email: user.email, newPassword: 'Changed456!' })
      : api.logout();
    await enteredDelete;
    // These must already be cleared even while secure deletion is pending.
    const canceledBeforeDeletion = canceled;
    const currentUserBeforeDeletion = api.getCurrentUserId();
    rejectDelete(new Error('storage error containing a secret must not be logged'));
    await assert.doesNotReject(operation);
    assert.equal(canceledBeforeDeletion, 1);
    assert.equal(currentUserBeforeDeletion, null);
    assert.equal(api.getSessionKey(), null);
    const requestCount = calls.length;
    await assert.rejects(api.completePasswordReset({ email: user.email, newPassword: 'Changed456!' }), /인증/);
    assert.equal(calls.length, requestCount, 'canceled reset draft cannot send another completion request');
    assert.deepEqual(warnings, [['[auth] SECURE_SESSION_CLEAR_FAILED']]);
  });
}

test('failed server logout plus failed secure deletion reports incomplete logout and permits cleanup retry', async t => {
  const f = fixture(), warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  let deletionFails = true;
  const api = createAuthApi({ baseUrl, sessionStore: { ...f.sessionStore, clear: async base => {
    if (deletionFails) throw new Error('private storage detail');
    await f.sessionStore.clear(base);
  } }, fetchImpl: async url => {
    if (url.endsWith('/login')) return response(tokens(1));
    throw new Error('offline');
  } });
  await login(api);
  await assert.rejects(api.logout(), error => error.code === 'LOGOUT_INCOMPLETE' && /복원될 수/.test(error.message));
  assert.equal(api.getCurrentUserId(), null);
  assert.equal(f.rows.size, 1, 'a valid credential may remain when neither operation succeeded');
  assert.deepEqual(warnings, [['[auth] SECURE_SESSION_CLEAR_FAILED']]);
  deletionFails = false;
  await api.logout();
  assert.equal(f.rows.size, 0);
});

test('failed server logout with successful secure deletion retains the network error and deletes local credentials', async () => {
  const f = fixture();
  const api = createAuthApi({ baseUrl, sessionStore: f.sessionStore, fetchImpl: async url => {
    if (url.endsWith('/login')) return response(tokens(1));
    throw new Error('offline');
  } });
  await login(api);
  await assert.rejects(api.logout(), error => error.code !== 'LOGOUT_INCOMPLETE' && /서버에 연결하지 못했어요/.test(error.message));
  assert.equal(api.getCurrentUserId(), null);
  assert.equal(f.rows.size, 0);
});

for (const status of [401]) for (const operation of ['refresh', 'restoreSession']) {
  test(`${operation}: secure deletion failure preserves the original ${status} authentication error`, async t => {
    const f = fixture(), warnings = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    const options = { baseUrl, sessionStore: { ...f.sessionStore, clear: async () => { throw new Error('private storage detail'); } },
      fetchImpl: async url => url.endsWith('/login') ? response(tokens(1))
        : response({ code: 'INVALID_TOKEN', detail: '인증이 만료됐어요.' }, status) };
    let api = createAuthApi(options);
    await login(api);
    if (operation === 'restoreSession') api = createAuthApi(options);
    await assert.rejects(api[operation](), { status, code: 'INVALID_TOKEN', message: SESSION_EXPIRED_MESSAGE });
    assert.equal(api.getCurrentUserId(), null);
    assert.equal(f.rows.size, 1);
    assert.deepEqual(warnings, [['[auth] SECURE_SESSION_CLEAR_FAILED']]);
  });
}

for (const activeSession of [true, false]) for (const sameAccount of [true, false]) {
  test(`password reset respects saved account ownership: active=${activeSession}, same=${sameAccount}`, async () => {
    const f = fixture(), calls = [];
    let resetAccountRevoked = false;
    const targetEmail = sameAccount ? ' MEMBER@EXAMPLE.COM ' : 'other@example.com';
    const options = { baseUrl, sessionStore: f.sessionStore, fetchImpl: async (url, request) => {
      calls.push(url);
      if (url.endsWith('/login')) return response(tokens(1));
      if (url.endsWith('/password-reset-verifications')) return response({ resetToken: 'verified-reset', expiresIn: 600 });
      if (url.endsWith('/password-resets')) {
        assert.equal(JSON.parse(request.body).email, targetEmail.trim().toLowerCase());
        resetAccountRevoked = sameAccount;
        return response(null, 204);
      }
      if (url.endsWith('/refresh')) return resetAccountRevoked
        ? response({ code: 'INVALID_TOKEN' }, 401) : response(tokens(2));
      assert.fail('unexpected request');
    } };
    let api = createAuthApi(options);
    await login(api);
    const savedBeforeReset = [...f.rows.values()];
    if (!activeSession) api = createAuthApi(options); // Process restart before session restoration.
    const previousKey = api.getSessionKey();
    await api.verifyPasswordReset(targetEmail, '123456');
    await api.completePasswordReset({ email: targetEmail, newPassword: 'Changed456!' });
    const count = calls.length;
    await assert.rejects(api.completePasswordReset({ email: targetEmail, newPassword: 'Changed456!' }), /인증/);
    assert.equal(calls.length, count, 'successful reset always clears its in-memory authorization draft');
    if (activeSession && sameAccount) {
      assert.equal(api.getCurrentUserId(), null);
      assert.equal(f.rows.size, 0);
    } else {
      assert.deepEqual([...f.rows.values()], savedBeforeReset, 'do not delete a token without confirming its owner');
      assert.equal(api.getSessionKey(), previousKey);
      if (sameAccount) {
        await assert.rejects(api.restoreSession(), { status: 401, code: 'INVALID_TOKEN' });
        assert.equal(f.rows.size, 0, 'the server rejects and clears a dormant token for the reset account');
      } else {
        assert.equal((await api.restoreSession()).userId, '7');
        assert.equal(api.getCurrentUserId(), '7');
      }
    }
  });
}

for (const operation of ['refresh', 'restoreSession']) {
  for (const failure of [{ status: 403 }, { status: 403, code: 'INVALID_TOKEN' }, { status: 401 }, { status: 401, code: 'ACCESS_DENIED' }]) {
    test(`${operation}: non-contract ${failure.status}/${failure.code ?? 'proxy response'} retains the saved token`, async () => {
      const f = fixture();
      let blocked = true;
      const options = { baseUrl, sessionStore: f.sessionStore, fetchImpl: async url => {
        if (url.endsWith('/login')) return response(tokens(1));
        return blocked ? response({ code: failure.code, detail: '접근 제한' }, failure.status) : response(tokens(2));
      } };
      let api = createAuthApi(options);
      await login(api);
      const saved = [...f.rows.values()];
      if (operation === 'restoreSession') api = createAuthApi(options);
      await assert.rejects(api[operation](), { status: failure.status, message: '접근 제한' });
      assert.deepEqual([...f.rows.values()], saved);
      assert.equal(api.getCurrentUserId(), operation === 'refresh' ? '7' : null);
      blocked = false;
      assert.equal((await api[operation]()).userId, '7');
      assert.equal(JSON.parse(f.writes.at(-1).value).refreshToken, 'refresh2');
    });
  }
}

test('active refresh retains rotated tokens in memory on a transient secure write failure and persists the next rotation', async t => {
  const f = fixture(), warnings = [], sent = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  let writeFails = false, generation = 1;
  const api = createAuthApi({ baseUrl, sessionStore: { ...f.sessionStore, save: async (base, value) => {
    if (writeFails) throw new Error('private keychain detail');
    await f.sessionStore.save(base, value);
  } }, fetchImpl: async (url, request) => {
    if (url.endsWith('/login')) return response(tokens(1));
    sent.push(JSON.parse(request.body).refreshToken);
    return response(tokens(++generation));
  } });
  await login(api);
  const key = api.getSessionKey();
  writeFails = true;
  await Promise.all([api.refresh(), api.refresh()]);
  assert.equal(api.getCurrentUserId(), '7');
  assert.equal(api.getSessionKey(), key);
  assert.equal(await api.getAccessToken({ userId: '7', sessionKey: key }), 'access2');
  assert.equal(JSON.parse(f.writes.at(-1).value).refreshToken, 'refresh1');
  assert.deepEqual(warnings, [['[auth] SECURE_SESSION_SAVE_FAILED']]);
  writeFails = false;
  await api.refresh();
  assert.deepEqual(sent, ['refresh1', 'refresh2']);
  assert.equal(JSON.parse(f.writes.at(-1).value).refreshToken, 'refresh3');
});
