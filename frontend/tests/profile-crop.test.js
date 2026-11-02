import test from 'node:test';
import assert from 'node:assert/strict';
import { cropProfilePhoto, profileCropStore } from '../src/auth/profileCrop.js';

test('앱 자르기 화면이 붙어 있으면 그 결과를, 없으면 고른 사진을 그대로 돌려준다', async () => {
  assert.equal(await cropProfilePhoto({ uri: 'file:///a.jpg' }), 'file:///a.jpg');
  const detach = profileCropStore.attach();
  try {
    const first = cropProfilePhoto({ uri: 'file:///b.jpg' });
    assert.equal(profileCropStore.getSnapshot().asset.uri, 'file:///b.jpg');
    // 앞 요청이 남은 채 다시 고르면 앞 요청은 취소(null)로 끝난다
    const second = cropProfilePhoto({ uri: 'file:///c.jpg' });
    assert.equal(await first, null);
    profileCropStore.settle('file:///cropped.jpg');
    assert.equal(await second, 'file:///cropped.jpg');
    assert.equal(profileCropStore.getSnapshot(), null);
  } finally {
    detach();
  }
});
