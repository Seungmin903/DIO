import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { emptyGuestImportAction } from '../src/diary/utils/libraryQuery.js';
import * as characterScale from '../src/shared/characterScale.js';

const entry = { count: 4, open() {} };

test('빈 내 다이어리: 옮길 것이 있는 회원의 전체 기록에만 입구를 둔다', () => {
  assert.deepEqual(emptyGuestImportAction(entry, 'personal', false), { label: '이 기기의 다이어리 4권 옮기기', onPress: entry.open });
  assert.equal(emptyGuestImportAction(null, 'personal', false), null); // 게스트 · 옮길 것 없음
  assert.equal(emptyGuestImportAction(entry, 'personal', true), null); // 즐겨찾기
  assert.equal(emptyGuestImportAction(entry, 'shared', false), null); // 공유
  assert.equal(emptyGuestImportAction(entry, undefined, false), null);
});

test('EmptyState: action 을 주면 버튼을 그리고 누르면 onPress 를 부른다', () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/components/EmptyState.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs'), [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'classic', pragma: 'h', pragmaFrag: 'F' }]],
  });
  const m = { exports: {} };
  const h = (type, props, ...children) => ({ type, props: { ...props, children } });
  const stub = id => {
    if (id === 'react-native') return { Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View' };
    if (id.endsWith('/constants')) return { C: {} };
    if (id.endsWith('/styles')) return { styles: {} };
    if (id.endsWith('/characterScale')) return characterScale;
    return { default: 'AppIcon' };
  };
  new Function('require', 'module', 'exports', 'h', code)(stub, m, m.exports, h);
  const walk = n => (!n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(walk) : [n, ...walk(n.props?.children)]);
  let pressed = 0;
  const withAction = walk(m.exports.default({ title: '없어요', action: { label: '옮기기', onPress() { pressed += 1; } } }));
  const button = withAction.find(n => n.type === 'Pressable');
  assert.ok(withAction.some(n => n.type === 'Text' && n.props.children.includes('옮기기')));
  button.props.onPress();
  assert.equal(pressed, 1);
  assert.equal(walk(m.exports.default({ title: '없어요' })).some(n => n.type === 'Pressable'), false);
});
