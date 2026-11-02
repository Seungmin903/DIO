import { memo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Circle, Defs, G, Line, Pattern, Rect } from 'react-native-svg';
import FillSvg from './FillSvg';
import { CHARACTER_SCALE } from '../../shared/characterScale';
import { snapToPixel } from '../../shared/pixelSnap';

// 캐릭터 무늬(모아 · 디오): 먹선만 남긴 그림 한 장을 표지 오른쪽 아래 가장자리에 크게 걸쳐 표지 색 계열(line)로 칠한다.
// 크기 · 잘림은 캐릭터 형압 다이어리 표지를 따랐다: 모아 높이 = 짧은 변의 70%, 아래로 높이의 17%가 잘린다.
// 오른쪽은 캐릭터 폭의 20%가 잘리고, 모아는 책 귀퉁이 탭이 남게 8%만 잘린다(cutRight).
// 그림은 4배(1440px 폭)로 둬서 태블릿 표지에서 늘려도 선이 깨지지 않는다.
// 디오는 모아 : 디오 키 비율에 맞게 scale 만큼 더 크다(shared/characterScale).
const CHARACTERS = {
  // small: 견본용으로 미리 고르게 줄인 그림(240px). 1440px 원본을 40px 견본에 줄이면 안드로이드에서 선이 깨졌다
  moa: { small: require('../../../assets/characters/moa-line-small.png'), source: require('../../../assets/characters/moa-line.png'), ratio: 360 / 410, scale: CHARACTER_SCALE.moa, cutRight: 0.08 },
  dio: { small: require('../../../assets/characters/dio-line-small.png'), source: require('../../../assets/characters/dio-line.png'), ratio: 360 / 393, scale: CHARACTER_SCALE.dio },
};
// 개발 빌드는 그림을 Metro 에서 받아 와서 새 다이어리 창을 처음 열 때 모아 · 디오가 늦게 뜬다. 앱을 켤 때 미리 받아 둔다(묶음 빌드의 내장 그림은 건너뜀).
for (const source of Object.values(CHARACTERS).flatMap(({ source, small }) => [source, small])) {
  const uri = Image.resolveAssetSource?.(source)?.uri;
  if (typeof uri === 'string' && /^https?:/.test(uri)) Image.prefetch?.(uri)?.catch?.(() => {});
}
// 발(그림 아래 13% 쯤)이 표지 밖으로 빠지게 오른쪽 아래 구석으로 민다
const MOTIF = { height: 0.7, cutRight: 0.2, cutBottom: 0.17 };

// swatch(무늬 견본): 표지처럼 구석에 잘려 걸치면 38px 견본에서 알아볼 수 없어, 캐릭터 전체를 가운데에 짧은 변의 62% 높이로 둔다(코덱스 2026-11-02)
const SWATCH_MOTIF = 0.62;

function CharacterMotif({ character, line, initialWidth, initialHeight, swatch = false }) {
  const [size, setSize] = useState(initialWidth > 0 && initialHeight > 0 ? { width: initialWidth, height: initialHeight } : null);
  const box = size && (() => {
    if (swatch) {
      const height = Math.min(size.width, size.height) * SWATCH_MOTIF, width = height * character.ratio;
      return { width, height, left: (size.width - width) / 2, top: (size.height - height) / 2 };
    }
    const height = Math.min(size.width, size.height) * MOTIF.height * character.scale, width = height * character.ratio;
    return { width, height, right: -width * (character.cutRight ?? MOTIF.cutRight), bottom: -height * MOTIF.cutBottom };
  })();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}
      onLayout={({ nativeEvent: { layout: { width, height } } }) => setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }))}>
      {box ? <Image source={swatch ? character.small ?? character.source : character.source} resizeMode="contain" style={[styles.motif, box, { tintColor: line }]} /> : null}
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

// 줄무늬(린넨 · 스트라이프 · 체크): 타일 안 줄 목록. 표지는 Pattern 으로 반복하고, 견본(fit)은 줄을 칸 끝까지 이어진 사각형 하나로 그린다
// (칸마다 타일 조각을 붙이면 경계의 안티앨리어싱 틈 때문에 줄이 '+ + +' · 점선처럼 끊겨 보였다).
function lined(size, lines) {
  return {
    size,
    lines,
    shapes: <>{lines.map((l, i) => l.axis === 'x'
      ? <Rect key={i} x={l.at - l.width / 2} y="0" width={l.width} height={size} fill={l.color} />
      : <Rect key={i} x="0" y={l.at - l.width / 2} width={size} height={l.width} fill={l.color} />)}</>,
  };
}

