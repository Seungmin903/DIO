import { useId } from 'react';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';

// 즐겨찾기 별. 칠한 별과 안 칠한 별이 같은 바깥 모양(굵은 선으로 둘러 둥글린 별)을 써서 크기 · 모서리 둥글기가 같다.
// 칠한 별: 윤곽색 바탕 별 위에 금색 별. 안 칠한 별: 같은 바탕 별에서 금색 별 자리를 마스크로 뚫은 테두리만 남긴다.
const STAR_PATH = 'm12 3.8 2.48 5.02 5.54.81-4.01 3.91.95 5.52L12 16.43l-4.96 2.61.95-5.52-4.01-3.91 5.54-.81L12 3.8Z';
export const STAR_GOLD = '#E8AF45';

/** filled: 금색으로 칠함. outline: 별 바깥 윤곽색(표지 · 바탕에 묻히지 않게). size: 정사각 한 변(바깥 윤곽 포함 크기는 약 0.89배) */
export default function FavoriteStar({ filled, outline, size = 21 }) {
  const holeId = `star-hole-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return <Svg width={size} height={size} viewBox="0 0 24 24">
    {filled ? <>
      <Path d={STAR_PATH} fill={outline} stroke={outline} strokeWidth={5.4} strokeLinejoin="round" />
      <Path d={STAR_PATH} fill={STAR_GOLD} stroke={STAR_GOLD} strokeWidth={1.8} strokeLinejoin="round" />
    </> : <>
      <Defs>
        <Mask id={holeId} maskUnits="userSpaceOnUse" x={0} y={0} width={24} height={24}>
          <Rect x={0} y={0} width={24} height={24} fill="#FFFFFF" />
          <Path d={STAR_PATH} fill="#000000" stroke="#000000" strokeWidth={1.8} strokeLinejoin="round" />
        </Mask>
      </Defs>
      <Path d={STAR_PATH} fill={outline} stroke={outline} strokeWidth={5.4} strokeLinejoin="round" mask={`url(#${holeId})`} />
    </>}
  </Svg>;
}
