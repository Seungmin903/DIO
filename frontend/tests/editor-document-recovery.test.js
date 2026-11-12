import test from 'node:test';
import assert from 'node:assert/strict';
import { readStoredDocument } from '../src/editor/services/readStoredDocument.js';

function fixture(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, storage: { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) } };
}

test('없는 문서와 정상 문서를 구분하고 원본을 변경하지 않는다', async () => {
  const raw = JSON.stringify({ pages: [{ id: 'one', objects: [{ id: 'stroke' }] }] });
  const f = fixture({ doc: raw });
  assert.equal(await readStoredDocument(f.storage, 'missing'), null);
  assert.equal((await readStoredDocument(f.storage, 'doc')).pages[0].objects[0].id, 'stroke');
  assert.equal(f.values.get('doc'), raw);
});

for (const raw of ['{broken', 'null', '{}', '{"pages":[]}', '{"pages":[{}]}', '']) {
  test(`손상된 문서는 빈 문서로 취급하지 않고 원본과 백업을 보존한다: ${raw}`, async () => {
    const f = fixture({ doc: raw });
    await assert.rejects(readStoredDocument(f.storage, 'doc'), { code: 'EDITOR_DOCUMENT_CORRUPT' });
    assert.equal(f.values.get('doc'), raw);
    assert.equal(f.values.get('doc:corrupt'), raw);
    f.values.set('doc', '{other');
    await assert.rejects(readStoredDocument(f.storage, 'doc'));
    assert.equal(f.values.get('doc:corrupt'), raw);
  });
}

test('백업에 실패해도 원본은 덮어쓰지 않으며 오류를 반환한다', async () => {
  const f = fixture({ doc: '{broken' });
  f.storage.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(readStoredDocument(f.storage, 'doc'), { code: 'EDITOR_DOCUMENT_CORRUPT' });
  assert.equal(f.values.get('doc'), '{broken');
});

test('저장소 읽기 오류는 문서 없음으로 변환하지 않는다', async () => {
  const storage = { getItem: async () => { throw new Error('read failed'); } };
  await assert.rejects(readStoredDocument(storage, 'doc'), /read failed/);
});
