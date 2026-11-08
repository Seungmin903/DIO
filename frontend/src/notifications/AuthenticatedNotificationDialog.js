import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EditorModal from '../editor/components/controls/EditorModal';
import NotificationPanel, { NotificationButton } from './NotificationPanel';
import { colors, radius } from '../shared/theme';
import { showNotificationDetail } from './notificationDetailView.js';

export default function AuthenticatedNotificationDialog({ model, onClose, sharingPending = false, onInvitationReady, embedded = false }) {
  const { width, height } = useWindowDimensions();
  const compact = Math.min(width, height) < 600;
  const detailOpen = showNotificationDetail(model.invitation, Boolean(onInvitationReady));
  const back = () => detailOpen ? model.store.closeInvitation() : onClose();
  const content = (
    <SafeAreaView style={[styles.backdrop, compact && styles.phoneBackdrop]}>
    <View accessibilityViewIsModal style={[styles.screen, compact ? styles.phone : { maxHeight: height - 64 }]}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{detailOpen ? '초대 상세' : '알림'}</Text><NotificationButton label="알림 닫기" text={null} icon="close" quiet trailing onPress={onClose} /></View>
      {sharingPending && <Text style={styles.notice}>공유 기능은 서버 연결을 준비하고 있어요. 받은 알림은 아래에서 확인할 수 있어요.</Text>}
      <NotificationPanel model={model} onInvitationReady={onInvitationReady} />
    </View>
    </SafeAreaView>
  );
  return embedded ? content : <EditorModal visible transparent animationType="none" onRequestClose={back}>{content}</EditorModal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  phoneBackdrop: { padding: 0, backgroundColor: colors.surface },
  screen: { width: '100%', maxWidth: 580, minHeight: 0, overflow: 'hidden', backgroundColor: colors.surface, borderRadius: radius.xl },
  phone: { flex: 1, maxWidth: '100%', borderRadius: 0 },
  // 좌우 24: 아래 목록(NotificationPanel content)과 같은 여백. 닫기 X 의 보이는 끝도 24 에 맞춘다(trailing)
  header: { paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '800' },
  notice: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 24, paddingTop: 12 },
});
