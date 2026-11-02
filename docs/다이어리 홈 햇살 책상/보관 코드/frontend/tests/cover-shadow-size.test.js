import test from 'node:test';
import assert from 'node:assert/strict';
import { coverShadowAt } from '../src/diary/utils/deskShadow.js';

// 'x y blur spread rgba(r,g,b,a)' 세 겹을 숫자로 푼다
const layers = shadow => shadow.split(/,\s*(?=-?[\d.]+px)/).map(layer => {
  const [dx, dy, blur, spread] = layer.match(/-?[\d.]+(?=px)/g).map(Number);
  return { dx, dy, blur, spread, alpha: Number(layer.match(/,([\d.]+)\)$/)[1]) };
});

test('그림자 크기 배율을 주지 않으면 지금 표지 그림자와 같다', () => {
  for (const hour of [8, 12, 15, 19, 23]) assert.equal(coverShadowAt(hour, true, 0, 1), coverShadowAt(hour, true));
});

test('큰 물건은 그림자 길이 · 퍼짐만 같은 비율로 커지고 진하기는 그대로다', () => {
  const base = layers(coverShadowAt(8, true)), grown = layers(coverShadowAt(8, true, 0, 1.5));
  assert.equal(base.length, 3);
  base.forEach((layer, index) => {
    for (const key of ['dx', 'dy', 'blur', 'spread']) assert.ok(Math.abs(grown[index][key] - layer[key] * 1.5) <= 0.1, `${index} ${key}`);
    assert.equal(grown[index].alpha, layer.alpha);
  });
});
