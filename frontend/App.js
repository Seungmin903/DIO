import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SHARED DIARY</Text>
        <Text style={styles.title}>DIO</Text>
        <Text style={styles.description}>
          오늘의 사진 위에 친구들과{`\n`}함께 이야기를 남겨 보세요.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isReady }}
          onPress={() => setIsReady(true)}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>
            {isReady ? '모바일 앱 준비 완료' : '시작하기'}
          </Text>
        </Pressable>

        {isReady && (
          <Text style={styles.notice}>
            이제 화면과 Spring Boot API를 연결할 수 있습니다.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF8F4',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  eyebrow: {
    color: '#9A6B63',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  title: {
    color: '#2A1D1A',
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -2,
    marginTop: 8,
  },
  description: {
    color: '#715C56',
    fontSize: 18,
    lineHeight: 28,
    marginTop: 20,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#F06F4A',
    borderRadius: 14,
    marginTop: 38,
    minWidth: 190,
    paddingHorizontal: 24,
    paddingVertical: 15,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  notice: {
    color: '#8A756F',
    fontSize: 14,
    marginTop: 20,
    textAlign: 'center',
  },
});
