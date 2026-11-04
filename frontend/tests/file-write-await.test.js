import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src', import.meta.url))
const nativeFiles = readdirSync(root, { recursive: true }).filter((name) => /\.native\.js$/.test(name))

// expo-file-system 의 File.write 는 비동기다. 기다리지 않으면 쓰기 전의 파일을 읽게 된다.
test('네이티브 파일 쓰기는 끝나기를 기다린다', () => {
  assert.ok(nativeFiles.length > 0)
  const missing = nativeFiles.flatMap((name) => readFileSync(join(root, name), 'utf8').split(/\r?\n/)
    .flatMap((line, index) => (/\.write\(/.test(line) && !/await\s[^;]*\.write\(/.test(line) && !/^const \w+ = .*=> .*\.write\(/.test(line) ? [`${name}:${index + 1}`] : [])))
  assert.deepEqual(missing, [])
})
