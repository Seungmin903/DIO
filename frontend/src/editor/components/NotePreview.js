import Svg, { Circle, Line, Rect } from 'react-native-svg'

// 축소하면 사라지는 노트 선은 미리보기에서만 간격과 농도를 보강한다.
export default function NotePreview({ background, width = 92, height, appearance }) {
  const xs = [], ys = [], step = 9
  for (let x = step / 2; x < width; x += step) xs.push(x)
  for (let y = step / 2; y < height; y += step) ys.push(y)
  const ink = appearance?.layoutColor ?? '#B7BFCC'
  const opacity = appearance?.layoutColor ? 0.4 : 1
  return <Svg width={width} height={height}>
    <Rect width={width} height={height} fill={appearance?.backgroundColor ?? '#FFFFFF'} />
    {(background === 'ruled' || background === 'grid') && ys.map(y => <Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={ink} strokeOpacity={opacity} strokeWidth={0.8} />)}
    {background === 'grid' && xs.map(x => <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={ink} strokeOpacity={opacity} strokeWidth={0.8} />)}
    {background === 'dots' && xs.flatMap(x => ys.map(y => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill={ink} fillOpacity={opacity} />))}
  </Svg>
}
