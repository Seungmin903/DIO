import { memo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import FillSvg from './FillSvg';
import { CHARACTER_SCALE } from '../../shared/characterScale';

// 캐릭터 무늬(모아 · 디오): 먹선만 남긴 그림 한 장을 표지 오른쪽 아래 가장자리에 크게 걸쳐 표지 색 계열(line)로 칠한다.
// 크기 · 잘림은 캐릭터 형압 다이어리 표지를 따랐다: 모아 높이 = 짧은 변의 70%, 오른쪽으로 캐릭터 폭의 20% · 아래로 높이의 17%가 잘린다.
// 디오는 모아 : 디오 키 비율에 맞게 scale 만큼 더 크다(shared/characterScale).
const CHARACTERS = {
  moa: { source: require('../../../assets/characters/moa-line.png'), ratio: 360 / 410, scale: CHARACTER_SCALE.moa },
  dio: { source: require('../../../assets/characters/dio-line.png'), ratio: 360 / 393, scale: CHARACTER_SCALE.dio },
};
// 개발 빌드는 그림을 Metro 에서 받아 와서 새 다이어리 창을 처음 열 때 모아 · 디오가 늦게 뜬다. 앱을 켤 때 미리 받아 둔다(묶음 빌드의 내장 그림은 건너뜀).
for (const { source } of Object.values(CHARACTERS)) {
  const uri = Image.resolveAssetSource?.(source)?.uri;
  if (typeof uri === 'string' && /^https?:/.test(uri)) Image.prefetch?.(uri)?.catch?.(() => {});
}
// 발(그림 아래 13% 쯤)이 표지 밖으로 빠지게 오른쪽 아래 구석으로 민다
const MOTIF = { height: 0.7, cutRight: 0.2, cutBottom: 0.17 };

function CharacterMotif({ character, line, initialWidth, initialHeight }) {
  const [size, setSize] = useState(initialWidth > 0 && initialHeight > 0 ? { width: initialWidth, height: initialHeight } : null);
  const box = size && (() => {
    const height = Math.min(size.width, size.height) * MOTIF.height * character.scale, width = height * character.ratio;
    return { width, height, right: -width * MOTIF.cutRight, bottom: -height * MOTIF.cutBottom };
  })();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}
      onLayout={({ nativeEvent: { layout: { width, height } } }) => setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }))}>
      {box ? <Image source={character.source} resizeMode="contain" style={[styles.motif, box, { tintColor: line }]} /> : null}
    </View>
  );
}

// SVG 무늬 정의는 문서 전체에서 id로 찾으므로 표지마다 겹치지 않는 id가 필요하다.
let nextPatternId = 0;

// 패턴 색: 어둡게(남색을 옅게) · 밝게(흰색을 옅게). 한 패턴 안의 진한 선·옅은 선은 같은 색의 농도로 나눈다.
const TONES = {
  dark: { strong: 'rgba(11,23,102,.12)', soft: 'rgba(11,23,102,.07)', dot: 'rgba(11,23,102,.16)' },
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

/**
 * 표지 위에 덮는 무늬. pattern이 없으면 아무것도 그리지 않는다(이전에 만든 다이어리). 캐릭터 무늬는 line(표지 색 계열 윤곽선 색)으로 칠한다.
 * initialWidth · initialHeight: 무늬를 깔 영역의 크기(알면 첫 프레임부터 그린다). scale: 표지 크기 배율(짧은 변 200 기준). 타일을 표지와 같은 비율로 키우고 줄여 한눈에 · 스와이프에서 무늬 비율이 같다.
 */
function CoverPattern({ pattern, tone = 'dark', scale = 1, line = '#FFFFFF', initialWidth, initialHeight }) {
  const idRef = useRef(null);
  if (CHARACTERS[pattern]) return <CharacterMotif character={CHARACTERS[pattern]} line={line} initialWidth={initialWidth} initialHeight={initialHeight} />;
  const spec = tile(pattern, tone);
  if (!spec) return null;
  if (!idRef.current) idRef.current = `dio-cover-pattern-${(nextPatternId += 1)}`;
  const id = idRef.current;

  return (
    <FillSvg initialWidth={initialWidth} initialHeight={initialHeight}>
      {(width, height) => (
        <>
          <Defs>
            <Pattern id={id} patternUnits="userSpaceOnUse" width={spec.size * scale} height={spec.size * scale} viewBox={`0 0 ${spec.size} ${spec.size}`}>
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

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  motif: { position: 'absolute' },
});
