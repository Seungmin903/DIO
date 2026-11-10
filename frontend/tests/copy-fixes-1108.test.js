import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('페이지 설정 창에는 사용법 안내 문구가 없다', () => {
  const s = src('editor/components/panels/PageSettingsDialog.js');
  assert.ok(!s.includes('크기를 바꿔도'));
  assert.ok(!s.includes('격자는 편집 화면에만'));
  assert.ok(!/styles\.hint/.test(s));
});

test('차단한 사용자 화면 위에 안내 문구가 없다', () => {
  assert.ok(!src('safety/SafetyScreen.js').includes('차단한 사용자와는 이메일 초대'));
});

test('회원가입 입력 화면 뒤로가기 글자는 가는 곳(가입 전 확인)과 같다', () => {
  const s = src('auth/AuthScreen.js');
  assert.match(s, /route === 'signup' \? '가입 전 확인'/);
  assert.match(s, /\{backLabel\}/);
  // 실제 이동: signup → eligibility
  assert.match(s, /route === 'signup' \? 'eligibility'/);
});

test('내 폰트 만들기의 개발용 항목과 개발자 문구는 개발 빌드에서만 보인다', () => {
  const s = src('handwriting/HandwritingStudio.js');
  // 가져오기는 .ttf 폰트 복원이라 일반 빌드에도 남기고 이름만 나눈다(리뷰 지적)
  assert.match(s, /<Button onPress=\{importFile\} disabled=\{Boolean\(busy\)\}>\{IS_DEV_BUILD \? '초안·폰트 가져오기' : '폰트 가져오기'\}<\/Button>/);
  assert.doesNotMatch(s, /IS_DEV_BUILD && <Button onPress=\{importFile\}/);
  assert.match(s, /IS_DEV_BUILD && value\?\.draft && <Button/);
  assert.ok(!/state\.support\.reason \|\| UNSUPPORTED/.test(s));
  assert.match(s, /supportReason\(state\.support\.reason\)/);
});
