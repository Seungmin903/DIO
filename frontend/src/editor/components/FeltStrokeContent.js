import { useMemo } from 'react'
import { Path } from 'react-native-svg'
import { FELT_LAYERS, feltStrokeLayers } from '../utils/feltStroke'
import { feltMaterialLayers, FELT_MATERIAL_OPACITIES } from '../utils/penMaterials'
import { completedStrokeGeometry } from '../utils/completedStrokeGeometry'

export default function FeltStrokeContent({ object, parts, points, width, color, renderVersion = 2, materialSeed = 0 }) {
  const source = useMemo(() => parts ?? [{ points }], [parts, points])
  const paths = useMemo(() => object && !parts ? completedStrokeGeometry.felt(object)
    : renderVersion === 3 ? feltMaterialLayers(source, width, materialSeed)
    : feltStrokeLayers(source, width), [object, parts, source, width, renderVersion, materialSeed])
  // 불투명도 100(사용자 결정 2026-11-02): 반투명 번짐 · 잉크 알갱이 겹은 그리지 않고, 누적 농도가 처음 30%를 넘는 겹
  // (예전에 눈에 보이던 굵기와 비슷한 안쪽 겹)을 꽉 찬 색 하나로 그린다.
  const solid = solidFeltLayer(renderVersion === 3 ? FELT_MATERIAL_OPACITIES : FELT_LAYERS.map((layer) => layer.opacity))
  return <Path d={paths[solid]} fill={color} fillRule="nonzero" />
}

function solidFeltLayer(opacities) {
  let clear = 1
  for (let i = 0; i < opacities.length; i++) {
    clear *= 1 - opacities[i]
    if (1 - clear >= 0.3) return i
  }
  return 0
}
