import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafetyApi } from '../src/safety/safetyApi.js';
import { buildReportBody } from '../src/safety/reportBody.web.js';
import { createSafetyStore } from '../src/safety/safetyModel.js';
const diaryId = '11111111-1111-4111-8111-111111111111';
const clientRequestId = '22222222-2222-4222-8222-222222222222';
const report = { targetUserId: '25', diaryId, clientRequestId, reason: 'HARASSMENT', description: '', photos: [] };
const time = '2026-11-04T12:00:00Z';
const block = { userId: 25, nickname: '계정 이름', blockedAt: time };
const page = (items = [block], index = 0, hasNext = false) => ({ items, page: index, size: 100, hasNext });
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function setup(handler) {
  const calls = [], uploads = [];
  let session = 'login-1', refreshes = 0;
  const auth = {
    getSessionKey: () => session,
    isSessionExpired: () => false,
    getConnectionOptions: () => ({ baseUrl: 'https://api.dio.test/api/v1', accessTokenHeader: 'X-DIO-Access-Token',
      getAuthHeaders: (url, token) => { assert.ok(url.startsWith('https://api.dio.test/')); return { Authorization: 'Basic test-gateway', 'X-DIO-Access-Token': token }; } }),
    getAccessToken: async context => { assert.deepEqual(context, { userId: '10', sessionKey: 'login-1' }); return refreshes ? 'new-token' : 'first-token'; },
    refresh: async () => { refreshes++; },
  };
  const api = createSafetyApi({ userId: '10', auth, timeoutMs: 1000,
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store'); return handler(url, init, calls.length); },
    buildReportBody: async (payload, photos) => { const body = new FormData(); body.append('report', new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'report.json'); uploads.push({ payload, photos, body }); return { body }; },
  });
  return { api, calls, uploads, auth, changeSession: () => { session = 'login-2'; }, get refreshes() { return refreshes; } };
}

test('공유 경고 닫기 기록은 서버에 저장하고 다른 클라이언트가 다시 조회할 수 있다', async () => {
  const userId = '9223372036854775807';
  let saved = [];
  const handle = (url, request) => {
    assert.ok(url.endsWith('/me/block-warning-dismissals/' + diaryId));
    if (request.method === 'PUT') {
      saved = JSON.parse(request.body).userIds;
      assert.deepEqual(saved, [userId]);
      return reply(null, 204);
    }
    return reply({ userIds: saved });
  };
  const first = setup(handle).api;
  assert.deepEqual(await first.listWarningDismissals(diaryId), []);
  await first.dismissWarning(diaryId, [userId]);
  assert.deepEqual(await setup(handle).api.listWarningDismissals(diaryId), [userId]);
});

