// 서버(회원 다이어리, 머지된 다이어리 생성 API)는 속지 설정의 글꼴(paperAppearance.font)을 받지 않는다. 보내면 400(Invalid appearance)으로 생성이 막힌다.
// 머지된 서버 계약은 그대로 두고, 서버로 가는 값에서만 글꼴을 뺀다(종이 색 · 선 색은 그대로). 게스트(기기 저장)는 글꼴을 그대로 쓴다.
// 회원 새 다이어리는 빈 페이지 한 장으로 시작해 글꼴 칸도 없다(DiaryCreateModal plainOnly). 서버가 font 를 받게 되면 SERVER_PAPER_FONT 를 true 로.
export const SERVER_PAPER_FONT = false

/** 서버로 보낼 속지 모양: 글꼴을 뺀다. 남는 값이 없으면 undefined. */
export function serverPaperAppearance(appearance) {
  if (!appearance || typeof appearance !== 'object' || SERVER_PAPER_FONT || !('font' in appearance)) return appearance
  const { font, ...rest } = appearance
  return Object.keys(rest).length ? rest : undefined
}

const withAppearance = (config) => {
  if (!config || typeof config !== 'object' || !config.paperAppearance) return config
  const paperAppearance = serverPaperAppearance(config.paperAppearance)
  const { paperAppearance: _, ...rest } = config
  return paperAppearance ? { ...rest, paperAppearance } : rest
}

/** 회원 다이어리 생성 입력(diaryCreateInput 결과)에서 서버가 모르는 글꼴을 모두 뺀다. 화면의 새 다이어리도 같은 값으로 만들어 기기와 서버가 어긋나지 않는다. */
export function serverDiaryCreateInput(input) {
  if (SERVER_PAPER_FONT || !input) return input
  const next = { ...input, templateConfig: withAppearance(input.templateConfig) }
  if (input.paperAppearance) {
    const paperAppearance = serverPaperAppearance(input.paperAppearance)
    if (paperAppearance) next.paperAppearance = paperAppearance
    else delete next.paperAppearance
  }
  if (Array.isArray(input.initialPages)) next.initialPages = input.initialPages.map(page => ({ ...page, templateConfig: withAppearance(page.templateConfig) }))
  return next
}
