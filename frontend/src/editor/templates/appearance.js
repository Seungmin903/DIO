import { Children, cloneElement, isValidElement } from 'react'
// 사용자 요소와 분리한 속지 전용 색상. 기존 문서는 기본 팔레트를 그대로 쓴다.
export const DEFAULT_PAPER_APPEARANCE = { backgroundColor: '#FFFFFF', layoutColor: '#292929' }
const palette = new Set(['#292929', '#666666', '#aeb3b8', '#bfc1c4', '#d7d9dc', '#e8e9eb'])
const hex = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback
export function normalizePaperAppearance(value) {
  return { backgroundColor: hex(value?.backgroundColor, '#FFFFFF'), layoutColor: hex(value?.layoutColor, '#292929') }
}
const rgb = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16))
function layoutPaint(value, appearance) {
  if (typeof value !== 'string' || !palette.has(value.toLowerCase())) return value
  const source = rgb(value), paper = rgb(appearance.backgroundColor), ink = rgb(appearance.layoutColor)
  // 원래 6색의 농도를 유지하고 가장 진한 색을 선택한 색에 맞춘다.
  return '#' + source.map((channel, index) => Math.round(Math.max(0, Math.min(255, paper[index] + (ink[index] - paper[index]) * (255 - channel) / 214))).toString(16).padStart(2, '0')).join('')
}
function isPaper(tag, props) {
  return tag === 'rect' && String(props.width) === '1024' && String(props.height) === '768' && Number(props.x ?? 0) === 0 && Number(props.y ?? 0) === 0
}
/** 원본 캐시를 변경하지 않고 표시용 AST를 복제한다. */
export function colorTemplateAst(ast, value) {
  const appearance = normalizePaperAppearance(value)
  if (appearance.backgroundColor === '#FFFFFF' && appearance.layoutColor === '#292929') return ast
  // react-native-svg의 parse 결과는 루트 아래에 React 요소를 보관한다.
  const visit = (node, depth = 1) => {
    if (!isValidElement(node)) return node
    const props = { ...node.props }
    if (depth === 1 && isPaper('rect', props) && String(props.fill).toLowerCase() === '#ffffff') props.fill = appearance.backgroundColor
    else for (const key of ['fill', 'stroke']) if (props[key]) props[key] = layoutPaint(props[key], appearance)
    if (props.children != null) props.children = Children.map(props.children, child => visit(child, depth + 1))
    return cloneElement(node, props)
  }
  return { ...ast, children: Children.map(ast.children, child => visit(child)) }
}
/** PNG/PDF도 같은 배색 규칙으로 원본 XML의 색상 속성만 바꾼다. */
export function colorTemplateXml(xml, value) {
  const appearance = normalizePaperAppearance(value)
  return xml.replace(/<([a-zA-Z][\w:.-]*)\b[^>]*>/g, (tag, name) => {
    const props = {}
    tag.replace(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g, (_, key, quote, text) => { props[key] = text; return _ })
    const paper = isPaper(name, props)
    return tag.replace(/\b(fill|stroke)\s*=\s*(["'])(.*?)\2/g, (_, key, quote, paint) => key + '=' + quote + (paper && key === 'fill' ? appearance.backgroundColor : layoutPaint(paint, appearance)) + quote)
  })
}
