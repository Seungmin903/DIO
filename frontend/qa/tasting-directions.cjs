const path = require('path')
const { chromium } = require('playwright')
const QA_BASE_URL = process.env.QA_BASE_URL || 'http://localhost:8093/'
const CHROME_PATH = process.env.CHROME_PATH
// 기본은 태블릿 가로 폭. 폰 배치는 QA_VIEWPORT=390x844 처럼 넘긴다
const [VIEWPORT_WIDTH, VIEWPORT_HEIGHT] = (process.env.QA_VIEWPORT || '1440x900').split('x').map(Number)

async function check(browser, orientation) {
  const context = await browser.newContext({ viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(QA_BASE_URL, { waitUntil: 'networkidle', timeout: 120000 })
    await page.getByRole('button', { name: '새 다이어리 만들기' }).click()
    if (orientation === 'landscape') await page.getByRole('button', { name: '가로', exact: true }).click()
    await page.getByRole('tab', { name: '속지, 없음' }).click()
    await page.getByRole('button', { name: '속지 추가' }).click()
    await page.getByRole('tab', { name: '일기', exact: true }).click()
    await page.getByRole('radio', { name: '테이스팅 노트' }).click()
    await page.getByRole('textbox', { name: '테이스팅 노트 장수 (1~400장)' }).fill('1')
    await page.getByRole('button', { name: '만들기', exact: true }).click()
    await page.getByRole('button', { name: '사진 추가', exact: true }).waitFor()
    await page.screenshot({ path: `qa/tasting-${orientation}.png` })
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '사진 추가', exact: true }).click()
    const chooser = await chooserPromise
    await chooser.setFiles(path.resolve('assets/images/icon.png'))
    await page.getByRole('button', { name: '적용', exact: true }).click()
    await page.getByRole('button', { name: /사진 레이어/ }).waitFor()
    if (await page.getByRole('button', { name: '사진 추가', exact: true }).count()) throw new Error('사진 추가 버튼이 남아 있습니다')
    await page.getByRole('button', { name: '펜', exact: true }).click()
    const box = await page.getByLabel('펜 캔버스').boundingBox()
    const landscape = orientation === 'landscape'
    const pageWidth = landscape ? 1024 : 768, pageHeight = landscape ? 768 : 1024
    const sourceWidth = landscape ? 1487 : 1058, sourceHeight = landscape ? 1058 : 1487
    const sourceY = landscape ? 374 : 434, sourceX = landscape ? [676, 808] : [640, 807]
    const x = v => box.x + box.width * v / sourceWidth, y = v => box.y + box.height * v / sourceHeight
    await page.mouse.move(x(sourceX[0] - 9), y(sourceY)); await page.mouse.down(); await page.mouse.move(x(sourceX[1] + 9), y(sourceY), { steps: 24 }); await page.mouse.up()
    const filled = () => page.getByTestId('color-capture-surface').locator('polygon[fill]:not([fill="none"])').count()
    await page.waitForTimeout(200)
    if (await filled() !== 3) throw new Error(`${orientation}: 별 세 개를 채우지 못했습니다`)
    await page.getByLabel('되돌리기', { exact: true }).click()
    if (await filled() !== 0) throw new Error(`${orientation}: 되돌리기 실패`)
    await page.getByLabel('다시 실행', { exact: true }).click()
    await page.getByRole('button', { name: '모든 변경 사항을 이 기기에 자동 저장했어요.' }).waitFor({ timeout: 20000 })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '새 다이어리 열기' }).click()
    await page.getByRole('button', { name: /사진 레이어/ }).waitFor()
    await page.waitForTimeout(200)
    if (await filled() !== 3) throw new Error(`${orientation}: 다시 연 후 별점이 사라졌습니다`)
    await page.getByRole('button', { name: '펜', exact: true }).click()
    const penBox = await page.getByLabel('펜 캔버스').boundingBox()
    const px = v => penBox.x + penBox.width * v / sourceWidth, py = v => penBox.y + penBox.height * v / sourceHeight
    for (const [cx, cy] of landscape ? [[730, 447], [730, 512]] : [[272, 551], [281, 640]]) {
      await page.mouse.move(px(cx - 9), py(cy)); await page.mouse.down(); await page.mouse.move(px(cx + 9), py(cy), { steps: 8 }); await page.mouse.up()
      const marks = page.getByTestId('color-capture-surface').locator(`circle[cx="${cx}"][cy="${cy}"][fill]:not([fill="none"])`)
      await marks.waitFor({ state: 'visible' })
      await page.getByRole('button', { name: '지우개', exact: true }).click()
      await page.mouse.move(px(cx - 16), py(cy)); await page.mouse.down(); await page.mouse.move(px(cx - 12), py(cy), { steps: 3 })
      await marks.waitFor({ state: 'detached' })
      await page.mouse.up()
      await page.getByRole('button', { name: '펜', exact: true }).click()
    }
    if (errors.length) throw new Error(errors.join('; '))
    console.log(`${orientation}: 사진·별점·선택 원·지우기·되돌리기·재열기 성공 (${pageWidth}×${pageHeight})`)
  } finally { await context.close() }
}
;(async () => {
  const browser = await chromium.launch({ headless: true, ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}) })
  try { await check(browser, 'portrait'); await check(browser, 'landscape') } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
