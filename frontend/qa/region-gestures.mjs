export async function dragRegionCorner(page, corner, x, y, pageWidth, pageHeight) {
  const overlay = page.getByTestId('export-region-overlay')
  await overlay.waitFor()
  const bounds = await overlay.boundingBox()
  const handle = await page.getByTestId(`region-handle-${corner}`).boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + x / pageWidth * bounds.width, bounds.y + y / pageHeight * bounds.height, { steps: 12 })
  await page.mouse.up()
}

export async function setRegion(page, region, pageWidth = 1280, pageHeight = 800) {
  await dragRegionCorner(page, 'nw', region.x, region.y, pageWidth, pageHeight)
  await dragRegionCorner(page, 'se', region.x + region.width, region.y + region.height, pageWidth, pageHeight)
}

export async function touchGesture(page, from, to, { staggered = false } = {}) {
  const cdp = await page.context().newCDPSession(page)
  try {
    if (staggered) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: from.slice(0, 1).map(([x, y]) => ({ x, y, id: 0 })) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: from.map(([x, y], id) => ({ x, y, id })) })
    for (let step = 1; step <= 12; step++) {
      const t = step / 12
      const touchPoints = from.map(([x, y], id) => ({ x: x + (to[id][0] - x) * t, y: y + (to[id][1] - y) * t, id }))
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally { await cdp.detach() }
}
