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

test('앱 정보는 배포 방침 URL을 사용하고 미설정 시 구글 문서 최종본을 연다', async () => {
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
    else assert.equal(opened[0], 'https://docs.google.com/document/d/1_eH0yCPmTWtclIvkExkjYwyxCmf5FhPtAN02LIax7uI/edit?usp=drivesdk');
  }
});
