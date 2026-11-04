import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('초대 딥링크에 사용할 dio URL scheme을 등록한다', () => {
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));

  assert.equal(config.expo.scheme, 'dio');
});
