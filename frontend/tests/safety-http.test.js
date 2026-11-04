import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSafetyApi } from '../src/safety/safetyApi.js';
import { buildReportBody } from '../src/safety/reportBody.web.js';

test('로컬 HTTP 계약: 원본 증빙·신고 201/200 재시도·차단 PUT/GET/DELETE와 no-store', async () => {
  const requests = [], blocks = [], reports = new Map();
  const diaryId = '11111111-1111-4111-8111-111111111111', clientRequestId = '22222222-2222-4222-8222-222222222222';
  const createdAt = '2026-11-04T12:00:00Z';
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), body = bytes.toString();
    requests.push({ path: req.url, method: req.method, body, bytes, headers: req.headers });
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (req.url === '/api/v1/reports') {
      const first = !reports.has(clientRequestId);
      reports.set(clientRequestId, 101);
      return json({ reportId: 101, status: 'RECEIVED', createdAt }, first ? 201 : 200);
    }
    if (req.method === 'PUT') { blocks.push({ userId: 25, nickname: '계정 이름', blockedAt: createdAt }); res.writeHead(204).end(); return; }
    if (req.method === 'DELETE') { blocks.length = 0; res.writeHead(204).end(); return; }
    if (req.url === '/api/v1/me/blocks?page=0&size=100') return json({ items: blocks, page: 0, size: 100, hasNext: false });
    json({ code: 'NOT_FOUND' }, 404);
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
    const auth = { getSessionKey: () => 'qa-session', getConnectionOptions: () => ({ baseUrl }),
      getAccessToken: async () => 'qa-member-token' };
    const api = createSafetyApi({ userId: '10', auth, buildReportBody });
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJz0AAAAASUVORK5CYII=';
    const input = { targetUserId: '25', diaryId, clientRequestId, reason: 'HARASSMENT', description: '', photos: [
      { uri: `data:image/png;base64,${data}`, mimeType: 'image/png', fileName: 'evidence.png', size: Buffer.from(data, 'base64').length },
    ] };
    const first = await api.report(input), retry = await api.report(input);
    assert.deepEqual(retry, first); assert.equal(reports.size, 1);
    for (const sent of requests.filter(r => r.path.endsWith('/reports'))) {
      assert.match(sent.headers['content-type'], /^multipart\/form-data; boundary=/);
      assert.match(sent.body, /name="report"; filename="report.json"/);
      assert.match(sent.body, /name="evidenceFiles"; filename="evidence.png"/);
      assert.ok(sent.bytes.includes(Buffer.from(data, 'base64')));
      assert.ok(sent.body.includes(clientRequestId)); assert.equal(sent.body.includes('reporterUserId'), false);
    }
    await api.block('25', diaryId); assert.equal((await api.listBlocks())[0].id, '25');
    await api.unblock('25'); assert.deepEqual(await api.listBlocks(), []);
    assert.deepEqual(JSON.parse(requests.find(r => r.method === 'PUT').body), { diaryId });
    assert.equal(requests.find(r => r.method === 'DELETE').body, '');
    for (const sent of requests) { assert.equal(sent.headers.authorization, 'Bearer qa-member-token'); assert.equal(sent.headers['cache-control'], 'no-store'); }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
