import test from 'node:test'
import assert from 'node:assert/strict'
import { PAPERS, appendPaper, changeRow, changeRowPaper, clampWhole, isPeriodSection, mergeSections, mixOrder, moveDown, movePaper, moveUp, newRow, newSection, paperPreviewId, removePaper, savedPaperSummary, splitSection, sectionTitle, sectionsTemplateConfig } from '../src/diary/utils/paperChoice.js'
import { bandAutoColor, changeCoverKind, coverElementSummary, defaultCover, normalizeCover } from '../src/diary/utils/coverDesign.js'
import { photoTone } from '../src/diary/utils/photoTone.js'
import { configuredPageIds, defaultTemplateConfig, normalizeTemplateConfig, templatePageCount } from '../src/editor/templates/creation.js'
import { getTemplate } from '../src/editor/templates/catalog.js'
import { createDefaultDoc } from '../src/editor/state/defaultDoc.js'
import { normalizeDiaries } from '../src/diary/utils/diaryLibrary.js'

// 줄을 직접 넣은 묶음
const sectionOf = (rows, extra = {}) => ({ ...newSection(), ...extra, rows: rows.map(([paper, count = 1, every = 'month']) => newRow(paper, count, every)) })

test('플래너는 고른 시작 달부터 기간만큼의 달만 넣는다', () => {
  const planner = sectionOf([['cover'], ['divider'], ['monthly'], ['weekly-blocks']], { year: 2026, startMonth: 3, months: 4 })
  const config = sectionsTemplateConfig([planner], 'landscape')
  const ids = configuredPageIds(config)
  const months = new Set(ids.map(id => getTemplate(id)).filter(asset => asset.type === 'monthly').map(asset => asset.month))
  assert.deepEqual([...months], [3, 4, 5, 6])
  assert.equal(ids[0], 'dated-cover-2026-landscape')
  assert.equal(templatePageCount(config), ids.length)
  assert.equal(createDefaultDoc({ templateConfig: config }).pages.length, ids.length)
})

test('기간은 2026년 12월을 넘지 않고, 예전 설정은 1년 전체로 읽는다', () => {
  const config = normalizeTemplateConfig({ ...defaultTemplateConfig(), startMonth: 11, months: 6 })
  assert.equal(config.months, 2)
  assert.equal(normalizeTemplateConfig(defaultTemplateConfig()).months, 12)
  assert.equal(templatePageCount(defaultTemplateConfig()), 78)
})

test('미리 섞인 세트 없이 속지는 한 종류씩이고 추천 표시도 없다', () => {
  assert.ok(!PAPERS.some(paper => paper.id === 'year' || 'recommended' in paper))
  for (const paper of PAPERS.filter(item => item.kind === 'count')) {
    const ids = configuredPageIds(sectionsTemplateConfig([sectionOf([[paper.id, 7]])], 'portrait'))
    assert.equal(ids.length, 7, paper.id)
    assert.equal(new Set(ids).size, 1, paper.id)
    assert.equal(ids[0], paperPreviewId(paper.id, 'portrait'), paper.id)
    assert.ok(ids[0].endsWith('-portrait'))
  }
  // 날짜 속지 하나만 고르면 그 속지만 (표지 · 구분지가 따라오지 않는다)
  const monthly = configuredPageIds(sectionsTemplateConfig([sectionOf([['monthly']], { year: 2027, months: 3 })], 'portrait'))
  assert.deepEqual(monthly, ['dated-monthly-2027-01-portrait', 'dated-monthly-2027-02-portrait', 'dated-monthly-2027-03-portrait'])
})

test('예전 플래너 묶음 · 예전 요약도 다시 읽는다', () => {
  const config = normalizeTemplateConfig({ ...defaultTemplateConfig('portrait', 'undated'), cover: false, dividers: false, monthly: false, weekly: false,
    sections: [{ kind: 'planner', dateMode: 'undated', cover: true, dividers: true, monthly: false, weekly: true, weeklyStyle: 'journal' }] })
  const ids = configuredPageIds(config)
  assert.equal(ids.length, 8)
  assert.ok(ids.includes('undated-weekly-journal-portrait'))
  const [saved] = normalizeDiaries([{ id: 'a', title: '플래너', templateConfig: { ...defaultTemplateConfig('portrait', 'undated'), paper: { id: 'weekly-journal', dated: false } } }])
  assert.equal(savedPaperSummary(saved.templateConfig), '주간 · 저널 · 날짜 없음')
  assert.match(savedPaperSummary(defaultTemplateConfig()), /^직접 구성 · 78페이지$/)
  const old = { ...config, paper: { sections: [{ kind: 'planner', paper: 'year', dated: true, year: 2027, startMonth: 1, months: 12, insert: { paper: null } }] } }
  assert.match(savedPaperSummary(old), /^표지 → 구분지 → 월간 달력 → 주간 · 블록 · \d+페이지$/)
})

