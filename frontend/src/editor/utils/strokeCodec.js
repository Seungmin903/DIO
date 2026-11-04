// 저장 전용 필기 점 형식. 편집기는 언제나 points 배열만 본다.
// 값별 정수 눈금으로 양자화한 뒤 열로 나눠 앞 점과의 차이만 적는다.
// - 센서 값은 createStroke 가 이미 같은 눈금으로 저장한다. 눈금에 맞지 않는 옛 값이 있으면 손실을 내지 않도록 그 획은 변환하지 않는다.
// - 좌표는 렌더러의 경로 정밀도(0.001)와 같은 눈금이고, 필압은 0.0001 눈금으로 반올림한다.
// - 첫 점은 연필 결 시드의 입력이라 원본 그대로 둔다.
// 눈금이 정해지지 않은 값이 하나라도 있으면 그 획은 변환하지 않는다.
const SCALE = { x: 1000, y: 1000, pressure: 10000, force: 10000, time: 10, speed: 10000, tiltX: 10, tiltY: 10, inkDistance: 10000 }
const ROUNDED = new Set(['x', 'y', 'pressure'])

/** 복원한 점이 저장 눈금의 오차 안에서 원본과 같은지. 눈금이 없는 값은 정확히 같아야 한다. */
export function samePoints(source, restored) {
  if (source.length !== restored.length) return false
  return source.every((point, index) => {
    const other = restored[index]
    const keys = Object.keys(point ?? {})
    if (!other || keys.length !== Object.keys(other).length) return false
    return keys.every((key) => (ROUNDED.has(key)
      ? Math.abs(point[key] - other[key]) <= 0.5 / SCALE[key] + 1e-9
      : point[key] === other[key]))
  })
}

function encodePoints(points) {
  const keys = Object.keys(points[0])
  if (!keys.every((key) => SCALE[key])) return null
  const columns = keys.map(() => [])
  const previous = keys.map(() => 0)
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    if (Object.keys(point).length !== keys.length) return null
    for (let k = 0; k < keys.length; k += 1) {
      const value = point[keys[k]]
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      const unit = Math.round(value * SCALE[keys[k]])
      if (!Number.isSafeInteger(unit)) return null
      if (i > 0 && !ROUNDED.has(keys[k]) && unit / SCALE[keys[k]] !== value) return null
      if (i > 0) columns[k].push(unit - previous[k])
      previous[k] = i === 0 ? Math.round(value * SCALE[keys[k]]) : unit
    }
  }
  return { first: points[0], keys, deltas: columns }
}

function decodePoints({ first, keys, deltas }) {
  const count = (deltas[0]?.length ?? 0) + 1
  const points = new Array(count)
  points[0] = first
  const units = keys.map((key) => Math.round(first[key] * SCALE[key]))
  for (let i = 1; i < count; i += 1) {
    const point = {}
    for (let k = 0; k < keys.length; k += 1) {
      units[k] += deltas[k][i - 1]
      point[keys[k]] = units[k] / SCALE[keys[k]]
    }
    points[i] = point
  }
  return points
}

const encodeObject = (object) => {
  if (object?.type !== 'stroke' || !Array.isArray(object.points) || object.points.length < 2) return object
  const packed = encodePoints(object.points)
  if (!packed) return object
  const { points, ...rest } = object
  return { ...rest, packedPoints: packed }
}

const decodeObject = (object) => {
  if (!object?.packedPoints) return object
  const { packedPoints, ...rest } = object
  return { ...rest, points: decodePoints(packedPoints) }
}

const mapObjects = (page, convert) => (Array.isArray(page?.objects) ? { ...page, objects: page.objects.map(convert) } : page)

export const encodePage = (page) => mapObjects(page, encodeObject)
export const decodePage = (page) => mapObjects(page, decodeObject)
export const encodeDocStrokes = (doc) => (Array.isArray(doc?.pages) ? { ...doc, pages: doc.pages.map(encodePage) } : doc)
export const decodeDocStrokes = (doc) => (Array.isArray(doc?.pages) ? { ...doc, pages: doc.pages.map(decodePage) } : doc)
