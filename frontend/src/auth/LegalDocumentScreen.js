import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EditorModal from '../editor/components/controls/EditorModal';
import AppIcon from '../shared/AppIcon';
import { colors } from '../shared/theme';
import { notify } from '../shared/dialogs';
import { documentTextRuns, isConsentDocument } from '../shared/legalContent';

async function openLink(url) {
  try { await Linking.openURL(url); }
  catch { notify('링크를 열지 못했어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); }
}

export default function LegalDocumentScreen({ document, onClose, onAgree }) {
  const canAgree = isConsentDocument(document) && typeof onAgree === 'function';
  return <EditorModal visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView style={styles.safe}>
      <View style={styles.container} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{document.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="문서 닫기" onPress={onClose} style={styles.close}>
            <AppIcon name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          {document.blocks.filter(block => block.level !== 1).map((block, index) => (
            <Text key={index} selectable accessibilityRole={block.type === 'heading' ? 'header' : undefined}
              style={[styles.paragraph, block.type === 'heading' && (block.level === 2 ? styles.heading : styles.subheading)]}>
              {block.type === 'listItem' ? `${block.number ? `${block.number}.` : '•'} ` : ''}
              {documentTextRuns(block).map((run, runIndex) => run.url
                ? <Text key={runIndex} accessibilityRole="link" style={styles.link} onPress={() => openLink(run.url)}>{run.text}</Text>
                : run.text)}
            </Text>
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" accessibilityLabel={canAgree ? '동의하고 돌아가기' : '닫기'}
            onPress={canAgree ? onAgree : onClose} style={styles.button}>
            <Text style={styles.buttonText}>{canAgree ? '동의하고 돌아가기' : '닫기'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  </EditorModal>;
}

// Reuse the full-screen license view structure and the existing auth button treatment.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceSoft },
  container: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center', backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '700' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  body: { padding: 24, gap: 16 },
  paragraph: { color: colors.text, fontSize: 14, lineHeight: 24, flexShrink: 1 },
  heading: { fontSize: 19, lineHeight: 29, fontWeight: '700', marginTop: 12 },
  subheading: { fontSize: 16, lineHeight: 26, fontWeight: '700', marginTop: 8 },
  link: { color: colors.primaryText, textDecorationLine: 'underline' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  button: { minHeight: 48, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: colors.surface, fontSize: 14, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
});
