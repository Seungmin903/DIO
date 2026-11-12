import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { datedBaseId, datedSvg, datedTemplate } from '../src/editor/templates/dated.js'
import { configuredPageIds, defaultTemplateConfig, templatePageCount } from '../src/editor/templates/creation.js'
import { getTemplate } from '../src/editor/templates/catalog.js'

const assets = new URL('../assets/templates/', import.meta.url)
const read = path => readFileSync(new URL(path, assets), 'utf8')
const make = id => datedSvg(id, read(`undated/${datedBaseId(id)}.svg`))
// 글자 묶음 → [이름|색|크기, 첫 글자 x, y]
const groups = xml => [...xml.matchAll(/<g fill="([^"]*)"[^>]*aria-label="([^"]*)"[^>]*>\s*(<path[^>]*>)/g)].map(([, fill, label, path]) => {
  const [x, y, scale] = path.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)/).slice(1).map(Number)
  return { key: `${label}|${fill}|${scale.toFixed(4)}`, x, y }
})

test('앱이 만든 2026 날짜 속지는 원본 SVG 와 글자 · 색 · 자리가 같다', () => {
  // 기간 첫 주 · 마지막 주의 기간 밖 날은 흐리게(-g)
  const edge = { '2025-12-29': '-g30', '2026-12-28': '-g03' }
  const files = readdirSync(new URL('2026/SVG/', assets)).filter(name => /^2026-(cover|divider|monthly|weekly)/.test(name))
  assert.equal(files.length, 262)
  for (const file of files) {
    const id = 'dated-' + file.slice(5, -4).replace(/^cover-/, 'cover-2026-').replace(/^(divider|monthly)-(\d\d)-/, '$1-2026-$2-')
      .replace(/(\d{4}-\d\d-\d\d)-/, (whole, date) => `${date}${edge[date] ?? ''}-`)
    const mine = groups(make(id))
    for (const item of groups(read(`2026/SVG/${file}`))) {
      assert.ok(mine.some(other => other.key === item.key && Math.abs(other.x - item.x) < 0.05 && Math.abs(other.y - item.y) < 0.05), `${file} ${item.key}`)
    }
  }
})

test('2026 설정은 파일과 같은 순서 · 장수로 날짜 속지 ID 를 만들고, 연도 없는 예전 설정은 파일을 그대로 쓴다', () => {
  const config = defaultTemplateConfig('portrait', 'dated')
  const files = configuredPageIds(config), made = configuredPageIds({ ...config, year: 2026 })
  assert.equal(made.length, files.length)
  assert.deepEqual(made.map(id => id.replace(/^dated-/, '').replace(/-g\d\d-/, '-').replace(/^(cover|divider|monthly)-2026-/, '$1-')),
    files.map(id => id.replace(/^2026-/, '')))
  assert.ok(files.every(id => id.startsWith('2026-')))
})

test('기간은 해를 넘겨 이어 가고, 첫 주의 앞달 날 · 마지막 주의 다음 달 날은 흐리게 한다', () => {
  const config = { ...defaultTemplateConfig('landscape', 'dated'), year: 2027, startMonth: 11, months: 3 }
  const ids = configuredPageIds(config)
  assert.equal(ids[0], 'dated-cover-2027-2028-landscape')
  assert.deepEqual(ids.filter(id => id.includes('-monthly-')), ['dated-monthly-2027-11-landscape', 'dated-monthly-2027-12-landscape', 'dated-monthly-2028-01-landscape'])
  // 2027-11-01 은 월요일이라 흐릴 날이 없고, 2028-01-31(월) 주는 2월 1~6일이 기간 밖이다
  assert.ok(ids.includes('dated-weekly-blocks-2027-11-01-landscape'))
  assert.equal(ids.filter(id => id.includes('-weekly-')).at(-1), 'dated-weekly-blocks-2028-01-31-g06-landscape')
  assert.equal(templatePageCount(config), ids.length)
  const week = make('dated-weekly-blocks-2028-01-31-g06-landscape')
  assert.match(week, /aria-label="1월 6주차 &amp; 2월 1주차"/)
  assert.match(week, /aria-label="2028\.01\.31 — 02\.06"/)
  assert.match(week, /fill="#bfc1c4" aria-label="TUE"/)
  assert.match(week, /fill="#292929" aria-label="31"/)
})

test('먼슬리는 5줄까지 그리고 여섯째 주는 칸을 나눠 넣는다', () => {
  const may = make('dated-monthly-2026-05-portrait')
  assert.match(may, /data-rows="5"/)
  assert.match(may, /data-week-split="true" data-split-column="0"/)
  assert.doesNotMatch(may, /data-calendar-date="2026-06-/)
  assert.match(make('dated-monthly-2026-02-portrait'), /data-rows="4"/)
  // 만년형의 손으로 쓰는 밑줄 · 6줄 가로줄은 지운다
  assert.doesNotMatch(may, /<line x1="[^"]*" x2=/)
})

test('잘못된 날짜 속지 ID 는 카탈로그에서 찾지 못한다', () => {
  for (const id of ['dated-weekly-blocks-2026-03-03-portrait', 'dated-monthly-2026-13-portrait', 'dated-cover-2026-2029-portrait', 'dated-divider-2026-03-g10-portrait', 'dated-weekly-blocks-2026-03-02-g44-portrait']) {
    assert.equal(datedTemplate(id), null, id)
    assert.throws(() => getTemplate(id))
  }
  assert.equal(getTemplate('dated-weekly-journal-2030-07-01-portrait').type, 'weekly')
})
