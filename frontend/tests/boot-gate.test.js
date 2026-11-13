import test from 'node:test';
import assert from 'node:assert/strict';
import { afterBoot, finishBoot, isBooting, startBoot, whenBooted } from '../src/shared/bootGate.js';

test('시작 화면이 닫힐 때까지 기다린 일을 닫힐 때 한 번씩 실행하고, 닫힌 뒤에는 바로 실행한다', async () => {
  assert.equal(isBooting(), false);
  startBoot();
  const order = [];
  afterBoot(() => order.push('dialog'));
  const permission = whenBooted().then(() => order.push('push'));
  await Promise.resolve();
  assert.deepEqual(order, []);
  finishBoot();
  await permission;
  assert.deepEqual(order, ['dialog', 'push']);
  finishBoot(); // 두 번 닫아도 다시 실행하지 않는다
  assert.deepEqual(order, ['dialog', 'push']);
  afterBoot(() => order.push('late'));
  await whenBooted();
  assert.deepEqual(order, ['dialog', 'push', 'late']);
});

test('기다리던 일 하나가 던져도 나머지는 실행된다', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    startBoot();
    const order = [];
    afterBoot(() => { throw new Error('onConfirm 실패'); });
    afterBoot(() => order.push('next'));
    const push = whenBooted().then(() => order.push('push'));
    finishBoot();
    await push;
    assert.deepEqual(order, ['next', 'push']);
  } finally { console.warn = warn; }
});
