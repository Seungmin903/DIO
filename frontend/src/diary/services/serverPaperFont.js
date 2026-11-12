// 구버전 생성 대기 요청과 게스트 가져오기의 기존 요청 형식을 재현한다.
// 새 회원 다이어리 및 페이지 저장에는 글꼴을 포함한다.
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
