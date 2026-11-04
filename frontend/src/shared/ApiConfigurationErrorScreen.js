import { Text, View } from 'react-native';
import { styles } from '../diary/styles';

// Reuse the established empty-state tokens so this release-only screen stays in
// step with the app's palette and typography.
export default function ApiConfigurationErrorScreen() {
  return <View style={styles.empty}>
    <Text style={styles.emptyTitle}>서버 설정을 확인해 주세요</Text>
    <Text style={styles.emptyCopy}>앱에 연결할 서버 주소가 설정되지 않았어요. 앱을 업데이트한 뒤 다시 시도해 주세요.</Text>
  </View>;
}
