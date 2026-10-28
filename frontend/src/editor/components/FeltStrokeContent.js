import { useMemo } from 'react'
import { Path } from 'react-native-svg'
import { FELT_LAYERS, feltStrokeLayers } from '../utils/feltStroke'
import { feltMaterialLayers, FELT_MATERIAL_OPACITIES } from '../utils/penMaterials'

export default function FeltStrokeContent({ parts, points, width, color, renderVersion = 2, materialSeed = 0 }) {
  const source = useMemo(() => parts ?? [{ points }], [parts, points])
  const paths = useMemo(() => renderVersion === 3 ? feltMaterialLayers(source, width, materialSeed)
    : feltStrokeLayers(source, width), [source, width, renderVersion, materialSeed])
  return paths.map((path, i) => <Path key={i} d={path} fill={color} fillRule="nonzero"
    fillOpacity={renderVersion === 3 ? FELT_MATERIAL_OPACITIES[i] : FELT_LAYERS[i].opacity} />)
}
