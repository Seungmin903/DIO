import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorModal from '../editor/components/controls/EditorModal';
import AppIcon from '../shared/AppIcon';
import { colors } from '../shared/theme';
import { notify } from '../shared/dialogs';
import { documentTextRuns, isConsentDocument, justifiedParagraph, justifyBreaks, paragraphLabel } from '../shared/legalContent';

async function openLink(url) {
  try { await Linking.openURL(url); }
  catch { notify('링크를 열지 못했어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); }
}

export default function LegalDocumentScreen({ document, onClose, onAgree }) {
  const canAgree = isConsentDocument(document) && typeof onAgree === 'function';
  const insets = useSafeAreaInsets();
  return <EditorModal visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
    {/* 상태 표시줄 영역까지 흰색 상단 바로 칠한다(다른 설정 하위 화면과 같게). 바탕(surfaceSoft)은 태블릿 좌우 여백에만 보인다 */}
    <View style={{ height: insets.top, backgroundColor: colors.surface }} />
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safe}>
      <View style={styles.container} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text maxFontSizeMultiplier={0} accessibilityRole="header" style={styles.title}>{document.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="문서 닫기" onPress={onClose} style={styles.close}>
            <AppIcon name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          {document.blocks.filter(block => block.level !== 1).map((block, index) => {
            const os = Platform?.OS;
            const justified = justifiedParagraph(block, os);
            const prefix = block.type === 'listItem' ? `${block.number ? `${block.number}.` : '•'} ` : '';
            // 안드로이드는 글자 선택(selectable)을 켜면 양쪽 맞춤이 적용되지 않아(실기기 확인 2026-11-08) 안드로이드만 선택을 끈다
            return <Text key={index} selectable={os !== 'android'} maxFontSizeMultiplier={0} accessibilityRole={block.type === 'heading' ? 'header' : undefined}
              accessibilityLabel={paragraphLabel(block, os, prefix)}
              style={[styles.paragraph, !justified && styles.leftAligned, block.type === 'heading' && (block.level === 2 ? styles.heading : styles.subheading)]}>
              {prefix || null}
              {documentTextRuns(block).map((run, runIndex) => run.url
                ? <Text key={runIndex} accessibilityRole="link" style={styles.link} onPress={() => openLink(run.url)}>{run.text}</Text>
                : justifyBreaks(run.text, { os, skip: block.type === 'heading' }))}
            </Text>;
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" accessibilityLabel={canAgree ? '동의하고 돌아가기' : '닫기'}
            onPress={canAgree ? onAgree : onClose} style={styles.button}>
            <Text maxFontSizeMultiplier={0} style={styles.buttonText}>{canAgree ? '동의하고 돌아가기' : '닫기'}</Text>
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
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  body: { padding: 24, gap: 16 },
  // 본문은 양쪽 맞춤(2026-11-08 사용자 요청), 제목은 왼쪽 맞춤 그대로
  paragraph: { color: colors.text, fontSize: 14, lineHeight: 24, flexShrink: 1, textAlign: 'justify' },
  leftAligned: { textAlign: 'left' },
  heading: { fontSize: 19, lineHeight: 29, fontWeight: '700', marginTop: 12, textAlign: 'left' },
  subheading: { fontSize: 16, lineHeight: 26, fontWeight: '700', marginTop: 8, textAlign: 'left' },
  link: { color: colors.primaryText, textDecorationLine: 'underline' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  button: { minHeight: 48, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: colors.surface, fontSize: 14, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
});
