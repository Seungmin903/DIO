import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import EditorModal from '../../editor/components/controls/EditorModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppIcon from '../../shared/AppIcon';
import { notify } from '../../shared/dialogs';
import { C } from '../constants';
import licenses from '../data/contentLicenses.json';
import software from '../../licenses/softwareNotices';
import { obtainLicenseSource } from '../../licenses/sourceFiles';

async function openLink(url) {
  try { await Linking.openURL(url); }
  catch { notify('링크를 열지 못했어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); }
}

function LicenseCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const [legalLimit, setLegalLimit] = useState(24000);
  const getSource = async (source) => {
    try { await obtainLicenseSource(source); }
    catch (error) { notify('소스 파일을 열지 못했어요', error.message); }
  };
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.name}>{entry.name}</Text>
    {entry.version ? <Text selectable style={styles.body}>버전 {entry.version}</Text> : null}
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
    {entry.sourceArchives?.map(source => <Pressable key={source.fileName} accessibilityRole="button" accessibilityLabel={`${entry.name} 소스 받기`} onPress={() => getSource(source)} style={styles.link}>
      <Text style={styles.linkText}>소스 받기 · {source.fileName}</Text>
    </Pressable>)}
    <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} 라이선스 전문 ${expanded ? '접기' : '보기'}`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.disclosure}>
      <Text style={styles.linkText}>라이선스 전문 {expanded ? '접기' : '보기'}</Text>
      <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}><AppIcon name="chevron-right" size={18} forText={14} color={C.ink} /></View>
    </Pressable>
    {expanded && <><Text selectable style={styles.legal}>{entry.text.slice(0, legalLimit)}</Text>
      {legalLimit < entry.text.length && <Pressable accessibilityRole="button" onPress={() => setLegalLimit(value => value + 24000)} style={styles.link}><Text style={styles.linkText}>전문 더 보기</Text></Pressable>}
    </>}
  </View>;
}

export default function ContentLicenses({ visible, onClose }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const entries = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...licenses, ...software.components].filter(entry => !term || `${entry.name} ${entry.version ?? ''} ${entry.license}`.toLowerCase().includes(term));
  }, [query]);
  return <EditorModal visible={visible} animationType="none" supportedOrientations={['portrait', 'landscape']} statusBarTranslucent onRequestClose={onClose}>
    {visible && <StatusBar hidden />}
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>오픈소스 및 콘텐츠 라이선스</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="라이선스 화면 닫기" onPress={onClose} style={styles.close}>
            <AppIcon name="close" size={22} color={C.ink} />
          </Pressable>
        </View>
        <TextInput accessibilityLabel="라이선스 검색" placeholder="이름·라이선스로 검색" value={query} onChangeText={value => { setQuery(value); setLimit(20); }} style={styles.search} autoCapitalize="none" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.body}>앱에 포함된 소프트웨어·콘텐츠의 원저작권 고지입니다. 소스 제공 대상은 각 항목의 ‘소스 받기’에서 확인할 수 있어요.</Text>
          <Text style={styles.body}>{entries.length}개 항목</Text>
          {entries.slice(0, limit).map(entry => <LicenseCard key={entry.id} entry={entry} />)}
          {entries.length > limit && <Pressable accessibilityRole="button" onPress={() => setLimit(value => value + 20)} style={styles.link}><Text style={styles.linkText}>고지 더 보기</Text></Pressable>}
        </ScrollView>
      </View>
    </SafeAreaView>
  </EditorModal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.pale },
  container: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  title: { flex: 1, color: C.ink, fontSize: 19, fontWeight: '700' },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 4, gap: 16 },
  search: { marginHorizontal: 20, marginBottom: 12, minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, color: C.ink, backgroundColor: C.white },
  card: { padding: 20, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, gap: 8 },
  name: { color: C.ink, fontSize: 19, fontWeight: '700' },
  body: { color: C.ink, fontSize: 14, lineHeight: 22 },
  notice: { color: C.inkSoft, fontSize: 13, lineHeight: 21, marginTop: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { color: C.ink, fontSize: 14, fontWeight: '700' },
  disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: C.line },
  legal: { color: C.ink, fontSize: 12, lineHeight: 20 },
});
