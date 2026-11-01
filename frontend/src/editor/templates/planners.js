// 인터랙션 속지(스터디 플래너 · 데일리 플래너)를 같은 모양으로 다루는 모음. 편집 화면 · 속지 배경 · 내보내기가 속지 ID 로 골라 쓴다.
// 속지 ID 가 인터랙션 속지가 아니면 null.
import * as study from './studyPlanner.js'
import * as day from './dayPlanner.js'

const orientationOf = id => id.endsWith('portrait') ? 'portrait' : 'landscape'

/**
 * { kind, orientation, startHour(기록) → 시간표 시작 시각, normalize(기록), setOptions(기록, patch),
 *   baseSvg(startHour) · overlaySvg(기록, 요소들) · svg(기록, 요소들) (요소들: 할 일 글을 막대에 비출 때 읽는 page.objects),
 *   titles(요소들) → 덮개가 읽는 할 일 글(없으면 null),
 *   stroke(기록, 점들, 도구 설정, 요소들) → { planner?, picker?, text? } | null (속지가 받은 획이 아니면 null),
 *   erase(기록, 점들, 지우개 모드) → 새 기록 | null, textSlot(점) → 줄 맞춘 글상자 자리 | null,
 *   cellTap(점) → 텍스트 도구로 눌렀을 때 글상자 대신 열 고르는 창 { picker } | null,
 *   nowLine(기록, 지금) → 시간표의 현재 시각 줄 { x, y, w } | null (화면 표시 전용),
 *   editTap(기록, 점, 요소들, 체크 색) → 선택 도구로 칸을 눌렀을 때 그 칸의 입력 { planner? | picker? | text? } | null,
 *   titleAt(점, 요소들) → 그 점의 할 일 칸에 이미 있는 글상자 | null, autoColor(기록, 요소들) → 색을 채운 새 기록 | null }
 */
export function plannerFor(assetId) {
  if (study.isStudyPlannerId(assetId)) {
    const o = orientationOf(assetId)
    return {
      kind: 'study', orientation: o,
      startHour: value => study.normalizePlanner(value).options.startHour,
      normalize: study.normalizePlanner, setOptions: study.setPlannerOptions,
      baseSvg: startHour => study.plannerBaseSvg(o, startHour), overlaySvg: value => study.plannerOverlaySvg(o, value), svg: value => study.studyPlannerSvg(o, value),
      stroke: (value, points, settings) => { const planner = study.applyPlannerStroke(value, o, points, settings); return planner ? { planner } : null },
      erase: (value, points, mode) => study.erasePlanner(value, o, points, mode),
      textSlot: point => study.plannerTextSlot(o, point),
      titles: () => null, cellTap: () => null, nowLine: () => null, autoColor: () => null,
      editTap: (value, point, objects, markColor) => study.plannerEditTap(o, point, value, markColor),
      titleAt: (point, objects) => study.plannerTitleAt(o, point, objects),
    }
  }
  if (day.isDayPlannerId(assetId)) {
    const o = orientationOf(assetId)
    return {
      kind: 'day', orientation: o,
      startHour: () => 6,
      normalize: day.normalizeDayPlanner, setOptions: day.setDayPlannerOptions,
      baseSvg: () => day.dayPlannerBaseSvg(o), overlaySvg: (value, objects) => day.dayPlannerOverlaySvg(o, value, objects), svg: (value, objects) => day.dayPlannerSvg(o, value, objects),
      titles: objects => day.dayTitles(o, objects),
      stroke: (value, points, settings, objects) => day.applyDayStroke(value, o, points, settings, objects),
      erase: (value, points) => day.eraseDayPlanner(value, o, points),
      textSlot: point => day.dayTextSlot(o, point),
      cellTap: point => day.dayCellTap(o, point),
      nowLine: (value, now) => day.dayNowLine(o, value, now),
      editTap: (value, point, objects, markColor) => day.dayEditTap(o, point, value, objects, markColor),
      titleAt: (point, objects) => day.dayTitleAt(o, point, objects),
      autoColor: (value, objects) => day.assignDayColors(value, o, objects),
    }
  }
  return null
}