test('숫자 칸은 범위 안의 정수로 맞추고 숫자가 아니면 거른다', () => {
  assert.equal(clampWhole('0', 1, 400), 1)
  assert.equal(clampWhole('999', 1, 400), 400)
  assert.equal(clampWhole('12장', 1, 400), 12)
  assert.equal(clampWhole('', 1, 400), null)
})

test('예전 다이어리는 색 · 패턴으로 표지를 만들고, 잘못된 표지 값은 기본값으로 채운다', () => {
  const cover = normalizeCover({ color: '#474d57', pattern: 'dot' })
  assert.equal(cover.color, '#474D57')
  assert.deepEqual(cover.pattern, { type: 'dot', tone: 'light' })
  assert.equal(coverElementSummary(cover, 'base'), '차콜 · 도트')
  const broken = normalizeCover({ color: '#9DABD8', cover: { kind: 'photo', title: { size: 999, anchor: 'zz' }, stickers: [{ id: 's', asset: 'heart', x: 140, size: 2 }, { x: 1 }] } })
  // 사진 없는 사진 표지는 색 표지로 읽는다
  assert.equal(broken.kind, 'plain')
  assert.equal(broken.title.size, 48)
  assert.equal(broken.title.anchor, 'bc')
  assert.deepEqual(broken.stickers.map(item => [item.x, item.size]), [[100, 6]])
})

test('표지를 빼도 설정은 남고, 종류를 바꿔도 바탕 밖의 요소(라벨 · 글씨 색)는 그대로다', () => {
  const cover = { ...defaultCover(), band: { on: false, dir: 'h', pos: 'center', color: '#FFFFFF' } }
  const removed = changeCoverKind(cover, 'none')
  assert.equal(removed.enabled, false)
  assert.deepEqual(changeCoverKind(removed, 'plain').band, cover.band)
  const photo = changeCoverKind(cover, 'photo')
  assert.equal(photo.kind, 'photo')
  assert.equal(photo.plate, cover.plate)
  assert.deepEqual(photo.title, cover.title)
  assert.deepEqual(changeCoverKind(photo, 'plain'), { ...cover, kind: 'plain' })
})

test('띠지 종이색은 목록 안의 색만 받고, 고무줄 맞춤 색은 바탕을 따른다', () => {
  assert.equal(defaultCover().ribbon.color, '#F3F2ED')
  assert.equal(normalizeCover({ cover: { ribbon: { color: '#d9c4a3' } } }).ribbon.color, '#D9C4A3')
  assert.equal(normalizeCover({ cover: { ribbon: { color: '#123456' } } }).ribbon.color, '#F3F2ED')
  const navy = { ...defaultCover(), ribbon: { color: '#0B1957' } }
  assert.equal(coverElementSummary(navy, 'plate'), '띠지 · 네이비 · 가운데 아래')
  assert.equal(coverElementSummary({ ...navy, title: { ...navy.title, at: { x: 0, y: 20 } } }, 'plate'), '띠지 · 네이비 · 옮긴 자리')
  const plain = defaultCover({ color: '#FFFFFF' })
  assert.notEqual(bandAutoColor(plain), bandAutoColor({ ...plain, gradient: 3 }))
  assert.equal(bandAutoColor({ ...plain, kind: 'photo' }), '#7D88B5')
})

test('보관함 목록은 표지 설정을 지우지 않는다', () => {
  const cover = defaultCover()
  const [saved] = normalizeDiaries([{ id: 'a', title: '표지', cover, pattern: 'check' }])
  assert.deepEqual(saved.cover, cover)
  assert.equal(saved.pattern, 'check')
})

test('예전 예시 사진 표지는 같은 그라데이션 바탕으로, 옮긴 제목 자리는 범위 안으로 읽는다', () => {
  const old = normalizeCover({ cover: { kind: 'photo', photo: { sample: 2 }, title: { at: { x: 140, y: 30 } } } })
  assert.equal(old.kind, 'plain')
  assert.equal(old.gradient, 2)
  assert.deepEqual(old.title.at, { x: 100, y: 30 })
  assert.equal(normalizeCover({ cover: { gradient: 99 } }).gradient, null)
  const own = normalizeCover({ cover: { kind: 'photo', photo: { src: 'file://a.jpg', mediaFileId: 'm1' } } })
  assert.equal(own.kind, 'photo')
  assert.equal(coverElementSummary(own, 'base'), '내 사진')
})

