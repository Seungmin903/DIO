// Component layout QA only; root state transitions are covered by auth-routing.test.js.
const { chromium } = require('playwright');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
const load = (file, mocks) => {
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] || require(id), module, module.exports);
  return module.exports.default;
};
(async () => {
  const theme = await import('../src/shared/theme.js');
  const Button = load('src/shared/DioButton.js', { 'react-native': native, './theme': theme, './AppIcon': { __esModule: true, default: () => null } });
  const Screen = load('src/auth/SessionRestoreScreen.js', { 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: native.View }, '../shared/theme': theme, '../shared/DioButton': { __esModule: true, default: Button } });
  const body = renderToStaticMarkup(React.createElement(Screen, { error: { code: 'NETWORK_ERROR' }, busy: false }));
  const html = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%;font-family:sans-serif}#root{display:flex;flex-direction:column}${native.StyleSheet.getSheet().textContent}</style><div id="root">${body}</div>`;
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--no-proxy-server', '--disable-gpu'] });
  try {
    fs.mkdirSync('qa/.out/auth-recovery', { recursive: true });
    for (const width of [320, 412, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('heading', { name: '회원 보관함을 열지 못했어요' }).waitFor();
      for (const name of ['연결 재시도', '다시 로그인', '게스트로 계속']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `qa/.out/auth-recovery/startup-${width}.png` });
      await page.close(); console.log(`Session restore layout passed: ${width}`);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
