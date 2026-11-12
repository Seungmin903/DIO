import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { withPaperBackground } from '../../editor/templates/appearance.js'
import { DEFAULT_PAPER_FONT } from '../../editor/templates/paperFont.js'
import { colors } from '../../shared/theme'
import EditablePalette from '../../editor/components/controls/EditablePalette'
import PaperFontDropdown from './PaperFontDropdown'
import { GroupGrid, GroupHead, PaletteFit, groupStyle } from './StudioPresets'

/**
 * 꾸미기 공방 '내 속지' 위쪽의 기본 속지 설정: 새 다이어리를 만들 때 처음 값이 되는 종이 색 · 선 · 글씨 색 · 속지 글꼴.
 * 이미 만든 다이어리의 속지는 바꾸지 않는다(각 다이어리가 자기 설정을 따로 갖는다). 다이어리 안에서 바꿀 때의 범위는 그 다이어리 안에서 정한다.
 * style · save 는 공방 화면이 useDefaultPaperStyle 로 읽어 넘긴다(저장한 속지 목록과 함께 한 번에 그리려고).
 * 모양은 도구 탭과 같은 묶음(아이콘 + 이름 · 옅은 선 · 고정 기본 팔레트)으로 둔다(코덱스 2026-11-02). 고른 색은 체크 없이 2px 고리 하나로 보인다.
 */
export default function StudioPaperStyle({ style, save, compact = false }) {
  const [failed, setFailed] = useState(false)
  const change = async (next) => setFailed(!await save(next))
  return (
    <View style={local.box}>
      <Text accessibilityRole="header" style={local.title}>기본 속지 설정</Text>
      <GroupGrid compact={compact}>{width => [
        <ColorGroup key="paper" width={width} compact={compact} icon="paintBucket" title="종이 색" scope="paper" label="종이"
          value={style.backgroundColor} onChange={backgroundColor => change(withPaperBackground(style, backgroundColor))} />,
        <ColorGroup key="line" width={width} compact={compact} icon="penLine" title="선 · 글자" scope="paperLine" label="선과 글씨"
          value={style.layoutColor} onChange={layoutColor => change({ ...style, layoutColor })} />,
        <View key="font" style={groupStyle(width, compact)}>
          <GroupHead icon="text" title="글꼴" full={compact} />
          {/* 공방에서는 고른 글꼴을 받지 않았으면 바로 받는다(편집 화면 · 새 다이어리 속지 설정은 받기 버튼으로만) */}
          <PaperFontDropdown autoDownload value={style.font ?? DEFAULT_PAPER_FONT} onChange={font => change({ ...style, font: font === DEFAULT_PAPER_FONT ? undefined : font })} />
        </View>,
      ]}</GroupGrid>
      {failed ? <Text accessibilityRole="alert" style={local.error}>저장하지 못했어요. 다시 시도해 주세요.</Text> : null}
    </View>
  )
}

function ColorGroup({ width, compact, icon, title, scope, label, value, onChange }) {
  return (
    <View style={groupStyle(width, compact)}>
      <GroupHead icon={icon} title={title} full={compact} />
      <PaletteFit full={compact}><EditablePalette scope={scope} label={label} value={value} onPick={onChange} flushEdit /></PaletteFit>
    </View>
  )
}

const local = StyleSheet.create({
  box: { gap: 16 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  error: { color: colors.dangerStrong, fontSize: 12, lineHeight: 18, fontWeight: '600' },
})
