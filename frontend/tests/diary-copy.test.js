import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingPreview, copyTitleError, defaultCopyTitle } from '../src/sharing/sharingPreview.js';
import { readSessionDocument, writeSessionDocument } from '../src/editor/services/sessionDocuments.js';

async function fixture(delay = 0) {
  const runtime = createSharingPreview({ delay });
  const invite = runtime.preview.inspect().invitations.find(row => row.status === 'PENDING');
  const source = await runtime.accept(invite.inviteId, '참여자');
  const card = runtime.getSnapshot().library.find(row => row.sharedDiaryId === source.id);
  return { runtime, source, card };
}

test('사본 이름은 24자 이내의 기본값과 빈 이름·공백 검증을 사용한다', () => {
  assert.equal(defaultCopyTitle('가'.repeat(24)).length, 24);
  assert.ok(copyTitleError('   '));
  assert.ok(copyTitleError('가'.repeat(25)));
  assert.equal(copyTitleError(' 여행 사본 '), '');
});

test('기본 사본 이름은 UTF-16 24단위 안에서 경계의 이모지 쌍을 보존한다', () => {
  for (const [source, expected] of [
    ['가'.repeat(20) + '😀', '가'.repeat(20) + ' 사본'],
    ['가'.repeat(19) + '😀끝', '가'.repeat(19) + '😀 사본'],
    ['😀'.repeat(12), '😀'.repeat(10) + ' 사본'],
    ['짧은😀제목', '짧은😀제목 사본'],
  ]) {
    const result = defaultCopyTitle(source);
    assert.equal(result, expected);
    assert.ok(result.length <= 24);
    assert.equal(copyTitleError(result), '');
    assert.equal(result.isWellFormed(), true);
  }
  assert.equal(copyTitleError('😀'.repeat(12)), '');
  assert.ok(copyTitleError('😀'.repeat(13)));
});

test('공유 문서 사본은 내용·표지를 복사하고 원본·멤버·초대·프로필과 독립적이다', async () => {
  const { runtime, source, card } = await fixture();
  const doc = { pages: [{ id: 'p1', elements: [{ id: 'e1', text: '우리 기록' }], strokes: [{ points: [1, 2] }] }] };
  writeSessionDocument(card.sessionStorageKey, doc);
  const result = await runtime.createPersonalCopy(source.id, ' 내 기록 ');
  assert.equal(result.title, '내 기록');
  assert.equal(result.type, '개인');
  assert.equal(result.sharedDiaryId, undefined);
  assert.equal(result.members, undefined);
  assert.equal(result.link, undefined);
  assert.equal(result.color, source.color);
  assert.notEqual(result.id, card.id);
  const copied = readSessionDocument(result.sessionStorageKey);
  assert.deepEqual(copied, doc);
  copied.pages[0].elements[0].text = '사본 편집';
  assert.equal(readSessionDocument(card.sessionStorageKey).pages[0].elements[0].text, '우리 기록');
  assert.deepEqual(await runtime.getSharing(source.id), source);
  const second = await runtime.createPersonalCopy(source.id, '내 기록');
  assert.notEqual(second.id, result.id);
  runtime.toggleFavorite(result.id);
  assert.equal(runtime.getSnapshot().library.find(row => row.id === result.id).favorite, true);
  assert.equal((await runtime.getSharing(source.id)).favorite, undefined);
  await runtime.leave(source.id);
  assert.equal(runtime.getSnapshot().library.length, 2);
  assert.ok(readSessionDocument(result.sessionStorageKey));
  runtime.dispose();
  assert.equal(readSessionDocument(result.sessionStorageKey), null);
  runtime.activate();
  assert.equal(runtime.getSnapshot().library.filter(row => !row.sharedDiaryId).length, 0);
});

test('취소에 해당하는 미요청·잘못된 이름·개인 원본·권한 없는 복사는 카드를 추가하지 않는다', async () => {
  const { runtime, source } = await fixture();
  const before = runtime.getSnapshot().library;
  for (const title of [' ', '가'.repeat(25)])
    await assert.rejects(runtime.createPersonalCopy(source.id, title), { code: 'INVALID_TITLE' });
  runtime.registerDiary({ id: 'local', title: '개인 원본' });
  await assert.rejects(runtime.createPersonalCopy('local', '사본'), { code: 'UNAVAILABLE' });
  await assert.rejects(runtime.createPersonalCopy('missing', '사본'), { code: 'FORBIDDEN' });
  assert.deepEqual(runtime.getSnapshot().library, before);
});

test('늦은 복사 요청은 탈퇴와 세션 종료 후 재활성화에서 사본을 생성하지 않는다', async () => {
  const { runtime, source } = await fixture(15);
  const leaving = runtime.leave(source.id);
  const pending = runtime.createPersonalCopy(source.id, '늦은 사본');
  await leaving;
  await assert.rejects(pending, { code: 'FORBIDDEN' });
  const other = await fixture(15);
  const copying = other.runtime.createPersonalCopy(other.source.id, '이전 세션');
  other.runtime.dispose();
  other.runtime.activate();
  await assert.rejects(copying, { code: 'DISPOSED' });
  assert.equal(other.runtime.getSnapshot().library.filter(row => !row.sharedDiaryId).length, 0);
});
