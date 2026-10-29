import { Pressable, StyleSheet, View } from 'react-native'
import { centerOf, rotateVector } from '../../utils/common'
import { emptyPhotoSlots, getObjectName, photoInnerBox } from '../../utils/objects'
import { stripCellBoxes } from '../../utils/photoStrip'
import Icon from '../controls/Icon'
import { frameColorOf } from './ObjectView'
import { isDarkColor } from './PhotoFrame'

const PLUS = 30 // 화면 px (작은 칸에서는 줄인다)
const MIN_PLUS = 18
const TOUCH = 44

/**
 * 사진 틀의 빈 자리 가운데에 + 를 띄운다 (편집 화면에서만. 썸네일·내보내기에는 그리지 않는다).
 * 버튼 모양 없이 + 만 그리고, 그 자리를 위에 놓인 다른 요소가 덮고 있으면 띄우지 않는다.
 * 누르면 onFill(틀, 칸 번호) — 한 장 틀은 칸 번호가 null.
 */
export default function SlotAddButtons({ objects, zoom, onFill }) {
  return objects.map((o, index) => {
    if (o.type !== 'photo' || o.hidden || o.locked) return null
    const slots = emptyPhotoSlots(o)
    if (!slots.length) return null
    const boxes = slots[0] === null ? [photoInnerBox(o)] : stripCellBoxes(o)
    // 틀 위에 쌓인 요소 (펜 획은 빼고)
    const above = objects.slice(index + 1).filter((other) => !other.hidden && other.type !== 'stroke')
    const color = o.frame === 'film' || o.frame === 'filmstrip' || isDarkColor(frameColorOf(o)) ? 'rgba(255,255,255,0.85)' : 'rgba(31,32,38,0.45)'
    const shown = slots.map((slot) => {
      const box = boxes[slot ?? 0]
      const size = Math.max(MIN_PLUS, Math.min(PLUS, Math.min(box.width, box.height) * zoom * 0.4))
      return { slot, box, size }
    }).filter(({ box, size }) => !covered(o, box, size / zoom, above))
    if (!shown.length) return null
    return (
      <View
        key={o.id}
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: o.x * zoom,
          top: o.y * zoom,
          width: o.w * zoom,
          height: o.h * zoom,
          transform: [{ rotate: `${o.rotation ?? 0}deg` }],
        }}
      >
        {shown.map(({ slot, box, size }) => (
          <Pressable
            key={slot ?? 'single'}
            onPress={() => onFill(o, slot)}
            hitSlop={Math.max(0, (TOUCH - size) / 2)}
            accessibilityRole="button"
            accessibilityLabel={slot == null ? `${getObjectName(o)}에 사진 넣기` : `${getObjectName(o)} ${slot + 1}번 칸에 사진 넣기`}
            style={({ pressed }) => [
              styles.plus,
              {
                left: (box.left + box.width / 2) * zoom - size / 2,
                top: (box.top + box.height / 2) * zoom - size / 2,
                width: size,
                height: size,
              },
              pressed && styles.pressed,
            ]}
          >
            <Icon name="plus" size={size} color={color} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
    )
  })
}

/** + 자리(칸 가운데 size 크기 네모, 페이지 단위)의 가운데나 네 모서리를 위 요소가 덮는지 */
function covered(frame, box, size, above) {
  if (!above.length) return false
  const c = centerOf(frame)
  const cx = box.left + box.width / 2 - frame.w / 2
  const cy = box.top + box.height / 2 - frame.h / 2
  const half = size / 2
  const points = [[0, 0], [-half, -half], [half, -half], [-half, half], [half, half]].map(([dx, dy]) => {
    const p = rotateVector(cx + dx, cy + dy, frame.rotation ?? 0)
    return { x: c.x + p.x, y: c.y + p.y }
  })
  return above.some((other) => points.some((point) => {
    const oc = centerOf(other)
    const local = rotateVector(point.x - oc.x, point.y - oc.y, -(other.rotation ?? 0))
    return Math.abs(local.x) <= other.w / 2 && Math.abs(local.y) <= other.h / 2
  }))
}

const styles = StyleSheet.create({
  plus: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
})
