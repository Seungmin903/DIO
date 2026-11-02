import test from 'node:test';
import assert from 'node:assert/strict';
import { cropProfilePhoto, cropRect, cropView, profileCropStore } from '../src/auth/profileCrop.js';

const photo = { width: 4000, height: 3000, frame: 300 };

test('확대 1 은 사진 짧은 변이 동그라미 틀에 꽉 찬다', () => {
  assert.deepEqual(cropRect({ ...photo, zoom: 1, cx: 2000, cy: 1500 }), { originX: 500, originY: 0, width: 3000, height: 3000 });
});

test('틀은 사진 밖으로 나가지 않는다', () => {
  const view = cropView({ ...photo, zoom: 2, cx: -100, cy: 99999 });
  assert.deepEqual([view.cx, view.cy], [750, 2250]);
  assert.deepEqual(cropRect({ ...photo, zoom: 2, cx: 99999, cy: -5 }), { originX: 2500, originY: 0, width: 1500, height: 1500 });
});

test('세로 사진도 짧은 변(가로) 기준으로 맞춘다', () => {
  assert.deepEqual(cropRect({ width: 1080, height: 1920, frame: 200, zoom: 1, cx: 540, cy: 0 }), { originX: 0, originY: 0, width: 1080, height: 1080 });
});

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
