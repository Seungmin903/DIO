# -*- coding: utf-8 -*-
"""③ 오프라인 에셋 목업 33종 — 스티커 · 테이프 · 종이 · 사진 틀 · 펜 · 재질.
시그니처 fn(W, H) -> list[str]  (W=640, H=480, 여백 32). 그리기는 목업_도형 만 쓴다.
"""
from 목업_도형 import *  # noqa: F401,F403
import math
import random

SEPIA = ("#EAE3D4", "#E8DCC8", "#D9C9A8")   # CREAM 포함 세피아 3톤
DARK = "#2B2B2B"
WHITE = "#FFFFFF"
IVORY = TAPES["ivory"][0]


# ── 비공개 도우미 ─────────────────────────────────────────────────────────
def _cap(x, y, s, anchor="start", fill=MUTED):
    return T(x, y, s, 11, fill=fill, anchor=anchor)


def _star_d(cx, cy, r):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append(f"{cx + rr * math.cos(ang):.1f},{cy + rr * math.sin(ang):.1f}")
    return "M" + " L".join(pts) + " Z"


def _heart_d(cx, cy, s):
    return (f"M{cx},{cy + s * .35} C{cx - s * 1.1},{cy - s * .45} {cx - s * .45},{cy - s * 1.05} {cx},{cy - s * .5} "
            f"C{cx + s * .45},{cy - s * 1.05} {cx + s * 1.1},{cy - s * .45} {cx},{cy + s * .35} Z")


def _sparkle_d(cx, cy, s):
    return f"M{cx},{cy - s} Q{cx},{cy} {cx + s},{cy} Q{cx},{cy} {cx},{cy + s} Q{cx},{cy} {cx - s},{cy} Q{cx},{cy} {cx},{cy - s} Z"


def _circle_d(cx, cy, r):
    return f"M{cx - r},{cy} a{r},{r} 0 1 0 {2 * r},0 a{r},{r} 0 1 0 {-2 * r},0 Z"


def _cloud_d(cx, cy, s):
    x0, yb = cx - s, cy + s * .35
    p1 = (cx - s * .45, cy - s * .3)
    p2 = (cx + s * .45, cy - s * .35)
    return (f"M{x0:.1f},{yb:.1f} A{s * .5:.1f},{s * .5:.1f} 0 0 1 {p1[0]:.1f},{p1[1]:.1f} "
            f"A{s * .55:.1f},{s * .55:.1f} 0 0 1 {p2[0]:.1f},{p2[1]:.1f} "
            f"A{s * .5:.1f},{s * .5:.1f} 0 0 1 {cx + s:.1f},{yb:.1f} "
            f"A{s * 1.6:.1f},{s * 1.6:.1f} 0 0 1 {x0:.1f},{yb:.1f} Z")


def _clip(cid, d):
    return f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'


def _stroke_sticker(d, color, sw, pad=4):
    """선으로 된 스티커(화살표 · 괄호)의 흰 테두리."""
    return G([P(d, stroke=WHITE, sw=sw + pad * 2, filt="softshadow"), P(d, stroke=color, sw=sw)])


def _flower(cx, cy, r, petal=ROSE, center=MUST, outline=False):
    pts = [(cx + r * .95 * math.cos(-math.pi / 2 + i * 2 * math.pi / 5), cy + r * .95 * math.sin(-math.pi / 2 + i * 2 * math.pi / 5)) for i in range(5)]
    g = []
    if outline:
        g += [C(px, py, r * .62, fill=WHITE, stroke=WHITE, sw=7) for px, py in pts]
    g += [C(px, py, r * .62, fill=petal, stroke="none") for px, py in pts]
    g.append(C(cx, cy, r * .5, fill=center, stroke="none"))
    return G(g, filt="softshadow" if outline else None)


def _leaf(cx, cy, rx, ry, angle, fill=SAGE, outline=False):
    g = []
    if outline:
        g.append(E(cx, cy, rx, ry, fill=WHITE, stroke=WHITE, sw=7))
    g += [E(cx, cy, rx, ry, fill=fill, stroke="none"), L(cx - rx * .8, cy, cx + rx * .8, cy, stroke=WHITE, sw=1.2, opacity=.7)]
    return G(g, transform=f"rotate({angle} {cx} {cy})", filt="softshadow" if outline else None)


def _barcode(x, y, w, h, seed=1, color=INK, opacity=None):
    rnd = random.Random(seed)
    out, cx = [], x
    while cx < x + w:
        bw = rnd.choice([1.2, 1.8, 2.6, 3.4])
        out.append(R(cx, y, bw, h, fill=color, stroke="none", opacity=opacity))
        cx += bw + rnd.choice([1.5, 2.2, 3])
    return G(out)


def _perf(x, y, w, h, step=11, r=4.5, color=PAPER):
    """우표 톱니: 가장자리를 따라 작은 원을 바탕색으로 찍는다."""
    out = []
    cx = x
    while cx <= x + w + 0.1:
        out += [C(cx, y, r, fill=color, stroke="none"), C(cx, y + h, r, fill=color, stroke="none")]; cx += step
    cy = y
    while cy <= y + h + 0.1:
        out += [C(x, cy, r, fill=color, stroke="none"), C(x + w, cy, r, fill=color, stroke="none")]; cy += step
    return G(out)


def _lace_strip(x, y, w, h, fill=WHITE, opacity=.9, r=8):
    n = max(1, int(w / (2 * r))); r = w / (2 * n)
    top = " ".join(f"A{r:.1f},{r:.1f} 0 0 1 {x + 2 * r * (i + 1):.1f},{y + r:.1f}" for i in range(n))
    bot = " ".join(f"A{r:.1f},{r:.1f} 0 0 1 {x + w - 2 * r * (i + 1):.1f},{y + h - r:.1f}" for i in range(n))
    d = f"M{x},{y + r:.1f} {top} V{y + h - r:.1f} {bot} Z"
    g = [P(d, fill=fill, stroke="#E6E0D4", sw=1, opacity=opacity)]
    for i in range(n):
        cx = x + r + 2 * r * i
        g.append(C(cx, y + h / 2, 3.2, fill="none", stroke=LINE, sw=1.2))
        if i % 2 == 0:
            g += [C(cx, y + r + 5, 1.6, fill=LINE, stroke="none"), C(cx, y + h - r - 5, 1.6, fill=LINE, stroke="none")]
    return G(g)


def _tile(cx, cy, s, ch, cls, bg, rot, color, size, circle_color=None):
    g = [R(cx - s / 2, cy - s / 2, s, s, fill=bg, stroke="#E6E0D4", rx=6, filt="softshadow")]
    if circle_color:
        g.append(C(cx, cy, s * .38, fill=circle_color, stroke="none"))
    g.append(T(cx, cy + size * .36, ch, size, cls=cls, fill=color, anchor="middle", weight=800 if cls == "l" else (700 if cls == "m" else None)))
    return G(g, transform=f"rotate({rot:.1f} {cx} {cy})")


def _wave_pts(x0, x1, y0, amp, cycles, n=56):
    return [(x0 + (x1 - x0) * i / n, y0 + amp * math.sin(2 * math.pi * cycles * i / n)) for i in range(n + 1)]


def _pts_d(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)


