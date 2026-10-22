import { useState } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import EditorModal from '../../editor/components/controls/EditorModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppIcon from '../../shared/AppIcon';
import { notify } from '../../shared/dialogs';
import { C } from '../constants';
import licenses from '../data/contentLicenses.json';

async function openLink(url) {
  try { await Linking.openURL(url); }
  catch { notify('링크를 열지 못했어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); }
}

function LicenseCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.name}>{entry.name}</Text>
    <Text selectable style={styles.body}>{entry.creator} · {entry.license}</Text>
    <Text selectable style={styles.body}>{entry.usage}</Text>
    <Text selectable style={styles.body}>{entry.changes}</Text>
    <Text selectable style={styles.notice}>{entry.notice}</Text>
    <View style={styles.links}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${entry.name} 출처 열기`} onPress={() => openLink(entry.sourceUrl)} style={styles.link}>
        <Text style={styles.linkText}>출처</Text>
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel={`${entry.name} 라이선스 웹페이지 열기`} onPress={() => openLink(entry.licenseUrl)} style={styles.link}>
        <Text style={styles.linkText}>라이선스 링크</Text>
      </Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} 라이선스 전문 ${expanded ? '접기' : '보기'}`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.disclosure}>
      <Text style={styles.linkText}>라이선스 전문 {expanded ? '접기' : '보기'}</Text>
      <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}><AppIcon name="chevron-right" size={18} color={C.ink} /></View>
    </Pressable>
    {expanded && <Text selectable style={styles.legal}>{entry.text}</Text>}
  </View>;
}

export default function ContentLicenses({ visible, onClose }) {
  return <EditorModal visible={visible} animationType="slide" supportedOrientations={['portrait', 'landscape']} statusBarTranslucent onRequestClose={onClose}>
    {visible && <StatusBar hidden />}
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>오픈소스 및 콘텐츠 라이선스</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="라이선스 화면 닫기" onPress={onClose} style={styles.close}>
            <AppIcon name="close" size={22} color={C.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {licenses.map(entry => <LicenseCard key={entry.id} entry={entry} />)}
        </ScrollView>
      </View>
    </SafeAreaView>
  </EditorModal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.pale },
  container: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  title: { flex: 1, color: C.ink, fontSize: 19, fontWeight: '800' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 4, gap: 16 },
  card: { padding: 20, backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, gap: 8 },
  name: { color: C.ink, fontSize: 19, fontWeight: '800' },
  body: { color: C.ink, fontSize: 14, lineHeight: 22 },
  notice: { color: C.inkSoft, fontSize: 13, lineHeight: 21, marginTop: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { color: C.ink, fontSize: 14, fontWeight: '700' },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: C.line },
  legal: { color: C.ink, fontSize: 12, lineHeight: 20 },
});
