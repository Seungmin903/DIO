import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { OUTLINE_WIDTH, outlineOf, SHADOW_DIRECTIONS, SHADOW_LIMITS, shadowOf } from '../../utils/effects'
import { photoSupportsShadow } from '../canvas/ObjectView'
import ColorField from '../controls/ColorField'
import Slider from '../controls/Slider'

/**
 * 윤곽선(stroke)·그림자 옵션 (옵션 패널 '꾸미기'). 스티커와 사진(윤곽선은 모양 사진만)에 쓴다.
 * 다른 옵션처럼 제목 + 막대(숫자 칸)로 둔다.
 * - 윤곽선: 두께 0 이면 없음. 색은 피커로 직접 고른다.
 * - 그림자: 크기(퍼짐) 0 이면 없음. 켜지면 바깥쪽·안쪽(사진만), 9방향 위치, 거리, 흐림, 불투명도, 색.
 * 여러 개를 골랐으면 첫 요소의 값을 보여 주고 모두에 적용한다.
 */
export default function EffectOptions({ objects, dispatch }) {
  const outlineTargets = objects.filter((o) => o.type === 'sticker' || (o.type === 'photo' && o.frame === 'shape'))
  const shadowTargets = objects.filter((o) => o.type === 'sticker' || o.type === 'shape' || (o.type === 'photo' && photoSupportsShadow(o)))
  if (!outlineTargets.length && !shadowTargets.length) return null

  const apply = (targets, patch, record = true) =>
    dispatch({ type: 'updateMany', record, patches: Object.fromEntries(targets.map((o) => [o.id, patch])) })
  const checkpoint = () => dispatch({ type: 'checkpoint' })

  const outline = outlineTargets.length ? outlineOf(outlineTargets[0]) : null
  const shadow = shadowTargets.length ? shadowOf(shadowTargets[0]) : null
  const outlineWidth = outline?.on ? outline.width : 0
  // 그림자 크기(spread). 켜져 있으면 최소 1로 보여 준다 (0 은 '없음')
  const shadowSize = shadow?.on ? Math.max(1, shadow.spread) : 0

  return (
    <>
      {outline && (
        <Section title="윤곽선">
          <Slider
            value={outlineWidth}
            min={0}
            max={OUTLINE_WIDTH.max}
            step={1}
            minusLabel="윤곽선 얇게"
            plusLabel="윤곽선 두껍게"
            label="윤곽선 두께"
            onStart={checkpoint}
            onChange={(value) => {
              const width = Math.round(value)
              apply(outlineTargets, width ? { outline: true, outlineWidth: width } : { outline: false }, false)
            }}
          />
          {outline.on && (
            <ColorField
              label="윤곽선 색"
              value={outline.color}
              onStart={checkpoint}
              onChange={(value) => apply(outlineTargets, { outlineColor: value }, false)}
            />
          )}
        </Section>
      )}

      {shadow && (
        <Section title="그림자">
          <Slider
            value={shadowSize}
            min={0}
            max={SHADOW_LIMITS.spread}
            step={1}
            minusLabel="그림자 작게"
            plusLabel="그림자 크게"
            label="그림자 크기"
            onStart={checkpoint}
            onChange={(value) => {
              const size = Math.round(value)
              apply(shadowTargets, size ? { shadow: true, shadowSpread: size } : { shadow: false }, false)
            }}
          />
          {shadow.on && (
            <>
              {/* 안쪽·바깥쪽: 사진만 (스티커는 바깥쪽 그림자만 지원) */}
              {shadowTargets.every((o) => o.type === 'photo') && (
                <View style={styles.segment}>
                  {[
                    { inset: false, label: '바깥쪽' },
                    { inset: true, label: '안쪽' },
                  ].map((item) => {
                    const active = shadow.inset === item.inset
                    return (
                      <Pressable
                        key={item.label}
                        onPress={() => apply(shadowTargets, { shadowInset: item.inset })}
                        accessibilityRole="button"
                        accessibilityLabel={`그림자 ${item.label}`}
                        accessibilityState={{ selected: active }}
                        style={[styles.segmentItem, active && styles.segmentActive]}
                      >
                        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
              <Label text="위치" />
              <View style={styles.directions}>
                {SHADOW_DIRECTIONS.map((dir) => {
                  const active = shadow.x == null && shadow.direction === dir.id
                  return (
                    <Pressable
                      key={dir.id}
                      // 예전 위치 패드 값(x·y)은 지우고 방향·거리로 정한다
                      onPress={() => apply(shadowTargets, { shadowDirection: dir.id, shadowX: undefined, shadowY: undefined })}
                      accessibilityRole="button"
                      accessibilityLabel={`그림자 ${dir.name}`}
                      accessibilityState={{ selected: active }}
                      style={[styles.direction, active && styles.directionActive]}
                    >
                      {/* 칸마다 그 방향 그림자를 미리 보여 준다 */}
                      <View style={styles.preview}>
                        <View
                          style={[
                            styles.previewShadow,
                            dir.id === 'c' ? styles.previewGlow : { transform: [{ translateX: dir.x * 3 }, { translateY: dir.y * 3 }] },
                          ]}
                        />
                        <View style={styles.previewBox} />
                      </View>
                      <Text style={[styles.directionText, active && styles.directionTextActive]} numberOfLines={1}>
                        {dir.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Label text="거리" />
              <Slider
                value={shadow.distance}
                min={0}
                max={SHADOW_LIMITS.distance}
                step={1}
                minusLabel="그림자 가깝게"
                plusLabel="그림자 멀게"
                label="그림자 거리"
                onStart={checkpoint}
                onChange={(value) => apply(shadowTargets, { shadowDistance: Math.round(value), shadowX: undefined, shadowY: undefined }, false)}
              />
              <Label text="흐림" />
              <Slider
                value={shadow.blur}
                min={0}
                max={SHADOW_LIMITS.blur}
                step={1}
                minusLabel="그림자 선명하게"
                plusLabel="그림자 흐리게"
                label="그림자 흐림"
                onStart={checkpoint}
                onChange={(value) => apply(shadowTargets, { shadowBlur: Math.round(value) }, false)}
              />
              <Label text="불투명도" />
              <Slider
                value={shadow.opacity}
                min={SHADOW_LIMITS.opacityMin}
                max={SHADOW_LIMITS.opacityMax}
                step={0.05}
                minusLabel="그림자 연하게"
                plusLabel="그림자 진하게"
                scale={100}
                unit="%"
                label="그림자 불투명도"
                onStart={checkpoint}
                onChange={(value) => apply(shadowTargets, { shadowOpacity: Math.round(value * 100) / 100 }, false)}
              />
              <ColorField
                label="그림자 색"
                value={shadow.color}
                onStart={checkpoint}
                onChange={(value) => apply(shadowTargets, { shadowColor: value }, false)}
              />
            </>
          )}
        </Section>
      )}
    </>
  )
}

/** 다른 옵션(불투명도 등)과 같은 모양의 구역: 작은 회색 제목 */
function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  )
}

function Label({ text }) {
  return <Text style={styles.label}>{text}</Text>
}


const styles = StyleSheet.create({
  section: { marginTop: 14 },
  title: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  label: { marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  segment: { flexDirection: 'row', padding: 3, marginBottom: 2, borderRadius: 11, backgroundColor: colors.surfaceMuted },
  segmentItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  // 패널 폭에 꽉 차는 3×3, 칸마다 미리보기 + 방향 글자
  directions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
  direction: {
    width: '32.3%',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  directionActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  preview: { width: 26, height: 22, alignItems: 'center', justifyContent: 'center' },
  previewBox: { width: 16, height: 16, borderRadius: 4, backgroundColor: '#DCE4F1' },
  directionText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  directionTextActive: { color: colors.text, fontWeight: '800' },
  previewShadow: { position: 'absolute', width: 16, height: 16, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.22)' },
  previewGlow: { width: 22, height: 22, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.16)' },
  pressed: { backgroundColor: colors.primarySoft },
})
