import { memo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { CHARACTER_SHAPES } from './characterShapes';

/**
 * 모아 · 디오 그림(벡터). 원본은 docs/캐릭터 디자인/최종(2026-11-08), 데이터는 shared/characterShapes(자동 생성).
 * PNG 를 줄여 그리면 안드로이드가 큰 그림을 건너뛰며 디코딩해 먹선이 들쭉날쭉해져서, 크기에 상관없이 벡터로 그린다.
 * variant: 'full'(완성, 원래 색) · 'line'(윤곽만). color 를 주면 면 · 선을 모두 그 색으로 칠한다(표지 무늬).
 * style 의 width · height 가 그림 상자(viewBox 전체)다.
 */
function CharacterArt({ character = 'moa', variant = 'full', color, style }) {
  const art = CHARACTER_SHAPES[character]?.[variant] ?? CHARACTER_SHAPES.moa.full;
  return (
    // 꾸밈 그림이라 화면 읽기 프로그램에서는 건너뛴다(빈 화면은 제목만 읽힌다)
    <Svg style={style} viewBox={art.viewBox.join(' ')} pointerEvents="none"
      accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {art.shapes.map((shape, i) => {
        if (shape[0] === 'c') return <Circle key={i} cx={shape[1]} cy={shape[2]} r={shape[3]} fill={color ?? shape[4]} />;
        if (shape[0] === 's') return <Path key={i} d={shape[1]} fill="none" stroke={color ?? shape[2]} strokeWidth={shape[3]} strokeLinecap="round" />;
        return <Path key={i} d={shape[1]} fill={color ?? shape[2]} fillRule={shape[3] ? 'evenodd' : 'nonzero'} />;
      })}
    </Svg>
  );
}

export default memo(CharacterArt);
