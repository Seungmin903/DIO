// 여행 노선 속지의 지점(출발 · 방문 · 도착). 새 요소 타입이 아니라 스티커 하위 종류다(D-day 위젯과 같은 방식):
//   { type: 'sticker', routeNode: { kind, t, color, label? }, x, y, w, h }
// 그래서 백엔드 변경 없이 STICKER 요소(propertiesJson.routeNode)로 동기화 · 내보내기 · 썸네일 · 올가미가 그대로 된다.
// t 는 노선 경로 위 비율(0~1, routePath.js)이고 x · y 도 함께 저장하므로 기록이 없는 기기에서도 제자리에 보인다.
// color 는 놓을 때의 노선 색이며 노선 색을 바꾸면 Canvas 가 지점 색도 함께 바꾼다(친구 기기는 노선 기록이 없어 이 색으로 본다).
import { createId } from '../utils/common.js'

export const ROUTE_NODE_SIZE = 44 // 페이지 단위. 터치 영역이자 그림 상자(원 지름은 약 20). 노선 굵기 6 에 맞춘다
export const ROUTE_NODE_KINDS = [['start', '출발'], ['stop', '방문'], ['end', '도착']]
/** 지점을 놓을 때 노선에서 이만큼(화면 px) 안을 눌러야 한다. 배율로 나눠 쓴다 */
export const ROUTE_NODE_SNAP_PX = 48
export const ROUTE_NODE_LABEL_MAX = 40
const KINDS = new Set(ROUTE_NODE_KINDS.map(([id]) => id))
const HEX = /^#[0-9a-f]{6}$/i

export const isRouteNode = object => object?.type === 'sticker' && object.routeNode != null && typeof object.routeNode === 'object'
export const routeNodeKindLabel = kind => ROUTE_NODE_KINDS.find(([id]) => id === kind)?.[1] ?? '방문'

/** 지점 기록을 검증한 모양으로. 모양이 이상하면 방문, t 는 0~1, 색은 hex 아니면 fallback, 이름은 40자 */
export function normalizeRouteNode(value, fallbackColor = '#91A886') {
  const v = value && typeof value === 'object' ? value : {}
  const t = Number.isFinite(v.t) ? Math.min(1, Math.max(0, v.t)) : 0
  const label = typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, ROUTE_NODE_LABEL_MAX) : null
  return { kind: KINDS.has(v.kind) ? v.kind : 'stop', t, color: typeof v.color === 'string' && HEX.test(v.color) ? v.color.toUpperCase() : fallbackColor.toUpperCase(), ...(label ? { label } : {}) }
}

/** 노선 위 점(routePath.nearest 결과 { x, y, t })에 놓는 지점의 자리 */
export const routeNodeBox = (point, size = ROUTE_NODE_SIZE) => ({ x: point.x - size / 2, y: point.y - size / 2, w: size, h: size })

export function createRouteNode({ kind = 'stop', point, color }) {
  const node = normalizeRouteNode({ kind, t: point.t, color })
  return { id: createId(), type: 'sticker', rotation: 0, ...routeNodeBox(point), routeNode: node, name: `여행 노선 · ${routeNodeKindLabel(node.kind)}` }
}
