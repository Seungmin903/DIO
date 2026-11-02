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

test('기존 앱 정보 행은 새 방침 URL을 공유하고 미설정 시 기존 열람 경로를 보존한다', async () => {
  for (const policy of ['https://dio.test/legal/v2/privacy-policy.html', undefined]) {
    const opened = [], mod = { exports: {} };
    const mocks = {
      react: { useState: value => [value, () => {}] },
      'react-native': { Linking: { openURL: async url => opened.push(url) }, StyleSheet: { create: value => value }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
      '../../shared/legalDocuments': { signupDocuments: { policy } },
      '../../shared/theme': { colors: {} }, '../constants': { C: {} },
    };
    new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), mod, mod.exports);
    const tree = mod.exports.default({});
    await nodes(tree).find(node => node.props.accessibilityLabel === '개인정보 처리방침, 브라우저로 열기').props.onPress();
    assert.equal(opened.length, 1);
    if (policy) assert.equal(opened[0], policy);
    else assert.ok(opened[0].startsWith('https://docs.google.com/document/'));
  }
});
