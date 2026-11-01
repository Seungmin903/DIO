import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EditorModal from '../editor/components/controls/EditorModal';
import NotificationPanel, { NotificationButton } from './NotificationPanel';
import { colors } from '../shared/theme';

export default function AuthenticatedNotificationDialog({ model, onClose, sharingPending = false, onInvitationReady }) {
  return <EditorModal visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}><NotificationButton label="알림 닫기" onPress={onClose} /></View>
      {sharingPending && <Text style={styles.notice}>공유 기능은 서버 연결을 준비하고 있어요. 받은 알림은 아래에서 확인할 수 있어요.</Text>}
      <NotificationPanel model={model} onInvitationReady={onInvitationReady} />
    </SafeAreaView>
  </EditorModal>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, header: { padding: 12 }, notice: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 16, paddingBottom: 12 } });
