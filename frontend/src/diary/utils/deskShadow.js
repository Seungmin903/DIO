// 다이어리 표지가 책상에 드리우는 그림자. 코덱스가 자연스러운 그림자(접촉 · 중심 · 반그림자 세 겹, 하늘빛을 머금은 색)를 조사해 시간대별로 설계했다.
// 세 겹: contact(책이 책상에 닿은 가장자리의 접지 그림자, 가장 진하고 짧다) · core(중심 드리운 그림자) · penumbra(멀수록 퍼지고 옅어지며 표지보다 좁은 반그림자).
// 각 겹은 [dx, dy, blur, spread, alpha](px)이고, large 는 스와이프(보이는 폭 약 380px) · small 은 한눈에(약 170px) 표지용이다.
// 색은 낮에는 하늘빛 푸른 보라, 해 질 녘에는 절제된 모브, 밤에는 낮은 대비의 청회색이다. at 이 5 · 29 인 줄은 밤 값이다(밤 → 새벽에 서서히 이어진다).
const PROFILES = [
  { at: 5, rgb: [67, 84, 112], large: { contact: [0.4, 0.1, 3, -1, 0.071], core: [1.7, 0.6, 9, -2, 0.023], penumbra: [3.2, 1.1, 18, -7, 0.014] }, small: { contact: [0.2, 0, 1.5, -0.5, 0.071], core: [0.8, 0.3, 4, -0.9, 0.023], penumbra: [1.4, 0.5, 8, -3.1, 0.014] } },
  { at: 6.5, rgb: [109, 83, 96], large: { contact: [1.7, 0.4, 3.5, -1.5, 0.205], core: [8.1, 1.7, 14, -4, 0.112], penumbra: [14.7, 3.2, 34, -13, 0.068] }, small: { contact: [0.8, 0.2, 2, -0.7, 0.205], core: [3.6, 0.8, 6.3, -1.8, 0.112], penumbra: [6.6, 1.4, 15.2, -5.8, 0.068] } },
  { at: 8, rgb: [91, 96, 124], large: { contact: [1.3, 0.4, 3.5, -1.5, 0.188], core: [6.4, 1.7, 12, -3.5, 0.094], penumbra: [11.6, 3.2, 28, -11, 0.056] }, small: { contact: [0.6, 0.2, 2, -0.7, 0.188], core: [2.9, 0.8, 5.4, -1.6, 0.094], penumbra: [5.2, 1.4, 12.5, -4.9, 0.056] } },
  { at: 10, rgb: [92, 100, 123], large: { contact: [0.6, 0.2, 3, -1.2, 0.17], core: [2.9, 1.2, 9, -2, 0.075], penumbra: [5.3, 2.1, 20, -8, 0.045] }, small: { contact: [0.3, 0.1, 1.5, -0.5, 0.17], core: [1.3, 0.5, 4, -0.9, 0.075], penumbra: [2.3, 0.9, 9, -3.6, 0.045] } },
  { at: 12, rgb: [95, 103, 126], large: { contact: [0, 0.1, 3, -1, 0.156], core: [0, 0.6, 8, -1.5, 0.06], penumbra: [0, 1.1, 16, -6, 0.036] }, small: { contact: [0, 0, 1.5, -0.5, 0.156], core: [0, 0.3, 3.6, -0.7, 0.06], penumbra: [0, 0.5, 7.2, -2.7, 0.036] } },
  { at: 15, rgb: [92, 100, 123], large: { contact: [-0.6, 0.2, 3, -1.2, 0.17], core: [-2.9, 1.2, 9, -2, 0.075], penumbra: [-5.3, 2.1, 20, -8, 0.045] }, small: { contact: [-0.3, 0.1, 1.5, -0.5, 0.17], core: [-1.3, 0.5, 4, -0.9, 0.075], penumbra: [-2.3, 0.9, 9, -3.6, 0.045] } },
  { at: 17.5, rgb: [117, 91, 101], large: { contact: [-1.4, 0.4, 3.5, -1.5, 0.197], core: [-7, 1.7, 13.5, -3.5, 0.109], penumbra: [-12.6, 3.2, 32, -12, 0.065] }, small: { contact: [-0.6, 0.2, 2, -0.7, 0.197], core: [-3.1, 0.8, 6, -1.6, 0.109], penumbra: [-5.6, 1.4, 14.3, -5.4, 0.065] } },
  { at: 19, rgb: [126, 97, 111], large: { contact: [-1.7, 0.4, 3.5, -1.5, 0.149], core: [-8.1, 1.7, 16, -4.5, 0.052], penumbra: [-14.7, 3.2, 38, -14, 0.032] }, small: { contact: [-0.8, 0.2, 2, -0.7, 0.149], core: [-3.6, 0.8, 7.2, -2, 0.052], penumbra: [-6.6, 1.4, 17, -6.3, 0.032] } },
  { at: 23, rgb: [67, 84, 112], large: { contact: [0.4, 0.1, 3, -1, 0.071], core: [1.7, 0.6, 9, -2, 0.023], penumbra: [3.2, 1.1, 18, -7, 0.014] }, small: { contact: [0.2, 0, 1.5, -0.5, 0.071], core: [0.8, 0.3, 4, -0.9, 0.023], penumbra: [1.4, 0.5, 8, -3.1, 0.014] } },
  { at: 29, rgb: [67, 84, 112], large: { contact: [0.4, 0.1, 3, -1, 0.071], core: [1.7, 0.6, 9, -2, 0.023], penumbra: [3.2, 1.1, 18, -7, 0.014] }, small: { contact: [0.2, 0, 1.5, -0.5, 0.071], core: [0.8, 0.3, 4, -0.9, 0.023], penumbra: [1.4, 0.5, 8, -3.1, 0.014] } },
]