def _bezier(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def _taper(pts, wmax, prof="mid", fill=INK):
    """붓 획: 점 목록을 따라 굵기가 변하는 다각형."""
    n = len(pts); left, right = [], []
    for i, (x, y) in enumerate(pts):
        t = i / (n - 1)
        if prof == "mid": w = wmax * (math.sin(math.pi * t) ** .8)
        elif prof == "fade": w = wmax * ((1 - t) ** .9)
        else: w = wmax * (t ** .9)
        w = max(w, 1.0)
        x0, y0 = pts[max(i - 1, 0)]; x1, y1 = pts[min(i + 1, n - 1)]
        dx, dy = x1 - x0, y1 - y0; ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        left.append((round(x + nx * w / 2, 1), round(y + ny * w / 2, 1))); right.append((round(x - nx * w / 2, 1), round(y - ny * w / 2, 1)))
    return poly(left + right[::-1], fill=fill, stroke=fill, sw=.6)


def _repeat_text(x, y, w, h, word, size, cls, color, cid, sep=" · ", cursor=False, count=None):
    """테이프 폭을 채우도록 글자를 반복(클립)."""
    def est(s): return sum(size * (1.0 if ord(ch) > 0x2E80 else .62) for ch in s)
    if count is None:
        s = word
        while est(s) < w + 40 and len(s) < 300: s += sep + word
    else:
        s = sep.join([word] * count)
    g = [clip_rect(cid, x, y, w, h), G([T(x + 12, y + h / 2 + size * .36, s, size, cls=cls, fill=color, weight=700)], clip=cid)]
    if cursor:
        ex = x + 12 + est(s) + 4
        g.append(L(ex, y + 6, ex, y + h - 6, stroke=PEN, sw=2))
    return G(g)


def _tag(x, y, w, h, fill, rot=0):
    pts = [(x, y + h / 2), (x + h / 2, y), (x + w, y), (x + w, y + h), (x + h / 2, y + h)]
    g = [poly(pts, fill=fill, stroke=LINE, sw=1), C(x + h / 2, y + h / 2, 4.5, fill=PAPER, stroke=LINE),
         P(f"M{x + h / 2},{y + h / 2} q-28,-18 -34,-40", stroke=MUTED, sw=1.2)]
    return G(g, transform=f"rotate({rot} {x + w / 2} {y + h / 2})", filt="softshadow")


def _zigzag_rect_d(x, y, w, h, tooth=10, depth=5):
    n = max(1, int(w / tooth)); tooth = w / n
    top = " ".join(f"L{x + tooth * (i + .5):.1f},{y + depth} L{x + tooth * (i + 1):.1f},{y}" for i in range(n))
    bot = " ".join(f"L{x + w - tooth * (i + .5):.1f},{y + h - depth} L{x + w - tooth * (i + 1):.1f},{y + h}" for i in range(n))
    return f"M{x},{y} {top} V{y + h} {bot} Z"


def _bg_strip(x, y, w, h, kind, angle, cid, opacity=.8):
    items = []
    if kind == "cloud":
        items.append(R(x, y, w, h, fill=TAPES["sky"][0], stroke="none"))
        for i in range(int(w / 90) + 1):
            cx = x + 40 + i * 90; cy = y + h / 2 + (5 if i % 2 else -3)
            items += [C(cx - 12, cy + 4, 9, fill=WHITE, stroke="none"), C(cx, cy - 3, 12, fill=WHITE, stroke="none"),
                      C(cx + 13, cy + 4, 9, fill=WHITE, stroke="none"), R(cx - 16, cy + 4, 32, 9, fill=WHITE, stroke="none", rx=4)]
    elif kind == "brick":
        bg, fg = TAPES["kraft"]; items.append(R(x, y, w, h, fill=bg, stroke="none"))
        bh = h / 3; bw = 30
        for r in range(3):
            cx = x - bw + (bw / 2 if r % 2 else 0)
            while cx < x + w:
                items.append(R(cx + 1.5, y + r * bh + 1.5, bw - 3, bh - 3, fill=fg, stroke="none", opacity=.35, rx=1)); cx += bw
    elif kind == "grass":
        bg, fg = TAPES["mint"]; items.append(R(x, y, w, h, fill=bg, stroke="none"))
        rnd = random.Random(5); gx = x + 6
        while gx < x + w:
            hgt = rnd.uniform(h * .35, h * .85); lean = rnd.uniform(-9, 9)
            items.append(P(f"M{gx:.1f},{y + h} q{lean / 2:.1f},{-hgt * .6:.1f} {lean:.1f},{-hgt:.1f}", stroke=fg, sw=1.8)); gx += rnd.uniform(6, 11)
    elif kind == "wave":
        bg, fg = TAPES["sky"]; items.append(R(x, y, w, h, fill=bg, stroke="none"))
        for j in range(3):
            items.append(P(_pts_d(_wave_pts(x - 10, x + w + 10, y + h * (j + 1) / 4, 4, w / 60)), stroke=fg, sw=1.6, opacity=.7))
    return G([clip_rect(cid, x, y, w, h), G(items, clip=cid)], transform=f"rotate({angle} {x + w / 2} {y + h / 2})", opacity=opacity)


# 테마 아이콘(선 1.8 · 둥근 끝)
def _ik(d):
    return P(d, stroke=INK, sw=1.8)


def _ic_cup(cx, cy):
    return [_ik(f"M{cx - 14},{cy - 10} h26 l-3,26 h-20 z"), _ik(f"M{cx + 12},{cy - 4} a7,7 0 0 1 0,14"),
            _ik(f"M{cx - 6},{cy - 16} q2,-4 0,-8"), _ik(f"M{cx + 2},{cy - 16} q2,-4 0,-8")]


def _ic_bread(cx, cy):
    return [_ik(f"M{cx - 16},{cy + 16} V{cy - 4} A8,8 0 0 1 {cx - 8},{cy - 14} A10,8 0 0 1 {cx + 8},{cy - 14} A8,8 0 0 1 {cx + 16},{cy - 4} V{cy + 16} Z"),
            _ik(f"M{cx - 10},{cy + 10} V{cy} A6,6 0 0 1 {cx - 4},{cy - 7} A7,6 0 0 1 {cx + 4},{cy - 7} A6,6 0 0 1 {cx + 10},{cy} V{cy + 10} Z")]


def _ic_sun(cx, cy):
    g = [C(cx, cy, 9, stroke=INK, sw=1.8)]
    for i in range(8):
        a = i * math.pi / 4
        g.append(L(cx + 13 * math.cos(a), cy + 13 * math.sin(a), cx + 18 * math.cos(a), cy + 18 * math.sin(a), stroke=INK, sw=1.8))
    return g


def _ic_umbrella(cx, cy):
    return [_ik(f"M{cx - 20},{cy + 2} A20,20 0 0 1 {cx + 20},{cy + 2}"),
            _ik(f"M{cx - 20},{cy + 2} a6.7,6 0 0 0 13.3,0 a6.7,6 0 0 0 13.4,0 a6.7,6 0 0 0 13.3,0"),
            _ik(f"M{cx},{cy + 2} v18 a5,5 0 0 1 -10,0"), L(cx, cy - 18, cx, cy - 21, stroke=INK, sw=1.8)]


def _ic_pencil(cx, cy):
    return [_ik(f"M{cx - 16},{cy + 10} l20,-20 l6,6 l-20,20 z"), _ik(f"M{cx - 16},{cy + 10} l-3,9 l9,-3"),
            L(cx - 12.5, cy + 6.5, cx - 6.5, cy + 12.5, stroke=INK, sw=1.8)]


def _ic_book(cx, cy):
    return [_ik(f"M{cx},{cy - 10} q-10,-6 -20,-2 v24 q10,-4 20,2 q10,-6 20,-2 v-24 q-10,-4 -20,2 z"), L(cx, cy - 10, cx, cy + 14, stroke=INK, sw=1.8)]


def _ic_dumbbell(cx, cy):
    return [L(cx - 10, cy, cx + 10, cy, stroke=INK, sw=1.8), R(cx - 18, cy - 10, 6, 20, stroke=INK, sw=1.8, rx=1.5), R(cx - 12, cy - 7, 4, 14, stroke=INK, sw=1.8, rx=1),
            R(cx + 8, cy - 7, 4, 14, stroke=INK, sw=1.8, rx=1), R(cx + 12, cy - 10, 6, 20, stroke=INK, sw=1.8, rx=1.5)]


def _ic_shoe(cx, cy):
    return [_ik(f"M{cx - 22},{cy + 12} h42 a5,5 0 0 0 1,-9 l-13,-5 l-7,-9 h-14 q-6,10 -9,23 z"), L(cx - 20, cy + 6, cx + 18, cy + 6, stroke=INK, sw=1.8),
            L(cx - 7, cy - 6, cx - 2, cy - 1, stroke=INK, sw=1.8), L(cx - 11, cy - 2, cx - 6, cy + 2, stroke=INK, sw=1.8)]


def _ic_lightstick(cx, cy):
    return [C(cx, cy - 9, 10, stroke=INK, sw=1.8), R(cx - 4, cy + 1, 8, 20, stroke=INK, sw=1.8, rx=3),
            L(cx - 17, cy - 19, cx - 14, cy - 16, stroke=INK, sw=1.8), L(cx + 17, cy - 19, cx + 14, cy - 16, stroke=INK, sw=1.8), L(cx, cy - 25, cx, cy - 22, stroke=INK, sw=1.8)]


def _ic_heartstick(cx, cy):
    return [P(_heart_d(cx, cy - 6, 12), stroke=INK, sw=1.8), L(cx, cy + 0, cx, cy + 20, stroke=INK, sw=1.8), L(cx - 6, cy + 20, cx + 6, cy + 20, stroke=INK, sw=1.8)]


def _ic_plane(cx, cy):
    return [_ik(f"M{cx - 20},{cy + 10} L{cx + 20},{cy - 12} L{cx - 2},{cy + 12} L{cx - 6},{cy + 2} Z"), L(cx - 6, cy + 2, cx + 20, cy - 12, stroke=INK, sw=1.8)]


def _ic_pin(cx, cy):
    return [_ik(f"M{cx},{cy + 20} c-10,-13 -13,-18 -13,-25 a13,13 0 0 1 26,0 c0,7 -3,12 -13,25 z"), C(cx, cy - 5, 5, stroke=INK, sw=1.8)]


# ── 스티커 ────────────────────────────────────────────────────────────────
def a_deco(W, H):
    g = asset_bg(W, H, "paper")
    g.append(sticker_sheet(50, 44, 540, 336))
    cols = [104, 212, 320, 428, 536]; rows = [100, 212, 324]
    x, y = cols[0], rows[0]; g.append(sticker_outline(_star_d(x, y, 30), MUST))
    x, y = cols[1], rows[0]; g.append(sticker_outline(_heart_d(x, y + 4, 30), ROSE))
    x, y = cols[2], rows[0]; g.append(sticker_outline(_sparkle_d(x, y, 32), PERI))
    x, y = cols[3], rows[0]; g.append(G([ribbon(x, y, 56, 20, LAV)], filt="softshadow"))
    x, y = cols[4], rows[0]; g.append(sticker_outline(_cloud_d(x, y, 34), TAPES["sky"][1]))
    x, y = cols[0], rows[1]; g.append(_stroke_sticker(f"M{x - 30},{y} H{x + 30} M{x + 16},{y - 12} L{x + 30},{y} L{x + 16},{y + 12}", CHAR, 4))
    x, y = cols[1], rows[1]; g.append(_stroke_sticker(f"M{x - 12},{y - 28} a10,10 0 0 0 -10,10 v36 a10,10 0 0 0 10,10 M{x + 12},{y - 28} a10,10 0 0 1 10,10 v36 a10,10 0 0 1 -10,10", CHAR, 3.5))
    x, y = cols[2], rows[1]; g += [P(f"M{x - 36},{y} H{x + 36}", stroke=WHITE, sw=12, filt="softshadow"), P(f"M{x - 36},{y} H{x + 36}", stroke=MUST, sw=4, dash="9 8")]
    x, y = cols[3], rows[1]; g.append(_flower(x, y, 22, ROSE, MUST, outline=True))
    x, y = cols[4], rows[1]; g.append(_leaf(x, y, 30, 14, -35, SAGE, outline=True))
    x, y = cols[0], rows[2]; g += [sticker_outline(_star_d(x - 16, y + 8, 17), MUST), sticker_outline(_star_d(x + 14, y - 10, 12), MUST), sticker_outline(_star_d(x + 18, y + 16, 8), MUST)]
    x, y = cols[1], rows[2]; g += [sticker_outline(_heart_d(x - 10, y + 6, 22), ROSE), sticker_outline(_heart_d(x + 16, y - 8, 15), LAV)]
    x, y = cols[2], rows[2]; g.append(_flower(x, y, 22, LAV, WHITE, outline=True))
    x, y = cols[3], rows[2]; g.append(_stroke_sticker(f"M{x - 34},{y} q8,-12 16,0 t16,0 t16,0 t16,0", PERI, 4))
    x, y = cols[4], rows[2]; g.append(_stroke_sticker(f"M{x - 14},{y - 14} L{x + 14},{y + 14} M{x + 14},{y - 14} L{x - 14},{y + 14}", ROSE, 5))
    g.append(_cap(50, 410, "단색 → 톤온톤 자동 · 흰 테두리 씰 옵션"))
    g.append(_cap(372, 410, "팔레트 →"))
    for i, col in enumerate([MUST, ROSE, PERI, SAGE, LAV]):
        g.append(star(448 + i * 32, 406, 11, fill=col))
    return g


def a_writable(W, H):
    g = asset_bg(W, H, "paper")
    g += [R(50, 56, 150, 70, fill=CREAM, stroke="none", rx=4, filt="softshadow"), hand(64, 88, "오늘 할 일", 22), hand(64, 114, "□ 빨래  □ 일기", 18),
          R(220, 56, 170, 70, fill=TAPES["pink"][0], stroke="none", rx=22, filt="softshadow"), hand(305, 98, "소금빵 사기!", 24, anchor="middle"),
          P(_cloud_d(126, 180, 72), fill=TAPES["sky"][0], stroke="none", filt="softshadow"), hand(126, 190, "비 와서 집콕", 20, anchor="middle"),
          speech(220, 148, 170, 58, "같이 가자 ~", fill=WHITE, size=22),
          P(torn_rect_path(50, 240, 170, 76, 6, 3), fill=TAPES["butter"][0], stroke="none", filt="softshadow"), hand(66, 272, "메모 메모", 22), hand(66, 300, "10.25 토", 18, MUTED),
          R(240, 258, 150, 36, fill=TAPES["mint"][0], stroke="none", rx=18, filt="softshadow"), C(258, 276, 5, fill=PAPER, stroke=TAPES["mint"][1]), hand(272, 284, "DONE ✓", 22, TAPES["mint"][1]),
          R(50, 338, 340, 92, fill=PAPERS[1], stroke="none", rx=6, filt="softshadow"), R(50, 338, 340, 44, stroke=MUTED, dash="4 4", rx=6, opacity=.7),
          hand(64, 366, "처음엔 한 줄이었는데", 20), hand(64, 392, "글을 더 쓰니 스티커가 아래로 자란다", 20),
          _cap(380, 422, "글이 길면 스티커가 자란다 ↓", anchor="end")]
    for i in (2, 1, 0):
        g.append(R(432 + i * 4, 60 + i * 4, 150, 190, fill=WHITE if i == 0 else IVORY, stroke=LINE, rx=3, filt="softshadow" if i == 0 else None))
    g += [R(432, 60, 150, 16, fill=TAPES["pink"][0], stroke="none", rx=3), lines(440, 84, 134, 150, 26, LINE2),
          hand(446, 108, "장보기", 20), hand(446, 134, "우유 · 계란", 18), hand(446, 160, "소금빵 ×4", 18), hand(446, 186, "휴지", 18),
          _cap(507, 270, "떡메 · 한 장씩 뜯는다", anchor="middle")]
    jag = " ".join(f"l8,{-5 if i % 2 == 0 else 4}" for i in range(16))
    g += [G([P(f"M440,302 {jag} V378 H440 Z", fill=WHITE, stroke=LINE, filt="softshadow"), hand(456, 342, "뜯어서 붙임", 20), lines(448, 318, 112, 50, 26, LINE2)],
             transform="rotate(-4 510 340)"), tape(486, 290, 60, 16, "mint", -6)]
    return g


def a_letters(W, H):
    rnd = random.Random(11)
    g = asset_bg(W, H, "paper")
    g.append(sticker_sheet(50, 44, 540, 352))
    for lab, y in [("둥근", 108), ("레트로 타자", 220), ("손글씨", 332)]:
        g.append(_cap(66, y + 4, lab))
    bgs = [TAPES["pink"][0], TAPES["butter"][0], TAPES["mint"][0], TAPES["sky"][0], TAPES["lavender"][0]]
    for i, ch in enumerate("다꾸하루♡"):
        g.append(_tile(196 + i * 78, 108, 64, ch, "l", WHITE, rnd.uniform(-6, 6), INK, 32, circle_color=bgs[i]))
    for i, ch in enumerate("DIARY"):
        g.append(_tile(196 + i * 78, 220, 64, ch, "m", IVORY, rnd.uniform(-6, 6), CHAR, 36))
    for i, ch in enumerate("2026!"):
        g.append(_tile(196 + i * 78, 332, 64, ch, "h", WHITE, rnd.uniform(-6, 6), PEN, 46))
    g.append(_cap(50, 424, "한글 · 알파벳 · 숫자 낱자 · 기울기 랜덤 ±6°"))
    return g


def a_labels(W, H):
    g = asset_bg(W, H, "paper")
    bg, fg = TAPES["butter"]
    g += [C(96, 104, 42, fill=bg, stroke=fg, sw=1.5, filt="softshadow"), C(96, 104, 15, fill=PAPER, stroke=LINE),
          R(118, 90, 210, 28, fill=WHITE, stroke=fg, sw=1.5, rx=4), L(228, 90, 228, 118, stroke=fg, dash="3 3"),
          T(173, 109, "TODO", 14, cls="m", fill=INK, anchor="middle", weight=700), T(278, 109, "오늘 꼭", 13, fill=INK, anchor="middle", weight=700),
          R(118, 128, 100, 26, fill=TAPES["pink"][0], stroke="none", rx=13), T(168, 146, "D-DAY", 13, cls="m", fill=CHAR, anchor="middle", weight=700),
          R(228, 128, 110, 26, fill=TAPES["mint"][0], stroke="none", rx=4), T(283, 146, "IMPORTANT", 12, cls="m", fill=CHAR, anchor="middle", weight=700),
          _cap(60, 176, "롤 라벨")]
    for i, key in enumerate(["pink", "butter", "mint", "sky", "lavender", "kraft", "ivory"]):
        b, f = TAPES[key]; x, y, w, h = 372 + i * 32, 56, 26, 80
        g.append(poly([(x, y), (x + w, y), (x + w, y + h - 12), (x + w / 2, y + h), (x, y + h - 12)], fill=b, stroke=f, sw=1, opacity=.95))
        if i == 3:
            g.append(T(x + w / 2, y + 36, "★", 12, fill=f, anchor="middle"))
    g.append(_cap(372, 158, "인덱스 플래그 · 색 7"))
    g += [_tag(70, 236, 170, 54, CREAM), hand(112, 270, "소금빵 3,500", 22), _tag(110, 310, 150, 48, TAPES["pink"][0], 5), T(150, 342, "NEW", 18, cls="s", fill=CHAR), _cap(60, 384, "가격표")]
    g += [R(360, 226, 230, 100, fill=WHITE, stroke=LINE, rx=6, filt="softshadow"), _barcode(380, 242, 190, 54, 3, INK),
          T(475, 316, "8 801234 567890", 11, cls="m", fill=INK, anchor="middle", ls="0.12em"), _cap(360, 346, "바코드")]
    g.append(_cap(60, 424, "글 입력 가능 · 색 7 · 정보 전달형 라벨은 한 결로"))
    return g


def a_ephemera(W, H):
    g = asset_bg(W, H, "paper")
    c0, c1, c2 = SEPIA
    # 티켓
    tk = [R(50, 62, 250, 90, fill=c1, stroke=c2, rx=6), L(230, 62, 230, 152, stroke=CHAR, dash="3 4", opacity=.5),
          C(230, 62, 6, fill=PAPER, stroke=c2), C(230, 152, 6, fill=PAPER, stroke=c2),
          T(66, 86, "ADMIT ONE", 11, cls="m", fill=MUTED, ls="0.1em"), T(66, 116, "CONCERT", 20, cls="s", fill=CHAR), T(66, 138, "2026 · 10 · 25 · 18:00", 11, cls="m", fill=MUTED),
          _barcode(242, 74, 48, 56, 2, CHAR, .7), T(266, 144, "No.0042", 11, cls="m", fill=MUTED, anchor="middle")]
    g.append(G(tk, transform="rotate(-4 175 107)", filt="softshadow"))
    # 우표
    st = [R(380, 56, 110, 132, fill=c0, stroke="none"), _perf(380, 56, 110, 132), R(392, 68, 86, 108, stroke="#B89C72", sw=1),
          P("M396,150 l22,-30 l14,14 l18,-24 l20,40", fill="none", stroke=CHAR, sw=2, opacity=.5), C(452, 96, 9, fill=MUST, stroke="none", opacity=.75),
          T(436, 170, "KOREA 430", 11, cls="s", fill=CHAR, anchor="middle")]
    g.append(G(st, transform="rotate(5 435 122)", filt="softshadow"))
    g.append(stamp(470, 170, 28, CHAR, "10.25", 11, -10))
    # 영수증
    rc = [P(_zigzag_rect_d(480, 212, 112, 188), fill=IVORY, stroke="none"),
          T(536, 238, "RECEIPT", 11, cls="m", fill=CHAR, anchor="middle", weight=700), L(490, 248, 582, 248, stroke=CHAR, dash="2 3", opacity=.5),
          T(490, 270, "아메리카노", 11, cls="m", fill=CHAR), T(582, 270, "4,500", 11, cls="m", fill=CHAR, anchor="end"),
          T(490, 290, "소금빵", 11, cls="m", fill=CHAR), T(582, 290, "3,800", 11, cls="m", fill=CHAR, anchor="end"),
          L(490, 304, 582, 304, stroke=CHAR, dash="2 3", opacity=.5),
          T(490, 326, "TOTAL", 11, cls="m", fill=CHAR, weight=700), T(582, 326, "8,300", 11, cls="m", fill=CHAR, anchor="end", weight=700),
          _barcode(498, 342, 76, 24, 6, CHAR, .7), T(536, 386, "감사합니다", 11, cls="m", fill=MUTED, anchor="middle")]
    g.append(G(rc, transform="rotate(3 536 306)", filt="softshadow"))
    # 신문 조각
    rnd = random.Random(8)
    np_ = [P(torn_rect_path(60, 236, 270, 165, 7, 4), fill=c1, stroke="none", opacity=.96), T(80, 266, "THE DAILY", 18, cls="s", fill=CHAR), L(80, 274, 300, 274, stroke=CHAR, sw=1, opacity=.6)]
    for col in (80, 196):
        yy = 290
        while yy < 392:
            np_.append(L(col, yy, col + rnd.uniform(70, 104), yy, stroke=CHAR, sw=2.2, opacity=.22)); yy += 8
    np_ += [L(188, 284, 188, 392, stroke=CHAR, sw=.8, opacity=.4), R(196, 330, 100, 46, fill=c2, stroke="none")]
    g.append(G(np_, transform="rotate(2 195 318)", filt="softshadow"))
    # 작은 우표 · 겹침
    s2 = [R(300, 196, 60, 72, fill=c2, stroke="none"), _perf(300, 196, 60, 72, 9, 3.5), R(308, 204, 44, 56, stroke="#B89C72", sw=.8), heart(330, 232, 10, fill=ROSE, opacity=.8)]
    g.append(G(s2, transform="rotate(-8 330 232)", filt="softshadow"))
    g.append(_cap(50, 432, "찢은 가장자리 마스크 · 세피아 톤 · 빈 칸에 글 입력"))
    return g


def a_theme_icons(W, H):
    g = asset_bg(W, H, "paper")
    sets = [("음식", _ic_cup, _ic_bread), ("날씨", _ic_sun, _ic_umbrella), ("공부", _ic_pencil, _ic_book),
            ("운동", _ic_dumbbell, _ic_shoe), ("덕질", _ic_lightstick, _ic_heartstick), ("여행", _ic_plane, _ic_pin)]
    for i, (lab, f1, f2) in enumerate(sets):
        r, c = divmod(i, 3)
        x, y = 50 + c * 184, 50 + r * 180
        g.append(R(x, y, 168, 150, fill=WHITE, stroke="#E6E0D4", rx=14, filt="softshadow"))
        g += [C(x + 50, y + 66, 30, fill=PAPER, stroke="none"), C(x + 118, y + 66, 30, fill=PAPER, stroke="none")]
        g += f1(x + 50, y + 66); g += f2(x + 118, y + 66)
        g.append(T(x + 84, y + 134, lab, 12, fill=MUTED, anchor="middle", weight=700))
    g.append(_cap(50, 424, "손그림 선 1.8 · 둥근 끝 · 세트당 12 (앱 아이콘 규칙과 같은 결)"))
    return g


# ── 테이프 ────────────────────────────────────────────────────────────────
def a_tape_basic(W, H):
    g = asset_bg(W, H, "paper")
    names = {"dots": "도트", "stripes": "스트라이프", "check": "체크", "grid": "그리드", "zigzag": "지그재그"}
    for i, (key, pat, ang) in enumerate([("pink", "dots", -2), ("sky", "stripes", 1.5), ("mint", "check", -1), ("butter", "grid", 2), ("lavender", "zigzag", -1.5)]):
        g.append(tape(56, 64 + i * 54, 360, 24, key, ang, torn=False, pattern=pat))
        g.append(_cap(432, 64 + i * 54 + 17, names[pat]))
    g += [tape_roll(540, 140, 50, "butter"), tape_roll(566, 262, 32, "kraft"), tape_roll(506, 262, 24, "pink")]
    g += [tape(56, 352, 130, 15, "pink", 0, torn=False, pattern="dots"), tape(206, 347, 130, 24, "sky", 0, torn=False, pattern="stripes"), tape(356, 341, 130, 36, "mint", 0, torn=False, pattern="check"),
          _cap(121, 400, "슬림 15", "middle"), _cap(271, 400, "기본 24", "middle"), _cap(421, 400, "와이드 36", "middle"),
          _cap(56, 432, "기하 무늬 5 × 팔레트 7색 · 직선 끝")]
    return g


def a_tape_torn(W, H):
    g = asset_bg(W, H, "paper")
    g += [tape(50, 72, 250, 28, "pink", -2, torn=False, pattern="dots"), _cap(175, 124, "자른 끝 (직선)", "middle"),
          tape(340, 72, 250, 28, "mint", 2, torn=True, pattern="stripes"), _cap(465, 124, "찢은 끝 (손맛)", "middle")]
    for i, (key, z, seed) in enumerate([("butter", 5, 1), ("sky", 10, 4), ("lavender", 16, 9)]):
        bg, fg = TAPES[key]; x, y, w, h = 56 + i * 184, 160, 164, 72
        g.append(P(torn_rect_path(x, y, w, h, z, seed), fill=bg, stroke="none", opacity=.92))
        for row in (h * .3, h * .7):
            g += [C(x + 22 + j * 16, y + row, 3, fill=fg, stroke="none") for j in range(int((w - 44) / 16) + 1)]
        g.append(_cap(x + w / 2, y + h + 18, f"끝 마스크 {i + 1} (확대)", "middle"))
    g += [tape(56, 300, 150, 26, "pink", 0, torn=True, pattern="dots"), tape(56, 340, 300, 26, "pink", 0, torn=True, pattern="dots"), tape(56, 380, 450, 26, "pink", 0, torn=True, pattern="dots"),
          tape_roll(566, 352, 32, "pink"), _cap(56, 432, "길이를 늘여도 끝 모양은 그대로 · 끝 마스크 3종 랜덤")]
    return g


def a_tape_bg(W, H):
    g = asset_bg(W, H, "paper")
    for i, (kind, lab, ang, x) in enumerate([("cloud", "구름", -2, 56), ("brick", "벽돌", 1.5, 72), ("grass", "풀숲", -1, 56), ("wave", "물결", 2, 72)]):
        y = 66 + i * 62
        g += [_bg_strip(x, y, 440, 44, kind, ang, f"bg{i}"), _cap(536, y + 26, f"{lab} · 30mm+")]
    g += [_bg_strip(60, 346, 260, 40, "cloud", -8, "bg4"), _bg_strip(130, 346, 260, 40, "brick", 8, "bg5"),
          _cap(420, 362, "겹치면 곱하기 블렌드처럼 진해진다"), _cap(420, 378, "기본 반투명 80%")]
    g.append(_cap(60, 432, "배경용 와이드 마테 — 사진 뒤 · 칸 바탕으로 넓게"))
    return g


def a_tape_kisscut(W, H):
    g = asset_bg(W, H, "paper")
    g += [R(50, 70, 60, 52, stroke=MUTED, dash="3 3", rx=4), _cap(50, 64, "반복 단위")]
    for i in range(9):
        cx = 76 + i * 58
        if i < 8:
            g.append(_leaf(cx + 29, 96, 11, 5, 0, SAGE))
        g.append(_flower(cx, 96, 17, ROSE if i % 2 == 0 else LAV, MUST))
    g.append(_cap(60, 140, "꽃줄"))
    g += [_lace_strip(60, 158, 520, 40, WHITE, .95), _cap(60, 222, "레이스")]
    for i in range(9):
        g.append(L(72 + i * 55, 262, 72 + (i + 1) * 55, 262, stroke=TAPES["butter"][1], sw=2))
    for i in range(10):
        g.append(star(72 + i * 55, 262, 16 if i % 2 == 0 else 11, MUST))
    g.append(_cap(60, 300, "별줄"))
    for i in range(23):
        cx = 76 + i * 22
        g.append(E(cx, 338, 13, 7, fill="none", stroke=CAMEL, sw=3) if i % 2 == 0 else E(cx, 338, 7, 5, fill="none", stroke=CAMEL, sw=3))
    g.append(_cap(60, 372, "체인"))
    g.append(_cap(60, 432, "모양 따라 잘린다 (알파 마스크 · 사각 바탕 없음) · 늘이면 반복 단위가 이어진다"))
    return g


def a_tape_text(W, H):
    g = asset_bg(W, H, "paper")
    g.append(tape_roll(84, 98, 36, "butter"))
    rows = [(118, 84, 472, "butter", "TODO", "m", 14, False), (60, 150, 530, "pink", "이번 주", "l", 13, False),
            (60, 216, 530, "mint", "DONE ✓", "m", 14, False), (60, 282, 530, "lavender", "휴일", "l", 13, True)]
    for i, (x, y, w, key, word, cls, size, cur) in enumerate(rows):
        bg, fg = TAPES[key]
        g.append(R(x, y, w, 30, fill=bg, stroke="none", opacity=.9))
        g.append(_repeat_text(x, y, w, 30, word, size, cls, CHAR, f"tt{i}", cursor=cur, count=3 if cur else None))
    g.append(_cap(60, 336, "글 입력형 — 입력한 말이 테이프 폭만큼 반복된다 · 글꼴 2"))
    g += [R(60, 362, 240, 30, fill=TAPES["sky"][0], stroke="none", opacity=.9), _repeat_text(60, 362, 240, 30, "직관", 20, "h", PEN, "tt5"), _cap(60, 412, "둥근 손글씨"),
          R(330, 362, 260, 30, fill=TAPES["kraft"][0], stroke="none", opacity=.9), _repeat_text(330, 362, 260, 30, "WEEK 43", 13, "m", CHAR, "tt6"), _cap(330, 412, "레트로 타자")]
    return g


def a_tape_lace(W, H):
    g = asset_bg(W, H, "paper")
    g.append(photo_filled(50, 70, 270, 190, "cafe"))
    g.append(G([_lace_strip(30, 142, 312, 44, WHITE, .88)], transform="rotate(-3 186 164)"))
    g.append(_cap(185, 290, "레이스 — 비치는 바탕 · 자수 결", "middle"))
    g += [hand(350, 108, "투명 마테 아래", 24), hand(350, 150, "글이 그대로 보인다", 24), hand(350, 190, "패턴만 불투명", 22, MUTED)]
    dots = [R(338, 118, 250, 56, stroke=LINE, dash="4 4", opacity=.7)]
    bg, fg = TAPES["sky"]
    for r in range(3):
        for c in range(15):
            dots.append(C(350 + c * 16 + (8 if r % 2 else 0), 130 + r * 16, 3, fill=fg, stroke="none", opacity=.85))
    g.append(G(dots, transform="rotate(2 463 146)"))
    g.append(_cap(463, 290, "투명 마테 — 바탕 없음, 무늬만", "middle"))
    g += [tape_roll(120, 372, 40, "ivory", "레이스"), C(300, 372, 40, fill=WHITE, stroke=LINE, sw=1.5, opacity=.5), C(300, 372, 17, fill=PAPER, stroke="#D9CBA6", sw=1.2)]
    for a in range(8):
        ang = a * math.pi / 4
        g.append(C(300 + 29 * math.cos(ang), 372 + 29 * math.sin(ang), 3, fill=fg, stroke="none"))
    g.append(T(300, 428, "투명", 11, fill=MUTED, anchor="middle"))
    g += [G([_lace_strip(400, 356, 190, 30, WHITE, .9, 6)], transform="rotate(-10 495 371)"), G([_lace_strip(400, 356, 190, 30, TAPES["pink"][0], .8, 6)], transform="rotate(12 495 371)"),
          _cap(495, 428, "겹쳐 붙이기", "middle")]
    return g


# ── 종이 · 배경지 ─────────────────────────────────────────────────────────
def a_texture(W, H):
    rnd = random.Random(3)
    g = asset_bg(W, H, "paper")
    specs = [("크라프트", "#D9B98F", "grain"), ("모조지", "#FFFDF7", None), ("한지", "#F6F1E3", "grain"), ("수채지", "#FAF7F0", "grain"), ("코르크", "#D6B48C", None), ("린넨", "#EDE8DC", "grid")]
    for i, (lab, fill, tex) in enumerate(specs):
        r, c = divmod(i, 3); x, y, w, h = 60 + c * 185, 56 + r * 186, 150, 136
        g.append(paper_swatch(x, y, w, h, fill, lab, tex))
        if lab == "모조지":
            g.append(hand(x + w / 2, y + h / 2 + 8, "글이 잘 써진다", 18, PEN, anchor="middle"))
        if lab == "한지":
            for _ in range(14):
                sx, sy = rnd.uniform(x + 8, x + w - 30), rnd.uniform(y + 8, y + h - 8)
                g.append(P(f"M{sx:.0f},{sy:.0f} q{rnd.uniform(6, 14):.0f},{rnd.uniform(-5, 5):.0f} {rnd.uniform(16, 28):.0f},{rnd.uniform(-4, 4):.0f}", stroke=LINE, sw=1, opacity=.8))
        if lab == "수채지":
            g += [E(x + 60, y + 64, 34, 24, fill=SAGE, stroke="none", opacity=.35), E(x + 92, y + 78, 30, 22, fill=PERI, stroke="none", opacity=.3)]
        if lab == "코르크":
            for _ in range(70):
                g.append(C(rnd.uniform(x + 6, x + w - 6), rnd.uniform(y + 6, y + h - 6), rnd.uniform(1.2, 3.4), fill=TAPES["kraft"][1], stroke="none", opacity=rnd.uniform(.25, .5)))
    g.append(_cap(60, 432, "질감 레이어 (종이 바탕 6색 위) + 미색 · 무채색 2색 추가"))
    return g


def a_pattern(W, H):
    rnd = random.Random(5)
    g = asset_bg(W, H, "paper")
    specs = [("깅엄", TAPES["sky"]), ("도트", TAPES["butter"]), ("체크", TAPES["mint"]), ("꽃", TAPES["lavender"]), ("스트라이프", TAPES["pink"]), ("하트", (PAPERS[3], ROSE))]
    for i, (lab, (bg, fg)) in enumerate(specs):
        r, c = divmod(i, 3); x, y, w, h = 60 + c * 185, 56 + r * 186, 150, 136
        cid = f"pat{i}"; items = []
        if lab == "깅엄":
            for k in range(8):
                items += [R(x + 10 + k * 20, y, 10, h, fill=fg, stroke="none", opacity=.3), R(x, y + 8 + k * 20, w, 10, fill=fg, stroke="none", opacity=.3)]
        elif lab == "도트":
            for rr in range(9):
                for cc in range(9):
                    items.append(C(x + 10 + cc * 18 + (9 if rr % 2 else 0), y + 10 + rr * 18, 4, fill=fg, stroke="none"))
        elif lab == "체크":
            for k in range(6):
                items += [L(x + 15 + k * 30, y, x + 15 + k * 30, y + h, stroke=fg, sw=4, opacity=.6), L(x, y + 15 + k * 30, x + w, y + 15 + k * 30, stroke=fg, sw=4, opacity=.6),
                          L(x + 30 + k * 30, y, x + 30 + k * 30, y + h, stroke=fg, sw=1, opacity=.6), L(x, y + 30 + k * 30, x + w, y + 30 + k * 30, stroke=fg, sw=1, opacity=.6)]
        elif lab == "꽃":
            for _ in range(9):
                items.append(_flower(rnd.uniform(x + 14, x + w - 14), rnd.uniform(y + 14, y + h - 14), 9, fg, WHITE))
        elif lab == "스트라이프":
            for k in range(9):
                items.append(R(x + 4 + k * 18, y, 8, h, fill=fg, stroke="none", opacity=.5))
        else:
            for rr in range(6):
                for cc in range(7):
                    items.append(heart(x + 14 + cc * 24 + (12 if rr % 2 else 0), y + 16 + rr * 24, 7, fill=fg, opacity=.85))
        g += [R(x, y, w, h, fill=bg, stroke="#D9D2C4", rx=6, filt="softshadow"), clip_rect(cid, x, y, w, h, 6), G(items, clip=cid),
              T(x + w / 2, y + h + 15, lab, 11, fill=MUTED, anchor="middle")]
    g.append(_cap(60, 432, "톤온톤 — 팔레트 따라 바탕 · 무늬 색이 함께 바뀐다"))
    return g


def a_vintage(W, H):
    rnd = random.Random(2)
    g = asset_bg(W, H, "paper")
    c0, c1, c2 = SEPIA
    news = [R(60, 70, 230, 200, fill=c1, stroke="none"), T(76, 100, "DAILY NEWS", 20, cls="s", fill=CHAR), L(76, 108, 274, 108, stroke=CHAR, opacity=.6)]
    for col in (76, 180):
        yy = 124
        while yy < 258:
            news.append(L(col, yy, col + rnd.uniform(60, 92), yy, stroke=CHAR, sw=2.2, opacity=.22)); yy += 8
    news.append(L(172, 118, 172, 258, stroke=CHAR, sw=.8, opacity=.4))
    g.append(G(news, transform="rotate(-3 175 170)", opacity=.92, filt="softshadow"))
    sheet = [R(300, 60, 250, 150, fill=c0, stroke="none")]
    for s in range(2):
        for k in range(5):
            yy = 86 + s * 64 + k * 7
            sheet.append(L(316, yy, 534, yy, stroke=CHAR, sw=.8, opacity=.6))
        for k, nx in enumerate([340, 372, 400, 440, 470, 506]):
            ny = 86 + s * 64 + [14, 7, 21, 10, 17, 7][k]
            sheet += [E(nx, ny, 4.5, 3.2, fill=CHAR, stroke="none", opacity=.8), L(nx + 4, ny, nx + 4, ny - 20, stroke=CHAR, sw=1.2, opacity=.8)]
    g.append(G(sheet, transform="rotate(2 425 135)", opacity=.92, filt="softshadow"))
    letter = [R(100, 232, 220, 150, fill=c0, stroke="none"), lines(112, 246, 196, 118, 26, LINE2),
              hand(116, 268, "Dear 수아,", 20, CHAR), hand(116, 294, "오늘 날씨가 참 좋았어.", 18, CHAR), hand(116, 320, "다음엔 같이 걷자.", 18, CHAR), hand(116, 362, "— 민희", 18, CHAR)]
    g.append(G(letter, transform="rotate(3 210 307)", opacity=.94, filt="softshadow"))
    mp = [R(330, 240, 230, 170, fill=c2, stroke="none"), P("M340,300 C390,280 420,340 470,310 S540,280 560,300", stroke=CHAR, sw=2, opacity=.5),
          P("M400,250 C390,300 440,340 420,400", stroke=CHAR, sw=1.4, opacity=.5, dash="4 3"), P("M330,380 C380,360 430,390 480,360 S540,340 560,350", stroke=PERI, sw=3, opacity=.6),
          C(470, 310, 4, fill=CHAR, stroke="none", opacity=.7), C(400, 288, 3, fill=CHAR, stroke="none", opacity=.7), T(478, 306, "역", 11, fill=CHAR), T(406, 285, "공원", 11, fill=CHAR),
          T(536, 268, "N", 12, cls="s", fill=CHAR, anchor="middle"), L(536, 290, 536, 274, stroke=CHAR, sw=1.5)]
    g.append(G(mp, transform="rotate(-2 445 325)", opacity=.92, filt="softshadow"))
    ad = [R(246, 158, 130, 104, fill=c1, stroke=CHAR, sw=2), R(252, 164, 118, 92, fill="none", stroke=CHAR, sw=.8),
          T(311, 212, "SALE", 34, cls="s", fill=CHAR, anchor="middle"), T(311, 236, "50% OFF · TODAY", 11, cls="m", fill=CHAR, anchor="middle"),
          star(262, 176, 6, CHAR), star(360, 176, 6, CHAR)]
    g.append(G(ad, transform="rotate(-6 311 210)", opacity=.95, filt="shadow"))
    g.append(_cap(60, 432, "신문 · 악보 · 편지 · 지도 · 레트로 광고 — 반투명 겹침 · 세피아"))
    return g


def a_colorgrid(W, H):
    g = asset_bg(W, H, "paper")
    cols = [PERI, ROSE, SAGE, MUST, LAV]
    for row, (bg, gap, op) in enumerate([(WHITE, 18, .65), ("#3E4350", 12, .75)]):
        y = 56 + row * 194
        for i, col in enumerate(cols):
            x, w, h = 56 + i * 108, 96, 150
            cid = f"cg{row}{i}"
            items = []
            k = 0
            while x + k * gap <= x + w: items.append(L(x + k * gap, y, x + k * gap, y + h, stroke=col, sw=1.2, opacity=op)); k += 1
            k = 0
            while y + k * gap <= y + h: items.append(L(x, y + k * gap, x + w, y + k * gap, stroke=col, sw=1.2, opacity=op)); k += 1
            g += [R(x, y, w, h, fill=bg, stroke=LINE, rx=6, filt="softshadow"), clip_rect(cid, x, y, w, h, 6), G(items, clip=cid)]
        g.append(_cap(56, y + h + 20, "밝은 바탕 5 · 5mm — 선이 글보다 연하게" if row == 0 else "어두운 바탕 5 · 3mm — 어두운 종이엔 흰 펜"))
        g.append(hand(56 + 2 * 108 + 48, y + 84, "오늘", 26, INK if row == 0 else WHITE, anchor="middle"))
    return g


def a_tracing_opp(W, H):
    g = asset_bg(W, H, "paper")
    g.append(photo_filled(50, 80, 250, 190, "green"))
    g.append(G([R(168, 66, 150, 220, fill=WHITE, stroke="none", opacity=.6), R(168, 66, 150, 220, fill="none", stroke=LINE, opacity=.8),
                hand(243, 170, "비치는 종이", 22, PEN, anchor="middle"), hand(243, 200, "위에 글을 쓴다", 20, PEN, anchor="middle")], transform="rotate(4 243 176)"))
    g.append(_cap(175, 310, "트레이싱지 — 60% 백색 반투명", "middle"))
    x, y, w, h = 352, 70, 220, 190
    g += [photo_filled(x + 10, y + 12, w - 20, h - 24, "pink"), R(x, y, w, h, fill="url(#gloss)", stroke=LINE, sw=1.5, rx=4),
          poly([(x + 36, y), (x + 76, y), (x + 176, y + h), (x + 136, y + h)], fill=WHITE, opacity=.35),
          R(x, y, w, 12, fill=WHITE, stroke="none", rx=2, opacity=.6), _cap(x + w / 2, 310, "OPP 포켓 — 비닐 반사광", "middle")]
    g += [hand(60, 372, "사진 액자 기법:", 22, INK), hand(60, 400, "사진 → 트레이싱지 → 스티커, OPP는 뒷면에", 20, CHAR)]
    g += [R(430, 350, 40, 30, fill=TAPES["sky"][0], stroke="none"), R(446, 358, 40, 30, fill=WHITE, stroke=LINE, opacity=.7), star(506, 374, 10, MUST),
          _cap(468, 408, "겹치는 순서", "middle")]
    return g


# ── 사진 틀 ───────────────────────────────────────────────────────────────
def a_polaroid(W, H):
    g = asset_bg(W, H, "paper")
    specs = [(56, 104, -6, "sky", WHITE, "소금빵 데이", PEN, "흰"), (236, 98, 0, "night", DARK, "밤 산책", WHITE, "검정"), (416, 104, 5, "pink", "#FBE4E1", "10.25 ♡", PEN, "파스텔")]
    w = 170; h = w * .93 + w * .28
    for x, y, ang, tone, col, cap, capcol, lab in specs:
        g.append(polaroid(x, y, w, "", ang, tone, col))
        g.append(G([hand(x + w / 2, y + h - 17, cap, 19, capcol, anchor="middle")], transform=f"rotate({ang} {x + w / 2} {y + h / 2})"))
        g.append(_cap(x + w / 2, 350, lab, "middle"))
    g += [tape(72, 96, 70, 18, "butter", -8), tape(456, 96, 60, 18, "mint", 6)]
    g.append(_cap(56, 424, "폴꾸 — 아래 라벨에 날짜 · 한 줄 (④ 날짜 도장과 연결)"))
    return g


def a_instax(W, H):
    g = asset_bg(W, H, "paper")
    s = 2.2
    x, y = 121, 84; fw, fh = 54 * s, 86 * s; iw, ih = 46 * s, 62 * s
    g += [R(x, y, fw, fh, fill=WHITE, stroke="#DDD6C9", rx=3, filt="shadow"), photo_filled(x + (fw - iw) / 2, y + 6 * s, iw, ih, "pink", rx=1),
          hand(x + fw / 2, y + fh - 14, "체키록 ♡", 18, PEN, anchor="middle"), _cap(x + fw / 2, y + fh + 20, "미니 54×86", "middle")]
    x2 = 280; fw2, fh2 = 108 * s, 86 * s; iw2, ih2 = 99 * s, 62 * s
    g += [R(x2, y, fw2, fh2, fill=WHITE, stroke="#DDD6C9", rx=3, filt="shadow"), photo_filled(x2 + (fw2 - iw2) / 2, y + 6 * s, iw2, ih2, "sky", rx=1),
          hand(x2 + fw2 / 2, y + fh2 - 14, "팬싸 · 2026.10.25", 18, PEN, anchor="middle"), _cap(x2 + fw2 / 2, y + fh2 + 20, "와이드 99×62", "middle")]
    g.append(tape(150, 76, 60, 16, "butter", -6))
    g += [R(60, 340, 120, 70, fill=IVORY, stroke=LINE, rx=4), R(70, 350, 100, 50, fill=WHITE, stroke="#DDD6C9", rx=2), R(78, 356, 84, 30, fill=LINE2, stroke="none"),
          _cap(120, 428, "필름 팩", "middle")]
    g += [hand(210, 372, "사진을 넣으면", 22, INK), hand(210, 400, "틀 비율로 자동 맞춤 (가운데 자르기)", 20, CHAR)]
    return g


def a_fourcut_frame(W, H):
    g = asset_bg(W, H, "paper")
    tones = ["sky", "cafe", "pink", "green"]
    x, y, w, h = 64, 44, 112, 372
    g.append(R(x, y, w, h, fill=DARK, stroke="none", rx=2, filt="shadow"))
    for i in range(4):
        g.append(photo_filled(x + 8, y + 8 + i * 86, 96, 78, tones[i], rx=1))
    g.append(T(x + w / 2, y + h - 12, "DIO 네컷", 11, cls="m", fill=WHITE, anchor="middle"))
    x, y, w, h = 228, 80, 228, 300
    g.append(R(x, y, w, h, fill=WHITE, stroke=LINE, rx=2, filt="shadow"))
    for i in range(4):
        r, c = divmod(i, 2)
        g.append(photo_filled(x + 10 + c * 106, y + 10 + r * 118, 102, 110, tones[i], rx=1))
    g += [T(x + w / 2, y + h - 30, "DIO 네컷", 12, cls="m", fill=INK, anchor="middle", weight=700), T(x + w / 2, y + h - 14, "2026.10.25", 11, cls="m", fill=MUTED, anchor="middle")]
    x, y, w, h = 500, 44, 100, 372
    g.append(R(x, y, w, h, fill=PERI, stroke="none", rx=2, filt="shadow"))
    for i in range(4):
        g.append(photo_filled(x + 8, y + 8 + i * 86, 84, 78, tones[(i + 1) % 4], rx=1))
    g.append(T(x + w / 2, y + h - 12, "DIO", 11, cls="m", fill=WHITE, anchor="middle"))
    g += [_cap(120, 438, "검정 · 세로 4컷", "middle"), _cap(342, 438, "흰 · 2×2", "middle"), _cap(550, 438, "컬러 · 세로 4컷", "middle")]
    return g


def a_toploader(W, H):
    g = asset_bg(W, H, "paper")
    cw, ch = 143, 221
    x, y = 84, 92
    g += [R(x - 8, y - 8, cw + 16, ch + 16, fill=WHITE, stroke=LINE, sw=1.5, rx=10, opacity=.7),
          R(x, y, cw, ch, fill="url(#card)", stroke="none", rx=8), heart(x + cw / 2, y + ch / 2, 16, fill="none", stroke=WHITE, sw=1.5),
          R(x - 8, y - 8, cw + 16, ch + 16, fill="url(#gloss)", stroke="none", rx=10),
          poly([(x + 20, y - 8), (x + 50, y - 8), (x + cw - 30, y + ch + 8), (x + cw - 60, y + ch + 8)], fill=WHITE, opacity=.28),
          R(x - 8, y - 8, cw + 16, 12, fill=WHITE, stroke="none", rx=2, opacity=.6),
          _cap(x + cw / 2, y + ch + 36, "포카 포켓 — 투명 · 반사광", "middle")]
    x2, y2 = 384, 92
    g += [R(x2 - 18, y2 - 18, cw + 36, ch + 36, fill=WHITE, stroke=LINE, sw=1.5, rx=12, filt="shadow"),
          R(x2 - 18, y2 - 18, cw + 36, ch + 36, fill="url(#gloss)", stroke="none", rx=12),
          R(x2 - 4, y2 - 4, cw + 8, ch + 8, fill="none", stroke="#CFC8BA", rx=8),
          R(x2, y2, cw, ch, fill="url(#card)", stroke="none", rx=6), heart(x2 + cw / 2, y2 + ch / 2, 16, fill="none", stroke=WHITE, sw=1.5),
          star(x2 - 10, y2 - 10, 11, MUST), heart(x2 + cw + 10, y2 + ch + 6, 9, ROSE), sparkle(x2 + cw + 10, y2 - 8, 9, PERI), C(x2 - 10, y2 + ch + 8, 5, fill=SAGE, stroke="none"),
          _cap(x2 + cw / 2, y2 + ch + 46, "탑로더 — 두꺼운 틀 + 꾸밈 여백 (탑꾸)", "middle")]
    g.append(_cap(320, 424, "카드 비율 55:85 · 사진을 넣으면 카드 비율로 잘린다", "middle"))
    return g


def a_ticket_frame(W, H):
    g = asset_bg(W, H, "paper")
    x, y, w, h = 50, 56, 260, 124
    g += [R(x, y, w, h, fill=WHITE, stroke=LINE, rx=8, filt="softshadow"), photo_filled(x + 10, y + 10, 96, h - 20, "night", rx=4),
          T(x + 118, y + 30, "CONCERT", 11, cls="m", fill=MUTED, ls="0.12em"), T(x + 118, y + 56, "WORLD TOUR", 15, weight=800), T(x + 118, y + 76, "2026.12.01 18:00", 11, cls="m", fill=MUTED),
          T(x + 118, y + 104, "2F · F구역 12열", 11, fill=CHAR),
          L(x + w - 54, y, x + w - 54, y + h, stroke=LINE, dash="3 4"), C(x + w - 54, y, 7, fill=PAPER, stroke=LINE), C(x + w - 54, y + h, 7, fill=PAPER, stroke=LINE),
          T(x + w - 22, y + 46, "ADMIT", 11, cls="m", fill=MUTED, anchor="middle", rotate=90), _cap(x, y + h + 16, "공연 · 절취선")]
    x, y, w, h = 330, 56, 260, 124
    bg = TAPES["butter"][0]
    g += [R(x, y, w, h, fill=bg, stroke="none", rx=4, filt="softshadow")]
    cy = y + 7
    while cy < y + h:
        g += [C(x, cy, 5, fill=PAPER, stroke="none"), C(x + w, cy, 5, fill=PAPER, stroke="none")]; cy += 14
    g += [photo_filled(x + 16, y + 12, 90, h - 24, "pink", rx=4), T(x + 120, y + 30, "CINEMA", 11, cls="m", fill=CHAR, ls="0.12em"), T(x + 120, y + 56, "MOVIE NIGHT", 15, weight=800),
          T(x + 120, y + 76, "SCREEN 7 · 19:30", 11, cls="m", fill=CHAR), T(x + 120, y + 104, "SEAT F12", 11, cls="m", fill=CHAR), _cap(x, y + h + 16, "영화 · 톱니")]
    x, y, w, h = 50, 226, 260, 124
    bg = TAPES["mint"][0]
    g += [R(x, y, w, h, fill=bg, stroke="none", rx=8, filt="softshadow"), photo_filled(x + 10, y + 10, 96, h - 20, "green", rx=4),
          T(x + 118, y + 30, "MATCH DAY", 11, cls="m", fill=CHAR, ls="0.12em"), T(x + 118, y + 56, "HOME vs AWAY", 15, weight=800), _barcode(x + 118, y + 68, 120, 30, 5, CHAR),
          T(x + 118, y + 114, "GATE 3 · BLOCK 112", 11, cls="m", fill=CHAR), _cap(x, y + h + 16, "경기 · 바코드")]
    x, y, w, h = 330, 226, 260, 124
    bg, fg = TAPES["sky"]; stub = 72
    g += [R(x, y, w, h, fill=bg, stroke="none", rx=8, filt="softshadow"), L(x + w - stub, y, x + w - stub, y + h, stroke=fg, dash="3 4", opacity=.6),
          C(x + w - stub, y, 8, fill=PAPER, stroke="none"), C(x + w - stub, y + h, 8, fill=PAPER, stroke="none"),
          T(x + 14, y + 26, "BOARDING PASS", 11, cls="m", fill=fg, ls="0.1em"), T(x + 14, y + 58, "ICN → CDG", 20, weight=800), T(x + 14, y + 80, "DIO AIR · 10:25", 11, cls="m", fill=CHAR),
          photo_filled(x + 120, y + 66, 56, 44, "sky", rx=3),
          T(x + w - stub / 2, y + 40, "SEAT", 11, cls="m", fill=CHAR, anchor="middle"), T(x + w - stub / 2, y + 66, "12A", 18, weight=800, anchor="middle"), T(x + w - stub / 2, y + 96, "GATE 23", 11, cls="m", fill=CHAR, anchor="middle"),
          _cap(x, y + h + 16, "탑승권 · 두 조각")]
    g.append(_cap(50, 424, "절취선 · 바코드 · 사진 자리 · 빈 칸에 글 입력"))
    return g


def a_filmstrip(W, H):
    g = asset_bg(W, H, "paper")
    x, y, w, h = 44, 150, 552, 176
    items = [R(x, y, w, h, fill=DARK, stroke="none", rx=3, filt="shadow")]
    hx = x + 10
    while hx < x + w - 10:
        items += [R(hx, y + 8, 12, 9, fill=PAPER, stroke="none", rx=2), R(hx, y + h - 17, 12, 9, fill=PAPER, stroke="none", rx=2)]; hx += 24
    tones = ["night", "sky", "cafe", "pink"]
    for i in range(4):
        fx = x + 20 + i * 134; fy = y + 30; fw, fh = 118, 116
        items += [photo_filled(fx, fy, fw, fh, tones[i], rx=1), R(fx, fy, fw, fh, fill=CAMEL, stroke="none", opacity=.22, rx=1),
                  T(fx + fw, y + h - 20, f"{12 + i}A", 11, cls="m", fill="#FFF1C2", anchor="end"), T(fx, y + 27, "DIO 400", 11, cls="m", fill="#FFF1C2")]
    g.append(G(items, transform="rotate(-2 320 238)"))
    g += [R(548, 54, 44, 76, fill=DARK, stroke="none", rx=4), R(544, 50, 52, 10, fill=CHAR, stroke="none", rx=2), R(562, 38, 10, 14, fill=CHAR, stroke="none", rx=1),
          R(556, 76, 28, 40, fill="#FFF1C2", stroke="none", rx=2), T(570, 100, "400", 11, cls="m", fill=INK, anchor="middle", weight=700)]
    g.append(_cap(44, 424, "3~5컷 · 스프로킷 홀 · 가장자리 글자 · 네거티브 톤"))
    return g


# ── 글씨 · 펜 ─────────────────────────────────────────────────────────────
def a_fonts(W, H):
    g = asset_bg(W, H, "paper")
    g += [_cap(60, 78, "① 둥근 손글씨"), hand(60, 120, "오늘도 다 같이 다꾸하는 날", 32, PEN), hand(560, 124, "가", 50, PEN, anchor="middle"),
          _cap(60, 178, "② 삐뚤 연필"), G([T(60, 220, "연필로 삐뚤삐뚤 써도 괜찮아", 30, cls="h", fill=CHAR), T(560, 226, "가", 48, cls="h", fill=CHAR, anchor="middle")], filt="rough"),
          _cap(60, 280, "③ 레트로 타자"), T(60, 318, "TYPEWRITER · 2026.10.25 다이어리", 20, cls="m", fill=INK, ls="0.1em"), T(560, 324, "가", 40, cls="m", fill=INK, anchor="middle"),
          L(60, 134, 440, 134, stroke=LINE2), L(60, 234, 440, 234, stroke=LINE2), L(60, 332, 440, 332, stroke=LINE2)]
    g.append(_cap(60, 424, "눈누 무료 글꼴 · 라이선스 확인 후 textFonts 에 등록"))
    return g


def a_crayon(W, H):
    g = asset_bg(W, H, "paper")
    for i, col in enumerate([PENS[4], PENS[3], PENS[1], PENS[5]]):
        y = 96 + i * 64
        d = f"M60,{y} C140,{y - 14} 220,{y + 16} 300,{y - 6} S400,{y + 10} 420,{y - 4}"
        g += [P(d, stroke=col, sw=14, opacity=.85, filt="rough"), P(d, stroke=WHITE, sw=14, opacity=.16, dash="2 9", filt="rough")]
    g.append(G([hand(60, 392, "크레용", 46, PENS[4])], filt="rough"))
    body = [R(500, 112, 40, 180, fill=PENS[4], stroke="none", rx=4), poly([(500, 112), (540, 112), (520, 80)], fill=PENS[4]),
            R(500, 164, 40, 76, fill=IVORY, stroke="none"), L(506, 180, 534, 180, stroke=PENS[4], sw=1.5), L(506, 224, 534, 224, stroke=PENS[4], sw=1.5),
            T(520, 208, "DIO", 11, cls="m", fill=PENS[4], anchor="middle", weight=700)]
    g.append(G(body, transform="rotate(-18 520 190)", filt="softshadow"))
    g.append(_cap(60, 430, "거친 왁스 질감 · 연필 질감 변주 · 1020 색연필 기록"))
    return g


def a_brush(W, H):
    g = asset_bg(W, H, "paper")
    g.append(G([hand(60, 196, "오늘", 76, INK)], filt="rough"))
    g.append(_taper(_bezier((60, 222), (120, 242), (200, 212), (256, 228), 40), 10, "fade", INK))
    for (p0, p1, p2, p3, wm, prof, lab) in [((330, 96), (400, 76), (480, 116), (580, 92), 15, "mid", "눌렀다 뗀다"),
                                             ((330, 166), (420, 146), (470, 196), (580, 166), 13, "fade", "점점 가늘게"),
                                             ((330, 236), (380, 216), (500, 276), (580, 236), 11, "grow", "점점 굵게")]:
        g += [_taper(_bezier(p0, p1, p2, p3, 48), wm, prof, INK), _cap(330, p0[1] - 20, lab)]
    g += [hand(60, 292, "필압 따라 굵기가 변하고", 24, CHAR), hand(60, 324, "빨리 그으면 가늘어진다", 24, CHAR)]
    brush = [R(500, 300, 22, 110, fill=CHAR, stroke="none", rx=6), R(500, 330, 22, 10, fill=MUST, stroke="none"), poly([(503, 300), (519, 300), (511, 270)], fill=INK)]
    g.append(G(brush, transform="rotate(32 511 340)", filt="softshadow"))
    g.append(_cap(60, 430, "필압 · 속도 반영 · 가사 · 시 · 필사"))
    return g


def a_glitter(W, H):
    rnd = random.Random(7)
    g = asset_bg(W, H, "paper")
    for i, col in enumerate([PENS[5], PENS[4], PENS[1]]):
        pts = _wave_pts(60, 440, 110 + i * 90, 14, 2.2 + i * .4)
        g.append(P(_pts_d(pts), stroke=col, sw=9, opacity=.8))
        for (x, y) in pts[::2]:
            if rnd.random() < .55:
                ox, oy = rnd.uniform(-3, 3), rnd.uniform(-3, 3)
                if rnd.random() < .45: g.append(sparkle(x + ox, y + oy, rnd.uniform(2.5, 4.5), WHITE))
                else: g.append(C(x + ox, y + oy, rnd.uniform(.9, 1.7), fill=[WHITE, "#FFF1C2", MUST][rnd.randrange(3)], stroke="none"))
    g.append(hand(520, 160, "반짝", 46, PENS[5], anchor="middle"))
    for (sx, sy, ss) in [(470, 128, 6), (570, 136, 5), (485, 176, 4), (560, 178, 7), (520, 112, 4)]:
        g.append(sparkle(sx, sy, ss, MUST))
    pen_ = [R(500, 230, 18, 140, fill=WHITE, stroke=LINE, rx=9), R(503, 250, 12, 60, fill=PENS[5], stroke="none", opacity=.5, rx=2), poly([(500, 370), (518, 370), (509, 392)], fill=LINE, stroke=LINE),
            L(509, 392, 509, 400, stroke=PENS[5], sw=2.5)]
    g.append(G(pen_, transform="rotate(-24 509 315)", filt="softshadow"))
    for i, col in enumerate(PENS):
        g.append(C(70 + i * 30, 404, 9, fill=col, stroke="none"))
    g.append(_cap(290, 408, "색 7 · 파티클 적게 (성능)"))
    return g


def a_whitepen(W, H):
    g = asset_bg(W, H, "dark")
    g += [hand(60, 98, "어두운 종이 위 흰 글씨", 32, WHITE), hand(60, 142, "검정 폴라로이드 라벨에도", 26, WHITE),
          star(540, 86, 22, fill="none", stroke=WHITE, sw=2), P("M470,130 q30,-26 60,0", stroke=WHITE, sw=2), P("M518,118 l12,12 l-16,2", stroke=WHITE, sw=2),
          heart(590, 128, 10, fill="none", stroke=WHITE, sw=2), sparkle(458, 80, 7, WHITE)]
    g += [R(60, 190, 300, 160, fill=CREAM, stroke="none", rx=4, filt="shadow"), lines(72, 206, 276, 120, 28, "#D7CDB9"),
          hand(76, 232, "파란 펜으로 쓴 글", 22), hand(76, 262, "틀린 글자는", 22), hand(176, 262, "수정액", 22),
          R(170, 244, 66, 24, fill=WHITE, stroke="none", rx=3, filt="rough"), hand(176, 262, "흰 펜", 22, INK),
          hand(76, 292, "으로 덮어 다시 쓴다", 22), hand(76, 322, "오늘도 다 같이 ♡", 22, PEN)]
    g += [tape(44, 178, 180, 26, "charcoal", -3, torn=True, pattern="plain"), T(134, 196, "OCT · 25 · SAT", 12, cls="m", fill=WHITE, anchor="middle", weight=700, rotate=-3)]
    g.append(polaroid(400, 176, 160, "", -4, "night", DARK))
    g.append(G([hand(480, 352, "밤 산책", 20, WHITE, anchor="middle")], transform="rotate(-4 480 272)"))
    g.append(_cap(60, 404, "불투명 흰색 — 아래 글자를 완전히 덮는다 (수정액)", fill=LINE))
    g.append(_cap(60, 424, "차콜 테이프 · 검정 폴라로이드 · 사진 위", fill=LINE))
    return g


# ── 재질 · 효과 ───────────────────────────────────────────────────────────
def a_transparent(W, H):
    g = asset_bg(W, H, "paper")
    for k, x in enumerate([50, 340]):
        g.append(photo_filled(x, 64, 250, 190, "green"))
        outline = k == 1
        g.append(_flower(x + 80, 150, 28, ROSE, MUST, outline))
        hd = _heart_d(x + 185, 196, 30); g.append(sticker_outline(hd, LAV) if outline else P(hd, fill=LAV, stroke="none"))
        sd = _star_d(x + 170, 110, 22); g.append(sticker_outline(sd, MUST) if outline else P(sd, fill=MUST, stroke="none"))
        cd = _cloud_d(x + 70, 222, 26); g.append(sticker_outline(cd, WHITE) if outline else P(cd, fill=WHITE, stroke="none", opacity=.9))
    g += [_cap(175, 282, "투명 — 바탕 없이 그림만", "middle"), _cap(465, 282, "씰 — 흰 테두리", "middle")]
    g += [hand(60, 356, "투명 스티커는 글 위에 올려도 글이 비친다", 24),
          P(_sparkle_d(130, 346, 18), fill=MUST, stroke="none", opacity=.85), P(_cloud_d(300, 348, 28), fill=TAPES["sky"][0], stroke="none", opacity=.7),
          P(_heart_d(440, 350, 16), fill=ROSE, stroke="none", opacity=.8)]
    g.append(_cap(60, 424, "알파 채널 · 투명 용지"))
    return g


def a_holo(W, H):
    g = asset_bg(W, H, "paper")
    g.append(sticker_sheet(50, 48, 540, 230))
    cxs = [116, 256, 396, 532]; cy = 162
    shapes = [_star_d(cxs[0], cy, 48), _heart_d(cxs[1], cy + 8, 46), _circle_d(cxs[2], cy, 46), _sparkle_d(cxs[3], cy, 46)]
    for i, d in enumerate(shapes):
        cx = cxs[i]
        g += [sticker_outline(d, "url(#holo)"), _clip(f"holo{i}", d),
              G([poly([(cx - 6, cy - 56), (cx + 16, cy - 56), (cx - 18, cy + 56), (cx - 40, cy + 56)], fill=WHITE, opacity=.5),
                 poly([(cx + 24, cy - 56), (cx + 32, cy - 56), (cx - 2, cy + 56), (cx - 10, cy + 56)], fill=WHITE, opacity=.35)], clip=f"holo{i}")]
    g += [G([R(70, 306, 40, 66, fill="none", stroke=CHAR, sw=1.8, rx=8), L(84, 316, 96, 316, stroke=CHAR, sw=1.8)], transform="rotate(-14 90 339)"),
          P("M124,318 a34,34 0 0 1 26,30", stroke=CHAR, sw=1.8), P("M142,340 l8,8 l8,-10", stroke=CHAR, sw=1.8),
          _cap(170, 334, "기울기 · 시간 따라 하이라이트가 흐른다"), _cap(170, 350, "(가볍게 — 선택 반응)")]
    g += [P(torn_rect_path(170, 392, 320, 26, 5, 2), fill="url(#holo)", stroke="none", opacity=.95),
          G([poly([(230, 392), (262, 392), (300, 418), (268, 418)], fill=WHITE, opacity=.5)]), _cap(506, 410, "홀로 마테")]
    return g


def a_foil(W, H):
    g = asset_bg(W, H, "paper")
    g += [R(60, 64, 240, 170, fill=WHITE, stroke="none", rx=4, filt="shadow"), R(72, 76, 216, 146, fill="none", stroke="url(#foil)", sw=8, rx=2), R(84, 88, 192, 122, fill="none", stroke="url(#foil)", sw=1.5),
          hand(180, 150, "Happy New Year", 26, CHAR, anchor="middle"), T(180, 184, "2027", 16, cls="s", fill="url(#foil)", anchor="middle", ls="0.2em")]
    g += [T(460, 170, "2027", 96, cls="s", fill="url(#foil)", anchor="middle"), T(460, 200, "GOLD FOIL", 11, fill=MUTED, anchor="middle", ls="0.2em")]
    g += [P(_star_d(130, 320, 44), fill="url(#foil)", stroke="none"), _cap(130, 392, "금", "middle"),
          P(_star_d(320, 320, 44), fill="url(#silver)", stroke="none"), _cap(320, 392, "은", "middle"),
          P(_heart_d(510, 326, 44), fill=ROSE, stroke="none"), _clip("rg", _heart_d(510, 326, 44)),
          G([poly([(488, 272), (506, 272), (470, 372), (452, 372)], fill=WHITE, opacity=.55), poly([(522, 272), (528, 272), (492, 372), (486, 372)], fill=WHITE, opacity=.3)], clip="rg"),
          _cap(510, 392, "로즈골드", "middle")]
    g.append(_cap(60, 430, "메탈릭 그라데이션 · 매트펄 · 프리미엄 박 가공"))
    return g


def a_corner_shadow(W, H):
    g = asset_bg(W, H, "paper")
    for i, (rx, tone) in enumerate([(0, "sky"), (4, "cafe"), (8, "pink")]):
        x = 60 + i * 185
        g += [photo_filled(x, 64, 160, 120, tone, rx=rx), T(x + 80, 206, f"반경 {rx}", 12, fill=MUTED, anchor="middle", weight=700), C(x, 64, 14, stroke=MUST, sw=1.5, dash="3 3")]
    g.append(_cap(60, 232, "모서리 펀치 — 사진 · 메모 · 스티커 공통 토큰"))
    bg = TAPES["butter"][0]
    g += [R(110, 262, 170, 130, fill=bg, stroke="none", rx=4), hand(126, 300, "그림자 없음", 22), hand(126, 330, "종이가 떠 보이지 않는다", 16, MUTED),
          R(360, 262, 170, 130, fill=bg, stroke="none", rx=4, filt="shadow"), hand(376, 300, "그림자 있음", 22), hand(376, 330, "붙인 종이 두께가 느껴진다", 16, MUTED),
          _cap(195, 414, "그림자 없음", "middle"), _cap(445, 414, "그림자 (종이 두께)", "middle")]
    return g


def a_palette(W, H):
    g = asset_bg(W, H, "paper")
    g += [R(70, 48, 500, 392, fill=WHITE, stroke="#E6E0D4", rx=14, filt="shadow"),
          T(100, 94, "몽글 파스텔", 26, cls="s", fill=INK), _cap(100, 114, "PACK 01 · 톤온톤 세트"), label_tag(470, 72, "PACK", ROSE)]
    g.append(_cap(100, 150, "펜 7"))
    for i, col in enumerate(["#F59AB2", "#EFC04F", "#8FD3B6", "#6E92C6", "#B39DED", "#A27B4E", "#3E4350"]):
        g.append(C(176 + i * 36, 146, 11, fill=col, stroke="none"))
    g.append(_cap(100, 200, "형광 5"))
    for i, col in enumerate(HIGHLIGHTERS[:5]):
        g.append(R(166 + i * 54, 186, 44, 18, fill=col, stroke="none", rx=3))
    g.append(_cap(100, 250, "테이프 4"))
    for i, (key, pat) in enumerate([("pink", "dots"), ("butter", "stripes"), ("mint", "check"), ("lavender", "zigzag")]):
        g.append(tape(166 + i * 98, 236, 88, 22, key, 0, torn=False, pattern=pat))
    g.append(_cap(100, 300, "글자색 3"))
    for i, col in enumerate([PEN, CHAR, "#F59AB2"]):
        g += [T(176 + i * 90, 304, "가", 24, fill=col, weight=700, anchor="middle"), hand(176 + i * 90 + 20, 304, "오늘", 20, col)]
    g.append(_cap(100, 350, "종이 3"))
    for i, col in enumerate([PAPERS[1], PAPERS[3], PAPERS[4]]):
        g.append(R(166 + i * 54, 336, 44, 30, fill=col, stroke=LINE, rx=4))
    g += [L(100, 388, 540, 388, stroke=LINE, dash="2 4"), _cap(100, 412, "한 팩 = 한 세트 · 내 색상(20) 위에 팩 프리셋이 얹힌다")]
    return g
