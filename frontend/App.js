import { StatusBar } from 'expo-status-bar'
import { StyleSheet, View } from 'react-native'
import EditorScreen from './src/editor/EditorScreen'
import { colors } from './src/theme'

// 홈·다이어리 생성 화면이 붙기 전까지는 편집 화면을 바로 띄운다.
export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <EditorScreen />
    </View>
  )
}

const styles = StyleSheet.create({
  // 웹에서 드래그할 때 이모지·글자가 블록 선택되지 않도록
  root: { flex: 1, backgroundColor: colors.surfaceSoft, userSelect: 'none' },
})
