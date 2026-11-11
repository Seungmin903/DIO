// 잉크 공병 **한 벌**의 모양만 — 네모 병 · 동그란 병. 그림은 pair.mjs, 메모지는 final3d.mjs 가 쓴다.
//
// 2026-11-10 사용자: "네모 완성하고 동그라미의 가로세로 비율 네모에 맞추자".
// 네모는 코덱스가 직접 그린 svg/codex-1.svg 의 각도를 그대로 쓴다(az 37° · e 0.375).
//   - 한 변 s 인 정사각 바닥을 az 만큼 돌려 보면 앞면 폭 s·cos(az), 옆면 폭 s·sin(az),
//     가로 모서리 기울기는 각각 tan(az)·e, cot(az)·e. 코덱스가 쓴 값을 역산하면 e ≈ 0.375 로 둘이 딱 맞는다.
//   - 코덱스 것에서 고친 것: 바닥 좌우 모서리 둥글리기, 목이 윗면 한가운데에 앉도록, 뚜껑 밑 호를 제대로 된 타원호로.
//     (앞 아래 모서리는 세 선이 만나는 꼭짓점이라 **날카롭게** 둔다 — 양쪽에서 둥글리면 패인다.)
//
// 동그란 병은 네모와 **같은 상자**에 들어간다:
//   지름 D = 앞면 폭 + 옆면 폭 (= 네모의 가로 전체) 로 두면
//   윗면 타원의 세로 반지름 D·e/2 가 네모의 윗면이 올라간 높이의 절반과 **자동으로 같아져서**
//   몸통 높이를 똑같이 줘도 아래 끝까지의 높이가 정확히 일치한다. 뚜껑·목은 둘이 완전히 같다.

export const n = (v) => Math.round(v * 100) / 100
export const RAD = Math.PI / 180

/** 한 벌 공통 치수(그리기 단위 — 마지막에 viewBox 140 에 맞춰 키운다) */
export const BASE = {
  az: 37, e: 0.375,      // 바닥을 돌린 각 · 눈높이 계수
  s: 74, bodyH: 60,      // 바닥 한 변 · 몸통 높이
  capRx: 22, capRy: 7, capH: 19, ribs: 9,
  neckRx: 16, neckH: 3.5, // 목은 뚜껑(22)보다 확실히 좁되 두툼하게 · 키는 반으로(사용자 2026-11-10)
  round: 5,              // 모서리 둥글리기(네모만) — 위·아래 모두
}

// ── 공통 조각 ────────────────────────────────────────────────
const step = (a, b, d) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: n(a.x + (b.x - a.x) / L * d), y: n(a.y + (b.y - a.y) / L * d) } }
/** 꼭짓점 c 를 a→c→b 방향으로 둥글린다. 선분 방향을 그대로 따라가므로 기울어진 모서리에서도 안 깨진다.
 *  mid = 둥근 호의 한가운데 — **세 선이 만나는 꼭짓점**에서 셋째 선이 여기서 출발하면 Y 자로 깔끔히 붙는다. */
const bend = (a, c, b, r) => {
  const p1 = step(c, a, r), p2 = step(c, b, r)
  return { p1, p2, mid: { x: n(0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x), y: n(0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y) },
    d: `L ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}` }
}

/** 목 + 뚜껑. yC = 윗면 한가운데 높이. 둘 다 똑같이 쓴다. */
function capStack(cx, yC, P) {
  const capRx = n(P.capRx), capRy = n(P.capRy), neckRx = n(P.neckRx)
  const { capH, neckH, ribs } = P
  const neckRy = n(neckRx * P.e)
  const parts = [], thin = []
  const neckBot = yC, neckTop = n(yC - neckH)
  // 뚜껑 아래 테두리가 목 옆선(±neckRx)과 만나는 높이에서 목이 나오게 — 틈도 겹침도 없다
  const capBot = n(neckTop - capRy * Math.sqrt(Math.max(0, 1 - (neckRx / capRx) ** 2)))
  const capTop = n(capBot - capH)
  // 목: 세로 두 선 + 앞쪽 반 타원
  parts.push(`<path d="M ${n(cx - neckRx)} ${neckTop} L ${n(cx - neckRx)} ${neckBot}` +
    ` A ${neckRx} ${neckRy} 0 0 0 ${n(cx + neckRx)} ${neckBot} L ${n(cx + neckRx)} ${neckTop}"/>`)
  // 뚜껑: 윗면 타원 + 옆선 + 앞쪽 반 타원
  parts.push(`<ellipse cx="${n(cx)}" cy="${capTop}" rx="${capRx}" ry="${capRy}"/>`)
  parts.push(`<path d="M ${n(cx - capRx)} ${capTop} L ${n(cx - capRx)} ${capBot}` +
    ` A ${capRx} ${capRy} 0 0 0 ${n(cx + capRx)} ${capBot} L ${n(cx + capRx)} ${capTop}"/>`)
  // 가는 세로 홈 — 위아래 모두 뚜껑 테두리 타원을 따라간다
  for (let i = 1; i <= ribs; i++) {
    const px = -capRx + (2 * capRx) * i / (ribs + 1)
    const dy = capRy * Math.sqrt(Math.max(0, 1 - (px / capRx) ** 2))
    thin.push(`<path d="M ${n(cx + px)} ${n(capTop + dy + 1)} L ${n(cx + px)} ${n(capBot + dy - 1)}"/>`)
  }
  return { parts, thin, top: n(capTop - capRy), capRx }
}

