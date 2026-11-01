import { StyleSheet, View } from 'react-native';
import appConfig from '../../app.json';
import BrandLogo from './BrandLogo';

// 네이티브 시작 화면(expo-splash-screen)과 똑같이 그린 JS 시작 화면. 보관함이 준비될 때까지 맨 위에 덮어 둔다.
// 개발 빌드는 개발 런처가 먼저 그려지면서 네이티브 시작 화면이 JS 실행 전에 내려가므로, 이 화면이 있어야 빈 화면이 안 보인다.
// 로고는 PNG 대신 벡터(BrandLogo)로 그린다. 개발 빌드에서 PNG 는 Metro 에서 받아 오느라 늦게 뜬다.
export const SPLASH = appConfig.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
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
