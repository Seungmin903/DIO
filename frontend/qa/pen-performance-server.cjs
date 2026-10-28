const http = require('node:http');
const token = require('node:crypto').randomBytes(24).toString('hex');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.DIO_QA_PORT || 8104), host = process.env.DIO_QA_HOST || '127.0.0.1';
const metro = Number(process.env.DIO_QA_METRO_PORT || 8106);
const reports = [];
const log = process.env.DIO_QA_REPORT_LOG || path.resolve(__dirname, '../.expo/pen-performance-reports.ndjson');
fs.mkdirSync(path.dirname(log), { recursive: true });
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>DIO · 필기 성능 QA</title>
<style>html,body,#root{margin:0;width:100%;height:100%;height:100dvh;overflow:hidden}#root{display:flex}body{background:#EDF1F8;font-family:system-ui}</style></head><body><div id="root">성능 QA 편집기를 불러오는 중…</div>
<script>
window.__DIO_PEN_QA_REPORT__ = function(report) {
  const value = { ...report, cacheMode: report.cacheMode || window.__DIO_PERF_CACHE__ || 'svg', userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, visibility: document.visibilityState,
    heapBytes: performance.memory ? performance.memory.usedJSHeapSize : null, heapSupported: !!performance.memory };
  window.dispatchEvent(new CustomEvent('dio-performance-report', { detail: value }));
  fetch('/perf-report', { method: 'POST', headers: { 'Content-Type':'application/json', 'X-DIO-QA-Token':'${token}' }, body: JSON.stringify(value) }).then(function(response) { window.dispatchEvent(new CustomEvent('dio-performance-ack', { detail: { type: value.type, kind: value.kind, sequence: value.sequence, phase: value.phase, recordId: value.recordId, ok: response.ok, stored: response.headers.get('X-DIO-QA-Saved') === '1' } })); }).catch(function(){ window.dispatchEvent(new CustomEvent('dio-performance-ack', { detail: { type: value.type, kind: value.kind, sequence: value.sequence, phase: value.phase, recordId: value.recordId, ok: false } })); });
};
window.addEventListener('pointerdown', function(e) {
  if (e.target.closest && e.target.closest('[aria-label="펜 입력 영역"],[aria-label="형광펜 입력 영역"],[aria-label="지우개 입력 영역"]')) {
    window.__DIO_PERF_INPUT__ = { trustedInput: e.isTrusted, pointerType: e.pointerType };
  }
}, true);
window.addEventListener('error', function(e) { window.__DIO_PEN_QA_REPORT__({type:'error', message: String(e.message).slice(0,300)}); });
</script><script src="/qa/pen-performance.entry.bundle?platform=web&dev=false&minify=true&hot=false&lazy=false"></script></body></html>`;
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://qa.local'); if (/[\u0000-\u001f]/.test(decodeURIComponent(url.pathname))) throw Error(); }
  catch { res.writeHead(400); res.end(); return; }
  if (['/perf-report', '/perf-reports'].includes(url.pathname) && req.headers['x-dio-qa-token'] !== token) { res.writeHead(403); res.end(); return; }
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    const entry = { 'storage-integration': 'storage-integration.entry.bundle', 'large-integration': 'large-integration.entry.bundle' }[url.searchParams.get('qa')];
    res.end(entry ? html.replaceAll('pen-performance.entry.bundle', entry) : html); return;
  }
  if (url.pathname === '/perf-reports') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(reports)); return; }
  if (url.pathname === '/perf-report' && req.method === 'POST') {
    let raw = '';
    req.on('data', data => { raw += data; if (raw.length > 32768) req.destroy(); });
    req.on('end', () => {
      try {
        const report = { at: new Date().toISOString(), ...JSON.parse(raw) };
        fs.appendFile(log, JSON.stringify(report) + '\n', error => {
          if (error) { res.writeHead(500); res.end('Report storage failed'); return; }
          reports.push(report); if (reports.length > 500) reports.shift();
          console.log('[pen-performance]', JSON.stringify(report));
          res.writeHead(204, { 'X-DIO-QA-Saved': '1' }); res.end();
        });
      } catch { res.writeHead(400); res.end(); }
    }); return;
  }
  const assetPath = decodeURIComponent(url.pathname);
  const allowed = ['/qa/pen-performance.entry.bundle', '/qa/storage-integration.entry.bundle', '/qa/large-integration.entry.bundle'].includes(url.pathname) || (assetPath.startsWith('/assets/') && !assetPath.split('/').some(part => part === '..' || part === '.') && !assetPath.includes('\\'));
  if (req.method !== 'GET' || !allowed) { res.writeHead(404); res.end(); return; }
  const proxy = http.request({ hostname: 'localhost', port: metro, method: 'GET', path: req.url }, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
  });
  proxy.on('error', () => { res.writeHead(502); res.end('Metro is starting. Reload shortly.'); });
  res.on('close', () => { if (!res.writableEnded) proxy.destroy(); });
  proxy.end();
});
server.listen(port, host, () => console.log('Performance QA on ' + host + ':' + server.address().port));
