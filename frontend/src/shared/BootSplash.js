import { StyleSheet, View } from 'react-native';
import appConfig from '../../app.json';
import BrandLogo from './BrandLogo';

// JS 시작 화면. 로고는 여기서만 한 번 보인다(안드로이드 네이티브 시작 화면은 바탕색만, iOS 는 같은 자리 · 크기의 로고).
// 보관함이 준비될 때까지 맨 위에 덮어 둔다.
// 네이티브 시작 화면과 같은 정사각 마스코트를 공용 BrandLogo로 표시한다.
// app.json 에서 플러그인 설정을 못 찾아도 앱이 뜨도록 지금 값과 같은 기본값을 둔다
const SPLASH_FALLBACK = { backgroundColor: '#F7F8FD', imageWidth: 160 };
const splashPlugin = appConfig.expo?.plugins?.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
export const SPLASH = { ...SPLASH_FALLBACK, ...(splashPlugin?.[1] ?? {}) };
// Native splash uses the full square image at imageWidth.
export const LOGO_HEIGHT = SPLASH.imageWidth;

export default function BootSplash({ onReady }) {
  return (
    <View style={s.root} pointerEvents="none">
      <BrandLogo size={LOGO_HEIGHT} onLoadEnd={onReady} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: SPLASH.backgroundColor },
});
