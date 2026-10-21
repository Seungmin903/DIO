import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createText } from '../src/editor/utils/text.js'

// 사용자 브라우저/저장소와 분리된 컨텍스트에서 실제 UI와 기존 자동 저장 경로를 검사한다.
export async function runEditorQa(browser, { baseURL, keys, screenshotDir }) {
  const records = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: true })
    const page = await context.newPage(), errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.setDefaultTimeout(10000)
    const record = { name: `editor-${attempt}`, attempt, passed: false, checks: [], saves: [], restores: [] }
    const id = `qa98-${attempt}`, key = `${keys.doc}:${id}`
    const doc = { id, title: `통합 QA 98-${attempt}`, pages: [{ id: 'page', canvasWidth: 1280, canvasHeight: 800, objects: [
      { ...createStroke([{ x: 800, y: 150 }, { x: 1050, y: 150 }], { id: 'erase-pen', kind: 'ball', width: 6 }), rotation: 25, w: 320, h: 24 },
      { ...createStroke([{ x: 800, y: 200 }, { x: 1050, y: 200 }], { id: 'erase-highlight', kind: 'highlighter', width: 18 }), rotation: -15, w: 290, h: 36 },
      { ...createStroke([{ x: 800, y: 250 }, { x: 1050, y: 250 }], { id: 'locked', width: 6 }), locked: true },
      { ...createStroke([{ x: 800, y: 300 }, { x: 1050, y: 300 }], { id: 'hidden', width: 6 }), hidden: true },
      createText({ id: 'text', x: 100, y: 420, width: 350, text: '한글 QA 98', fontSize: 28 }),
    ] }] }
    const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key)
    const waitDoc = async (predicate) => {
      const start = performance.now()
      while (performance.now() - start < 10000) {
        const value = await stored()
        if (value && predicate(value)) { record.saves.push(Math.round(performance.now() - start)); return value }
        await page.waitForTimeout(80)
      }
      throw Error('자동 저장 결과 대기 시간 초과')
    }
    const object = (doc, id) => doc.pages[0].objects.find((o) => o.id === id)
    const tool = async (name) => {
      await page.getByRole('button', { name, exact: true }).click()
      const close = page.getByRole('button', { name: `${name} 설정 닫기`, exact: true })
      if (await close.isVisible()) await close.click()
      if (name === '텍스트') await page.getByRole('button', { name, exact: true }).click()
    }
    const point = async (x, y) => {
      const box = await page.locator('[aria-label$=" 캔버스"]').boundingBox()
      assert.ok(box)
      return { x: box.x + x * box.width / 1280, y: box.y + y * box.height / 800 }
    }
    const drag = async (from, to, hold = false) => {
      const a = await point(...from), b = await point(...to)
      await page.mouse.move(a.x, a.y); await page.mouse.down()
      await page.mouse.move(b.x, b.y, { steps: 8 })
      if (hold) await page.waitForTimeout(750)
      await page.mouse.up()
    }
    try {
      await page.goto(baseURL)
      await page.evaluate(({ keys, doc }) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        canvas.getContext('2d').fillRect(0, 0, 1, 1)
        doc.pages[0].objects.push({ id: 'protected-photo', type: 'photo', x: 870, y: 350, w: 80, h: 40, rotation: 0,
          src: canvas.toDataURL(), imageWidth: 1, imageHeight: 1, frame: 'shape', shape: 'rect', crop: { zoom: 1, fx: 0.5, fy: 0.5 } })
        localStorage.setItem(keys.diaries, JSON.stringify([{ id: doc.id, title: doc.title, color: '#CED9EE' }]))
        localStorage.setItem(`${keys.doc}:${doc.id}`, JSON.stringify(doc))
      }, { keys, doc })
      await page.reload()
      await page.getByText(doc.title, { exact: true }).first().click()
      await page.locator('[aria-label$=" 캔버스"]').waitFor()

      for (const [name, title, closeName] of [
        ['펜', '펜', '펜 설정 닫기'], ['형광펜', '형광펜', '형광펜 설정 닫기'],
        ['지우개', '지우개', '지우개 설정 닫기'], ['텍스트', '텍스트', '텍스트 설정 닫기'],
        ['올가미 선택', '올가미', '올가미 설정 닫기'], ['스티커', '스티커', '보관함 닫기'],
        ['마스킹테이프', '마스킹테이프', '보관함 닫기'], ['사진', '사진', '보관함 닫기'],
      ]) {
        const trigger = page.getByRole('button', { name, exact: true })
        await trigger.click()
        await page.getByText(title, { exact: true }).last().waitFor()
        const close = page.getByRole('button', { name: closeName, exact: true })
        const card = await close.locator('..').locator('..').boundingBox()
        const anchor = await trigger.boundingBox()
        assert.ok(card.y - (anchor.y + anchor.height) >= 7 && card.y - (anchor.y + anchor.height) <= 18, `${name} vertical anchor`)
        assert.ok(card.x >= 0 && card.x + card.width <= 1280, `${name} viewport`)
        assert.ok(Math.abs(card.width - 320) < 2, `${name} common width`)
        if (attempt === 1) await page.screenshot({ path: `${screenshotDir}/options-${name}.png` })
        if (name === '펜' || name === '형광펜') {
          const code = page.getByLabel(`${name} 색상 HEX 코드`, { exact: true })
          const before = await code.inputValue()
          await page.getByRole('button', { name: `${name} 색상 팔레트 열기`, exact: true }).click()
          const sv = page.getByLabel(`${name} 채도·밝기`, { exact: true })
          await sv.click({ position: { x: 150, y: 25 } })
          await page.getByLabel(`${name} 색상`, { exact: true }).click({ position: { x: 110, y: 12 } })
          assert.notEqual(await code.inputValue(), before)
          assert.match(await code.inputValue(), /^#[0-9A-F]{6}$/)
          if (attempt === 1) await page.screenshot({ path: `${screenshotDir}/picker-${name}.png` })
          await page.getByRole('button', { name: `${name} 색상 팔레트 닫기`, exact: true }).click()
        }
        await close.click()
      }
      await page.getByLabel('공유 및 내보내기', { exact: true }).click()
      await page.getByRole('button', { name: '내보내기 닫기', exact: true }).click()
      record.checks.push('8개 도구 옵션 공통 폭·아이콘 기준 위치·닫기 및 내보내기 닫기')
      await tool('펜')
      const a = await point(100, 160), mid = await point(200, 230), end = await point(400, 160)
      await page.mouse.move(a.x, a.y); await page.mouse.down()
      await page.mouse.move(mid.x, mid.y, { steps: 5 }); await page.mouse.move(end.x, end.y, { steps: 5 })
      await page.waitForTimeout(750); await page.mouse.up()
      let saved = await waitDoc((d) => d.pages[0].objects.length === 7)
      const pen = saved.pages[0].objects.at(-1)
      assert.equal(pen.points.length, 2)
      record.checks.push('펜 끝점 유지 직선 보정·저장')

      await tool('형광펜')
      await drag([100, 320], [400, 320], true)
      saved = await waitDoc((d) => d.pages[0].objects.length === 8)
      assert.equal(saved.pages[0].objects.at(-1).penKind, 'highlighter')
      assert.equal(saved.pages[0].objects.at(-1).points.length, 2)
      record.checks.push('형광펜 직선 보정·저장')

      await tool('선택')
      const textPoint = await point(130, 440)
      await page.mouse.click(textPoint.x, textPoint.y)
      await page.getByRole('button', { name: '선택 요소 색상 #DD887A', exact: true }).click()
      saved = await waitDoc((d) => object(d, 'text').color === '#DD887A')
      await page.screenshot({ path: `${screenshotDir}/text-context-${attempt}.png` })
      await page.getByRole('button', { name: '글씨 확대', exact: true }).click()
      await waitDoc(d => object(d, 'text').fontSize === 30)
      await page.getByRole('button', { name: '글씨 축소', exact: true }).click()
      await waitDoc(d => object(d, 'text').fontSize === 28)
      await page.mouse.click(textPoint.x, textPoint.y)
      const input = page.getByLabel('캔버스 텍스트 내용', { exact: true })
      await input.fill('한글 통합 QA\n부분 색상과 줄바꿈')
      await input.press('Control+Home'); await input.press('Shift+ArrowRight'); await input.press('Shift+ArrowRight')
      await page.getByRole('button', { name: '선택 문자열 색상 #A3C5F0', exact: true }).click()
      await page.getByRole('button', { name: '글씨 확대', exact: true }).click()
      await page.getByRole('button', { name: '링크', exact: true }).click()
      await page.getByLabel('텍스트 링크 URL', { exact: true }).fill('https://example.com/diary')
      await page.getByRole('button', { name: '적용', exact: true }).click()
      const empty = await point(1100, 650)
      await page.mouse.click(empty.x, empty.y)
      saved = await waitDoc((d) => object(d, 'text').text === '한글 통합 QA\n부분 색상과 줄바꿈' && object(d, 'text').colorRanges?.length === 1)
      assert.deepEqual(object(saved, 'text').colorRanges, [{ start: 0, end: 2, color: '#A3C5F0' }])
      assert.deepEqual(object(saved, 'text').styleRanges, [{ start: 0, end: 2, fontSize: 30, href: 'https://example.com/diary' }])
      record.checks.push('공통 텍스트 바·전체 크기/색상·한글 줄바꿈·선택 글자 색상/크기/URL 저장')

      await tool('선택')
      await page.mouse.click(textPoint.x, textPoint.y)
      await page.getByRole('button', { name: '복사', exact: true }).click()
      await page.mouse.click(textPoint.x, textPoint.y)
      await input.press('Control+Home'); await input.press('Shift+ArrowRight'); await input.press('Shift+ArrowRight')
      await page.getByRole('button', { name: '복사', exact: true }).click()
      await page.getByRole('button', { name: '삭제', exact: true }).click()
      await page.mouse.click(empty.x, empty.y)
      await waitDoc(d => object(d, 'text').text === ' 통합 QA\n부분 색상과 줄바꿈')
      await page.getByLabel('되돌리기', { exact: true }).click()
      saved = await waitDoc(d => object(d, 'text').text.startsWith('한글') && object(d, 'text').styleRanges?.[0]?.href === 'https://example.com/diary')
      record.checks.push('전체/선택 글자 클립보드 복사·선택 삭제·Undo 범위 복원')
      let t = object(saved, 'text')
      await drag([t.x + 20, t.y + 10], [t.x + 70, t.y + 40])
      saved = await waitDoc((d) => object(d, 'text').x !== t.x)
      t = object(saved, 'text')
      await drag([t.x + t.w, t.y + t.h], [t.x + t.w + 100, t.y + t.h + 30])
      saved = await waitDoc((d) => object(d, 'text').w > t.w)
      t = object(saved, 'text')
      const handle = await page.getByLabel('요소 회전 손잡이', { exact: true }).boundingBox()
      const center = await point(t.x + t.w / 2, t.y + t.h / 2)
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down()
      await page.mouse.move(center.x + 80, center.y, { steps: 8 }); await page.mouse.up()
      saved = await waitDoc((d) => object(d, 'text').rotation !== 0)
      const rotated = object(saved, 'text')
      await page.getByLabel('되돌리기', { exact: true }).click()
      await waitDoc((d) => object(d, 'text').rotation === 0)
      await page.getByLabel('다시 실행', { exact: true }).click()
      saved = await waitDoc((d) => object(d, 'text').rotation === rotated.rotation)
      record.checks.push('텍스트 선택·이동·모서리 확대·회전·Undo/Redo')

      await tool('지우개')
      const beforeZoom = await page.locator('[aria-label$=" 캔버스"]').boundingBox()
      const zoomAt = await point(900, 250)
      await page.mouse.move(zoomAt.x, zoomAt.y)
      await page.keyboard.down('Control'); await page.mouse.wheel(0, -30); await page.keyboard.up('Control')
      await page.waitForTimeout(150)
      assert.ok((await page.locator('[aria-label$=" 캔버스"]').boundingBox()).width > beforeZoom.width)
      await drag([900, 120], [900, 400])
      saved = await waitDoc((d) => !object(d, 'erase-pen') && !object(d, 'erase-highlight'))
      assert.ok(object(saved, 'locked')); assert.ok(object(saved, 'hidden')); assert.ok(object(saved, 'text')); assert.ok(object(saved, 'protected-photo'))
      await page.getByLabel('되돌리기', { exact: true }).click()
      const beforeCancel = await waitDoc((d) => object(d, 'erase-pen') && object(d, 'erase-highlight'))
      const cdp = await context.newCDPSession(page)
      const touch = await point(900, 140)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touch.x, y: touch.y, id: 0 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touch.x, y: touch.y, id: 0 }, { x: touch.x + 35, y: touch.y + 35, id: 1 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(800)
      assert.deepEqual(await stored(), beforeCancel)
      await cdp.detach()
      record.checks.push('브라우저 모사 두 손가락 지우기 취소·기존 Redo 보존')
      await page.getByLabel('다시 실행', { exact: true }).click()
      saved = await waitDoc((d) => !object(d, 'erase-pen') && !object(d, 'erase-highlight'))
      record.checks.push('확대 상태에서 회전·변형된 두 획 삭제·사진/잠금/숨김/텍스트 보호·한 단계 Undo/Redo')

      const expected = saved
      for (let i = 0; i < 2; i++) {
        const start = performance.now()
        await page.reload()
        await page.getByText(doc.title, { exact: true }).first().click()
        await page.locator('[aria-label$=" 캔버스"]').waitFor()
        await page.getByText('부분 색상과 줄바꿈', { exact: false }).first().waitFor()
        assert.deepEqual(await stored(), expected)
        record.restores.push(Math.round(performance.now() - start))
      }
      record.checks.push('실제 자동 저장 후 새로고침·재진입 2회 문서 일치')
      assert.deepEqual(errors, [])
      record.passed = true
      await page.screenshot({ path: `${screenshotDir}/editor-${attempt}.png` })
    } catch (error) {
      record.error = error.stack
      await page.screenshot({ path: `${screenshotDir}/editor-${attempt}-failed.png` }).catch(() => {})
    } finally {
      records.push(record); console.log(record.name, record.passed ? 'PASS' : record.error)
      await context.close()
    }
  }
  return { passed: records.every((r) => r.passed), viewport: { width: 1280, height: 800 }, browser: await browser.version(),
    environment: 'Playwright Chromium / 격리된 웹 저장소, Android 실기기 결과 아님', records }
}
