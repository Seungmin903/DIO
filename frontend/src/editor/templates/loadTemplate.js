import { Asset } from 'expo-asset'
import { parse } from 'react-native-svg'
import { TEMPLATE_ASSETS } from './assets'
import { getTemplate, templateCanvasSize, TemplateError } from './catalog.js'
import { createTemplateCache } from './cache.js'
import { readSvg } from './readSvg'

const load = createTemplateCache(async id => {
  const module = TEMPLATE_ASSETS[id]
  if (!module) throw new TemplateError()
  const asset = Asset.fromModule(module)
  await asset.downloadAsync()
  const xml = await readSvg(asset.localUri ?? asset.uri)
  // HTML 오류 응답이나 빈 파일이 정상 배경으로 처리되지 않도록 검사한다.
  const ast = parse(xml)
  const { width, height } = templateCanvasSize(getTemplate(id).orientation)
  if (ast?.tag !== 'svg' || ast.props.viewBox !== `0 0 ${width} ${height}`) throw new TemplateError('내지 파일의 형식이나 크기가 올바르지 않아요.')
  // 속지 SVG는 80KB 안팎이라 해석 비용이 크다. 검증하며 만든 AST를 화면 표시에 그대로 쓴다.
  return { xml, ast }
})

async function loadEntry(reference) {
  const asset = getTemplate(reference.backgroundAssetId, reference.templateVersion)
  try { return await load(asset.id) }
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

/** 이미 불러온 속지면 해석된 SVG를 바로, 아니면 undefined를 돌려준다. */
export function peekTemplateAst(reference) {
  return load.peek(reference.backgroundAssetId)?.ast
}
