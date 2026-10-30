import Svg, { Circle, Path, Rect } from 'react-native-svg';

// 원본: assets/brand/dio-logo.svg (746×836). 앱 아이콘·시작 화면 PNG 도 이 그림으로 만든다.
const INK = '#242424';
const THEME = '#ABB1D8';
export const BRAND_LOGO_RATIO = 746 / 836;

/** DIO 로고 (D 심볼 + 테마 원). size 는 높이 */
export default function BrandLogo({ size = 28, color = INK, accent = THEME }) {
  return (
    <Svg width={size * BRAND_LOGO_RATIO} height={size} viewBox="6 -16 746 836" fill="none" accessibilityLabel="DIO 로고">
      <Path d="M431 106C408 96 383 94 350 94H72V754H350C534 754 686 622 686 424C686 357 664 297 624 251" stroke={color} strokeWidth={132} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={218} y={356} width={277} height={44} rx={22} fill={color} />
      <Rect x={218} y={452} width={195} height={44} rx={22} fill={color} />
      <Circle cx={607} cy={74} r={90} fill={accent} />
    </Svg>
  );
}
