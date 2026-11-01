import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { usePan } from '../hooks/usePan'
import { DAY_STEP, DURATION_HOURS, DURATION_RANGE } from '../templates/dayPlanner.js'
import { PlannerPopup, PopupButton, PopupLabels, PopupToggle, PopupWheel, PopupWheelGroup, PopupWheels, popupSize } from './PlannerPopup'

export { ITEM_H, SHOWN } from './PlannerPopup'
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTE_MARKS = Array.from({ length: 60 / DAY_STEP }, (_, i) => i * DAY_STEP)
const pad = value => String(value).padStart(2, '0')

/**
 * 데일리 플래너 일정 한 줄의 시작 시각 · 진행(지속 시간)을 한 창에서 같이 고르는 창 (시작 · 진행 칸 어디를 눌러도 뜬다).
 * 맨 위에 「종일」 토글(켜면 시간표 대신 종일 칸에 올라간다), 그 아래에 시작(시 · 분)과 진행(시간 · 분) 휠 넷이 있다.
 * 고른 값은 휠 가운데 한 줄에 나란히 놓인다. 색은 여기서 고르지 않는다(자동으로 주고, 형광펜으로 바꾼다).
 * value: 그 줄의 지금 기록({ start, dur, allDay }, 없으면 null). suggest: 아직 시간이 없는 줄에 처음 보일 값 { start, dur }.
 * onChange({ start, dur, allDay }): 고를 때마다 알린다(시간표에 바로 보인다). 시작 · 진행 중 하나라도 고르면 둘 다 정해져 일정이 생긴다.
 * onClear(): 그 줄의 시간을 비운다.
 */
export default function DayTimePicker({ row, value, suggest, onChange, onClear, onClose, style }) {
  const [draft, setDraft] = useState(value?.start != null || value?.allDay ? { start: value.start ?? suggest.start, dur: value.dur ?? suggest.dur, allDay: Boolean(value.allDay) } : null)
  const shown = draft ?? { start: suggest.start, dur: suggest.dur, allDay: false }
  const set = next => { setDraft(next); onChange(next) }
  const pick = patch => set({ ...shown, allDay: false, ...patch }) // 휠을 돌리면 종일은 풀린다
  const hour = Math.floor(shown.start / 60), minute = shown.start % 60
  const hours = Math.floor(shown.dur / 60), minutes = shown.dur % 60
  // 0시간 0분은 가장 짧은 5분, 24시간을 넘는 분은 24시간으로(넘기면 일정 기록이 버려진다)
  const pickDuration = (h, m) => pick({ dur: Math.min(DURATION_RANGE.max, Math.max(DURATION_RANGE.min, h * 60 + m)) })
  return (
    <PlannerPopup label={`일정 ${row + 1}`} closeLabel="일정 닫기" onClose={onClose} style={style}
      headerLeft={<PopupToggle label="종일" on={shown.allDay} onPress={() => shown.allDay ? pick({}) : set({ ...shown, allDay: true })} />}>
      <PopupLabels items={[{ name: '시작' }, { name: '진행' }]} />
      <PopupWheels>
        <PopupWheelGroup separator=":" dim={shown.allDay}>
          <PopupWheel items={HOURS} selected={hour} text={pad} label="시작 시" onPick={h => pick({ start: h * 60 + minute })} />
          <PopupWheel items={MINUTE_MARKS} selected={minute} text={pad} label="시작 분" onPick={m => pick({ start: hour * 60 + m })} />
        </PopupWheelGroup>
        <PopupWheelGroup dim={shown.allDay}>
          <PopupWheel items={DURATION_HOURS} selected={hours} text={h => `${h}시간`} label="진행 시간" onPick={h => pickDuration(h, minutes)} />
          <PopupWheel items={MINUTE_MARKS} selected={minutes} text={m => `${m}분`} label="진행 분" onPick={m => pickDuration(hours, m)} />
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
export const DAY_TIME_PICKER = popupSize({ width: 300 })
