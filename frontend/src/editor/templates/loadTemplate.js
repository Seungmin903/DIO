import { Asset } from 'expo-asset'
import { parse } from 'react-native-svg'
import { TEMPLATE_ASSETS } from './assets'
import { UNDATED_ASSETS } from './undatedAssets'
import { getTemplate, templateCanvasSize, TemplateError } from './catalog.js'
import { createTemplateCache } from './cache.js'
import { isPaperFontId, swapPaperFont } from './paperFont.js'
import { readSvg } from './readSvg'
import { plannerFor } from './planners.js'
import { datedBaseId, datedSvg, isDatedId } from './dated.js'

// 캐시 키: 속지 ID, 속지 글꼴을 골랐으면 'ID|글꼴'(원본 글자 윤곽을 그 글꼴로 바꾼 XML · AST 를 따로 둔다)
const keyOf = (id, font) => isPaperFontId(font) ? `${id}|${font}` : id
const load = createTemplateCache(async key => {
  const [id, font] = key.split('|')
  if (font) { const base = await load(id); const xml = swapPaperFont(base.xml, font); return { xml, ast: parse(xml) } }
  // 스터디 · 데일리 플래너는 파일 없이 바탕을 만든다. 기록은 PageBackground 가 덮개로 겹치고, 내보내기는 기록을 넣어 다시 만든다.
  const planner = plannerFor(id)
  if (planner) { const xml = planner.baseSvg(); return { xml, ast: parse(xml) } }
  // 날짜 속지는 같은 양식의 만년형 속지를 불러와 날짜를 얹는다
  const fileId = isDatedId(id) ? datedBaseId(id) : id
  const module = UNDATED_ASSETS[fileId] ?? TEMPLATE_ASSETS[fileId]
  if (!module) throw new TemplateError()
  const asset = Asset.fromModule(module)
  await asset.downloadAsync()
  const file = await readSvg(asset.localUri ?? asset.uri)
  const xml = isDatedId(id) ? datedSvg(id, file) : file
  // HTML 오류 응답이나 빈 파일이 정상 배경으로 처리되지 않도록 검사한다.
  const ast = parse(xml)
  const { width, height } = templateCanvasSize(getTemplate(id).orientation)
  if (ast?.tag !== 'svg' || ast.props.viewBox !== `0 0 ${width} ${height}`) throw new TemplateError('내지 파일의 형식이나 크기가 올바르지 않아요.')
  // 속지 SVG는 80KB 안팎이라 해석 비용이 크다. 검증하며 만든 AST를 화면 표시에 그대로 쓴다.
  return { xml, ast }
}, 32) // 속지 글꼴 변형이 원본과 함께 머물 수 있게 넉넉히 둔다

async function loadEntry(reference) {
  const asset = getTemplate(reference.backgroundAssetId, reference.templateVersion)
  try { return await load(keyOf(asset.id, reference.font)) }
  catch (error) { throw error instanceof TemplateError ? error : new TemplateError(undefined, error) }
}

/** 내보내기처럼 원본 XML이 필요한 곳에서 쓴다. */
export async function loadTemplate(reference) {
  return (await loadEntry(reference)).xml
}

/** 화면 표시용 해석된 SVG. */
export async function loadTemplateAst(reference) {
  return (await loadEntry(reference)).ast
}

/** 이미 불러온 속지면 원본 XML을 바로, 아니면 undefined를 돌려준다. */
export function peekTemplate(reference) {
  return load.peek(keyOf(reference.backgroundAssetId, reference.font))?.xml
}

/** 이미 불러온 속지면 해석된 SVG를 바로, 아니면 undefined를 돌려준다. */
export function peekTemplateAst(reference) {
  return load.peek(keyOf(reference.backgroundAssetId, reference.font))?.ast
}
