import { Image } from 'react-native';

// Approved transparent-corner revision from app-icon-transparent-fixed.zip.
export const BRAND_LOGO_RATIO = 1;
// Metro selects the matching @2x/@3x asset for the device density.
const sources = {
  24: require('../../assets/brand/display/mascot-24.png'),
  28: require('../../assets/brand/display/mascot-28.png'),
  30: require('../../assets/brand/display/mascot-30.png'),
  32: require('../../assets/brand/display/mascot-32.png'),
  52: require('../../assets/brand/display/mascot-52.png'),
  160: require('../../assets/brand/display/mascot-160.png'),
};
const sizes = Object.keys(sources).map(Number).sort((a, b) => a - b);
// New display sizes reuse the next larger prepared asset, never the 1254px original.
const warnedSizes = new Set();
const sourceForSize = size => {
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !Object.hasOwn(sources, size) && !warnedSizes.has(size)) {
    warnedSizes.add(size);
    console.warn(`[BrandLogo] 준비되지 않은 크기 ${size}. 지원 크기: ${sizes.join(', ')}. 생성 목록을 확장하고 pnpm brand:icons를 실행해 주세요.`);
  }
  return sources[sizes.find(value => value >= size) ?? sizes.at(-1)];
};

export default function BrandLogo({ size = 28, onLoadEnd }) {
  return <Image source={sourceForSize(size)} onLoadEnd={onLoadEnd} style={{ width: size, height: size }} resizeMode="contain" resizeMethod="scale" fadeDuration={0} accessibilityLabel="DIO 로고" />;
}