test('속지 묶음은 순서대로 쌓고, 기간 묶음은 달 · 주마다 줄을 번갈아 넣고, 장수 묶음은 섞어 반복한다', () => {
  const planner = sectionOf([['cover'], ['divider'], ['monthly'], ['weekly-blocks'], ['diary', 1, 'day']], { year: 2027, startMonth: 3, months: 1 })
  const mix = sectionOf([['diary', 1], ['scrap', 2]], { repeat: 3 })
  const ids = configuredPageIds(sectionsTemplateConfig([planner, mix], 'portrait'))
  // 3월 2027: 표지 · 구분지 · 월간 + 주간 5장(3/1 ~ 3/29) 마다 그 주의 기간 안 날만큼 하루 일기
  const weeks = ids.filter(id => id.startsWith('dated-weekly-'))
  assert.equal(weeks.length, 5)
  assert.equal(ids.indexOf(weeks[1]) - ids.indexOf(weeks[0]), 8)
  assert.equal(ids.filter(id => id.includes('-diary-')).length, 31 + 3)
  // 섞은 묶음: 일기 1 → 사진 2 를 3번
  assert.deepEqual(ids.slice(-9).map(id => id.match(/-(diary|scrap)-/)[1]), ['diary', 'scrap', 'scrap', 'diary', 'scrap', 'scrap', 'diary', 'scrap', 'scrap'])
  const config = sectionsTemplateConfig([mix, planner], 'portrait')
  assert.ok(configuredPageIds(config)[0].includes('-diary-'))
  assert.match(savedPaperSummary(config), /^하루 일기 → 사진 · 스크랩 외 1묶음 · \d+페이지$/)
  assert.equal(createDefaultDoc({ templateConfig: config }).pages.length, configuredPageIds(config).length)
  // 주간 두 양식 · 매주 노트는 주마다 차례로, 매달 노트는 그 줄 자리에
  const both = configuredPageIds(sectionsTemplateConfig([sectionOf([['weekly-blocks'], ['weekly-journal'], ['ruled', 1, 'week'], ['grid', 2, 'month']], { year: 2027, startMonth: 3, months: 1 })], 'portrait'))
  assert.deepEqual(both.slice(0, 6).map(id => id.match(/weekly-(blocks|journal)|note-ruled/)[0]), ['weekly-blocks', 'weekly-journal', 'note-ruled', 'weekly-blocks', 'weekly-journal', 'note-ruled'])
  assert.equal(both.length, 5 * 3 + 2)
  assert.ok(both.slice(-2).every(id => id.includes('note-grid')))
  // 날짜 없는 플래너도 개월만큼, 한 달 5주
  assert.equal(configuredPageIds(sectionsTemplateConfig([sectionOf([['monthly'], ['weekly-journal']], { dated: false, months: 2 })], 'portrait')).length, 2 * (1 + 5))
})

test('속지 목록: 더하면 이어서, 사이를 섞어서로 바꾸면 번갈아, 다시 이어서로 펼친다', () => {
  // 더하면 각자 이어서 (장수 속지 10장)
  let list = appendPaper(appendPaper([], 'diary'), 'scrap')
  assert.deepEqual(list.map(section => section.rows.map(row => [row.paper, row.count])), [[['diary', 10]], [['scrap', 10]]])
  // 일기 30 · 사진 10 을 섞으면 일기 3 → 사진 1 을 10번
  list = [{ ...list[0], rows: [{ ...list[0].rows[0], count: 30 }] }, list[1]]
  list = mergeSections(list, 0)
  assert.equal(list.length, 1)
  assert.equal(mixOrder(list[0]), '하루 일기 3 → 사진 · 스크랩 1 을 10번')
  assert.equal(configuredPageIds(sectionsTemplateConfig(list, 'portrait')).length, 40)
  // 다시 이어서로 나누면 반복만큼 장수로 펼친다
  const split = splitSection(list, 0, 0)
  assert.deepEqual(split.map(section => section.rows.map(row => [row.paper, row.count])), [[['diary', 30]], [['scrap', 10]]])
  // 이름을 눌러 그 자리에서 바꾸기
  list = [changeRowPaper(list[0], list[0].rows[1].key, 'grid')]
  assert.deepEqual(list[0].rows.map(row => row.paper), ['diary', 'grid'])
  // 날짜 속지와 섞으면 기간 묶음: 장수 속지는 매달 1장, 표지는 맨 위
  list = mergeSections(appendPaper(list, 'monthly'), 0)
  assert.ok(isPeriodSection(list[0]))
  assert.deepEqual(list[0].rows.map(row => [row.paper, row.count, row.every]), [['diary', 1, 'month'], ['grid', 1, 'month'], ['monthly', 1, 'month']])
  list = mergeSections(appendPaper(list, 'cover'), 0)
  assert.equal(list[0].rows[0].paper, 'cover')
  list = [changeRow(list[0], list[0].rows.find(row => row.paper === 'grid').key, { every: 'start' })]
  assert.equal(sectionTitle(list[0]), '표지 → 모눈 → 하루 일기 → 월간 달력')
  // 위로: 자리(섞어서)는 두고 속지만 바꾼다
  const moved = moveUp(appendPaper(appendPaper([], 'ruled'), 'dots'), 1, 0)
  assert.deepEqual(moved.map(section => section.rows[0].paper), ['dots', 'ruled'])
  // 날짜 속지를 빼면 다시 장수 묶음, 마지막 속지를 빼면 묶음도 빠진다
  list = removePaper(list, 0, list[0].rows.find(row => row.paper === 'monthly').key)
  assert.ok(!isPeriodSection(list[0]))
  const one = appendPaper([], 'ruled')
  assert.deepEqual(removePaper(one, 0, one[0].rows[0].key), [])
  // 빈 묶음은 빼고 만든다 · 너무 많으면 막는다
  assert.deepEqual(configuredPageIds(sectionsTemplateConfig([newSection()], 'portrait')), [])
  const huge = sectionOf([['ruled', 400]])
  assert.throws(() => sectionsTemplateConfig([huge, huge, huge, huge, huge, huge], 'portrait'), /2000장/)
})

