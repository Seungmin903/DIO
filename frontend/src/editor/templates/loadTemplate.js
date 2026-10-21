import { Asset } from 'expo-asset'
import { parse } from 'react-native-svg'
import { TEMPLATE_ASSETS } from './assets'
import { getTemplate, TemplateError } from './catalog.js'
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
  if (ast?.tag !== 'svg' || ast.props.viewBox !== '0 0 1024 768') throw new TemplateError('속지 파일의 형식이나 크기가 올바르지 않아요.')
  return xml
})

export async function loadTemplate(reference) {
  const asset = getTemplate(reference.backgroundAssetId, reference.templateVersion)
  try { return await load(asset.id) }
  catch (error) { throw error instanceof TemplateError ? error : new TemplateError(undefined, error) }
}
