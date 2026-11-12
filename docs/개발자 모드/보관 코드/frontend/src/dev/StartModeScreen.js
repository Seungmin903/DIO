import { StyleSheet, Text, View } from 'react-native';
import BrandLogo from '../shared/BrandLogo';
import DioButton from '../shared/DioButton';
import { LOGO_HEIGHT, SPLASH } from '../shared/BootSplash';
import { colors } from '../shared/theme';

// 개발용(src/dev/devAccess): 앱을 켤 때 어떤 상태로 둘러볼지 고른다. 출시 전에 이 파일째 뺀다.
// 일반 사용자 = 로그인 전 게스트(목업 없음) · 개발자 모드 = 로그인한 사용자처럼 다 열리고 목업이 들어 있다.
// 로고는 시작 화면(BootSplash · 네이티브 시작 화면)과 같은 크기 · 같은 자리에 둔다. 다르면 넘어갈 때 로고가 옮겨 가며 깜박인다.
// 글과 버튼만 로고 아래에 나타난다. 안전 영역을 빼지 않는다(시작 화면도 화면 전체 가운데다).
export default function StartModeScreen({ onChoose }) {
  return (
    <View style={s.root}>
      <BrandLogo size={LOGO_HEIGHT} />
      <View style={s.below}>
        <Text style={s.title}>어떤 상태로 시작할까요?</Text>
        <View style={s.actions}>
          <DioButton variant="filled" label="일반 사용자로 시작" block onPress={() => onChoose(false)} />
          <DioButton variant="ghost" outline label="개발자 모드로 시작" block onPress={() => onChoose(true)} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: SPLASH.backgroundColor },
  below: { position: 'absolute', top: '50%', left: 16, right: 16, marginTop: LOGO_HEIGHT / 2 + 32, alignItems: 'center', gap: 24 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  actions: { alignSelf: 'center', width: '100%', maxWidth: 360, gap: 12 },
});
