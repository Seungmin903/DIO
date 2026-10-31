import { useState } from 'react'
import { daysInMonth } from '../templates/dayPlanner.js'
import { PlannerPopup, PopupButton, PopupLabels, PopupWheel, PopupWheelGroup, PopupWheels, popupSize } from './PlannerPopup'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * 데일리 플래너 날짜를 고르는 창 (날짜 칸을 누르면 뜬다). 요일은 고른 날짜로 정해 속지에 자동으로 동그라미를 친다.
 * 년 · 월 · 일 휠의 고른 값이 가운데 한 줄에 나란히 놓인다(시간 창과 같은 모양).
 * value: 지금 날짜({ y, m, d }, 없으면 null). suggest: 날짜가 없을 때 처음 보일 값(오늘).
 * onChange({ y, m, d }): 고를 때마다 알린다. onClear(): 날짜를 비운다.
 */
export default function DayDatePicker({ value, suggest, onChange, onClear, onClose, style }) {
  const [draft, setDraft] = useState(value)
  const shown = draft ?? suggest
  const years = Array.from({ length: 10 }, (_, i) => suggest.y - 3 + i)
  if (!years.includes(shown.y)) years.push(shown.y)
  const pick = patch => {
    const next = { ...shown, ...patch }
    next.d = Math.min(next.d, daysInMonth(next.y, next.m)) // 짧은 달로 옮기면 그 달 마지막 날로
    setDraft(next); onChange(next)
  }
  const dates = Array.from({ length: daysInMonth(shown.y, shown.m) }, (_, i) => i + 1)
  return (
    <PlannerPopup label="날짜 고르기" closeLabel="날짜 닫기" onClose={onClose} style={style}>
      <PopupLabels items={[{ name: '년', flex: 1.4 }, { name: '월' }, { name: '일' }]} />
      <PopupWheels>
        <PopupWheelGroup flex={1.4}><PopupWheel items={years} selected={shown.y} text={String} label="년" onPick={y => pick({ y })} /></PopupWheelGroup>
        <PopupWheelGroup><PopupWheel items={MONTHS} selected={shown.m} text={String} label="월" onPick={m => pick({ m })} /></PopupWheelGroup>
        <PopupWheelGroup><PopupWheel items={dates} selected={shown.d} text={String} label="일" onPick={d => pick({ d })} /></PopupWheelGroup>
      </PopupWheels>
      {draft && <PopupButton label="지우기" a11y="날짜 지우기" onPress={onClear} />}
    </PlannerPopup>
  )
}

// 위치를 정할 때 쓰는 크기
export const DAY_DATE_PICKER = popupSize()
