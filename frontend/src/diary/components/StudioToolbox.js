import { StyleSheet, View } from 'react-native';
import { colors } from '../../shared/theme';

/**
 * 공방 도구함: 만들기 버튼들을 한 줄(좁으면 세로)로 묶는 옅은 면(surfaceMuted, 모서리 20).
 * taped: 왼쪽 위에 버터 테이프 한 조각(32×12, -6°)을 붙인다. 빈 화면에서는 캐릭터만 쓰므로 끈다.
 */
export default function StudioToolbox({ taped = true, compact = false, children }) {
  return (
    <View style={[local.box, compact && local.boxCompact]}>
      {taped ? <View pointerEvents="none" style={local.tape} /> : null}
      {children}
    </View>
  );
}

const local = StyleSheet.create({
  box: { minHeight: 80, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  boxCompact: { flexDirection: 'column', alignItems: 'stretch' },
  tape: { position: 'absolute', top: -4, left: 12, width: 32, height: 12, borderRadius: 2, backgroundColor: colors.butterTape, transform: [{ rotate: '-6deg' }] },
});
