import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { ClipPath, Defs, Path } from 'react-native-svg';
import appConfig from '../../app.json';
import { BOOT_INTRO_TOTAL, LETTER_SLOTS, POP_LINES, letterAt, moaAt, popLineAt, sample, strokeAt, strokeSpans } from './bootIntro';
import { BOOT_LOGO_ADVANCE, BOOT_LOGO_LETTERS, BOOT_LOGO_PEN_WIDTH } from './bootLogoPaths';

const splashPlugin = appConfig.expo?.plugins?.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
export const SPLASH = { backgroundColor: '#F0ECFD', ...splashPlugin?.[1] };

const LOGO_COLOR = '#AEA3FA';
const LINE_COLOR = '#1C1C1C'; // 모아 윤곽선과 같은 먹색
// Animated 가 붙이는 collapsable 은 웹 DOM 속성이 아니라 경고가 나서 Path 에 넘기기 전에 뺀다
const PenPath = forwardRef(({ collapsable, ...props }, ref) => <Path ref={ref} {...props} />);
const AnimatedPath = Animated.createAnimatedComponent(PenPath);

// DIO: Pretendard ExtraBold 글자 모양으로 잘라 낸 굵은 펜 선을 획 순서대로 그려 손글씨처럼 드러낸다.
// 마스크 대신 고정된 글자 모양(ClipPath)으로 자르고 움직이는 건 펜 선뿐이라 iOS · 안드로이드 모두 다시 그리기가 확실하다.
function DioHandwriting({ pen, glyphSize, shown }) {
  const k = glyphSize / 2048;
  return (
    <Svg width={BOOT_LOGO_ADVANCE * k} height={1540 * k} viewBox={`0 -52 ${BOOT_LOGO_ADVANCE} 1540`} accessible accessibilityLabel="DIO">
      <Defs>
        {BOOT_LOGO_LETTERS.map(letter => (
          <ClipPath key={letter.letter} id={`bootLogo${letter.letter}`}><Path d={letter.glyph} /></ClipPath>
        ))}
      </Defs>
      {/* 획마다 경로 하나: 점선은 경로 조각마다 처음부터 다시 시작해, 두 획을 한 경로에 두면 동시에 그려진다 */}
      {BOOT_LOGO_LETTERS.map((letter, index) => index < shown && strokeSpans(letter.strokes).map((span, strokeIndex) => {
        const { length, pen: d } = letter.strokes[strokeIndex];
        return (
          <AnimatedPath key={`${letter.letter}${strokeIndex}`} d={d} clipPath={`url(#bootLogo${letter.letter})`} fill="none"
            stroke={LOGO_COLOR} strokeWidth={BOOT_LOGO_PEN_WIDTH} strokeLinecap="round" strokeLinejoin="round"
            // 틈을 획 길이보다 길게 두어 다 감춘 상태에서 끝점에 둥근 점이 남지 않게 한다
            strokeDasharray={[length, length + 2000]}
            strokeDashoffset={pen.interpolate(sample(t => length * (1 - strokeAt(letterAt(t, index), span)), LETTER_SLOTS[index][0] - 20, LETTER_SLOTS[index][1] + 20, 10))} />
        );
      }))}
    </Svg>
  );
}

