import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../src/auth/AuthScreen.js');
const reset = read('../src/auth/PasswordResetScreen.js');
const styles = read('../src/auth/styles.js');

test('674 오류 문구를 타이머로 지우지 않고 오류 줄 자리를 늘 확보한다', () => {
  assert.doesNotMatch(auth, /setTimeout\(\(\) => setMessage\(''\)/);
  assert.match(auth, /s\.submitErrorSlot/);
  assert.match(styles, /submitErrorSlot:\{minHeight:18\}/);
});

test('692 오류 줄과 로그인 버튼 사이 간격은 24', () => {
  assert.match(styles, /submitArea:\{gap:24/);
});

test('676 키보드 위에 버튼까지 보이게 스크롤한다', () => {
  assert.match(auth, /submitArea\.current/);
  assert.match(auth, /ref=\{submitArea\}/);
});

test('643 비밀번호 찾기 흐름은 로그인 · 가입과 같은 틀과 한국어 문구를 쓴다', () => {
  assert.match(reset, /BrandLogo/);
  assert.match(reset, /placeholder="이메일을 입력해 주세요"/);
  assert.match(reset, /placeholder="6자리 숫자"/);
  assert.match(reset, /재전송 \(\$\{resendIn\}초\)/);
  assert.doesNotMatch(reset, /name@example\.com/);
  assert.match(reset, /\{!change && primary\}/);
});
