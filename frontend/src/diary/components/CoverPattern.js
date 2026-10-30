import { memo, useRef } from 'react';
import { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import FillSvg from './FillSvg';

// SVG 무늬 정의는 문서 전체에서 id로 찾으므로 표지마다 겹치지 않는 id가 필요하다.
let nextPatternId = 0;

// 패턴 색: 어둡게(남색을 옅게) · 밝게(흰색을 옅게). 한 패턴 안의 진한 선·옅은 선은 같은 색의 농도로 나눈다.
const TONES = {
  dark: { strong: 'rgba(11,25,87,.12)', soft: 'rgba(11,25,87,.07)', dot: 'rgba(11,25,87,.16)' },
  light: { strong: 'rgba(255,255,255,.38)', soft: 'rgba(255,255,255,.22)', dot: 'rgba(255,255,255,.55)' },
};

// 작은 타일 하나를 반복해 그리므로 표지 크기와 상관없이 도형 수가 늘지 않는다.
function tile(pattern, tone) {
  const { strong: DARK, soft: LIGHT, dot } = TONES[tone] ?? TONES.dark;
  switch (pattern) {
    case 'linen':
      return {
        size: 4,
        shapes: (
          <>
            <Line x1="0" y1="1" x2="4" y2="1" stroke={LIGHT} strokeWidth="0.7" />
            <Line x1="1" y1="0" x2="1" y2="4" stroke={DARK} strokeWidth="0.6" />
            <Line x1="0" y1="3" x2="4" y2="3" stroke={DARK} strokeWidth="0.4" />
          </>
        ),
      };
    case 'leather':
      return {
        size: 7,
        shapes: (
          <>
            <Circle cx="1.5" cy="1.8" r="0.7" fill={DARK} />
            <Circle cx="5" cy="3.2" r="0.6" fill={LIGHT} />
            <Circle cx="3" cy="5.6" r="0.8" fill={DARK} />
            <Circle cx="6.2" cy="6.3" r="0.5" fill={LIGHT} />
          </>
        ),
      };
    case 'dot':
      return { size: 14, shapes: <Circle cx="7" cy="7" r="2.2" fill={dot} /> };
    case 'gingham':
      return {
        size: 16,
        shapes: (
          <>
            <Rect x="0" y="0" width="8" height="16" fill={LIGHT} />
            <Rect x="0" y="0" width="16" height="8" fill={LIGHT} />
          </>
        ),
      };
    case 'stripe':
      return { size: 14, shapes: <Rect x="0" y="0" width="6" height="14" fill={DARK} /> };
    case 'check':
      return {
        size: 12,
        shapes: (
          <>
            <Line x1="0" y1="0.5" x2="12" y2="0.5" stroke={DARK} strokeWidth="1" />
            <Line x1="0.5" y1="0" x2="0.5" y2="12" stroke={DARK} strokeWidth="1" />
          </>
        ),
      };
    default:
      return null;
  }
}

/** 표지 위에 덮는 무늬. pattern이 없으면 아무것도 그리지 않는다(이전에 만든 다이어리). */
function CoverPattern({ pattern, tone = 'dark' }) {
  const idRef = useRef(null);
  const spec = tile(pattern, tone);
  if (!spec) return null;
  if (!idRef.current) idRef.current = `dio-cover-pattern-${(nextPatternId += 1)}`;
  const id = idRef.current;

  return (
    <FillSvg>
      {(width, height) => (
        <>
          <Defs>
            <Pattern id={id} patternUnits="userSpaceOnUse" width={spec.size} height={spec.size}>
              {spec.shapes}
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
        </>
      )}
    </FillSvg>
  );
}

export default memo(CoverPattern);
