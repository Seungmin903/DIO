// 원본 packing-*-blank.svg의 좌표. 값은 페이지 좌표이며 줌과 무관하다.
const LAYOUTS = {
  portrait: {
    origin: { x: 70, y: 169 },
    cases: [{ x: 0, y: 0, width: 309, height: 315, rx: 30 }, { x: 319, y: 0, width: 309, height: 315, rx: 30 }],
    interiors: [{ x: 15, y: 16, width: 279, height: 283, rx: 20 }, { x: 334, y: 16, width: 279, height: 283, rx: 20 }],
    mesh: 'M354 16H593Q613 16 613 36V279Q613 299 593 299H354Q334 299 334 279V36Q334 16 354 16Z',
  },
  landscape: {
    origin: { x: 36, y: 207 },
    cases: [{ x: 0, y: 0, width: 257, height: 410, rx: 30 }, { x: 267, y: 0, width: 257, height: 410, rx: 30 }],
    interiors: [{ x: 15, y: 16, width: 227, height: 378, rx: 20 }, { x: 282, y: 16, width: 227, height: 378, rx: 20 }],
    mesh: 'M302 16H489Q509 16 509 36V374Q509 394 489 394H302Q282 394 282 374V36Q282 16 302 16Z',
  },
}

export function packingLayout(assetId) {
  if (assetId === 'remote-packing-list-v8-portrait') return { ...packingLayout('remote-packing-list-v7-portrait'), outlineWidth: 1.4 }
  if (assetId === 'remote-packing-list-v8-landscape') return { ...packingLayout('remote-packing-list-v7-landscape'), outlineWidth: 1.4 }
  if (assetId === 'remote-packing-list-v7-portrait') return packingLayout('remote-packing-list-v6-portrait')
  if (assetId === 'remote-packing-list-v7-landscape') return packingLayout('remote-packing-list-v6-landscape')
  if (assetId === 'remote-packing-list-v6-portrait') return { ...packingLayout('remote-packing-list-v5-portrait'), buckleV2: true }
  if (assetId === 'remote-packing-list-v6-landscape') return { ...packingLayout('remote-packing-list-v5-landscape'), buckleV2: true }
  if (assetId === 'remote-packing-list-v5-portrait') return { origin: { x: 70, y: 180 }, cases: [{x:0,y:0,width:309,height:422,rx:28},{x:319,y:0,width:309,height:422,rx:28}], interiors: [{x:15,y:15,width:279,height:392,rx:18},{x:334,y:15,width:279,height:392,rx:18}], mesh: 'M352 15H595Q613 15 613 33V389Q613 407 595 407H352Q334 407 334 389V33Q334 15 352 15Z', detailed: true }
  if (assetId === 'remote-packing-list-v5-landscape') return { origin: { x: 82, y: 155 }, cases: [{x:0,y:0,width:420,height:345,rx:28},{x:430,y:0,width:420,height:345,rx:28}], interiors: [{x:15,y:15,width:390,height:315,rx:18},{x:445,y:15,width:390,height:315,rx:18}], mesh: 'M463 15H817Q835 15 835 33V312Q835 330 817 330H463Q445 330 445 312V33Q445 15 463 15Z', detailed: true }
  if (assetId === 'remote-packing-list-v4-portrait') return { ...LAYOUTS.portrait, origin: { x: 70, y: 185 }, scaleX: 1, scaleY: 1.65, detailed: true }
  if (assetId === 'remote-packing-list-v4-landscape') return { ...LAYOUTS.landscape, origin: { x: 80, y: 140 }, scaleX: 1.62, scaleY: 0.9, detailed: true }
  if (assetId === 'remote-packing-list-v3-portrait') return { ...LAYOUTS.portrait, origin: { x: 70, y: 185 }, scaleX: 1, scaleY: 1.65 }
  if (assetId === 'remote-packing-list-v3-landscape') return { ...LAYOUTS.landscape, origin: { x: 80, y: 140 }, scaleX: 1.62, scaleY: 0.9 }
  if (assetId === 'remote-packing-list-v2-portrait') return { ...LAYOUTS.portrait, origin: { x: 170, y: 150 }, scaleX: 0.68, scaleY: 1.2 }
  if (assetId === 'remote-packing-list-v2-landscape') return { ...LAYOUTS.landscape, origin: { x: 36, y: 260 }, scaleX: 1, scaleY: 0.56 }
  if (assetId === 'remote-packing-list-portrait') return LAYOUTS.portrait
  if (assetId === 'remote-packing-list-landscape') return LAYOUTS.landscape
  return null
}
