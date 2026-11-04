import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { isLoaded } from 'expo-font';
import { colors, radius } from '../shared/theme';

function availableFont(name) {
  try { return isLoaded(name) ? { fontFamily: name, fontWeight: 'normal' } : null; }
  catch { return null; }
}

// Core controls only: recovery cannot depend on the editor, SVG, session providers or loaded fonts.
export default function AppErrorFallback({ onRetry }) {
  return (
    <SafeAreaProvider style={styles.root}>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <Text dioFont={false} accessibilityRole="header" style={[styles.title, availableFont('Pretendard-Bold')]}>
              화면을 불러오지 못했어요
            </Text>
            <Text dioFont={false} style={[styles.body, availableFont('Pretendard-Regular')]}>
              다시 시도해 주세요. 문제가 계속되면 앱을 종료한 뒤 다시 열어 주세요.
            </Text>
            <Text dioFont={false} style={[styles.body, availableFont('Pretendard-Regular')]}>
              저장하지 못한 변경 사항이 있을 수 있어요.
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={onRetry} style={styles.button}>
              <Text dioFont={false} style={[styles.buttonText, availableFont('Pretendard-ExtraBold')]}>다시 시도</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
  title: { color: colors.text, fontSize: 20, lineHeight: 30, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 24 },
  button: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: colors.surface, fontSize: 15, lineHeight: 24, fontWeight: '800', textAlign: 'center' },
});
