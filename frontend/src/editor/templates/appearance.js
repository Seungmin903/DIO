import { Children, cloneElement, isValidElement } from 'react'
import { isPaperFontId, swapPaperFont } from './paperFont.js'
// 사용자 요소와 분리한 속지 전용 색상 · 글꼴. 기존 문서는 기본 팔레트와 원본 글꼴(마루부리)을 그대로 쓴다.
// font 는 고른 때만 들어간다(없으면 원본 글꼴). 속지의 인쇄 글자를 고른 글꼴로 다시 그린다(paperFont.js).
export const DEFAULT_PAPER_APPEARANCE = { backgroundColor: '#FFFFFF', layoutColor: '#292929' }
// 고를 수 있는 속지 배경색·레이아웃(글자·선) 색 [이름, 색]
// 두 줄 모두 다른 프리셋처럼 7색(코덱스 2026-11-02): 기존 6색 자리는 그대로 두고 끝에 어두운 종이 · 흰 선을 더했다.
// 어두운 종이는 순수 검정 대신 차콜(덜 눈부심, GoodNotes '다크'와 같은 짙은 회색), 선은 순수 검정을 넣지 않는다(차콜이 충분히 진함)
export const PAPER_BACKGROUNDS = [
  ['화이트', '#FFFFFF'], ['크림', '#FFF8E7'], ['세이지', '#EDF3EA'],
  ['로즈', '#FBEFF0'], ['아이스 블루', '#EDF3FA'], ['웜 그레이', '#F1EFEB'], ['나이트 차콜', '#292929'],
]
export const PAPER_LAYOUTS = [
  ['차콜', '#292929'], ['네이비', '#33476B'], ['브라운', '#72533E'],
  ['포레스트', '#486653'], ['플럼', '#75546F'], ['슬레이트', '#596875'], ['화이트', '#FFFFFF'],
]
const luminance = (value) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (hi + 0.05) / (lo + 0.05) }
/**
 * 종이 색을 바꿀 때 선과 글씨가 그 위에서 읽히지 않으면(작은 글자 4.5:1 미만) 맞는 기본 선으로 바꾼다.
 * 어두운 종이(나이트 차콜) → 화이트 선, 밝은 종이에 흰 선이 남아 있으면 → 차콜 선. 읽히면 고른 선을 그대로 둔다.
 */
export function withPaperBackground(appearance, backgroundColor) {
  const next = { ...appearance, backgroundColor }
  const paper = /^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : '#FFFFFF', ink = /^#[0-9a-f]{6}$/i.test(appearance?.layoutColor ?? '') ? appearance.layoutColor : '#292929'
  if (contrast(paper, ink) >= 4.5) return next
  return { ...next, layoutColor: luminance(paper) < 0.18 ? '#FFFFFF' : '#292929' }
}
const palette = new Set(['#292929', '#666666', '#aeb3b8', '#bfc1c4', '#d7d9dc', '#e8e9eb'])
const hex = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback
export function normalizePaperAppearance(value) {
  return { backgroundColor: hex(value?.backgroundColor, '#FFFFFF'), layoutColor: hex(value?.layoutColor, '#292929'), ...(isPaperFontId(value?.font) ? { font: value.font } : {}) }
}
const rgb = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16))
function layoutPaint(value, appearance) {
  if (typeof value !== 'string' || !palette.has(value.toLowerCase())) return value
  const source = rgb(value), paper = rgb(appearance.backgroundColor), ink = rgb(appearance.layoutColor)
  // 원래 6색의 농도를 유지하고 가장 진한 색을 선택한 색에 맞춘다.
  return '#' + source.map((channel, index) => Math.round(Math.max(0, Math.min(255, paper[index] + (ink[index] - paper[index]) * (255 - channel) / 214))).toString(16).padStart(2, '0')).join('')
}
function isPaper(tag, props) {
  const width = Number(props.width), height = Number(props.height)
  return tag === 'rect' && (width === 1024 && height === 768 || width === 768 && height === 1024) && Number(props.x ?? 0) === 0 && Number(props.y ?? 0) === 0
}
/** 원본 캐시를 변경하지 않고 표시용 AST를 복제한다. */
export function colorTemplateAst(ast, value, { transparentPaper = false } = {}) {
  const appearance = normalizePaperAppearance(value)
  if (!transparentPaper && appearance.backgroundColor === '#FFFFFF' && appearance.layoutColor === '#292929') return ast
  // react-native-svg의 parse 결과는 루트 아래에 React 요소를 보관한다.
  const visit = (node, depth = 1) => {
    if (!isValidElement(node)) return node
    const props = { ...node.props }
    if (depth === 1 && isPaper('rect', props) && String(props.fill).toLowerCase() === '#ffffff') props.fill = transparentPaper ? 'none' : appearance.backgroundColor
    else if (props.dataPreservePaint !== 'true') for (const key of ['fill', 'stroke']) if (props[key]) props[key] = layoutPaint(props[key], appearance)
    if (props.children != null) props.children = Children.map(props.children, child => visit(child, depth + 1))
    return cloneElement(node, props)
  }
  return { ...ast, children: Children.map(ast.children, child => visit(child)) }
}
/** PNG/PDF도 같은 배색 규칙으로 원본 XML의 색상 속성만 바꾼다. 속지 글꼴을 골랐으면 글자 윤곽을 먼저 그 글꼴로 바꾼다. */
export function colorTemplateXml(source, value) {
  const appearance = normalizePaperAppearance(value)
  const xml = swapPaperFont(source, appearance.font)
  return xml.replace(/<([a-zA-Z][\w:.-]*)\b[^>]*>/g, (tag, name) => {
    const props = {}
    tag.replace(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g, (_, key, quote, text) => { props[key] = text; return _ })
    // 플래너 기록처럼 사용자가 고른 색은 속지 팔레트와 같아도 보존한다.
    if (props['data-preserve-paint'] === 'true') return tag
    const paper = isPaper(name, props)
    return tag.replace(/\b(fill|stroke)\s*=\s*(["'])(.*?)\2/g, (_, key, quote, paint) => key + '=' + quote + (paper && key === 'fill' ? appearance.backgroundColor : layoutPaint(paint, appearance)) + quote)
  })
}
