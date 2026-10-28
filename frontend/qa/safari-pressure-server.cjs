const http = require('node:http');
const token = process.env.DIO_QA_TOKEN || require('node:crypto').randomBytes(24).toString('hex');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../.expo/pen-material-final');
const port = Number(process.env.DIO_QA_PORT ?? 8103);
const host = process.env.DIO_QA_HOST || '127.0.0.1';
const reports = [];
const script = `(() => {
  const box = document.createElement('aside');
  box.id = 'pressure-qa';
  box.style.cssText = 'position:fixed;z-index:2147483647;right:8px;bottom:8px;background:#fffef9ed;border:1px solid #d3d7de;border-radius:10px;padding:8px 12px;font:12px/1.5 system-ui;color:#1d1d1f;pointer-events:none;max-width:250px;box-shadow:0 2px 10px #0001';
  box.textContent = 'Safari 필압 QA · Pencil로 필기해 주세요';
  document.body.appendChild(box);
  let active = null, latest = null, pending = false, savedText = '';
  box.style.whiteSpace = 'pre-line';
  function savedStrokes() {
    const objects = new Map();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.includes('dio:editor:doc:v4')) continue;
      try {
        const doc = JSON.parse(localStorage.getItem(key));
        for (const page of doc.pages || []) for (const object of page.objects || []) if (object.type === 'stroke') objects.set(object.id, object);
      } catch {}
    }
    return objects;
  }
  const seen = new Set(savedStrokes().keys());
  const waiting = [];
  let saveTimer = null;
  const labels = { felt: '펠트펜', fountain: '만년필', brush: '붓펜', pencil: '연필', highlighter: '형광펜' };
  const post = report => fetch('/qa-report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DIO-QA-Token': '${token}' }, body: JSON.stringify(report) }).catch(() => {});
  function strokeSummary(object) {
    const values = (object.points || []).map(p => p.force).filter(Number.isFinite);
    const widths = (object.points || []).map(p => p.pressure).filter(Number.isFinite);
    let fingerprint = 2166136261;
    for (const c of String(object.id)) fingerprint = Math.imul(fingerprint ^ c.charCodeAt(0), 16777619);
    return { kind: object.penKind, renderVersion: object.renderVersion, fingerprint: fingerprint >>> 0,
      samples: values.length, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
      widthMultiplierMin: widths.length ? Math.min(...widths) : null, widthMultiplierMax: widths.length ? Math.max(...widths) : null };
  }
  function checkSaved() {
    saveTimer = null;
    for (const [id, object] of savedStrokes()) {
      if (seen.has(id)) continue;
      seen.add(id);
      const input = waiting.shift();
      if (!input) continue;
      const report = { type: 'saved-pressure', trusted: input.trusted, ...strokeSummary(object) };
      post(report);
      const varied = report.samples > 0 && report.max > report.min;
      savedText = (labels[report.kind] || report.kind) + (report.samples ? ' 저장 확인 · 필압 ' + report.min.toFixed(3) + '–' + report.max.toFixed(3) : ' 저장됨 · 실측 필압 없음')
        + (varied ? ' · 변화 반영' : '');
      paint();
    }
    while (waiting.length && Date.now() - waiting[0].at > 15000) {
      waiting.shift(); savedText = '저장 확인 대기 초과 · 다시 필기해 주세요'; paint();
    }
    if (waiting.length) saveTimer = setTimeout(checkSaved, 500);
  }
  // Reload proof is distinct from a new trusted hardware event.
  for (const object of savedStrokes().values()) if (object.penKind === 'felt') post({ type: 'restored-pressure', ...strokeSummary(object) });
  const paint = () => {
    pending = false;
    const s = active || latest;
    if (s) box.textContent = (s.trusted ? 'Pencil 실측 ' : '합성 입력 ') + s.current.toFixed(3) + ' · 범위 ' + s.min.toFixed(3) + '–' + s.max.toFixed(3) + ' · ' + s.samples + '개' + (s.max - s.min > 0.02 ? ' · 변화 수신' : ' · 압력을 바꿔 주세요') + '\\n' + savedText;
  };
  function record(e) {
    if (!active || e.pointerId !== active.id || e.pointerType !== 'pen') return;
    let samples; try { samples = e.getCoalescedEvents?.() || [] } catch { samples = [] }
    if (!samples.length) samples = [e];
    for (const p of samples) if (Number.isFinite(p.pressure) && p.pressure >= 0 && p.pressure <= 1) {
      active.current = p.pressure;
      active.min = Math.min(active.min, p.pressure); active.max = Math.max(active.max, p.pressure); active.samples++;
    }
    if (!pending) { pending = true; requestAnimationFrame(paint) }
  }
  window.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'pen' || !e.target.closest?.('[aria-label="펜 입력 영역"], [aria-label="형광펜 입력 영역"]')) return;
    active = { id: e.pointerId, trusted: e.isTrusted, current: 0, min: 1, max: 0, samples: 0 };
    savedText = '저장 확인 중';
    record(e);
  }, true);
  window.addEventListener('pointermove', record, true);
  function finish(e) {
    if (!active || e.pointerId !== active.id) return;
    latest = active; active = null; paint();
    const summary = { type: 'browser-pressure', trusted: latest.trusted, samples: latest.samples, min: latest.min, max: latest.max, varied: latest.max - latest.min > 0.02, cancelled: e.type === 'pointercancel' };
    post(summary);
    // Read only this app's saved documents. Send aggregates, never handwriting,
    // text, coordinates, diary names or account data to the QA server.
    if (!summary.cancelled) {
      waiting.push({ trusted: summary.trusted, at: Date.now() });
      if (!saveTimer) saveTimer = setTimeout(checkSaved, 500);
    }
  }
  window.addEventListener('pointerup', finish, true);
  window.addEventListener('pointercancel', finish, true);
  window.__pressureQA = { get latest() { return latest } };
})();`;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://qa.local').pathname); }
  catch { res.writeHead(400); res.end('Invalid URL'); return; }
  if (/[\u0000-\u001f\u007f]/.test(pathname)) { res.writeHead(400); res.end('Invalid URL'); return; }
  if (['/qa-report', '/qa-reports'].includes(pathname) && req.headers['x-dio-qa-token'] !== token) { res.writeHead(403); res.end(); return; }
  if (pathname === '/qa-report' && req.method === 'POST') {
    let raw = ''; req.on('data', c => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => { try { const report = JSON.parse(raw); reports.push({ at: new Date().toISOString(), ...report }); if (reports.length > 100) reports.shift(); console.log('[pressure-qa]', JSON.stringify(reports.at(-1))); res.writeHead(204); res.end(); } catch { res.writeHead(400); res.end(); } }); return;
  }
  if (pathname === '/qa-reports') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(reports)); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try { fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(file.endsWith('index.html') ? bytes.toString().replace('</body>', '<script>' + script + '</script></body>') : bytes);
  }); } catch { res.writeHead(400); res.end('Invalid path'); }
});
server.listen(port, host, () => console.log('Safari pressure QA listening on ' + host + ':' + server.address().port + ' (open this PC LAN address in Safari)'));
