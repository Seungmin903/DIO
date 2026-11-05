import assert from 'node:assert/strict';
import test from 'node:test';

test('네이티브 펜 시각: 같은 접촉만 펜이고, 펜보다 먼저 닿은 손바닥은 펜이 아니다', async () => {
  let time = 1000;
  globalThis.expo = { modules: { DioStylus: { sample: () => [0.5, 0, 0, time] } } };
  const { nativePenAt } = await import('../src/editor/utils/stylusSensor.js');
  assert.equal(nativePenAt(1000), true);
  time = 1010; assert.equal(nativePenAt(1000), true);
  time = 1060; assert.equal(nativePenAt(1000), false); // 손바닥 뒤 60ms 에 닿은 펜
  time = 900; assert.equal(nativePenAt(1000), false); // 오래전 펜
  assert.equal(nativePenAt(undefined), false);
  delete globalThis.expo;
});
