import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import appConfig from '../../app.json';

const splashPlugin = appConfig.expo?.plugins?.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
export const SPLASH = { backgroundColor: '#F0ECFD', ...splashPlugin?.[1] };

function DioWordmark({ width }) {
  return (
    <Svg width={width} height={width * 62 / 150} viewBox="0 0 150 62" accessible accessibilityLabel="DIO">
      <Path
        d="M12 49 Q13 31 13 13 C52 5 57 52 12 49 M69 13 Q67 31 67 49 M131 20 C113 1 89 15 89 34 C89 56 117 58 132 41 C138 34 137 26 131 20"
        fill="none" stroke="#AEA3FA" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function BootSplash({ onReady, onComplete }) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const shortSide = Math.min(width, height);
  const size = Math.min(shortSide * (landscape ? 0.69 : 0.92), 520);
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [loaded, setLoaded] = useState(false);
  const completed = useRef(false);
  const completeCallback = useRef(onComplete);
  useEffect(() => { completeCallback.current = onComplete; }, [onComplete]);
  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    completeCallback.current?.();
  };

  useEffect(() => {
    if (!loaded || completed.current) return;
    let cancelled = false;
    let animation;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (cancelled) return;
      if (reduced) {
        complete();
        return;
      }
      opacity.setValue(1);
      animation = Animated.sequence([
        Animated.timing(progress, { toValue: 0.6, duration: 350, easing: Easing.bezier(.22, .75, .25, 1), useNativeDriver: true }),
        Animated.delay(30),
        Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(300),
      ]);
      animation.start(({ finished }) => { if (finished && !cancelled) complete(); });
    }).catch(() => { if (!cancelled) complete(); });
    return () => { cancelled = true; animation?.stop(); };
  }, [loaded, progress, opacity]);

  return (
    <View style={s.root} pointerEvents="none">
      <View style={[s.wordmark, { top: height * (landscape ? 0.36 : 0.30) }]}>
        <DioWordmark width={Math.min(shortSide * 0.28, 220)} />
      </View>
      <Animated.View style={[s.mascot, {
        opacity,
        width: size, height: size, left: -size * 0.15, bottom: -size * (landscape ? 0.20 : 0.10),
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [-size * 0.86, 0, 0] }) },
          { translateY: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [size * 0.65, 0, 0] }) },
          { rotate: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['0deg', '0deg', '6deg'] }) },
        ],
      }]}>
        <Image source={require('../../assets/brand/mascot-splash.png')} style={s.image} fadeDuration={0}
          onError={complete} onLoadEnd={() => { if (!completed.current) setLoaded(true); onReady?.(); }} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 100, overflow: 'hidden', backgroundColor: SPLASH.backgroundColor },
  wordmark: { position: 'absolute', width: '100%', alignItems: 'center' },
  mascot: { position: 'absolute', transformOrigin: '28% 80%' },
  image: { width: '100%', height: '100%' },
});