const mix = (a, b, t) => a + (b - a) * t
const mixList = (a, b, t) => a.map((value, index) => mix(value, b[index], t))

// 밤에 가로등이 켜져 있으면 읽히는 그림자 방향은 가로등이 정한다: 오른쪽 위 광원에서 왼쪽 아래로(코덱스 점검 L03 · 밤 기하).
// 세 겹 모두 같은 벡터의 배수이고, 알파는 contact 0.12 · core 0.045 · penumbra 0.02 로 옅다. 달 그림자는 가로등이 있으면 거의 묻힌다.
const LAMP_SHADOW = { vector: [-15, 9], rgb: [67, 84, 112], layers: { contact: [0.12, 3, -1, 0.12], core: [0.58, 9, -2, 0.045], penumbra: [1.05, 18, -7, 0.02] } }

// 책이 책상에 앉아 보이도록 접지 · 중심 · 반그림자를 키운다(코덱스 최종값). 옆 카드는 카드 전체가 transform 으로 줄어 그림자도 같이 줄어든다.
const GROUND = {
  big: { alpha: { contact: 1.32, core: 1.1, penumbra: 1.05 }, blur: { contact: 0, core: 2, penumbra: 4 } },
  small: { alpha: { contact: 1.22, core: 1.05, penumbra: 1 }, blur: { contact: 0, core: 1, penumbra: 2 } },
}

/**
 * 시각(0 ≤ h < 24) → 표지 그림자 box-shadow 문자열. big 이면 스와이프 표지, 아니면 한눈에 표지. lamp(0~1)는 가로등 세기.
 * size 는 그 프로필이 기준으로 삼은 표지 폭보다 큰(작은) 물건에 길이 · 퍼짐만 같은 비율로 키운다(진하기는 그대로). 펼쳐서의 책이 쓴다.
 */
export function coverShadowAt(h, big, lamp = 0, size = 1) {
  const t = h < 5 ? h + 24 : h
  const next = PROFILES.findIndex(profile => profile.at > t)
  const to = PROFILES[next < 0 ? PROFILES.length - 1 : next]
  const from = PROFILES[next < 0 ? PROFILES.length - 1 : Math.max(0, next - 1)]
  const k = to.at === from.at ? 0 : (t - from.at) / (to.at - from.at)
  const rgb = mixList(from.rgb, to.rgb, k).map(Math.round).join(',')
  const key = big ? 'large' : 'small'
  const lampWeight = Math.max(0, Math.min(1, (lamp - 0.3) / 0.4))
  const scale = big ? 1 : 170 / 380
  return ['contact', 'core', 'penumbra'].map(layer => {
    let [dx, dy, blur, spread, alpha] = mixList(from[key][layer], to[key][layer], k)
    if (lampWeight > 0) {
      const [multiple, lampBlur, lampSpread, lampAlpha] = LAMP_SHADOW.layers[layer]
      const lampLayer = [LAMP_SHADOW.vector[0] * multiple * scale, LAMP_SHADOW.vector[1] * multiple * scale, lampBlur * scale, lampSpread * scale, lampAlpha]
      ;[dx, dy, blur, spread, alpha] = mixList([dx, dy, blur, spread, alpha], lampLayer, lampWeight)
    }
    const ground = GROUND[big ? 'big' : 'small']
    blur += ground.blur[layer]
    alpha *= ground.alpha[layer]
    const color = lampWeight > 0 ? mixList(rgb.split(',').map(Number), LAMP_SHADOW.rgb, lampWeight).map(Math.round).join(',') : rgb
    return `${(dx * size).toFixed(1)}px ${(dy * size).toFixed(1)}px ${(blur * size).toFixed(1)}px ${(spread * size).toFixed(1)}px rgba(${color},${alpha.toFixed(3)})`
  }).join(', ')
}
