import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { usePan } from '../hooks/usePan'
import { DAY_STEP, DURATION_HOURS } from '../templates/dayPlanner.js'
import { PlannerPopup, PopupButton, PopupLabels, PopupWheel, PopupWheelGroup, PopupWheels, popupSize } from './PlannerPopup'

export { ITEM_H, SHOWN } from './PlannerPopup'
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTE_MARKS = Array.from({ length: 60 / DAY_STEP }, (_, i) => i * DAY_STEP)
const ALL_DAY = '종일'
const DURATION_CHOICES = [ALL_DAY, ...DURATION_HOURS] // 진행 시간 휠 맨 위: 종일(시간 없이 하루 내내)
const pad = value => String(value).padStart(2, '0')

/**
 * 데일리 플래너 일정 한 줄의 시작 시각 · 진행(지속 시간)을 고르는 창 (시작 · 진행 칸을 누르면 뜬다). 시각도 시간도 시 · 분 두 휠이라 긴 목록을 넘기지 않는다.
 * 네 휠의 고른 값이 가운데 한 줄에 나란히 놓인다. 진행의 맨 위 「종일」을 고르면 시간표 대신 종일 칸에 올라간다.
 * 색은 여기서 고르지 않는다(자동으로 주고, 형광펜으로 바꾼다).
 * value: 그 줄의 지금 기록({ start, dur, allDay }, 없으면 null). suggest: 아직 시간이 없는 줄에 처음 보일 값 { start, dur }.
 * onChange({ start, dur, allDay }): 고를 때마다 알린다(시간표에 바로 보인다). 시작 · 진행 중 하나라도 고르면 둘 다 정해져 일정이 생긴다.
 * onClear(): 그 줄의 시간을 비운다.
 */
export default function DayTimePicker({ row, value, suggest, onChange, onClear, onClose, style }) {
  const [draft, setDraft] = useState(value?.start != null || value?.allDay ? { start: value.start ?? suggest.start, dur: value.dur ?? suggest.dur, allDay: Boolean(value.allDay) } : null)
  const shown = draft ?? { start: suggest.start, dur: suggest.dur, allDay: false }
  const pick = patch => { const next = { ...shown, allDay: false, ...patch }; setDraft(next); onChange(next) }
  const hour = Math.floor(shown.start / 60), minute = shown.start % 60
  const hours = Math.floor(shown.dur / 60), minutes = shown.dur % 60
  const pickDuration = (h, m) => pick({ dur: Math.max(DAY_STEP, h * 60 + m) }) // 0시간 0분은 가장 짧은 5분
  return (
    <PlannerPopup title={`일정 ${row + 1}`} label={`일정 ${row + 1}`} closeLabel="일정 닫기" onClose={onClose} style={style}>
      <PopupLabels items={[{ name: '시작' }, { name: '진행' }]} />
      <PopupWheels>
        <PopupWheelGroup separator=":" dim={shown.allDay}>
          <PopupWheel items={HOURS} selected={hour} text={pad} label="시작 시" onPick={h => pick({ start: h * 60 + minute })} />
          <PopupWheel items={MINUTE_MARKS} selected={minute} text={pad} label="시작 분" onPick={m => pick({ start: hour * 60 + m })} />
        </PopupWheelGroup>
        <PopupWheelGroup>
          <PopupWheel items={DURATION_CHOICES} selected={shown.allDay ? ALL_DAY : hours} text={h => h === ALL_DAY ? ALL_DAY : `${h}시간`} label="진행 시간"
            onPick={h => h === ALL_DAY ? (setDraft({ ...shown, allDay: true }), onChange({ ...shown, allDay: true })) : pickDuration(h, minutes)} />
          <View style={shown.allDay ? styles.off : styles.on}>
            <PopupWheel items={MINUTE_MARKS} selected={minutes} text={m => `${m}분`} label="진행 분" onPick={m => pickDuration(hours, m)} />
          </View>
        </PopupWheelGroup>
      </PopupWheels>
      {draft && <PopupButton label="지우기" a11y="일정 지우기" onPress={onClear} />}
    </PlannerPopup>
  )
}

/** 시간 창 바깥을 톡 누르면 창을 닫는다. 펜 입력 영역(PalmRejectionArea) 안에 두어 손바닥은 거르고, 닫으려고 누른 터치로 획이 남지 않게 막는다. */
export function DayPickBackdrop({ onClose }) {
  const handlers = usePan({ onEnd: ({ cancelled }) => { if (!cancelled) onClose() } })
  return <View style={StyleSheet.absoluteFill} accessibilityLabel="일정 닫기" {...handlers} />
}

// 위치를 정할 때 쓰는 크기
export const DAY_TIME_PICKER = popupSize()

const styles = StyleSheet.create({
  on: { flex: 1 },
  off: { flex: 1, opacity: 0.4 }, // 종일이면 분 휠은 쓰지 않는다
})