export default function BootSplash({ onReady, onWritten, onComplete }) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const shortSide = Math.min(width, height);
  const size = Math.min(shortSide * (landscape ? 0.69 : 0.92), 520);
  const lift = size * (landscape ? 0.20 : 0.10);
  const clock = useRef(new Animated.Value(0)).current; // 모아 · 효과선(네이티브 드라이버)
  const pen = useRef(new Animated.Value(0)).current; // DIO 펜 선(strokeDashoffset 은 JS 드라이버)
  const opacity = useRef(new Animated.Value(0)).current;
  const [loaded, setLoaded] = useState(false);
  // 쓰기 시작한 글자 수. 차례가 오기 전에는 펜 선을 아예 그리지 않는다: 일부 안드로이드 기기(갤럭시 탭 SM-X510)는
  // 다 감춘 선에도 시작점의 둥근 끝을 그리고 strokeOpacity 도 무시해서, 쓰기 전부터 D 자리에 점이 떠 있었다
  const [lettersShown, setLettersShown] = useState(0);
  useEffect(() => {
    const id = pen.addListener(({ value }) => {
      const count = LETTER_SLOTS.filter(([start]) => value >= start).length;
      setLettersShown(previous => (count > previous ? count : previous));
    });
    return () => pen.removeListener(id);
  }, [pen]);
  const completed = useRef(false);
  const completeCallback = useRef(onComplete);
  const writtenCallback = useRef(onWritten);
  useEffect(() => { completeCallback.current = onComplete; }, [onComplete]);
  useEffect(() => { writtenCallback.current = onWritten; }, [onWritten]);
  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    completeCallback.current?.();
  };
  const running = useRef(null);
  // 화면 어디를 눌러도 인트로를 넘기고 앱으로 간다(손글씨 전이라도 시작 화면이 닫히면 App 이 미뤄 둔 작업을 시작한다)
  const skip = () => {
    running.current?.intro?.stop();
    running.current?.writing?.stop();
    complete();
  };

  useEffect(() => {
    if (!loaded || completed.current) return;
    let cancelled = false;
    let intro, writing;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (cancelled) return;
      if (reduced) {
        complete();
        return;
      }
      opacity.setValue(1);
      // 모아 · 효과선은 끝까지(네이티브 드라이버), DIO 펜 선은 마지막 글자를 다 쓸 때까지(JS 드라이버) 따로 돌린다.
      // 펜 선이 끝나면 onWritten 으로 알려 뒤에서 미뤄 둔 무거운 작업이 손글씨와 겹치지 않게 한다(App.js migrationGate)
      const writeEnd = LETTER_SLOTS[LETTER_SLOTS.length - 1][1];
      intro = Animated.timing(clock, { toValue: BOOT_INTRO_TOTAL, duration: BOOT_INTRO_TOTAL, easing: Easing.linear, useNativeDriver: true });
      writing = Animated.timing(pen, { toValue: writeEnd, duration: writeEnd, easing: Easing.linear, useNativeDriver: false });
      running.current = { intro, writing };
      writing.start(({ finished }) => { if (finished && !cancelled) writtenCallback.current?.(); });
      intro.start(({ finished }) => { if (finished && !cancelled) complete(); });
    }).catch(() => { if (!cancelled) complete(); });
    return () => { cancelled = true; intro?.stop(); writing?.stop(); };
  }, [loaded, clock, pen, opacity]);

  const moa = useMemo(() => [
    { translateX: clock.interpolate(sample(t => moaAt(t).x * size)) },
    { translateY: clock.interpolate(sample(t => moaAt(t).y * size)) },
    { rotate: clock.interpolate(sample(t => `${moaAt(t).r}deg`)) },
    { scale: clock.interpolate(sample(t => moaAt(t).k)) },
  ], [clock, size]);

  const lines = useMemo(() => {
    const { start, duration, angles, width: lineWidth, length, anchor, pose } = POP_LINES;
    const span = [start - 10, start + duration + 10, 10];
    const x = -size * 0.15 + (pose.x + anchor.u) * size;
    const y = height + lift - size + (pose.y + anchor.v) * size;
    return angles.map(angle => ({
      left: x, top: y - lineWidth * size / 2, width: length * size, height: lineWidth * size, borderRadius: lineWidth * size / 2,
      opacity: clock.interpolate(sample(t => (popLineAt(t).visible ? 1 : 0), ...span)),
      transform: [
        { rotate: `${angle}deg` },
        { translateX: clock.interpolate(sample(t => popLineAt(t).tail * size, ...span)) },
        { scaleX: clock.interpolate(sample(t => { const { head, tail } = popLineAt(t); return Math.max((head - tail) / length, 0.001); }, ...span)) },
      ],
    }));
  }, [clock, size, height, lift]);

  const wordmarkHeight = Math.min(shortSide * 0.28, 220) * 62 / 150;
  const glyphSize = wordmarkHeight * 1.25;

  return (
    // 인트로 중 터치는 뒤 보관함으로 넘기지 않고, 손을 떼면 인트로를 넘긴다(안내 글자는 두지 않는다)
    <View style={s.root} pointerEvents="auto" accessibilityRole="button" accessibilityLabel="인트로 넘기기"
      onAccessibilityTap={skip} onStartShouldSetResponder={() => true} onResponderRelease={skip}>
      <View style={[s.wordmark, { top: height * (landscape ? 0.36 : 0.30) + 0.148 * glyphSize - 52 * glyphSize / 2048 }]}>
        <DioHandwriting pen={pen} glyphSize={glyphSize} shown={lettersShown} />
      </View>
      <Animated.View style={[s.mascot, { opacity, width: size, height: size, left: -size * 0.15, bottom: -lift, transform: moa }]}>
        <Image source={require('../../assets/brand/mascot-splash.png')} style={s.image} fadeDuration={0}
          onError={complete} onLoadEnd={() => { if (!completed.current) setLoaded(true); onReady?.(); }} />
      </Animated.View>
      {lines.map((line, index) => <Animated.View key={index} style={[s.line, line]} />)}
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 100, overflow: 'hidden', backgroundColor: SPLASH.backgroundColor },
  wordmark: { position: 'absolute', width: '100%', alignItems: 'center' },
  mascot: { position: 'absolute', transformOrigin: '28% 80%' },
  image: { width: '100%', height: '100%' },
  line: { position: 'absolute', backgroundColor: LINE_COLOR, transformOrigin: '0% 50%' },
});