// ── 네모 병 ──────────────────────────────────────────────────
export function square(P = BASE) {
  const az = P.az * RAD
  const dxL = P.s * Math.cos(az), dyL = P.s * Math.sin(az) * P.e   // 앞면: 왼쪽으로 물러난다
  const dxR = P.s * Math.sin(az), dyR = P.s * Math.cos(az) * P.e   // 옆면: 오른쪽으로 물러난다
  const xF = dxL, yF = 0                                           // 앞 세로 모서리 위 끝을 원점 삼는다
  const F = { x: n(xF), y: n(yF) }
  const L = { x: n(xF - dxL), y: n(yF - dyL) }
  const R = { x: n(xF + dxR), y: n(yF - dyR) }
  const B = { x: n(L.x + dxR), y: n(L.y - dyR) }                   // 윗면 뒤 꼭짓점(뚜껑에 가린다)
  const H = P.bodyH, R0 = P.round
  const Fb = { x: F.x, y: n(F.y + H) }, Lb = { x: L.x, y: n(L.y + H) }, Rb = { x: R.x, y: n(R.y + H) }
  const yC = n((F.y + B.y) / 2)                                    // 윗면 한가운데
  const cx = n((F.x + B.x) / 2)
  const cap = capStack(cx, yC, P)

  const parts = []
  // 윗면 뒤 변이 뚜껑 기둥 뒤로 들어가는 지점(여기서 실루엣이 시작·끝난다)
  const cut = (a, b, x) => ({ x: n(x), y: n(a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x))) })
  const gL = cut(L, B, Math.max(cx - cap.capRx, L.x + R0 + 1))
  const gR = cut(B, R, Math.min(cx + cap.capRx, R.x - R0 - 1))
  // 꼭짓점 넷의 둥근 호 — 모두 **바깥 실루엣이 꺾이는 쪽**으로 잡는다
  const bL = bend(B, L, Lb, R0)          // 왼쪽 위: 뒤 변 → 세로
  const bLb = bend(L, Lb, Fb, R0)        // 왼쪽 아래
  const bFb = bend(Lb, Fb, Rb, R0)       // 앞 아래(세 선)
  const bRb = bend(Fb, Rb, R, R0)        // 오른쪽 아래
  const bR = bend(Rb, R, B, R0)          // 오른쪽 위: 세로 → 뒤 변
  const bF = bend(L, F, R, R0)           // 앞 위(세 선)
  // ── 바깥 실루엣 한 획: 뒤 변 → 왼 세로 → 바닥 → 오른 세로 → 뒤 변 ──
  parts.push(`<path d="M ${gL.x} ${gL.y} ${bL.d} ${bLb.d} ${bFb.d} ${bRb.d} ${bR.d} L ${gR.x} ${gR.y}"/>`)
  // ── 윗면 앞 두 변: 좌우 호의 한가운데에서 출발해 앞 꼭짓점에서 둥글게 꺾인다 ──
  parts.push(`<path d="M ${bL.mid.x} ${bL.mid.y} ${bF.d} L ${bR.mid.x} ${bR.mid.y}"/>`)
  // ── 앞 세로 모서리: 위아래 호의 한가운데를 잇는다 ──
  parts.push(`<path d="M ${bF.mid.x} ${bF.mid.y} L ${bFb.mid.x} ${bFb.mid.y}"/>`)

  const box = { x0: L.x, x1: R.x, y0: cap.top, y1: Fb.y }
  // 글이 모서리에 안 걸리는 가장 넓은 자리 = **앞면** 안쪽. 앞면은 세로변이 수직이고 위·아래 변이 같은 기울기라
  // 가로는 L.x~F.x, 세로는 (제일 낮은 위 변 = F) ~ (제일 높은 아래 변 = Lb) 사이가 전부 앞면 안이다.
  const inner = { x0: L.x, x1: F.x, y0: F.y, y1: Lb.y }
  return { parts: [...parts, ...cap.parts], thin: cap.thin, box, inner }
}

