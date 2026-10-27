import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import { thumbnailPlacements } from '../../utils/stickerSplitGroups.js'

// Display-only composition. Full-resolution PNGs are merged only on save.
export default function StickerGroupThumbnail({ group, style }) {
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const pattern = `checker-${group.id}`
  return <View style={[s.frame, style]} onLayout={event => setFrame(event.nativeEvent.layout)} pointerEvents="none">
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%"><Defs><Pattern id={pattern} width={16} height={16} patternUnits="userSpaceOnUse"><Rect width={16} height={16} fill={colors.surface} /><Rect width={8} height={8} fill={colors.surfaceMuted} /><Rect x={8} y={8} width={8} height={8} fill={colors.surfaceMuted} /></Pattern></Defs><Rect width="100%" height="100%" fill={`url(#${pattern})`} /></Svg>
    {thumbnailPlacements(group, frame.width, frame.height).map(({ id, uri, ...position }) => <Image key={id} source={{ uri }} resizeMode="contain" style={[s.member, position]} />)}
  </View>
}
const s = StyleSheet.create({ frame: { overflow: 'hidden', backgroundColor: colors.surfaceMuted }, member: { position: 'absolute' } })