// 도형은 타일 가운데에 둔다(타일이 딱 맞게 들어가면 양 끝이 똑같이 잘린다).
// 작은 타일 하나를 반복해 그리므로 표지 크기와 상관없이 도형 수가 늘지 않는다.
function tile(pattern, tone) {
  const { strong: DARK, soft: LIGHT, dot } = TONES[tone] ?? TONES.dark;
  switch (pattern) {
    case 'linen':
      // 성긴 직조 결(코덱스 2026-11-02): 타일 4 → 8, 선 0.6~0.9. 4 타일은 견본에서 0.2px 대 잔무늬로 뭉개졌다
      return lined(8, [
        { axis: 'y', at: 2, width: 0.9, color: LIGHT }, { axis: 'y', at: 6, width: 0.8, color: DARK },
        { axis: 'x', at: 2, width: 0.8, color: DARK }, { axis: 'x', at: 6, width: 0.6, color: LIGHT },
      ]);
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
            <Rect x="4" y="0" width="8" height="16" fill={LIGHT} />
            <Rect x="0" y="4" width="16" height="8" fill={LIGHT} />
          </>
        ),
      };
    case 'stripe':
      // 띠 6 · 사이 12(주기 18, 코덱스 2026-11-02). 견본에서 2줄로 맞춘다(fitCount: 3줄이면 양 끝 줄이 둥근 모서리에 깎여 보였다)
      return { ...lined(18, [{ axis: 'x', at: 9, width: 6, color: DARK }]), fitCount: Math.floor };
    case 'check':
      return lined(12, [{ axis: 'x', at: 6, width: 1, color: DARK }, { axis: 'y', at: 6, width: 1, color: DARK }]);
    default:
      return null;
  }
}

/**
 * 표지 위에 덮는 무늬. pattern이 없으면 아무것도 그리지 않는다(이전에 만든 다이어리). 캐릭터 무늬는 line(표지 색 계열 윤곽선 색)으로 칠한다.
 * fit: 작은 견본용. 타일을 정수 개가 딱 들어가는 크기로 맞춰 무늬가 한쪽으로 쏠리거나 잘리지 않게 한다.
 * initialWidth · initialHeight: 무늬를 깔 영역의 크기(알면 첫 프레임부터 그린다). scale: 표지 크기 배율(짧은 변 200 기준). 타일을 표지와 같은 비율로 키우고 줄여 한눈에 · 스와이프에서 무늬 비율이 같다.
 */
// pixelScale: 표지를 바깥에서 transform 으로 줄여 그릴 때(한눈에 보기 격자) 그 배율. 칸을 화면에 보이는 크기 기준으로 픽셀에 맞춘다
function CoverPattern({ pattern, tone = 'dark', scale = 1, line = '#FFFFFF', fit = false, pixelScale = 1, initialWidth, initialHeight }) {
  const idRef = useRef(null);
  if (CHARACTERS[pattern]) return <CharacterMotif character={CHARACTERS[pattern]} line={line} initialWidth={initialWidth} initialHeight={initialHeight} swatch={fit} />;
  const spec = tile(pattern, tone);
  if (!spec) return null;
  if (!idRef.current) idRef.current = `dio-cover-pattern-${(nextPatternId += 1)}`;
  const id = idRef.current;

  return (
    <FillSvg initialWidth={initialWidth} initialHeight={initialHeight} bleed={fit ? 1 : 0}>
      {(width, height) => {
        // 무늬 칸은 기기 픽셀에 맞춘다(작은 표지에서 칸 이음매가 깨지지 않게, shared/pixelSnap)
        const size = snapToPixel((fit ? Math.min(width, height) / Math.max(1, (spec.fitCount ?? Math.round)(Math.min(width, height) / spec.size)) : spec.size * scale) * pixelScale) / pixelScale;
        // 견본(fit)은 Pattern 대신 타일을 칸 수만큼 직접 늘어놓는다. 안드로이드 react-native-svg 는 Pattern 한 칸을 정수 픽셀 그림으로 구워 반복해서(Brush.setupPaint)
        // 12.67 · 3.8 같은 소수 타일이 토막 난 줄 · 십자 · 점으로 깨졌다(웹은 정상). 견본은 칸이 작아 도형 수가 많지 않다(린넨 10×10 타일).
        if (fit && spec.lines) {
          const k = size / spec.size;
          const cols = Math.ceil(width / size), rows = Math.ceil(height / size);
          return <G>{spec.lines.flatMap((l, i) => l.axis === 'x'
            ? Array.from({ length: cols }, (_, c) => <Rect key={`${i}-${c}`} x={(c * spec.size + l.at - l.width / 2) * k} y="0" width={l.width * k} height={height} fill={l.color} />)
            : Array.from({ length: rows }, (_, r) => <Rect key={`${i}-${r}`} x="0" y={(r * spec.size + l.at - l.width / 2) * k} width={width} height={l.width * k} fill={l.color} />))}</G>;
        }
        if (fit) {
          const k = size / spec.size;
          const cols = Math.ceil(width / size), rows = Math.ceil(height / size);
          return <G>{Array.from({ length: rows * cols }, (_, i) => (
            <G key={i} transform={`translate(${(i % cols) * size} ${Math.floor(i / cols) * size}) scale(${k})`}>{spec.shapes}</G>
          ))}</G>;
        }
        return (
          <>
            <Defs>
              {/* x · y 는 주지 않는다: 안드로이드 react-native-svg 는 x · y 를 타일 위치가 아니라 viewBox 맞출 칸의 왼쪽 위로 써서(RectF(x, y, w, h)) 무늬가 줄어든 토막으로 그려진다.
                  fit 은 타일이 칸에 딱 나눠 떨어지므로 밀 필요가 없다(38 % 12.67 같은 부동소수 나머지가 0 이 아니게 나와 깨졌었다). */}
              <Pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size} viewBox={`0 0 ${spec.size} ${spec.size}`}>
                {spec.shapes}
              </Pattern>
            </Defs>
            <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
          </>
        );
      }}
    </FillSvg>
  );
}

export default memo(CoverPattern);

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  motif: { position: 'absolute' },
});
