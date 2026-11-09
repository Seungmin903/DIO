import test from 'node:test'
import assert from 'node:assert/strict'
import { dashedContour, dashedObjectContour, dashedPreviewContour } from '../src/editor/utils/dashedStroke.js'
import { createStroke, samplePenCurve } from '../src/editor/utils/strokes.js'
import { createStrokePreview } from '../src/editor/utils/strokePreview.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { encodePage, decodePage } from '../src/editor/utils/strokeCodec.js'
import { sanitizePenSettings, sanitizePenKinds } from '../src/editor/utils/penSettings.js'

for (const kind of ['dashed', 'dotted']) {
  test(kind + ' settings and saved geometry survive serialization', () => {
    assert.equal(sanitizePenSettings({ kind }).kind, kind)
    assert.equal(sanitizePenKinds({ [kind]: { width: 4, opacity: 0.5 } })[kind].width, 4)
    const object = createStroke([{ x: 0, y: 0 }, { x: 150, y: 0 }], { id: kind, kind, width: 4 })
    const restored = decodePage(JSON.parse(JSON.stringify(encodePage({ objects: [object] })))).objects[0]
    assert.equal(dashedObjectContour(restored), dashedObjectContour(object))
    const eraser = createEraserSession([object], 0.1)
    assert.deepEqual(eraser.move({ x: kind === 'dotted' ? 7 : 14, y: 0 }), [])
    assert.deepEqual(eraser.move({ x: 0, y: 0 }), [kind])
  })

  test(kind + ' preview uses original distances across chunk boundaries', () => {
    const points = Array.from({ length: 220 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 15) * 12 }))
    const parts = createStrokePreview().snapshot(points)
    for (const part of parts) {
      assert.ok(dashedPreviewContour(part, 3, kind).length)
    }
    const single = createStrokePreview(1000).snapshot(points)[0]
    assert.equal(dashedPreviewContour(single, 3, kind), dashedContour(samplePenCurve(points), 3, kind))
    assert.ok(dashedObjectContour(createStroke([{ x: 2, y: 3 }], { kind, width: 3 })))
  })

  test(kind + ' area erasing keeps the phase of the remaining dots and dashes', () => {
    const object = createStroke([{ x: 0, y: 100 }, { x: 300, y: 100 }], { id: kind, kind, width: 4 })
    const erase = createEraserSession([object], 10, 'area')
    erase.move({ x: 150, y: 100 })
    const fragments = erase.finish().replacements[kind]
    assert.equal(fragments.length, 2)
    for (const fragment of fragments) {
      assert.ok(fragment.points.every(point => Number.isFinite(point.inkDistance)))
      assert.ok(dashedObjectContour(fragment).length)
    }
    const right = fragments[1]
    const gapX = kind === 'dotted' ? 175 : 176
    assert.deepEqual(createEraserSession([right], 0.1).move({ x: gapX, y: 100 }), [])
    assert.deepEqual(createEraserSession([right], 0.1).move({ x: kind === 'dotted' ? 182 : 180, y: 100 }), [right.id])
  })
}
