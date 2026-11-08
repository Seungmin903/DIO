import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
const code = babel.transformSync(readFileSync(new URL('../src/diary/components/AppInformation.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];

test('앱 정보는 배포 방침 URL을 사용하고 미설정 시 내장 처리방침을 앱 안에서 연다(로그인이 필요한 구글 문서를 열지 않는다)', async () => {
  for (const policy of ['https://dio.test/legal/v2/privacy-policy.html', undefined]) {
    const opened = [], states = [], mod = { exports: {} };
    const mocks = {
      react: { useState: value => [value, v => states.push(v)] },
      '../../shared/legalContent': { getSignupDocument: id => ({ id }) }, '../../auth/LegalDocumentScreen': 'LegalDocumentScreen',
      'react-native': { Linking: { openURL: async url => opened.push(url) }, StyleSheet: { create: value => value }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
      '../../shared/legalDocuments': { signupDocuments: { policy } },
      '../../shared/theme': { colors: {} }, '../constants': { C: {} },
    };
    new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), mod, mod.exports);
    const tree = mod.exports.default({});
    await nodes(tree).find(node => node.props.accessibilityLabel === '개인정보 처리방침 보기').props.onPress();
    if (policy) { assert.equal(opened.length, 1); assert.equal(opened[0], policy); }
    else { assert.equal(opened.length, 0); assert.ok(states.includes(true)); }
  }
});
