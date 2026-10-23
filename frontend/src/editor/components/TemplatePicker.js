import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import NotePreview from './NotePreview'
import { reusableTemplates, templateCanvasSize, TEMPLATE_VERSION } from '../templates/catalog.js'
import { colors, shadow } from '../../shared/theme'
import PageBackground from './PageBackground'
import { PANEL_RADIUS, ToolPanelHeader } from './ToolPanel'

const THUMB_WIDTH = 92


/**
 * 페이지 추가 버블. 페이지 목록의 '페이지 추가' 버튼 옆에 떠서, 속지를 미리보기 썸네일과 이름으로 보여 준다.
 * 속지를 플래너·노트로 묶는다. 모바일은 남은 화면 너비에 맞춰 줄바꿈·스크롤하고 태블릿은 기존 버블 배치를 쓴다. 바깥을 누르면 닫힌다.
 * anchor: 버블을 놓을 자리 { left, bottom } (화면 기준)
 */
export default function TemplatePicker({ compact = false, onSelect, onClose, anchor = { left: 16, bottom: 16 }, orientation = 'landscape' }) {
  const { width, height } = templateCanvasSize(orientation)
  const window = useWindowDimensions()
  const [containerWidth, setContainerWidth] = useState(null)
  const availableWidth = containerWidth ?? window.width
  const left = Math.max(8, Math.min(anchor.left, availableWidth - 128))
  const cardWidth = Math.min(500, Math.max(1, availableWidth - left - 16))
  const columns = cardWidth - 32 >= 154 ? 2 : 1
  const thumbWidth = compact ? Math.min(THUMB_WIDTH, Math.max(1, Math.floor((cardWidth - 32 - (columns - 1) * 10) / columns) - 8)) : THUMB_WIDTH
  const previewHeight = thumbWidth * height / width
  const templates = reusableTemplates(orientation)
  const groups = [
    { title: '하루 기록', items: templates.filter(item => item.type !== 'note') },
    { title: '자유 노트', items: templates.filter(item => item.type === 'note') },
  ]
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none" onLayout={compact ? event => setContainerWidth(event.nativeEvent.layout.width) : undefined}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="페이지 추가 닫기" />
      <View style={[styles.bubble, compact ? [styles.phoneBubble, { left, bottom: anchor.bottom, width: cardWidth }] : anchor]} accessibilityViewIsModal accessibilityLabel="페이지 추가">
        <ToolPanelHeader icon="plus" title="페이지 추가" closeLabel="페이지 추가 닫기" onClose={onClose} />
        <ScrollView style={compact ? styles.phoneScroll : undefined} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={[styles.row, compact && styles.phoneRow]}>
                {group.items.map((item) => (
                  <Pressable
                    key={item.assetId}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    onPress={() => onSelect(item.assetId)}
                    style={({ pressed }) => [styles.option, compact && { width: thumbWidth + 8 }, pressed && styles.pressed]}
                  >
                    <View style={[styles.thumb, { height: previewHeight, width: thumbWidth }]} pointerEvents="none">
                      {item.type === 'note' ? (
                        <NotePreview height={previewHeight} background={item.background} />
                      ) : (
                        <PageBackground page={{ id: `template-${item.assetId}`, backgroundAssetId: item.assetId, templateVersion: TEMPLATE_VERSION, canvasWidth: width, canvasHeight: height }} zoom={thumbWidth / width} compact />
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
  phoneBubble: { maxHeight: '90%', overflow: 'hidden' },
  phoneScroll: { flexShrink: 1 },
  phoneRow: { flexWrap: 'wrap' },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  group: { gap: 8 },
  groupTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  option: { width: THUMB_WIDTH + 8, alignItems: 'center', gap: 6, padding: 4, borderRadius: 10 },
  pressed: { backgroundColor: colors.primarySoft },
  thumb: { width: THUMB_WIDTH, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(11,25,87,0.12)', backgroundColor: '#FFFFFF' },
  label: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
})
