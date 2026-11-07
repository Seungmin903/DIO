import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
const compile = path => babel.transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const calls = [];
const mod = { exports: {} };
new Function('require', 'module', 'exports', compile('../src/auth/AuthenticationRecovery.js'))(id => ({
  'react-native': { Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: value => value } },
  './loginGate': { useLoginEntry: () => request => calls.push(request) }, '../shared/theme': { colors: {} },
}[id] || require(id)), mod, mod.exports);
const Recovery = mod.exports.default;

test('인증 거절은 재로그인 버튼으로 연결하고 실제 세션 만료 표식을 전달한다', () => {
  calls.length = 0;
  for (const sessionExpired of [false, true]) {
    const button = Recovery({ error: { status: 401, sessionExpired } });
    assert.equal(button.props.accessibilityLabel, '다시 로그인');
    button.props.onPress();
  }
  assert.deepEqual(calls, [{ sessionExpired: false }, { sessionExpired: true }]);
});

test('네트워크·서버 오류·권한 거절·개발 접속 인증은 회원 재로그인으로 보내지 않는다', () => {
  for (const error of [null, { code: 'NETWORK_ERROR' }, { status: 503 }, { status: 403 }, { status: 401, code: 'DEVELOPMENT_ACCESS_REQUIRED' }]) {
    assert.equal(Recovery({ error }), null);
  }
});

test('보관함·만들기·휴지통의 401 오류 화면에 동작 가능한 로그인 경로가 있다', () => {
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  for (const [file, props] of [
    ['MemberLibraryNotice', { library: { error: { status: 401 } } }],
    ['MemberRequestNotice', { error: { status: 401, message: '인증 오류' } }],
    ['MemberTrashNotice', { state: { trashError: { status: 401 } } }],
  ]) {
    const module = { exports: {} };
    const mocks = { 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' },
      '../styles': { styles: {} }, '../constants': { C: {} }, '../../shared/DioButton': { __esModule: true, default: 'Pressable' }, '../../auth/sessionExpiry.js': { authenticationErrorMessage: () => '인증 오류' },
      '../../auth/AuthenticationRecovery': { __esModule: true, ...mod.exports } };
    new Function('require', 'module', 'exports', compile(`../src/diary/components/${file}.js`))(id => mocks[id] || require(id), module, module.exports);
    const action = nodes(module.exports.default(props)).find(node => node.type === Recovery && node.props.error?.status === 401);
    assert.ok(action, file);
    const before = calls.length;
    Recovery(action.props).props.onPress();
    assert.equal(calls.length, before + 1);
  }
});


test('휴지통 손상 메타 안내는 원인을 표시하고 불필요한 재시도 없이 두 경고를 함께 보여준다',()=>{
 const module={exports:{}};
 const mocks={'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},'../styles':{styles:{}},'../../shared/DioButton':{__esModule:true,default:'Pressable'},'../../auth/sessionExpiry.js':{},'../../auth/AuthenticationRecovery':{__esModule:true,default:()=>null}};
 new Function('require','module','exports',compile('../src/diary/components/MemberTrashNotice.js'))(id=>mocks[id]||require(id),module,module.exports);
 const walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
 const nodes=walk(module.exports.default({state:{lifecycle:{canRetry:true,error:{code:'INVALID_LOCAL_CACHE',message:'표지 자료 손상으로 이동하지 않았어요.'}},metadataError:{code:'read',message:'조회 경고'},metadataCleanupError:{code:'cleanup',message:'정리 경고'}}}));
 const labels=nodes.filter(node=>node.type==='Text').map(node=>node.props.children);
 assert.ok(labels.includes('표지 자료 손상으로 이동하지 않았어요.'));
 assert.ok(labels.includes('조회 경고'));assert.ok(labels.includes('정리 경고'));
 assert.ok(!labels.includes('휴지통 작업 다시 시도'));
});


test('선택 이동의 동일 표지 손상 안내는 한 번만 표시하고 혼합 실패에만 일반 안내를 더한다',async()=>{
 // 지라 619부터 결과는 목록 위 칸이 아니라 알약 토스트 한 줄(bulkTrashToastMessage)로 알린다.
 const { bulkTrashToastMessage } = await import('../src/diary/utils/bulkTrashToast.js');
 for(const mixed of [false,true]) {
  const failed=['a','b'].map(id=>({id,error:{code:'INVALID_LOCAL_CACHE',message:'손상되어 이동하지 않았어요.'}}));
  if(mixed)failed.push({id:'c',error:{code:'NETWORK_ERROR'}});
  const message=bulkTrashToastMessage({failed,ids:['a','b','c'],succeeded:[]});
  assert.equal(message.split('손상되어 이동하지 않았어요.').length-1,mixed?0:1);
  assert.match(message,new RegExp(`${failed.length}권을 휴지통으로 옮기지 못했어요`));
 }
});
