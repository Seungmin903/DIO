import { StyleSheet, View } from 'react-native';
import appConfig from '../../app.json';
import BrandLogo from './BrandLogo';

// JS 시작 화면. 로고는 여기서만 한 번 보인다(안드로이드 네이티브 시작 화면은 바탕색만, iOS 는 같은 자리 · 크기의 로고).
// 보관함이 준비될 때까지 맨 위에 덮어 둔다.
// 로고는 PNG 대신 벡터(BrandLogo)로 그린다. 개발 빌드에서 PNG 는 Metro 에서 받아 오느라 늦게 뜬다.
// app.json 에서 플러그인 설정을 못 찾아도 앱이 뜨도록 지금 값과 같은 기본값을 둔다
const SPLASH_FALLBACK = { backgroundColor: '#F7F8FD', imageWidth: 160 };
const splashPlugin = appConfig.expo?.plugins?.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
export const SPLASH = { ...SPLASH_FALLBACK, ...(splashPlugin?.[1] ?? {}) };
// splash-icon.png(1536²) 안 로고 높이 426 을 표시 폭(imageWidth)에 맞춘 높이
export const LOGO_HEIGHT = SPLASH.imageWidth * 426 / 1536;

export default function BootSplash() {
  return (
    <View style={s.root} pointerEvents="none">
      <BrandLogo size={LOGO_HEIGHT} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: SPLASH.backgroundColor },
});
