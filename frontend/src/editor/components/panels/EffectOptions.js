import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { OUTLINE_WIDTH, outlineOf, SHADOW_DIRECTIONS, SHADOW_LIMITS, shadowOf } from '../../utils/effects'
import { photoSupportsShadow } from '../canvas/ObjectView'
import ColorPicker from '../controls/ColorPicker'
import Icon from '../controls/Icon'
import Slider from '../controls/Slider'

/**
 * 테두리·그림자 세부 옵션 (더보기 패널의 '꾸미기'). 스티커와 사진(테두리는 도형 사진만)에 쓴다.
 * 효과마다 카드 하나: 머리줄의 스위치로 켜고 끄며, 켜져 있을 때만 세부 옵션을 펼친다.
 * 그림자는 PPT '바깥쪽 그림자'처럼 방향(9칸)·거리·흐림·진하기·색을 고른다. 색은 프리셋 없이 피커로 직접 고른다.
 * 여러 개를 골랐으면 첫 요소의 값을 보여 주고 모두에 적용한다.
 */
export default function EffectOptions({ objects, dispatch }) {
  const outlineTargets = objects.filter((o) => o.type === 'sticker' || (o.type === 'photo' && o.frame === 'shape'))
  const shadowTargets = objects.filter((o) => o.type === 'sticker' || (o.type === 'photo' && photoSupportsShadow(o)))
  if (!outlineTargets.length && !shadowTargets.length) return null

  const apply = (targets, patch, record = true) =>
    dispatch({ type: 'updateMany', record, patches: Object.fromEntries(targets.map((o) => [o.id, patch])) })
  const checkpoint = () => dispatch({ type: 'checkpoint' })

  const outline = outlineTargets.length ? outlineOf(outlineTargets[0]) : null
  const shadow = shadowTargets.length ? shadowOf(shadowTargets[0]) : null

  return (
    <>
      {outline && (
        <Card
          title="테두리"
          summary={outline.on ? `두께 ${outline.width}` : '꺼짐'}
          swatch={outline.on ? outline.color : null}
          on={outline.on}
          onToggle={() => apply(outlineTargets, { outline: !outline.on })}
        >
          <Label text="두께" value={outline.width} />
          <Slider
            value={outline.width}
            min={OUTLINE_WIDTH.min}
            max={OUTLINE_WIDTH.max}
            step={1}
            minusLabel="테두리 얇게"
            plusLabel="테두리 두껍게"
            onStart={checkpoint}
            onChange={(value) => apply(outlineTargets, { outlineWidth: Math.round(value) }, false)}
          />
          <ColorField
            label="테두리 색"
            value={outline.color}
            onStart={checkpoint}
            onChange={(value) => apply(outlineTargets, { outlineColor: value }, false)}
          />
        </Card>
      )}

      {shadow && (
        <Card
          title="그림자"
          summary={shadow.on ? `${SHADOW_DIRECTIONS.find((d) => d.id === shadow.direction)?.name ?? ''} · ${Math.round(shadow.opacity * 100)}%` : '꺼짐'}
          swatch={shadow.on ? shadow.color : null}
          on={shadow.on}
          onToggle={() => apply(shadowTargets, { shadow: !shadow.on })}
        >
          <Label text="위치" />
          <View style={styles.directions}>
            {SHADOW_DIRECTIONS.map((dir) => {
              const active = shadow.direction === dir.id
              return (
                <Pressable
                  key={dir.id}
                  onPress={() => apply(shadowTargets, { shadowDirection: dir.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`그림자 ${dir.name}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.direction, active && styles.directionActive]}
                >
                  {/* 칸마다 그 방향 그림자를 미리 보여 준다 */}
                  <View
                    style={[
                      styles.previewShadow,
                      dir.id === 'c' ? styles.previewGlow : { transform: [{ translateX: dir.x * 4 }, { translateY: dir.y * 4 }] },
                    ]}
                  />
                  <View style={styles.previewBox} />
                </Pressable>
              )
            })}
          </View>
          <Label text="거리" value={shadow.distance} />
          <Slider
            value={shadow.distance}
            min={0}
            max={SHADOW_LIMITS.distance}
            step={1}
            minusLabel="그림자 가깝게"
            plusLabel="그림자 멀게"
            onStart={checkpoint}
            onChange={(value) => apply(shadowTargets, { shadowDistance: Math.round(value) }, false)}
          />
          <Label text="흐림" value={shadow.blur} />
          <Slider
            value={shadow.blur}
            min={0}
            max={SHADOW_LIMITS.blur}
            step={1}
            minusLabel="그림자 선명하게"
            plusLabel="그림자 흐리게"
            onStart={checkpoint}
            onChange={(value) => apply(shadowTargets, { shadowBlur: Math.round(value) }, false)}
          />
          <Label text="진하기" value={`${Math.round(shadow.opacity * 100)}%`} />
          <Slider
            value={shadow.opacity}
            min={SHADOW_LIMITS.opacityMin}
            max={SHADOW_LIMITS.opacityMax}
            step={0.05}
            minusLabel="그림자 연하게"
            plusLabel="그림자 진하게"
            onStart={checkpoint}
            onChange={(value) => apply(shadowTargets, { shadowOpacity: Math.round(value * 100) / 100 }, false)}
          />
          <ColorField
            label="그림자 색"
            value={shadow.color}
            onStart={checkpoint}
            onChange={(value) => apply(shadowTargets, { shadowColor: value }, false)}
          />
        </Card>
      )}
    </>
  )
}

function Card({ title, summary, swatch, on, onToggle, children }) {
  return (
    <View style={[styles.card, on && styles.cardOn]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="switch"
        accessibilityLabel={`${title} ${on ? '끄기' : '켜기'}`}
        accessibilityState={{ checked: on }}
        style={styles.head}
      >
        <View style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.summaryRow}>
            {swatch && <View style={[styles.summarySwatch, { backgroundColor: swatch }]} />}
            <Text style={styles.summary}>{summary}</Text>
          </View>
        </View>
        <View style={[styles.toggle, on && styles.toggleOn]}>
          <View style={[styles.knob, on && styles.knobOn]} />
        </View>
      </Pressable>
      {on && <View style={styles.cardBody}>{children}</View>}
    </View>
  )
}

function Label({ text, value }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{text}</Text>
      {value != null && <Text style={styles.value}>{value}</Text>}
    </View>
  )
}

/** 색 한 줄: 지금 색을 보여 주고, 누르면 아래에 피커를 펼친다. */
function ColorField({ label, value, onStart, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${open ? '접기' : '고르기'}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.colorRow, pressed && styles.pressed]}
      >
        <Text style={styles.label}>색</Text>
        <View style={styles.colorValue}>
          <View style={[styles.colorChip, { backgroundColor: value }]} />
          <Text style={styles.colorHex}>{value.toUpperCase()}</Text>
          <View style={open && styles.flip}>
            <Icon name="chevronDown" size={16} color={colors.textMuted} />
          </View>
        </View>
      </Pressable>
      {open && <ColorPicker value={value} label={label} onStart={onStart} onChange={onChange} />}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardOn: { borderColor: 'rgba(110,146,198,0.55)' },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 14, gap: 10 },
  headText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: colors.text },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  summarySwatch: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.border },
  summary: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  value: { fontSize: 12, fontWeight: '800', color: colors.text },
  toggle: { width: 46, height: 28, padding: 3, borderRadius: 14, backgroundColor: '#D5DCE8' },
  toggleOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface },
  knobOn: { transform: [{ translateX: 18 }] },
  directions: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 48 + 2 * 6, gap: 6 },
  direction: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  directionActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  previewBox: { width: 20, height: 20, borderRadius: 4, backgroundColor: '#DCE4F1' },
  previewShadow: { position: 'absolute', width: 20, height: 20, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.22)' },
  previewGlow: { width: 26, height: 26, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.16)' },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 10,
  },
  pressed: { backgroundColor: colors.primarySoft },
  colorValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorChip: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border },
  colorHex: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  flip: { transform: [{ rotate: '180deg' }] },
})
