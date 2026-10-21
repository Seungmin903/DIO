import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { PAPER_BACKGROUNDS, PAPER_LAYOUTS } from '../templates/appearance.js'
import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'

const SCOPES = [{ id: 'page', label: '이 페이지' }, { id: 'all', label: '모든 페이지' }]

/**
 * 속지 색 (빈 곳을 길게 눌러 연다). 다이어리를 만들 때 고르는 배경색·레이아웃 색과 같은 색들이다.
 * appearance: 지금 페이지의 { backgroundColor, layoutColor }. onChange(appearance, all): all 이면 모든 페이지(와 새로 추가할 페이지)에 쓴다.
 */
export default function PaperColorSettings({ appearance, onChange, onClose, style }) {
  const [scope, setScope] = useState('page')
  const pick = (patch) => onChange({ ...appearance, ...patch }, scope === 'all')
  return (
    <View style={[toolPanelStyles.card, style]} accessibilityLabel="속지 색 설정" onStartShouldSetResponder={() => true}>
      <ToolPanelHeader icon="roller" title="속지 색" closeLabel="속지 색 설정 닫기" onClose={onClose} />
      <View style={toolPanelStyles.content}>
        <Segmented items={SCOPES} selected={(id) => scope === id} onPress={setScope} />
        {[['backgroundColor', '배경색', PAPER_BACKGROUNDS], ['layoutColor', '레이아웃 색', PAPER_LAYOUTS]].map(([key, label, presets]) => (
          <View key={key} style={styles.section}>
            <Text style={toolPanelStyles.label}>{label}</Text>
            <View style={styles.row}>
              {presets.map(([name, color]) => {
                const on = appearance[key]?.toUpperCase() === color.toUpperCase()
                return (
                  <Pressable key={color} onPress={() => pick({ [key]: color })} accessibilityRole="radio" accessibilityLabel={`${label} ${name}`} accessibilityState={{ selected: on }}
                    style={[styles.swatch, { backgroundColor: color }, on && styles.swatchOn]} />
                )
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(11,25,87,0.15)' },
  swatchOn: { borderWidth: 3, borderColor: colors.primary },
})
