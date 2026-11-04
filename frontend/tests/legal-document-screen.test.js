import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as legal from '../src/shared/legalContent.js';
import { signupTermsVersions } from '../src/auth/signupPolicy.js';

const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
const source = readFileSync(new URL('../src/auth/LegalDocumentScreen.js', import.meta.url), 'utf8');
const code = babel.transformSync(source, { configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const nodes = node => !node || typeof node !== 'object' ? []
  : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];

function render(key, callbacks = {}) {
  const closed = [], agreed = [], opened = [], mod = { exports: {} };
  const mocks = {
    'react-native': { Linking: { openURL: async url => opened.push(url) }, StyleSheet: { create: value => value },
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../shared/legalContent': legal, '../shared/theme': { colors: {} }, '../shared/dialogs': { notify() {} },
  };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id)
    : { __esModule: true, default: id }), mod, mod.exports);
  return { closed, agreed, opened, tree: mod.exports.default({ document: legal.getSignupDocument(key),
    onClose: () => closed.push(true), onAgree: () => agreed.push(true), ...callbacks }) };
}

for (const key of ['service', 'privacy', 'marketingPrivacy', 'adEmail', 'adPush', 'adNightPush']) {
  test(`동의서 화면의 닫기와 명시적 동의는 서로 다른 동작이다: ${key}`, () => {
    const ui = render(key), all = nodes(ui.tree);
    all.find(node => node.props.accessibilityLabel === '문서 닫기').props.onPress();
    ui.tree.props.onRequestClose();
    assert.equal(ui.closed.length, 2); assert.equal(ui.agreed.length, 0);
    all.find(node => node.props.accessibilityLabel === '동의하고 돌아가기').props.onPress();
    assert.equal(ui.agreed.length, 1);
  });
}

test('처리방침은 동의 콜백을 주어도 닫기 버튼만 제공한다', () => {
  const ui = render('policy'), all = nodes(ui.tree);
  assert.equal(all.some(node => node.props.accessibilityLabel === '동의하고 돌아가기'), false);
  all.find(node => node.props.accessibilityLabel === '닫기').props.onPress();
  assert.equal(ui.closed.length, 1); assert.equal(ui.agreed.length, 0);
});

test('긴 문서는 스크롤하며 본문·제목·동의 버튼의 줄 수를 제한하지 않는다', () => {
  const ui = render('service'), all = nodes(ui.tree);
  assert.ok(all.some(node => node.type === 'ScrollView'));
  assert.equal(ui.tree.props.animationType, 'none');
  const texts = all.filter(node => node.type === 'Text');
  assert.ok(texts.filter(node => node.props.accessibilityRole !== 'link').every(node => node.props.maxFontSizeMultiplier === 0));
  const flattenText = value => Array.isArray(value) ? value.map(flattenText).join('')
    : value && typeof value === 'object' ? flattenText(value.props?.children) : value ?? '';
  const rendered = flattenText(ui.tree);
  for (const block of legal.getSignupDocument('service').blocks) assert.ok(rendered.includes(block.text));
  assert.ok(texts.every(node => node.props.numberOfLines === undefined && node.props.adjustsFontSizeToFit !== true));
});

test('앱 내장본은 시행일·가입 버전과 일치하고 체크할 수 없는 동의 문장을 담지 않는다', () => {
  const bundled = JSON.parse(readFileSync(new URL('../src/shared/legalContent.json', import.meta.url), 'utf8'));
  const handoff = JSON.parse(readFileSync(new URL('../../docs/legal/final/app-documents.json', import.meta.url), 'utf8'));
  assert.deepEqual(bundled.documents, handoff.documents);
  assert.equal(bundled.documents.length, 7);
  for (const document of bundled.documents) {
    assert.equal(document.effectiveDate, '2026-11-04');
    if (signupTermsVersions[document.termsType]) assert.equal(document.termsVersion, signupTermsVersions[document.termsType]);
    assert.ok(document.blocks.every(block => !/동의합니다\. \((필수|선택)\)/.test(block.text)));
  }
  assert.equal(legal.isConsentDocument(legal.getSignupDocument('policy')), false);
  assert.equal(legal.getSignupDocument('unknown'), null);
});

test('링크가 있는 문단은 본문을 빠뜨리거나 HTML로 해석하지 않고 표시한다', () => {
  const block = { text: '문의는 공식 메일에서 접수합니다.', links: [{ label: '공식 메일', url: 'mailto:dioapp.official@gmail.com' }] };
  const runs = legal.documentTextRuns(block);
  assert.equal(runs.map(run => run.text).join(''), block.text);
  assert.equal(runs.find(run => run.url).url, 'mailto:dioapp.official@gmail.com');
});
