import assert from 'node:assert/strict';
import test from 'node:test';
import { memberInviteId, subscribeMemberInviteLinks } from '../src/sharing/memberInviteLink.js';

test('only the DIO member invitation route with a valid ID opens an invitation', () => {
  assert.equal(memberInviteId('dio://member-invites/9223372036854775807'), '9223372036854775807');
  for (const url of [
    null, 'https://dio.example/member-invites/123', 'dio://invite/123',
    'dio://member-invites/0', 'dio://member-invites/9223372036854775808',
    'dio://member-invites/123?token=secret', 'dio://member-invites/123\n',
  ]) assert.equal(memberInviteId(url), null);
});

test('a cold start and subsequent links both deliver the invitation ID', async () => {
  const received = [];
  let receive;
  let removed = false;
  const stop = subscribeMemberInviteLinks({
    addEventListener(type, callback) {
      assert.equal(type, 'url');
      receive = callback;
      return { remove: () => { removed = true; } };
    },
    getInitialURL: async () => 'dio://member-invites/123',
  }, id => received.push(id));
  await Promise.resolve();
  receive({ url: 'dio://member-invites/456' });
  stop();
  receive({ url: 'dio://member-invites/789' });
  assert.equal(removed, true);
  assert.deepEqual(received, ['123', '456']);
});

test('only production HTTPS sharing links enter the shared invitation flow', async () => {
  const url = 'https://k15f106.p.ssafy.io/invite/7.' + 'a'.repeat(43);
  const received = [];
  let receive;
  const stop = subscribeMemberInviteLinks({
    addEventListener(_type, callback) {
      receive = callback;
      return { remove() {} };
    },
    getInitialURL: async () => url,
  }, id => assert.fail(id), link => received.push(link));
  await Promise.resolve();
  for (const invalid of [url.replace('https', 'http'), url.replace('.io/', '.io:8443/'),
    url.replace('.io/', '.io.example/'), url + '?next=1', url + '\n', url.slice(0, -1)]) {
    receive({ url: invalid });
  }
  receive({ url: url.replace('/7.', '/8.') });
  stop();
  assert.deepEqual(received, [url, url.replace('/7.', '/8.')]);
});