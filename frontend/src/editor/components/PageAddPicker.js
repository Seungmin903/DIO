import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { PaperGrid, PaperTabs } from '../../diary/components/PaperOptions'
import { PAPER_GROUPS, countAssetId, papersIn } from '../../diary/utils/paperChoice'
import { PANEL_RADIUS, ToolPanelHeader } from './ToolPanel'

// 페이지로 더할 수 있는 속지: 장수로 넣는 속지만 (날짜 속지는 다이어리를 만들 때 기간으로 넣는다)
const GROUPS = PAPER_GROUPS.map(group => ({ ...group, papers: papersIn(group.id).filter(paper => paper.kind === 'count') })).filter(group => group.papers.length)
const CARD_WIDTH = 340

/**
 * 페이지 추가 (약식 버블). 페이지 목록의 '페이지 추가' 옆에 떠서 분류 탭 + 속지 타일을 보이고,
 * 속지를 누르면 지금 페이지 뒤에 한 장을 넣고 닫는다. 바깥을 누르면 닫힌다.
 * 폰은 화면 아래에 가로로 꽉 차게 띄운다. 폭은 창 크기로 정해 처음 그린 뒤 다시 재지 않는다.
 * anchor: 태블릿 버블 자리 { left, bottom } (화면 기준)
 */
export default function PageAddPicker({ compact = false, orientation, appearance, anchor = { left: 16, bottom: 16 }, onSelect, onClose }) {
  const [group, setGroup] = useState(GROUPS[0].id)
  const window = useWindowDimensions()
  const place = compact ? { left: 8, right: 8, bottom: anchor.bottom } : { left: anchor.left, bottom: anchor.bottom, width: Math.min(CARD_WIDTH, window.width - anchor.left - 16) }
  return <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="페이지 추가 닫기" />
    <View style={[styles.bubble, place]} accessibilityViewIsModal accessibilityLabel="페이지 추가">
      <ToolPanelHeader icon="plus" title="페이지 추가" closeLabel="페이지 추가 닫기" onClose={onClose} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PaperTabs groups={GROUPS} value={group} onChange={setGroup} />
        <PaperGrid papers={GROUPS.find(item => item.id === group).papers} selected={null} orientation={orientation} appearance={appearance}
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
})
