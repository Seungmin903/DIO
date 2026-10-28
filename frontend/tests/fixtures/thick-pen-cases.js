export const thickPenCases = [
  { name: 'hairpin', points: [{ x: 35, y: 65 }, { x: 140, y: 65 }, { x: 142, y: 68 }, { x: 140, y: 71 }, { x: 35, y: 71 }] },
  { name: 'loop', points: Array.from({ length: 49 }, (_, i) => ({ x: 100 + 6 * Math.cos(i * Math.PI / 24), y: 75 + 6 * Math.sin(i * Math.PI / 24) })) },
  { name: 'zigzag', points: [{ x: 40, y: 110 }, { x: 90, y: 40 }, { x: 80, y: 100 }, { x: 130, y: 40 }, { x: 120, y: 105 }, { x: 165, y: 50 }] },
  { name: 'retrace', points: [{ x: 40, y: 60 }, { x: 145, y: 60 }, { x: 40, y: 60 }, { x: 145, y: 60 }] },
]
export const penCasePoints = (fixture, kind) => fixture.points.map(p => ({ ...p, pressure: kind === 'fountain' ? 1.5 : 2.3 }))
