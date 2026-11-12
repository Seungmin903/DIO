import { useMemo } from 'react'
import { PixelRatio } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { getTemplate, templateCanvasSize } from '../../editor/templates/catalog.js'
import { colorTemplateXml } from '../../editor/templates/appearance.js'
import { PAPER_SKETCHES } from '../utils/paperSketches'
import { sketchXml } from '../utils/paperSketchXml.js'

// 속지 고르기 칸의 '대표 그림'(2026-11-02, 디자인 가이드 §11.0.1). 플래너 · 일기는 줄이면 글자가 얼룩, 선이 흐린 무늬가 되어
// 실제 속지를 그대로 줄이지 않고 구조만 그린다(애플 HIG 문서 아이콘: 작으면 선을 줄이고 픽셀에 맞춰 굵게, 아주 작으면 뺀다).
// - 선은 기기 픽셀 한 칸 굵기로, 자리를 기기 픽셀에 맞춘다
// - 같은 간격의 줄 · 모눈은 간격을 기기 픽셀 정수(최소 MIN_GAP)로 맞추고, 옅은 결 무늬가 그보다 촘촘하면 뺀다
// - 글자는 글자 자리만 막대로(제목은 진하게, 작은 글자는 옅게)
// 색은 속지 팔레트 색만 써서 속지 색 설정(colorTemplateXml)이 그대로 먹는다.

/** 대표 그림이 있는 속지면 그 키(종류-방향), 없으면 null */
export function paperSketchKey(assetId) {
  const asset = getTemplate(assetId)
  const kind = asset.type === 'weekly' ? (/weekly-(blocks|journal)/.exec(assetId)?.[0] ?? null) : asset.type
  const key = kind && `${kind}-${asset.orientation}`
  return key && PAPER_SKETCHES[key] ? key : null
}

/** 속지 대표 그림. 칸 크기(width × height)는 화면 단위, 안에서는 기기 픽셀 단위로 그린다 */
export default function PaperSketch({ sketchKey, orientation, width, height, appearance }) {
  const ratio = PixelRatio.get()
  const xml = useMemo(() => {
    const { width: pageWidth, height: pageHeight } = templateCanvasSize(orientation)
    const deviceWidth = Math.round(width * ratio), deviceHeight = Math.round(height * ratio)
    return colorTemplateXml(sketchXml(sketchKey, pageWidth, pageHeight, deviceWidth, deviceHeight), appearance)
  }, [sketchKey, orientation, width, height, ratio, appearance?.backgroundColor, appearance?.layoutColor]) // eslint-disable-line react-hooks/exhaustive-deps
  return <SvgXml xml={xml} width={width} height={height} />
}
