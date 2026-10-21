import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import NotePreview from './NotePreview'
import { reusableTemplates, templateCanvasSize, TEMPLATE_VERSION } from '../templates/catalog.js'
import { colors, shadow } from '../../shared/theme'
import PageBackground from './PageBackground'
import { PANEL_RADIUS, ToolPanelHeader } from './ToolPanel'

const THUMB_WIDTH = 92


/**
 * 페이지 추가 버블. 페이지 목록의 '페이지 추가' 버튼 옆에 떠서, 속지를 미리보기 썸네일과 이름으로 보여 준다.
 * 7종을 플래너·노트 두 줄로 묶어 스크롤 없이 한눈에 고른다. 바깥을 누르면 닫힌다.
 * anchor: 버블을 놓을 자리 { left, bottom } (화면 기준)
 */
export default function TemplatePicker({ onSelect, onClose, anchor = { left: 16, bottom: 16 }, orientation = 'landscape' }) {
  const { width, height } = templateCanvasSize(orientation)
  const previewHeight = THUMB_WIDTH * height / width
  const templates = reusableTemplates(orientation)
  const groups = [
    { title: '하루 기록', items: templates.filter(item => item.type !== 'note') },
    { title: '자유 노트', items: templates.filter(item => item.type === 'note') },
  ]
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="페이지 추가 닫기" />
      <View style={[styles.bubble, anchor]} accessibilityViewIsModal accessibilityLabel="페이지 추가">
        <ToolPanelHeader icon="plus" title="페이지 추가" closeLabel="페이지 추가 닫기" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.content}>
          {groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.row}>
                {group.items.map((item) => (
                  <Pressable
                    key={item.assetId}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    onPress={() => onSelect(item.assetId)}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  >
                    <View style={[styles.thumb, { height: previewHeight }]} pointerEvents="none">
                      {item.type === 'note' ? (
                        <NotePreview height={previewHeight} background={item.background} />
                      ) : (
                        <PageBackground page={{ id: `template-${item.assetId}`, backgroundAssetId: item.assetId, templateVersion: TEMPLATE_VERSION, canvasWidth: width, canvasHeight: height }} zoom={THUMB_WIDTH / width} compact />
                      )}
                    </View>
                    <Text style={styles.label} numberOfLines={1}>{item.type === 'note' ? shortName(item.name) : item.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}

// '자유 노트 · 모눈' → '모눈' (노트 줄에서는 묶음 이름이 이미 보인다)
const shortName = (name) => name.split('·').pop().trim()

const styles = StyleSheet.create({
  // 편집 화면(본문)보다 위에 뜬다
  layer: { zIndex: 60, elevation: 60 },
  bubble: { position: 'absolute', maxHeight: '90%', borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  group: { gap: 8 },
  groupTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  option: { width: THUMB_WIDTH + 8, alignItems: 'center', gap: 6, padding: 4, borderRadius: 10 },
  pressed: { backgroundColor: colors.primarySoft },
  thumb: { width: THUMB_WIDTH, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(11,25,87,0.12)', backgroundColor: '#FFFFFF' },
  label: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
})
