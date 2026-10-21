import test from 'node:test'
import assert from 'node:assert/strict'
import { gifFirstFramePngFromHead } from '../src/editor/utils/gifFirstFrame.js'

// 1×1 빨간 GIF
const TINY_GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0xff, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b]

test('큰 GIF 도 첫 장면이 끝나는 앞부분만 읽는다', async () => {
  const file = new Uint8Array(40 * 1024 * 1024)
  file.set(TINY_GIF)
  const reads = []
  const result = await gifFirstFramePngFromHead((length) => { reads.push(length); return file.subarray(0, length) }, file.length)
  assert.ok(result.png.length > 0)
  assert.deepEqual(reads, [1 << 20])
})

test('앞부분에 첫 장면이 없으면 4배씩 늘려 읽고, 끝까지 읽어도 깨졌으면 실패한다', async () => {
  const broken = new Uint8Array(5 * 1024 * 1024)
  broken.set(TINY_GIF.slice(0, 20))
  const reads = []
  await assert.rejects(gifFirstFramePngFromHead((length) => { reads.push(length); return broken.subarray(0, length) }, broken.length))
  assert.deepEqual(reads, [1 << 20, 4 << 20, broken.length])
})
