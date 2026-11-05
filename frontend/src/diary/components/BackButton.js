import { Pressable, StyleSheet } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { colors } from '../../shared/theme';

// 제목 왼쪽 뒤로 버튼(설정 · 다이어리 검색). 터치 48, 면 · 테두리 없음(알림 설정 화면의 뒤로와 같은 모양)
export default function BackButton({ label, onPress, disabled = false }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.button}>
      <AppIcon name="chevron-left" size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ button: { width: 48, height: 48, marginLeft: -12, alignItems: 'center', justifyContent: 'center', borderRadius: 10 } });
