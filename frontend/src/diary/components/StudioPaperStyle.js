import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { PaperStyleOptions } from './PaperOptions'

/**
 * 꾸미기 공방 '내 속지' 위쪽의 기본 속지 설정: 새 다이어리를 만들 때 처음 값이 되는 종이 색 · 선 · 글씨 색 · 속지 글꼴.
 * 이미 만든 다이어리의 속지는 바꾸지 않는다(각 다이어리가 자기 설정을 따로 갖는다). 다이어리 안에서 바꿀 때의 범위는 그 다이어리 안에서 정한다.
 * style · save 는 공방 화면이 useDefaultPaperStyle 로 읽어 넘긴다(저장한 속지 목록과 함께 한 번에 그리려고).
 */
export default function StudioPaperStyle({ style, save }) {
  const [failed, setFailed] = useState(false)
  return (
    <View style={local.box}>
      <Text accessibilityRole="header" style={local.title}>기본 속지 설정</Text>
      <PaperStyleOptions fontDropdown appearance={style} onChange={async (next) => setFailed(!await save(next))} />
      {failed ? <Text accessibilityRole="alert" style={local.error}>저장하지 못했어요. 다시 시도해 주세요.</Text> : null}
    </View>
  )
}

const local = StyleSheet.create({
  box: { gap: 8 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  error: { color: colors.dangerStrong, fontSize: 12, lineHeight: 18, fontWeight: '600' },
})
