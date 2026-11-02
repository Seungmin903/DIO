import { isDeskDarkAt } from './deskLight'
import { useDeskHour } from './deskTimeStore'

/** 책상 위에 얹힌 글씨가 흰색이어야 할 만큼 상판이 어두운가. enabled 가 false(책상 없음)면 구독하지 않고 false. */
export const useDeskDark = (enabled = true) => {
  const hour = useDeskHour(enabled)
  return enabled && hour != null && isDeskDarkAt(hour)
}
