import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, DARK_AVATAR_COLORS, LIGHT_AVATAR_COLORS, memberAvatarTone } from '../src/shared/avatarColor.js';

const NAVY = '#0B1766'; // colors.text
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

test('참여자 기본 프로필 24색은 서로 다르고 표정이 4.5:1 이상 보인다(밝은 색은 네이비, 어두운 색은 흰색)', () => {
  assert.equal(new Set([...LIGHT_AVATAR_COLORS, ...DARK_AVATAR_COLORS]).size, 24);
  for (const color of LIGHT_AVATAR_COLORS) assert.ok(contrast(color, NAVY) >= 4.5, color);
  for (const color of DARK_AVATAR_COLORS) assert.ok(contrast(color, '#FFFFFF') >= 4.5, color);
});

test('서버 참여자 색은 24색 중 하나가 되고, 같은 값은 늘 같은 색이다', () => {
  for (let r = 64; r <= 208; r += 24) for (let g = 64; g <= 208; g += 24) for (let b = 64; b <= 208; b += 24) {
    const server = hex(r, g, b);
    const tone = memberAvatarTone(server);
    assert.ok((tone.light ? LIGHT_AVATAR_COLORS : DARK_AVATAR_COLORS).includes(tone.fill), `${server} → ${tone.fill}`);
    assert.deepEqual(memberAvatarTone(server), tone);
  }
});

test('서버 랜덤색(각 채널 64~208)에서 24색이 거의 같은 비율로 나온다', () => {
  const count = new Map();
  let total = 0;
  for (let r = 64; r <= 208; r += 4) for (let g = 64; g <= 208; g += 4) for (let b = 64; b <= 208; b += 4) {
    const { fill } = memberAvatarTone(hex(r, g, b));
    count.set(fill, (count.get(fill) || 0) + 1);
    total += 1;
  }
  assert.equal(count.size, 24);
  for (const [color, n] of count) assert.ok(Math.abs(n / total - 1 / 24) < 0.01, `${color} ${(n / total * 100).toFixed(1)}%`);
});

test('밝은 서버 색은 밝은 색, 어두운 서버 색은 어두운 색이 된다', () => {
  assert.equal(memberAvatarTone('#D0A0A8').light, true);
  assert.equal(memberAvatarTone('#704050').light, false);
});

test('잘못된 서버 색은 null 이라 기본 색을 쓴다', () => {
  for (const value of [null, undefined, '', 'red', '#12345', '#GGGGGG']) assert.equal(memberAvatarTone(value), null);
});
