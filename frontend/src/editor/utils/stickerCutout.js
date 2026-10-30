// SAM 미연결 단계의 선택 입력 계약. 사진 픽셀·모델 결과·저장 파일을 만들지 않는다.
export const CUTOUT_MAX_STROKES = 150
export const CUTOUT_MAX_POINTS = 1200
export const emptyCutout = () => ({ strokes: [], redo: [] })
export function cutoutHistory(state, action) {
  if (action.type === 'reset') return emptyCutout()
  if (action.type === 'undo') return state.strokes.length ? {
    strokes: state.strokes.slice(0, -1), redo: [...state.redo, state.strokes.at(-1)],
  } : state
  if (action.type === 'redo') return state.redo.length ? {
    strokes: [...state.strokes, state.redo.at(-1)], redo: state.redo.slice(0, -1),
  } : state
  if (action.type !== 'stroke') return state
  const stroke = action.stroke
  if (state.strokes.length >= CUTOUT_MAX_STROKES || !['add', 'exclude'].includes(stroke?.mode)
    || !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 1
    || !stroke.points?.length || stroke.points.length > CUTOUT_MAX_POINTS
    || stroke.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return state
  return { strokes: [...state.strokes, { ...stroke, points: stroke.points.map(p => ({ x: p.x, y: p.y })) }], redo: [] }
}
export const hasCutoutSelection = state => state.strokes.some(stroke => stroke.mode === 'add')
export function containCutout(image, area) {
  if (!image?.width || !image?.height || !area.width || !area.height) return null
  const scale = Math.min(area.width / image.width, area.height / image.height)
  const width = image.width * scale, height = image.height * scale
  return { x: (area.width - width) / 2, y: (area.height - height) / 2, width, height }
}
export function cutoutPoint(x, y, rect) {
  if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) return null
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  return { x: x / rect.width, y: y / rect.height }
}
export function cutoutPath(stroke, image) {
  return stroke.points.map((p, i) => `${i ? 'L' : 'M'}${p.x * image.width} ${p.y * image.height}`).join(' ')
    + (stroke.points.length === 1 ? 'l0.01 0' : '')
}
// 화면의 width는 지름, SAM PoC의 size는 사진 너비 대비 반지름이다.
// 업로드로 받은 imageId만 전달하며 로컬 URI는 segment 요청에 포함하지 않는다.
export function cutoutSegmentInput(imageId, state) {
  if (typeof imageId !== 'string' || !imageId.trim()) throw new Error('사진을 먼저 분석해 주세요.')
  if (!hasCutoutSelection(state)) throw new Error('남길 대상을 먼저 칠해 주세요.')
  const validated = state.strokes.reduce((value, stroke) => cutoutHistory(value, { type: 'stroke', stroke }), emptyCutout())
  if (validated.strokes.length !== state.strokes.length) throw new Error('선택 입력을 확인해 주세요.')
  return { imageId, strokes: validated.strokes.map(stroke => ({
    mode: stroke.mode === 'add' ? 'include' : 'exclude', size: stroke.width / 2,
    points: stroke.points.map(point => ({ ...point })),
  })) }
}
export async function previewCutoutSelection(source, state) {
  if (!source?.uri || !hasCutoutSelection(state)) throw new Error('남길 대상을 먼저 칠해 주세요.')
  return { kind: 'selection-preview', image: { width: source.width, height: source.height },
    strokes: state.strokes.map(s => ({ ...s, points: s.points.map(p => ({ ...p })) })) }
}
