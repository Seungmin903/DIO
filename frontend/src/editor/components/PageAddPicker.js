import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { PaperGrid, PaperTabs, TemplatePreview } from '../../diary/components/PaperOptions'
import { TEMPLATE_VERSION } from '../templates/catalog.js'
import { loadTemplate } from '../templates/loadTemplate'
import Icon from './controls/Icon'
import { PAPER_GROUPS, countAssetId, papersIn } from '../../diary/utils/paperChoice'
import { PANEL_RADIUS, ToolPanelHeader } from './ToolPanel'

// 페이지로 더할 수 있는 속지: 장수로 넣는 속지만 (날짜 속지는 다이어리를 만들 때 기간으로 넣는다)
const GROUPS = PAPER_GROUPS.map(group => ({ ...group, papers: papersIn(group.id).filter(paper => paper.kind === 'count') })).filter(group => group.papers.length)
const CARD_WIDTH = 340
const SLOTS = 6 // 분류마다 두 줄(3열)로 맞춘다

/** 팝업을 열기 전에 속지를 미리 불러 둬 열자마자 그려지게 한다 */
export function prefetchPageAddPapers(orientation) {
  for (const group of GROUPS) for (const paper of group.papers) {
    try { loadTemplate({ backgroundAssetId: countAssetId(paper.id, orientation), templateVersion: TEMPLATE_VERSION }).catch(() => {}) } catch { /* 없는 속지는 건너뜀 */ }
  }
}

/**
 * 페이지 추가 (약식 버블). 페이지 목록의 '페이지 추가' 옆에 떠서 분류 탭 + 속지 타일을 보이고,
 * 속지를 누르면 지금 페이지 뒤에 한 장을 넣고 닫는다. 바깥을 누르면 닫힌다.
 * 폰은 화면 아래에 가로로 꽉 차게 띄운다. 폭은 창 크기로 정해 처음 그린 뒤 다시 재지 않는다.
 * anchor: 태블릿 버블 자리 { left, bottom } (화면 기준)
 */
export default function PageAddPicker({ compact = false, orientation, appearance, currentAssetId = null, anchor = { left: 16, bottom: 16 }, onSelect, onClose }) {
  // 지금 페이지의 속지와 같은 속지가 있으면 그 분류에서 열고, 맨 위에 바로 넣는 줄을 둔다
  const current = currentAssetId ? GROUPS.flatMap(item => item.papers.map(paper => ({ paper, group: item.id })))
    .find(item => countAssetId(item.paper.id, orientation) === currentAssetId) ?? null : null
  const [group, setGroup] = useState(current?.group ?? GROUPS[0].id)
  const window = useWindowDimensions()
  const place = compact ? { left: 8, right: 8, bottom: anchor.bottom } : { left: anchor.left, bottom: anchor.bottom, width: Math.min(CARD_WIDTH, window.width - anchor.left - 16) }
  return <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="페이지 추가 닫기" />
    <View style={[styles.bubble, place]} accessibilityViewIsModal accessibilityLabel="페이지 추가">
      <ToolPanelHeader icon="plus" title="페이지 추가" closeLabel="페이지 추가 닫기" onClose={onClose} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {current && <Pressable accessibilityRole="button" accessibilityLabel={`현재 속지 ${current.paper.name} 한 장 더`} onPress={() => onSelect(currentAssetId)}
          style={({ pressed }) => [styles.current, pressed && styles.pressed]}>
          <TemplatePreview assetId={currentAssetId} width={36} appearance={appearance} />
          <View style={styles.currentText}>
            <Text style={styles.currentLabel}>현재 속지</Text>
            <Text numberOfLines={1} style={styles.currentName}>{current.paper.name}</Text>
          </View>
          <Icon name="plus" size={16} color={colors.primaryStrong} />
        </Pressable>}
        <PaperTabs groups={GROUPS} value={group} onChange={setGroup} />
        <PaperGrid papers={GROUPS.find(item => item.id === group).papers} selected={null} orientation={orientation} appearance={appearance} minSlots={SLOTS}
          onSelect={id => onSelect(countAssetId(id, orientation))} />
      </ScrollView>
    </View>
  </View>
}

const styles = StyleSheet.create({
  // 편집 화면(본문 · 도구 막대)보다 위에 뜬다
  layer: { zIndex: 60, elevation: 60 },
  bubble: { position: 'absolute', maxHeight: '90%', overflow: 'hidden', borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  pressed: { opacity: 0.7 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  currentText: { flex: 1, minWidth: 0, gap: 2 },
  currentLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  currentName: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
})
