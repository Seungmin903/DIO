import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import { REUSABLE_TEMPLATES, TEMPLATE_VERSION } from '../templates/catalog.js'
import { colors, shadow } from '../../shared/theme'
import PageBackground from './PageBackground'
import { PANEL_RADIUS, ToolPanelHeader } from './ToolPanel'

const THUMB_WIDTH = 92
const THUMB_ZOOM = THUMB_WIDTH / 1024
const GROUPS = [
  { title: '플래너', items: REUSABLE_TEMPLATES.filter((item) => item.type !== 'note') },
  { title: '노트', items: REUSABLE_TEMPLATES.filter((item) => item.type === 'note') },
]

/**
 * 페이지 추가 버블. 페이지 목록의 '페이지 추가' 버튼 옆에 떠서, 속지를 미리보기 썸네일과 이름으로 보여 준다.
 * 7종을 플래너·노트 두 줄로 묶어 스크롤 없이 한눈에 고른다. 바깥을 누르면 닫힌다.
 * anchor: 버블을 놓을 자리 { left, bottom } (화면 기준)
 */
export default function TemplatePicker({ onSelect, onClose, anchor = { left: 16, bottom: 16 } }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="페이지 추가 닫기" />
      <View style={[styles.bubble, anchor]} accessibilityViewIsModal accessibilityLabel="페이지 추가">
        <ToolPanelHeader icon="plus" title="페이지 추가" closeLabel="페이지 추가 닫기" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.content}>
          {GROUPS.map((group) => (
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
                    <View style={styles.thumb} pointerEvents="none">
                      {item.type === 'note' ? (
                        <NotePreview background={item.background} />
                      ) : (
                        <PageBackground page={{ id: `template-${item.assetId}`, backgroundAssetId: item.assetId, templateVersion: TEMPLATE_VERSION }} zoom={THUMB_ZOOM} compact />
                      )}
                    </View>
                    <Text style={styles.label} numberOfLines={1}>{shortName(item.name)}</Text>
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

const PREVIEW_HEIGHT = THUMB_WIDTH * (768 / 1024)
const PREVIEW_STEP = 9 // 실제 속지(28) 를 그대로 줄이면 2.5px 간격이라 무늬가 뭉개져서, 미리보기는 성기게
const PREVIEW_COLOR = '#B7BFCC' // 실제 속지 선(#e8e9eb)은 작은 미리보기에서 안 보여서 진하게

/** 노트 속지 미리보기: 무지·줄·모눈·도트 무늬가 작게도 또렷이 보이게 그린 그림 */
function NotePreview({ background }) {
  const xs = []
  const ys = []
  for (let x = PREVIEW_STEP / 2; x < THUMB_WIDTH; x += PREVIEW_STEP) xs.push(x)
  for (let y = PREVIEW_STEP / 2; y < PREVIEW_HEIGHT; y += PREVIEW_STEP) ys.push(y)
  return (
    <Svg width={THUMB_WIDTH} height={PREVIEW_HEIGHT}>
      {(background === 'ruled' || background === 'grid') &&
        ys.map((y) => <Line key={`h${y}`} x1={0} y1={y} x2={THUMB_WIDTH} y2={y} stroke={PREVIEW_COLOR} strokeWidth={0.8} />)}
      {background === 'grid' && xs.map((x) => <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={PREVIEW_HEIGHT} stroke={PREVIEW_COLOR} strokeWidth={0.8} />)}
      {background === 'dots' && xs.flatMap((x) => ys.map((y) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill={PREVIEW_COLOR} />))}
    </Svg>
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
  thumb: { width: THUMB_WIDTH, height: THUMB_WIDTH * (768 / 1024), borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(11,25,87,0.12)', backgroundColor: '#FFFFFF' },
  label: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
})
