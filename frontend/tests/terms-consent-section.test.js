import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as terms from '../src/auth/termsConsent.js';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/components/TermsConsentSection.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup({ failLoad = false, response, writeGate, failOnceType } = {}) {
  const values = [], refs = [], deps = [], cleanups = [], calls = [];
  let stateCursor, refCursor, effectCursor, fail = false, session = '101:1';
  const auth = { getSessionKey: () => session, getCurrentUserId: () => '101' };
  const props = { auth, userId: '101', saveRef: {current:null} };
  const mocks = {
    react: { useState: initial => { const i = stateCursor++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
      useRef: initial => refs[refCursor++] ??= { current: initial },
      useEffect: (fn, next) => { const i = effectCursor++; if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn(); } } },
    './SettingRow': { SettingSwitch: 'Switch' },
    'react-native': { View: 'View', Text: 'Text', Switch: 'Switch', Linking: { openURL: async () => {} }, StyleSheet: { create: v => v } },
    'expo/fetch': { fetch() {} }, '../../auth/authService': { apiBaseUrl: 'https://test/api/v1', accessTokenHeader: 'Authorization' },
    '../../auth/termsConsent': terms, '../../shared/legalDocuments': { signupDocuments: {} },
    '../../shared/legalContent': { getSignupDocument: id => id === 'adEmail' ? { id } : null }, '../../auth/LegalDocumentScreen': 'LegalDocumentScreen', '../../shared/theme': { colors: {} },
    '../services/memberTransport': { createAuthenticatedMemberTransport: () => async input => {
      calls.push(input); if (fail || (input.method === 'GET' && failLoad)) throw Error('network failed');
      if (input.method === 'GET') return response || { agreements: terms.optionalTerms.map(item => ({termsType:item.termsType,termsVersion:'v3',agreed:true,agreedAt:'2026-11-03T12:00:00Z',recordStatus:'CURRENT_VERSION'})) };
      if (input.path.split('/')[3] === failOnceType) { failOnceType = null; throw Error('offline'); }
      if (writeGate) await writeGate;
      return { termsType: input.path.split('/')[3], termsVersion: 'v3', agreed: input.body.agreed, agreedAt: '2026-11-03T12:00:00Z' };
    } }, '../../shared/DioButton': { __esModule: true, default: 'Button' },
  };
  const mod = { exports: {} };
  new Function('require','module','exports',code)(id => id === 'react/jsx-runtime' ? require(id) : mocks[id], mod, mod.exports);
  return { calls, props, retryLoad: () => { failLoad = false; }, fail: () => { fail = true; }, changeSession: () => { session = '101:2'; },
    render() { stateCursor = 0; refCursor = 0; effectCursor = 0; return mod.exports.default(props); },
    close() { cleanups.forEach(fn => fn?.()); },
  };
}
test('조회 중에는 네 항목이 비활성화되고 GET 완료 후 서버 값을 표시한다', async () => {
  const ui=setup();ui.render();
  assert.ok(nodes(ui.render()).filter(n=>n.type==='Switch').every(n=>n.props.disabled));
  await settle();const controls=nodes(ui.render()).filter(n=>n.type==='Switch');
  assert.equal(controls.length,4);assert.ok(controls.every(n=>n.props.on&&!n.props.disabled));
  assert.deepEqual(ui.calls,[{method:'GET',path:'/me/terms'}]);ui.close();
});
test('스위치 변경 즉시 변경한 동의를 서버에 저장한다',async()=>{
 const ui=setup();ui.render();await settle();
 nodes(ui.render()).filter(n=>n.type==='Switch')[1].props.onToggle(false);
 assert.equal(nodes(ui.render()).filter(n=>n.type==='Switch')[1].props.on,false);
 await settle();
 assert.deepEqual(ui.calls.at(-1),{method:'PUT',path:'/me/terms/AD_EMAIL/v3',body:{agreed:false}});
 await ui.props.saveRef.current();assert.equal(ui.calls.filter(c=>c.method==='PUT').length,1);ui.close();
});
test('스위치를 변경하면 화면을 닫기 전에도 요청이 시작된다',async()=>{
 const ui=setup();ui.render();await settle();
 nodes(ui.render()).filter(n=>n.type==='Switch')[0].props.onToggle(false);ui.close();
 assert.equal(ui.calls.filter(c=>c.method==='PUT').length,1);
});
test('저장 실패 시 선택을 보존하고 오류를 표시한다',async()=>{
 const ui=setup();ui.render();await settle();ui.fail();
 nodes(ui.render()).filter(n=>n.type==='Switch')[2].props.onToggle(false);
 await assert.rejects(ui.props.saveRef.current());
 const tree=ui.render();assert.equal(nodes(tree).filter(n=>n.type==='Switch')[2].props.on,false);
 assert.ok(nodes(tree).some(n=>n.props.children==='저장하지 못했어요. 다시 시도해 주세요.'));ui.close();
});
test('조회 실패는 변경을 차단하며 다시 시도로 복구한다',async()=>{
 const ui=setup({failLoad:true});ui.render();await settle();
 let tree=ui.render();assert.ok(nodes(tree).filter(n=>n.type==='Switch').every(n=>n.props.disabled));
 ui.retryLoad();nodes(tree).find(n=>n.props.children==='다시 시도').props.onPress();ui.render();await settle();
 assert.ok(nodes(ui.render()).filter(n=>n.type==='Switch').every(n=>!n.props.disabled));ui.close();
});
test('저장 중 연타와 변경은 추가 전송하지 않는다',async()=>{
 let finish;const gate=new Promise(resolve=>{finish=resolve;});const ui=setup({writeGate:gate});ui.render();await settle();
 const control=nodes(ui.render()).filter(n=>n.type==='Switch')[1];control.props.onToggle(false);
 const first=ui.props.saveRef.current();assert.equal(first,ui.props.saveRef.current());control.props.onToggle(true);
 assert.equal(nodes(ui.render()).filter(n=>n.type==='Switch')[1].props.on,false);
 finish();await first;assert.equal(ui.calls.filter(c=>c.method==='PUT').length,1);ui.close();
});

test('자동 저장 실패 후 재시도는 실패한 항목만 보내고 오류를 지운다',async()=>{
 const ui=setup({failOnceType:'AD_PUSH'});ui.render();await settle();
 nodes(ui.render()).filter(n=>n.type==='Switch')[1].props.onToggle(false);await settle();
 nodes(ui.render()).filter(n=>n.type==='Switch')[2].props.onToggle(false);await settle();
 await ui.props.saveRef.current();
 const writes=ui.calls.filter(c=>c.method==='PUT');assert.equal(writes.length,3);
 assert.equal(writes.filter(c=>c.path.includes('AD_EMAIL')).length,1);
 assert.equal(writes.filter(c=>c.path.includes('AD_PUSH')).length,2);
 assert.ok(!nodes(ui.render()).some(n=>n.props.children==='저장하지 못했어요. 다시 시도해 주세요.'));ui.close();
});

test('보기 링크는 배포 주소가 없어도 눌러지고 내장 약관을 앱 안에서 연다', async () => {
  const t = setup();
  let tree = t.render(); await settle(); tree = t.render();
  const links = nodes(tree).filter(n => n.props?.accessibilityRole === 'link');
  const adEmail = links.find(n => n.props.accessibilityLabel.includes('이메일'));
  assert.ok(adEmail && !adEmail.props.disabled);
  await adEmail.props.onPress();
  tree = t.render();
  assert.ok(nodes(tree).some(n => n.type === 'LegalDocumentScreen' && n.props.document.id === 'adEmail'));
  t.close();
});
