// 모아 · 디오 그림 크기와 키 비율. 원본은 docs/캐릭터 디자인/최종/(2026-11-08): 모아 · 디오 완성 · 윤곽 SVG.
// 앱은 이 SVG 를 옮긴 벡터(shared/characterShapes · CharacterArt)로 그린다. 아래 크기는 그 viewBox 와 먹선 경계(둘레 4 여백)다.
// 키 비율은 '모아 디오 함께' 그림과 같은 모아 2153 : 디오 2475 → 모아 키 = 디오의 약 87%.
export const MOA_KEY = 2153
export const DIO_KEY = 2475

// 그림 한 장의 크기(viewBox) · 그 안의 먹선 경계(left · top · width · height)
export const CHARACTER_ART = Object.freeze({
  moa: Object.freeze({ width: 638, height: 768, ink: Object.freeze({ left: 4, top: 4, width: 630, height: 760 }) }),
  dio: Object.freeze({ width: 832, height: 805, ink: Object.freeze({ left: 4, top: 4, width: 824, height: 797 }) }),
})

// 그림 상자 높이를 같게 그렸을 때 먹선 키가 위 비율이 되도록 디오를 키우는 배율(모아 = 1).
const inkShare = art => art.ink.height / art.height
export const CHARACTER_SCALE = Object.freeze({ moa: 1, dio: (DIO_KEY / MOA_KEY) * inkShare(CHARACTER_ART.moa) / inkShare(CHARACTER_ART.dio) })
