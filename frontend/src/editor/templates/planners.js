// 인터랙션 속지(스터디 플래너 · 데일리 플래너)를 같은 모양으로 다루는 모음. 편집 화면 · 속지 배경 · 내보내기가 속지 ID 로 골라 쓴다.
// 속지 ID 가 인터랙션 속지가 아니면 null.
import * as study from './studyPlanner.js'
import * as day from './dayPlanner.js'
import * as route from './routePaper.js'
import { isTastingId } from './tastingGeometry.js'
import * as tasting from './tastingPaper.js'
import { inkRecordApi } from './inkRecordPaper.js'
import { paperFontIdsToLoad } from './paperFont.js'

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
  // 발색 기록: 바탕은 속지 파일 그대로 두고(fileBase) 자동으로 채운 색 값만 덮개로 올린다.
  const inkRecord = inkRecordApi(assetId)
  if (inkRecord) return inkRecord
  if (isTastingId(assetId)) {
    const landscape = assetId.endsWith('landscape')
    return {
      kind: 'tasting', orientation: landscape ? 'landscape' : 'portrait', startHour: () => 6,
      normalize: value => value ?? {}, setOptions: value => value ?? {},
      baseSvg: () => tasting.tastingBaseSvg(assetId), overlaySvg: value => tasting.tastingOverlaySvg(value, assetId), svg: value => tasting.tastingSvg(value, assetId),
      stroke: (value, points, settings) => { const planner = tasting.applyTastingStroke(value, points, settings, assetId); return planner ? { planner } : null },
      erase: (value, points) => tasting.eraseTastingStroke(value, points, assetId),
      titles: () => null, textSlot: () => null, cellTap: () => null, nowLine: () => null,
      editTap: () => null, titleAt: () => null, autoColor: () => null,
    }
  }
  if (study.isStudyPlannerId(assetId)) {
    const o = orientationOf(assetId)
    return {
      kind: 'study', orientation: o,
      startHour: value => study.normalizePlanner(value).options.startHour,
      normalize: study.normalizePlanner, setOptions: study.setPlannerOptions,
      baseSvg: startHour => study.plannerBaseSvg(o, startHour), overlaySvg: value => study.plannerOverlaySvg(o, value), svg: value => study.studyPlannerSvg(o, value),
      stroke: (value, points, settings, objects) => {
        // 펜 톡으로 할 일 줄 글 입력(지라 830). 데일리처럼 칸 맞춤(snap)이 켜져 있을 때만 속지 입력으로 받는다
        if (study.normalizePlanner(value).options.snap) { const text = study.plannerTapText(o, points, settings, objects); if (text) return text }
        const planner = study.applyPlannerStroke(value, o, points, settings)
        return planner ? { planner } : null
      },
      erase: (value, points, mode) => study.erasePlanner(value, o, points, mode),
      textSlot: point => study.plannerTextSlot(o, point),
      titles: () => null, cellTap: () => null, nowLine: () => null, autoColor: () => null,
      editTap: (value, point, objects, markColor) => study.plannerEditTap(o, point, value, markColor),
      // 색 칸: 지금 색 · 고른 색으로 바꾸기
      rowColor: (value, row) => study.normalizePlanner(value).bands[row] ?? null,
      setRowColor: (value, row, c) => study.setPlannerBand(value, row, c),
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
      // 현재 시각 줄(화면에만 그린다)을 누르거나 따라 칠한 획은 지금 시각으로 본다
      stroke: (value, points, settings, objects) => day.applyDayStroke(value, o, points, settings, objects, new Date()),
      erase: (value, points) => day.eraseDayPlanner(value, o, points, new Date()),
      textSlot: point => day.dayTextSlot(o, point),
      cellTap: point => day.dayCellTap(o, point),
      nowLine: (value, now) => day.dayNowLine(o, value, now),
      editTap: (value, point, objects, markColor) => day.dayEditTap(o, point, value, objects, markColor),
      titleAt: (point, objects) => day.dayTitleAt(o, point, objects),
      autoColor: (value, objects) => day.assignDayColors(value, o, objects),
      rowColor: (value, row) => day.normalizeDayPlanner(value).rows[row]?.color ?? null,
      setRowColor: (value, row, c) => day.setDayRowColor(value, row, c),
    }
  }
  if (route.isRoutePaperId(assetId)) {
    const o = orientationOf(assetId)
    return {
      kind: 'route', orientation: o,
      startHour: () => 6,
      normalize: route.normalizeRoutePlanner, setOptions: route.setRoutePlannerOptions,
      baseSvg: () => route.routePaperBaseSvg(o), overlaySvg: value => route.routePaperOverlaySvg(o, value), svg: value => route.routePaperSvg(o, value),
      // 노선은 기록이 없어도 기본 스타일로 덮개에 그린다. 덮개를 늘 그리게 빈 객체가 아닌 값을 돌려준다(PageBackground 는 titles 가 비면 덮개를 건너뛴다).
      titles: () => ({ route: true }),
      stroke: () => null, erase: () => null, cellTap: () => null, nowLine: () => null, autoColor: () => null, titleAt: () => null,
      // 선택 도구: "DAY n" 제목 → 번호 창, 아래 범례 → 노선 스타일 창 · 지점 추가
      editTap: (value, point) => route.routeEditTap(o, value, point),
      textSlot: (point, value) => route.routeTextSlot(o, point, value),
    }
  }
  return null
}

/**
 * 속지를 그리려면 기기에 있어야 하는 글꼴 id 들. 둘이 겹칠 수 있어 하나로 모은다.
 *  · 데일리 플래너가 막대 · 종일 칸에 비추는 글(사용자가 쓴 글)은 <text> 로 마루부리를 쓴다(dayPlanner.js deviceText).
 *    이 글은 속지 글꼴 설정과 상관없다.
 *  · 속지 글꼴을 원본(마루부리)이 아닌 것으로 고르면 인쇄 글자도 <text> 가 되므로 그 글꼴이 있어야 한다
 *    (paperFont.js swapPaperFont). 원본이면 글자 윤곽이라 글꼴 파일 없이도 그려진다.
 */
export const paperDeviceFontIds = (assetId, paperFont = null) => {
  const ids = day.isDayPlannerId(assetId) ? ['maruburi'] : []
  for (const id of paperFontIdsToLoad(paperFont)) if (!ids.includes(id)) ids.push(id)
  return ids
}