test('차단 목록은 모든 페이지를 모으고 계정 ID를 정밀도 손실 없이 유지한다', async () => {
  const f = setup(url => url.includes('page=0') ? reply(page([block], 0, true))
    : reply(page([{ userId: '9223372036854775807', nickname: '탈퇴한 사용자', blockedAt: time }], 1)));
  const rows = await f.api.listBlocks();
  assert.deepEqual(rows.map(row => row.id), ['25', '9223372036854775807']);
  assert.equal(rows[0].nickname, '계정 이름');
  assert.ok(f.calls[1].url.endsWith('/me/blocks?page=1&size=100'));
  assert.equal(f.calls[0].headers.Authorization, 'Basic test-gateway');
  assert.equal(f.calls[0].headers['X-DIO-Access-Token'], 'first-token');
});
test('차단 PUT 204 이후 서버 목록으로 시각·이름을 확정하고 DELETE에는 본문이 없다', async () => {
  const f = setup((url, init) => init.method === 'GET' ? reply(page()) : reply(null, 204));
  const row = await f.api.block('25', diaryId);
  assert.equal(row.blockedAt, time); assert.equal(row.nickname, '계정 이름');
  assert.deepEqual(JSON.parse(f.calls[0].body), { diaryId });
  assert.equal(f.calls[0].method, 'PUT');
  await f.api.unblock('25'); await f.api.unblock('25');
  assert.equal(f.calls[2].method, 'DELETE'); assert.equal(f.calls[2].body, undefined);
});
test('차단 성공 후 목록 조회 유실은 상태를 꾸미지 않고 재조회 가능하게 한다', async () => {
  const f = setup((url, init) => init.method === 'PUT' ? reply(null, 204) : reply(null, 500));
  const store = createSafetyStore(f.api);
  await assert.rejects(store.block({ id: '25' }, diaryId), /차단 요청은 처리됐지만/);
  assert.equal(store.getSnapshot().status, 'error'); assert.deepEqual(store.getSnapshot().blocks, []);
});
test('신고는 report JSON 파트를 사용하고 동일 재시도 ID·multipart 본문으로 401을 한 번 갱신한다', async () => {
  const f = setup((url, init, n) => n === 1 ? reply(null, 401) : reply({ reportId: 101, status: 'RECEIVED', createdAt: time }, 201));
  const receipt = await f.api.report(report);
  assert.equal(receipt.reportId, '101'); assert.equal(f.refreshes, 1);
  assert.equal(f.calls[0].body, f.calls[1].body);
  assert.equal(f.calls[1].headers['X-DIO-Access-Token'], 'new-token');
  assert.equal(f.calls[0].headers['Content-Type'], undefined);
  assert.deepEqual(f.uploads[0].payload, { reportedUserId: 25, diaryId, reasonCode: 'HARASSMENT', description: null, clientRequestId });
  assert.equal(f.uploads[0].payload.reporterUserId, undefined);
});
test('서버가 같은 신고의 재시도 결과를 200으로 돌려주면 기존 접수로 완료한다', async () => {
  const f = setup(() => reply({ reportId: 101, status: 'RECEIVED', createdAt: time }, 200));
  await f.api.report(report); await f.api.report(report);
  assert.equal(f.uploads[0].payload.clientRequestId, f.uploads[1].payload.clientRequestId);
});
test('신고 충돌은 새 요청 ID로 자동 재접수하지 않는다', async () => {
  const f = setup(() => reply({ code: 'REPORT_REQUEST_CONFLICT' }, 409));
  await assert.rejects(f.api.report(report), error => error.code === 'REPORT_REQUEST_CONFLICT');
  assert.equal(f.calls.length, 1); assert.equal(f.uploads[0].payload.clientRequestId, clientRequestId);
});
test('본인·잘못된 ID·필수 기타 설명·증빙 제한은 전송 전에 검증한다', async () => {
  const f = setup(() => { throw new Error('must not send'); });
  for (const input of [{ ...report, targetUserId: '10' }, { ...report, clientRequestId: 'bad' }, { ...report, reason: 'OTHER', description: ' ' },
    { ...report, photos: Array(4).fill({ mimeType: 'image/png', size: 1 }) }]) await assert.rejects(f.api.report(input));
  await assert.rejects(f.api.block('10', diaryId)); await assert.rejects(f.api.block('25', 'bad'));
  assert.equal(f.calls.length, 0);
});
test('계정 전환 뒤 옛 파일 준비·지연 응답은 새로운 계정으로 요청하지 않는다', async () => {
  const wait = defer(), f = setup(() => wait.promise);
  const pending = f.api.listBlocks(); await Promise.resolve(); await Promise.resolve();
  f.changeSession(); wait.resolve(reply(page())); await assert.rejects(pending, error => error.status === 401);
  const before = f.calls.length;
  await assert.rejects(f.api.unblock('25'), error => error.status === 401);
  assert.equal(f.calls.length, before);
});
test('멤버 API의 blockedByMe만 노출하고 탈퇴한 사용자 정보는 숨긴다', async () => {
  const f = setup(() => reply({ members: [{ userId: 25, nickname: '친구', role: 'EDITOR', blockedByMe: true },
    { userId: 26, nickname: '숨길 실명', activeAccount: false, profilePhotoUrl: 'private', blockedByMe: false }] }));
  const rows = await f.api.listParticipants(diaryId);
  assert.equal(rows[0].blockedByMe, true); assert.equal(rows[0].participation, 'CURRENT');
  assert.equal(rows[1].nickname, '탈퇴한 사용자'); assert.equal(rows[1].photoUri, null);
});
test('비정상 페이지·손상 접수 응답을 성공으로 표시하지 않는다', async () => {
  const bad = setup(() => reply({ ...page([], 0, true) }));
  await assert.rejects(bad.api.listBlocks(), error => error.code === 'INVALID_RESPONSE');
  const broken = setup(() => reply({ reportId: 101 }, 201));
  await assert.rejects(broken.api.report(report), error => error.code === 'INVALID_RESPONSE');
});
test('웹 증빙 multipart는 실제 원본 바이트와 JSON 파트·여러 파일 이름을 유지한다', async () => {
  const uri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJz0AAAAASUVORK5CYII=';
  const prepared = await buildReportBody({ clientRequestId, reasonCode: 'HARASSMENT' }, [{ uri, mimeType: 'image/png', size: 68, fileName: 'evidence.png' }]);
  assert.equal(prepared.body.get('report').type, 'application/json');
  assert.equal(JSON.parse(await prepared.body.get('report').text()).clientRequestId, clientRequestId);
  const image = prepared.body.get('evidenceFiles');
  assert.equal(image.name, 'evidence.png'); assert.equal(image.type, 'image/png');
  assert.equal(image.size, (await (await fetch(uri)).blob()).size);
  await assert.rejects(buildReportBody({}, [{ uri: 'https://outside.test/image.png' }]), /다시 선택/);
});


test('개발 서버 인증 거절은 회원 refresh로 재시도하지 않고 원래 코드를 유지한다', async () => {
  const f = setup(() => reply({ code: 'DEVELOPMENT_ACCESS_REQUIRED' }, 401));
  await assert.rejects(f.api.listBlocks(), error => error.code === 'DEVELOPMENT_ACCESS_REQUIRED' && error.status === 401);
  assert.equal(f.refreshes, 0); assert.equal(f.calls.length, 1);
});
