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
  return paths.map((path, i) => <Path key={i} d={path} fill={color} fillRule="nonzero"
    fillOpacity={renderVersion === 3 ? FELT_MATERIAL_OPACITIES[i] : FELT_LAYERS[i].opacity} />)
}