// ── 동그란 병 ────────────────────────────────────────────────
/** D 를 주지 않으면 네모의 가로 전체를 그대로 쓴다(= 가로·세로 둘 다 네모와 같아진다) */
export function circle(P = BASE, D = null) {
  const az = P.az * RAD
  const Dw = D ?? P.s * (Math.cos(az) + Math.sin(az))
  const rx = n(Dw / 2), ry = n(Dw * P.e / 2)
  const cx = rx, yC = 0                                            // 윗면 타원 가운데를 원점 삼는다
  // 윗면 한가운데부터 아래 끝까지의 길이를 **네모와 똑같이** 맞춘다 — 지름을 바꿔도 아래 끝이 안 움직인다
  const belowC = P.s * (Math.cos(az) + Math.sin(az)) * P.e / 2 + P.bodyH
  const H = n(belowC - ry)
  const cap = capStack(cx, yC, P)
  const parts = []
  // 윗면 타원 — 앞 반원은 통째로, 뒤 반원은 뚜껑에 가리는 가운데 구간을 뺀다
  parts.push(`<path d="M ${n(cx - rx)} ${yC} A ${rx} ${ry} 0 0 0 ${n(cx + rx)} ${yC}"/>`)
  const gx = cap.capRx
  const by = (x) => n(yC - ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)))
  parts.push(`<path d="M ${n(cx - rx)} ${yC} A ${rx} ${ry} 0 0 1 ${n(cx - gx)} ${by(-gx)}"/>`)
  parts.push(`<path d="M ${n(cx + gx)} ${by(gx)} A ${rx} ${ry} 0 0 1 ${n(cx + rx)} ${yC}"/>`)
  // 옆선 + 바닥 앞 반원
  parts.push(`<path d="M ${n(cx - rx)} ${yC} L ${n(cx - rx)} ${n(yC + H)}` +
    ` A ${rx} ${ry} 0 0 0 ${n(cx + rx)} ${n(yC + H)} L ${n(cx + rx)} ${yC}"/>`)
  const box = { x0: 0, x1: n(Dw), y0: cap.top, y1: n(yC + H + ry) }
  // 몸통 안: 위는 앞쪽 타원이 제일 처지는 가운데(yC+ry), 아래는 바닥 타원이 제일 높은 양 끝(yC+H)
  const inner = { x0: 0, x1: n(Dw), y0: n(yC + ry), y1: n(yC + H) }
  return { parts: [...parts, ...cap.parts], thin: cap.thin, box, inner }
}

// ── viewBox 140 에 맞춰 키우고 가운데로 ──────────────────────
// 두 번 그린다: 한 번 그려 상자를 재고, 치수에 배율을 곱해 **다시** 그린다.
// (변환에 scale 을 쓰면 선 굵기도 같이 늘어나 3.2 가 아니게 된다 — 좌표에 바로 먹인다.)
// 배율은 **네모 하나로 정해** 모든 병이 공유한다 → 뚜껑·목·총높이가 한 벌 내내 똑같다.
export const scaleP = (P, k) => Object.fromEntries(Object.entries(P).map(([key, v]) =>
  [key, (key === 'az' || key === 'e' || key === 'ribs') ? v : v * k]))

export const VB = 140, PAD = 8, SW0 = 1.5   // 선 굵기 — 지금 메모(2.6/220상자)보다 확실히 얇다
const K = (() => { const a = square(BASE), w = a.box.x1 - a.box.x0, h = a.box.y1 - a.box.y0
  return Math.min((VB - 2 * PAD - SW0) / w, (VB - 2 * PAD - SW0) / h) })()
const REF = square(scaleP(BASE, K)).box
const TOP = n((VB - (REF.y1 - REF.y0)) / 2)

export function fit(build, { sw = SW0, thinSw = null, over = {} } = {}) {
  const art = build(scaleP({ ...BASE, ...over }, K))
  const tx = n((VB - (art.box.x1 - art.box.x0)) / 2 - art.box.x0), ty = n(TOP - art.box.y0)
  const g = (list, width) => `<g stroke-width="${width}" transform="translate(${tx} ${ty})">${list.join('')}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" fill="none" stroke="{line}"` +
    ` stroke-linecap="round" stroke-linejoin="round">${g(art.parts, sw)}${g(art.thin, thinSw ?? n(sw * 0.56))}</svg>`
}


/** 원하는 **그린 높이**로 바로 뽑는다(메모지에 앉힐 때 쓴다).
 *  sw 는 높이에 비례시킨다 — 지금 잉크병 메모가 높이 166.7 에 선 2.6(=0.0156)이고,
 *  사용자가 2026-11-10 "훨씬 얇게" 로 정한 값이 그 0.8배인 0.0124 다. */
export const SW_RATIO = 1.5 / 120.8
export function artAt(build, height, { over = {} } = {}) {
  const P0 = { ...BASE, ...over }
  const a0 = build(P0)
  const k = height / (a0.box.y1 - a0.box.y0)
  const art = build(scaleP(P0, k))
  return { ...art, w: n(art.box.x1 - art.box.x0), h: n(art.box.y1 - art.box.y0),
    sw: n(height * SW_RATIO), thinSw: n(height * SW_RATIO * 0.56) }
}
/** 왼쪽 위 (x, y) 에 앉힌 <g> 두 개 */
export function place(art, x, y) {
  const tx = n(x - art.box.x0), ty = n(y - art.box.y0)
  const g = (list, w) => `<g fill="none" stroke="{line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${tx} ${ty})">${list.join('')}</g>`
  return g(art.parts, art.sw) + g(art.thin, art.thinSw)
}