test('아래로 · 끌어서 옮기기: 섞인 판 안에 놓으면 그 판에, 아니면 혼자 이어서', () => {
  const rows = list => list.map(section => section.rows.map(row => row.paper))
  // 일기 · 사진 을 섞은 판 + 월간 + 줄
  let list = mergeSections(appendPaper(appendPaper([], 'diary'), 'scrap'), 0)
  list = appendPaper(appendPaper(list, 'monthly'), 'ruled')
  assert.deepEqual(rows(moveDown(list, 0, 0)), [['scrap', 'diary'], ['monthly'], ['ruled']])
  assert.deepEqual(rows(moveDown(list, 2, 0)), rows(list))
  // 줄을 맨 위(일기 앞)로 끌면 혼자 이어서
  assert.deepEqual(rows(movePaper(list, 2, 0, 0)), [['ruled'], ['diary', 'scrap'], ['monthly']])
  // 줄을 일기와 사진 사이로 끌면 그 판에 들어간다
  assert.deepEqual(rows(movePaper(list, 2, 0, 1)), [['diary', 'ruled', 'scrap'], ['monthly']])
  // 사진을 판 밖(맨 끝)으로 끌면 판이 풀리고, 남은 일기는 반복만큼 장수로 펼친다
  const out = movePaper(list, 0, 1, 3)
  assert.deepEqual(rows(out), [['diary'], ['monthly'], ['ruled'], ['scrap']])
  assert.equal(out[0].rows[0].count, list[0].repeat)
  // 장수 속지가 기간 판에 들어가면 매달 1장부터
  const period = mergeSections(appendPaper(appendPaper([], 'divider'), 'monthly'), 0)
  const joined = movePaper([...period, ...appendPaper([], 'grid')], 1, 0, 1)
  assert.deepEqual(joined[0].rows.map(row => [row.paper, row.count, row.every]), [['divider', 1, 'month'], ['grid', 1, 'month'], ['monthly', 1, 'month']])
})

test('사진 표지의 고무줄 맞춤색은 사진 대표 색을 따른다', () => {
  const pixels = (...colors) => Uint8Array.from(colors.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat()))
  // 하늘색이 가장 많은 사진 → 파란 계열, 무채색 사진 → 평균색
  assert.equal(photoTone(pixels([80, 140, 220, 60], [230, 200, 60, 20], [250, 250, 250, 20])), '#508CDC')
  assert.equal(photoTone(pixels([40, 40, 40, 50], [200, 200, 200, 50])), '#787878')
  const cover = { ...defaultCover(), kind: 'photo', photo: { src: 'file://a.jpg', tone: '#508CDC' } }
  assert.notEqual(bandAutoColor(cover), '#7D88B5')
  assert.equal(normalizeCover({ cover }).photo.tone, '#508CDC')
  assert.equal(bandAutoColor({ ...cover, photo: { src: 'file://a.jpg' } }), '#7D88B5')
})

test('속지 묶음이 없어도 만들 수 있고 빈 페이지 한 장으로 시작한다', () => {
  const config = sectionsTemplateConfig([], 'portrait')
  assert.deepEqual(configuredPageIds(config), [])
  assert.equal(templatePageCount(config), 1)
  assert.equal(savedPaperSummary(config), '속지 없음')
  const pages = createDefaultDoc({ templateConfig: config }).pages
  assert.equal(pages.length, 1)
  assert.equal(pages[0].backgroundAssetId ?? null, null)
})
