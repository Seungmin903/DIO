// 원격 속지 SVG 가 앱 속지와 같은 규칙(DIO 속지 형식)을 따르는지 검사한다. 앱 속지(assets/templates) 전부가 이 검사를 통과한다(tests/remote-catalog.test.js).
// 이 규칙을 지켜야 속지 색 바꾸기(editor/templates/appearance.js)가 원격 속지에도 그대로 적용된다.
//
// 1. 루트 <svg> 의 width · height · viewBox 가 속지 크기와 같다(가로 1024×768, 세로 768×1024).
// 2. 처음 그리는 요소가 종이 전체를 덮는 rect(x · y 0, fill #ffffff) 다. 종이 색을 바꾸면 이 사각형 색이 바뀐다.
// 3. fill · stroke 는 none 또는 속지 선 색 6가지(아래 LAYOUT_PAINTS)만 쓴다. #ffffff 는 종이 사각형에만 쓴다.
//    선 색을 바꾸면 이 6색이 농도를 지킨 채 고른 색으로 바뀐다.
// 4. 쓸 수 있는 요소는 도형(path · line · rect · circle · ellipse · polyline · polygon) · g · title · metadata · desc 뿐이다.
//    글자(text)는 윤곽선(path)으로 바꾼다. style 속성 · <style> 로 칠하지 않는다(색 바꾸기가 fill · stroke 속성만 바꾼다).
// 5. 모든 도형은 자기나 감싼 g 에 fill 이 있어야 한다(없으면 검정으로 칠해져 색 바꾸기를 따르지 않는다).

export const LAYOUT_PAINTS = ['#292929', '#666666', '#aeb3b8', '#bfc1c4', '#d7d9dc', '#e8e9eb']
const SIZE = { landscape: [1024, 768], portrait: [768, 1024] }
const SHAPES = new Set(['path', 'line', 'rect', 'circle', 'ellipse', 'polyline', 'polygon'])
const ALLOWED = new Set([...SHAPES, 'svg', 'g', 'title', 'metadata', 'desc'])
// class 는 쓸 수 있다(앱 속지 루트의 class="dp-paper"). <style> 요소를 받지 않으므로 class 로 색이 바뀌지 않는다
const BANNED_ATTRIBUTES = /^(style|href|xlink:href|filter|mask|clip-path|font.*|on.*)$/i

const attributes = tag => {
  const props = {}
  tag.replace(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs, (_, key, quote, value) => { props[key] = value; return _ })
  return props
}

/** 문제 목록(빈 배열이면 통과). orientation: 'landscape' | 'portrait' */
export function checkTemplateSvg(xml, orientation) {
  const problems = []
  const add = message => { if (!problems.includes(message)) problems.push(message) }
  const [width, height] = SIZE[orientation]
  // 주석 · XML 선언 · title/metadata/desc 안의 글은 검사하지 않는다
  const source = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  if (/<!DOCTYPE|<!\[CDATA\[/i.test(source)) add('DOCTYPE · CDATA 는 쓸 수 없어요')
  const stack = [] // 열린 요소마다 { name, fill }
  let root = null, firstShape = null
  // 태그는 따옴표 안을 건너뛰며 자른다(속성값 안의 '>' 로 뒤의 속성이 검사를 빠져나가지 않게)
  const TAG = /<\/?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/g
  const body = source.replace(/<(title|metadata|desc)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1>/gi, '<$1/>')
  const tags = body.match(TAG) ?? []
  // 태그로 읽히지 않고 남은 '<' 가 있으면(닫히지 않은 따옴표 · 깨진 태그) 검사할 수 없으므로 받지 않는다
  if (body.replace(TAG, '').includes('<')) add('읽을 수 없는 태그가 있어요(닫히지 않은 따옴표나 깨진 태그)')
  for (const tag of tags) {
    if (tag.startsWith('</')) { stack.pop(); continue }
    const name = /^<([a-zA-Z][\w:.-]*)/.exec(tag)[1]
    const props = attributes(tag)
    if (Object.values(props).some(value => /[<>]/.test(value))) add('속성값에 < > 를 쓸 수 없어요')
    // 속성은 모두 이름="값" · 이름='값' 이어야 한다. 따옴표 없는 값(fill=#000 onload=...)이나 값 없는 속성은 검사를 빠져나가므로 받지 않는다
    const rest = tag.replace(/^<[a-zA-Z][\w:.-]*/, '').replace(/\/?>$/, '').replace(/\s+[\w:.-]+\s*=\s*("[^"]*"|'[^']*')/g, '')
    if (rest.trim()) add(`<${name}> 에 읽을 수 없는 속성이 있어요(값은 따옴표로 감싸 주세요)`)
    const selfClosing = tag.endsWith('/>')
    if (!ALLOWED.has(name)) add(`<${name}> 는 쓸 수 없어요(도형 · g 만, 글자는 윤곽선으로)`)
    for (const key of Object.keys(props)) if (BANNED_ATTRIBUTES.test(key)) add(`${key} 속성은 쓸 수 없어요(색은 fill · stroke 속성으로)`)
    if (name === 'svg') {
      if (root) add('<svg> 안에 <svg> 를 넣을 수 없어요')
      root = props
    }
    const inheritedFill = stack.length ? stack[stack.length - 1].fill : null
    const fill = props.fill ?? inheritedFill
    if (SHAPES.has(name)) {
      const isPaper = !firstShape && name === 'rect' && Number(props.width) === width && Number(props.height) === height && Number(props.x ?? 0) === 0 && Number(props.y ?? 0) === 0
      if (!firstShape) firstShape = { name, isPaper, fill: props.fill }
      if (fill == null) add(`fill 이 없는 <${name}> 가 있어요(검정으로 칠해져요). fill="none" 이나 선 색을 적어 주세요`)
      for (const key of ['fill', 'stroke']) {
        const paint = props[key]
        if (paint == null) continue
        const value = paint.trim().toLowerCase()
        if (value === 'none') continue
        if (value === '#ffffff' && isPaper && key === 'fill') continue
        if (!LAYOUT_PAINTS.includes(value)) add(`${key}="${paint}" 는 쓸 수 없어요(none 또는 ${LAYOUT_PAINTS.join(' · ')}, #ffffff 는 종이 사각형에만)`)
      }
    } else if (name === 'g' || name === 'svg') {
      for (const key of ['fill', 'stroke']) {
        const value = props[key]?.trim().toLowerCase()
        if (value != null && value !== 'none' && !LAYOUT_PAINTS.includes(value)) add(`${key}="${props[key]}" 는 쓸 수 없어요(none 또는 ${LAYOUT_PAINTS.join(' · ')})`)
      }
    }
    if (!selfClosing) stack.push({ name, fill })
  }
  if (!root) return ['<svg> 가 없어요']
  const viewBox = root.viewBox?.trim().replace(/\s+/g, ' ')
  if (viewBox !== `0 0 ${width} ${height}` || Number(root.width) !== width || Number(root.height) !== height) {
    add(`${orientation === 'landscape' ? '가로' : '세로'} 속지는 width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" 이어야 해요`)
  }
  if (!firstShape?.isPaper || firstShape.fill?.toLowerCase() !== '#ffffff') add(`처음 그리는 요소는 종이 사각형 <rect width="${width}" height="${height}" fill="#ffffff"/> 이어야 해요`)
  return problems
}
