import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_COUNT, PRESET_MIN_WIDTH, presetPress, sameColor } from '../src/editor/components/chrome/ribbonPresets.js';

test('3색 칸은 폭 840부터 세 칸이다', () => {
  assert.equal(PRESET_MIN_WIDTH, 840);
  assert.equal(PRESET_COUNT, 3);
});

test('색 비교는 대소문자를 가리지 않고 값이 없으면 같지 않다', () => {
  assert.equal(sameColor('#ABCDEF', '#abcdef'), true);
  assert.equal(sameColor('#ABCDEF', '#ABCDE0'), false);
  assert.equal(sameColor(undefined, '#abcdef'), false);
  assert.equal(sameColor(undefined, undefined), false);
});

test('쓰는 중에 고른 칸을 다시 누를 때만 설정을 연다', () => {
  assert.equal(presetPress({ chosen: true, active: true }), 'settings');
  assert.equal(presetPress({ chosen: true, active: false }), 'pick');
  assert.equal(presetPress({ chosen: false, active: true }), 'pick');
});
