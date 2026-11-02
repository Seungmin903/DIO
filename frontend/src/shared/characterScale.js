// 모아 · 디오 키 비율. 기준은 docs/캐릭터 디자인/최종시안 svg 변경본.svg(먹선 포함): 모아 2153 : 디오 2475 → 모아 키 = 디오의 약 87%.
// 두 그림 파일의 먹선 높이는 moa.png 402px · dio.png 383px(폭 360 기준)라 같은 폭으로 그리면 디오가 더 작게 나온다.
// 모아를 기준(1)으로 두고 디오를 이 배율만큼 키워 그린다.
export const MOA_KEY = 2153
export const DIO_KEY = 2475
export const MOA_INK_HEIGHT = 402
export const DIO_INK_HEIGHT = 383

export const CHARACTER_SCALE = Object.freeze({ moa: 1, dio: (DIO_KEY / MOA_KEY) * (MOA_INK_HEIGHT / DIO_INK_HEIGHT) })
