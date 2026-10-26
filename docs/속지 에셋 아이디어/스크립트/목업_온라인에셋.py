# -*- coding: utf-8 -*-
"""온라인 에셋 23종 목업 — 상태 · 시간 · 사람과 이어진 재료 (분류표.py 'asset-online', 접두어 an)

시그니처 fn(W, H) -> list[str]  (W=640, H=480, 에셋 카드).
카드 하나에 에셋 하나를 2~3 상태(또는 전 → 후)로 보여 주고, 사건이 있는 항목은 알림 알약을 하나 둔다.
모든 도형은 목업_도형 의 함수만 쓰고, 색은 팔레트 상수에서만 가져온다. 캐릭터 IP 없음 — 아바타는 색 + 초성.
"""
import functools
import math
import random

from 목업_도형 import *  # noqa

INKS = [PERI, ROSE, SAGE, MUST, LAV, CAMEL]   # 색종이 · 도장 잉크에 쓰는 팔레트 6색


# ── 공통 작은 도구 ─────────────────────────────────────────────────────────
def _safe(fn):
    """목업 함수는 절대 렌더를 멈추지 않는다 — 예외가 나면 바탕 + 메모만 돌려준다."""
    @functools.wraps(fn)
    def wrap(W, H):
        try:
            return fn(W, H)
        except Exception as e:  # noqa: BLE001
            return asset_bg(W, H, "paper") + [T(W / 2, H / 2, f"{fn.__name__}: {e}", 11, fill=MUTED, anchor="middle")]
    return wrap


def _cap(x, y, s, size=11, color=MUTED, anchor="middle"):
    return T(x, y, s, size, fill=color, anchor=anchor)


def _arrow(x, y, s="→"):
    return T(x, y, s, 20, fill=MUTED, anchor="middle")


def _card(x, y, w, h, fill="#fff", stroke=LINE, rx=8, dash=None, sw=1):
    return R(x, y, w, h, fill=fill, stroke=stroke, sw=sw, rx=rx, dash=dash)


def _curve_arrow(x1, y1, x2, y2, bend=30, color=MUTED, sw=1.5, dash="4 4"):
    """점선 곡선 화살표(끌기 · 순서 안내)."""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    ln = math.hypot(dx, dy) or 1
    cx, cy = mx - dy / ln * bend, my + dx / ln * bend
    ang = math.atan2(y2 - cy, x2 - cx)
    s = 8
    head = [(x2, y2), (x2 - s * math.cos(ang - .5), y2 - s * math.sin(ang - .5)), (x2 - s * math.cos(ang + .5), y2 - s * math.sin(ang + .5))]
    return G([P(f"M{x1},{y1} Q{cx:.1f},{cy:.1f} {x2},{y2}", stroke=color, sw=sw, dash=dash),
              poly([(f"{px:.1f}", f"{py:.1f}") for px, py in head], fill=color, stroke="none")])


def _hourglass(cx, cy, s, color=CAMEL):
    w, h = s * .8, s
    return G([L(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, stroke=color, sw=2), L(cx - w / 2, cy + h / 2, cx + w / 2, cy + h / 2, stroke=color, sw=2),
              poly([(cx - w / 2 + 2, cy - h / 2 + 2), (cx + w / 2 - 2, cy - h / 2 + 2), (cx, cy)], fill=color, stroke=color, sw=1.2, opacity=.3),
              poly([(cx - w / 2 + 2, cy + h / 2 - 2), (cx + w / 2 - 2, cy + h / 2 - 2), (cx, cy)], fill=color, stroke=color, sw=1.2, opacity=.3),
              poly([(cx - w / 2 + 2, cy - h / 2 + 2), (cx + w / 2 - 2, cy - h / 2 + 2), (cx, cy - h / 2 + h * .32)], fill=color, stroke="none"),
              poly([(cx - w / 4, cy + h / 2 - 2), (cx + w / 4, cy + h / 2 - 2), (cx, cy + h / 2 - h / 4)], fill=color, stroke="none")])


def _wavy(x, y, w, color, amp=3, period=14, sw=1.5, opacity=.8):
    d = f"M{x},{y}"; cx = x; up = True
    while cx < x + w - .1:
        nx = min(cx + period, x + w)
        d += f" Q{(cx + nx) / 2:.1f},{y + (-amp if up else amp)} {nx:.1f},{y}"
        cx = nx; up = not up
    return P(d, stroke=color, sw=sw, opacity=opacity)


def _ring_text(cx, cy, r, text, color, size=10, a0=-165, a1=-15, bottom=False):
    """원 둘레를 따라 한 글자씩 놓는다(우체국 소인). a0→a1 도(度), bottom=True 면 아래쪽 호(글자 머리가 중심을 향함)."""
    out = []
    n = len(text)
    for i, ch in enumerate(text):
        a = a0 + (a1 - a0) * (i / (n - 1) if n > 1 else .5)
        rad = math.radians(a)
        x, y = cx + r * math.cos(rad), cy + r * math.sin(rad)
        rot = a - 90 if bottom else a + 90
        out.append(T(f"{x:.1f}", f"{y + size * .35:.1f}", ch, size, cls="m", fill=color, anchor="middle", weight=700, rotate=f"{rot:.1f}", opacity=.9))
    return G(out)


def _confetti(rnd, x0, y0, x1, y1, n=30):
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        col = rnd.choice(INKS); k = rnd.random(); ang = rnd.uniform(-70, 70)
        if k < .5: out.append(G([R(f"{x:.1f}", f"{y:.1f}", 5, 9, fill=col, stroke="none", rx=1)], transform=f"rotate({ang:.0f} {x:.1f} {y:.1f})"))
        elif k < .8: out.append(C(f"{x:.1f}", f"{y:.1f}", 3, fill=col, stroke="none"))
        else: out.append(star(x, y, 5, fill=col))
    return out


def _tally(x, y, n, color=PEN, s=24, sw=2.4):
    """바를 정(正) — 5획씩. 획 순서: 一 · 丨 · 가운데 짧은 一 · 왼쪽 짧은 丨 · 아래 一"""
    order = [((0, 0), (1, 0)), ((.5, 0), (.5, 1)), ((.5, .5), (.92, .5)), ((.12, .5), (.12, 1)), ((0, 1), (1, 1))]
    out = []
    full, rem = divmod(n, 5)
    for k in range(full + (1 if rem else 0)):
        cnt = 5 if k < full else rem
        ox = x + k * s * 1.6
        for a, b in order[:cnt]:
            out.append(L(ox + a[0] * s, y + a[1] * s, ox + b[0] * s, y + b[1] * s, stroke=color, sw=sw))
    return G(out)


def _ticket(x, y, w, h, main, sub, key="butter", angle=-3):
    bg, fg = TAPES[key]
    cut = x + w * .7
    g = [R(x, y, w, h, fill=bg, stroke=fg, sw=1.2, rx=6, filt="softshadow"), L(cut, y + 5, cut, y + h - 5, stroke=fg, sw=1, dash="3 3"),
         C(cut, y, 5, fill=PAPER, stroke=fg, sw=1.2), C(cut, y + h, 5, fill=PAPER, stroke=fg, sw=1.2),
         T(x + 14, y + h * .52 + 9, main, 26, cls="m", weight=800), T(x + 14, y + h - 9, sub, 10, fill=MUTED),
         T(cut + (x + w - cut) / 2, y + h / 2, "TICKET", 9, cls="m", fill=fg, anchor="middle", weight=700, rotate=90)]
    return G(g, transform=f"rotate({angle} {x + w / 2} {y + h / 2})")


def _star_d(cx, cy, r):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * .45
        pts.append(f"{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}")
    return "M" + " L".join(pts) + " Z"


def _heart_d(cx, cy, s):
    return (f"M{cx},{cy + s * .35} C{cx - s * 1.1},{cy - s * .45} {cx - s * .45},{cy - s * 1.05} {cx},{cy - s * .5} "
            f"C{cx + s * .45},{cy - s * 1.05} {cx + s * 1.1},{cy - s * .45} {cx},{cy + s * .35} Z")


def _ellipse_d(cx, cy, rx, ry):
    return f"M{cx - rx},{cy} a{rx},{ry} 0 1 0 {2 * rx},0 a{rx},{ry} 0 1 0 {-2 * rx},0"


def _flower_d(cx, cy, s):
    parts = []
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        px, py, r = cx + s * .42 * math.cos(a), cy + s * .42 * math.sin(a), s * .3
        parts.append(f"M{px + r:.1f},{py:.1f} a{r:.1f},{r:.1f} 0 1 0 {-2 * r:.1f},0 a{r:.1f},{r:.1f} 0 1 0 {2 * r:.1f},0")
    return " ".join(parts)


def _cat_d(cx, cy, s):
    rx, ry = s * .5, s * .4
    body = _ellipse_d(cx, cy, rx, ry)
    ears = (f"M{cx - rx * .75},{cy - ry * .55} L{cx - rx * .6},{cy - ry * 1.55} L{cx - rx * .15},{cy - ry * .95} Z "
            f"M{cx + rx * .75},{cy - ry * .55} L{cx + rx * .6},{cy - ry * 1.55} L{cx + rx * .15},{cy - ry * .95} Z")
    return body + " " + ears


def _doodle(fx, fy, cx, cy, s, sticker=False):
    """손그림 두 개 — 꽃 · 고양이 비슷한 덩어리(얼굴 없음). sticker=True 면 흰 테두리 + 그림자."""
    fd, cd = _flower_d(fx, fy, s * .62), _cat_d(cx, cy, s * .9)
    tail = f"M{cx + s * .45},{cy + s * .1} q{s * .3},{-s * .05} {s * .22},{-s * .42}"
    stem = f"M{fx},{fy + s * .5} L{fx},{fy + s * 1.0}"
    out = []
    if sticker:
        out += [P(stem, stroke="#fff", sw=10, filt="softshadow"), P(tail, stroke="#fff", sw=10, filt="softshadow"),
                sticker_outline(fd, TAPES["pink"][0], 4), sticker_outline(cd, CREAM, 4)]
    else:
        out += [P(fd, fill=TAPES["pink"][0], stroke="none", opacity=.6), P(cd, fill=CREAM, stroke="none", opacity=.8)]
    out += [P(stem, stroke=PEN, sw=2.2), P(fd, stroke=PEN, sw=2.2), C(fx, fy, s * .14, fill=MUST, stroke=PEN, sw=2),
            P(cd, stroke=PEN, sw=2.2), P(tail, stroke=PEN, sw=2.2)]
    return out


def _cup_d(cx, cy, s):
    return (f"M{cx - s * .5},{cy - s * .42} L{cx + s * .5},{cy - s * .42} L{cx + s * .4},{cy + s * .4} "
            f"Q{cx + s * .38},{cy + s * .52} {cx + s * .26},{cy + s * .52} L{cx - s * .26},{cy + s * .52} "
            f"Q{cx - s * .38},{cy + s * .52} {cx - s * .4},{cy + s * .4} Z")


def _cup(cx, cy, s, fill=CREAM, outline="white", coffee=True):
    """컵 하나. outline: 'white' 씰 테두리 · 'holo' 홀로 테두리 · None 테두리 없음"""
    body = _cup_d(cx, cy, s)
    hd = f"M{cx + s * .46},{cy - s * .18} a{s * .22},{s * .24} 0 0 1 0,{s * .46}"
    g = []
    if outline == "white":
        g += [P(body, fill="#fff", stroke="#fff", sw=7, filt="softshadow"), P(hd, stroke="#fff", sw=11)]
    elif outline == "holo":
        g += [P(body, fill="url(#holo)", stroke="url(#holo)", sw=7, filt="softshadow"), P(hd, stroke="url(#holo)", sw=11)]
    g += [P(hd, stroke=fill, sw=4), P(body, fill=fill, stroke="none" if outline else LINE, sw=1)]
    if coffee: g.append(E(cx, cy - s * .42, s * .5, s * .08, fill=CAMEL, stroke="none"))
    return G(g)


def _animal(cx, cy, r, color, kind):
    """얼굴 없는 동물 실루엣 4종 — 토끼 · 곰 · 고양이 · 병아리"""
    if kind == "rabbit":
        g = [E(cx - r * .32, cy - r * .62, r * .2, r * .55, fill=color, stroke="none"), E(cx + r * .32, cy - r * .62, r * .2, r * .55, fill=color, stroke="none"),
             C(cx, cy + r * .2, r * .62, fill=color, stroke="none")]
    elif kind == "bear":
        g = [C(cx - r * .52, cy - r * .5, r * .28, fill=color, stroke="none"), C(cx + r * .52, cy - r * .5, r * .28, fill=color, stroke="none"),
             C(cx, cy + r * .05, r * .7, fill=color, stroke="none")]
    elif kind == "cat":
        g = [poly([(cx - r * .62, cy - r * .1), (cx - r * .58, cy - r * .98), (cx - r * .1, cy - r * .58)], fill=color, stroke="none"),
             poly([(cx + r * .62, cy - r * .1), (cx + r * .58, cy - r * .98), (cx + r * .1, cy - r * .58)], fill=color, stroke="none"),
             C(cx, cy + r * .1, r * .66, fill=color, stroke="none")]
    else:  # chick
        g = [C(cx, cy, r * .66, fill=color, stroke="none"), poly([(cx + r * .6, cy - r * .1), (cx + r * .98, cy + r * .04), (cx + r * .6, cy + r * .18)], fill=CAMEL, stroke="none"),
             C(cx - r * .05, cy - r * .74, r * .13, fill=color, stroke="none")]
    return G(g)


def _animal_stamp(cx, cy, r, color, kind, angle=-8):
    return G([C(cx, cy, r, stroke=color, sw=2.2, opacity=.85), C(cx, cy, r - 5, stroke=color, sw=.8, opacity=.5), _animal(cx, cy, r * .6, color, kind)],
             transform=f"rotate({angle} {cx} {cy})", filt="rough")


def _postmark(cx, cy, r, color, top, bottom, center, sub, angle=-6):
    """우체국 소인 — 두 겹 원, 둘레 글자, 가운데 장소 + 날짜"""
    g = [C(cx, cy, r, stroke=color, sw=2, opacity=.85), C(cx, cy, r - 17, stroke=color, sw=1.2, opacity=.7),
         _ring_text(cx, cy, r - 8.5, top, color, 10, -165, -15), _ring_text(cx, cy, r - 8.5, bottom, color, 10, 150, 30, bottom=True),
         T(cx, cy + 5, center, 17, fill=color, anchor="middle", weight=800, opacity=.9),
         T(cx, cy + 22, sub, 10, cls="m", fill=color, anchor="middle", weight=700, opacity=.85)]
    return G(g, transform=f"rotate({angle} {cx} {cy})", filt="rough")


def _qr(x, y, s, rnd):
    cell = s / 9
    g = [R(x, y, s, s, fill="#fff", stroke=LINE, rx=3)]
    for fx, fy in [(0, 0), (6, 0), (0, 6)]:
        g += [R(x + fx * cell + 1, y + fy * cell + 1, 3 * cell - 2, 3 * cell - 2, fill="none", stroke=INK, sw=1.5), R(x + (fx + 1) * cell + 1, y + (fy + 1) * cell + 1, cell - 2, cell - 2, fill=INK, stroke="none")]
    for i in range(9):
        for j in range(9):
            if (i < 3 and j < 3) or (i > 5 and j < 3) or (i < 3 and j > 5): continue
            if rnd.random() < .45: g.append(R(x + i * cell + 1, y + j * cell + 1, cell - 2, cell - 2, fill=INK, stroke="none"))
    return G(g)


def _nfc(cx, cy, color=PERI):
    g = [C(cx - 8, cy, 3, fill=color, stroke="none")]
    for k in range(1, 4):
        r = 7 * k
        a0, a1 = math.radians(-50), math.radians(50)
        g.append(P(f"M{cx - 8 + r * math.cos(a0):.1f},{cy + r * math.sin(a0):.1f} A{r},{r} 0 0 1 {cx - 8 + r * math.cos(a1):.1f},{cy + r * math.sin(a1):.1f}", stroke=color, sw=2))
    return G(g)


def _pin(cx, cy, color=ROSE):
    return G([P(f"M{cx},{cy + 16} C{cx - 15},{cy - 2} {cx - 11},{cy - 18} {cx},{cy - 18} C{cx + 11},{cy - 18} {cx + 15},{cy - 2} {cx},{cy + 16} Z", fill=color, stroke="none"),
              C(cx, cy - 6, 5, fill="#fff", stroke="none")])


def _counter_stamp(x, y, w, h, color, num, label, angle=-4):
    g = [R(x, y, w, h, stroke=color, sw=2, rx=4, opacity=.9), R(x + 3, y + 3, w - 6, h - 6, stroke=color, sw=.8, rx=2, opacity=.6),
         T(x + w * .36, y + h / 2 + 13, num, 38, cls="m", fill=color, anchor="middle", weight=800, opacity=.9),
         T(x + w * .74, y + h / 2 - 1, label, 13, fill=color, anchor="middle", weight=700, opacity=.9),
         T(x + w * .74, y + h / 2 + 16, "회", 13, fill=color, anchor="middle", weight=700, opacity=.9)]
    return G(g, transform=f"rotate({angle} {x + w / 2} {y + h / 2})", filt="rough")


def _plus_one(cx, cy, color=PERI):
    return G([C(cx, cy, 14, fill="#fff", stroke=color, sw=1.5, filt="softshadow"), T(cx, cy + 4, "+1", 12, fill=color, anchor="middle", weight=800)])


def _sticker_avatar(cx, cy, col, ch):
    return G([C(cx, cy, 26, fill="#fff", stroke="none", filt="softshadow"), avatar(cx, cy, 22, col, ch, 17)])


# ── 상태 · 가림 소품 ───────────────────────────────────────────────────────
@_safe
def o_scratch(W, H):
    g = asset_bg(W, H, "paper")
    cw, ch, y = 168, 150, 108
    xs = [32, 32 + cw + 36, 32 + 2 * (cw + 36)]
    a1, a2 = "교토! 단풍 시즌에", "같이 가자 ㅎㅎ"
    for i, x in enumerate(xs):
        g += [_card(x, y, cw, ch), avatar(x + 20, y + 20, 11, ROSE, "수", 10), T(x + 36, y + 24, "수아", 11, weight=700)]
        ix, iy, iw, ih = x + 12, y + 38, cw - 24, ch - 50
        if i == 0:
            g.append(scratch(ix, iy, iw, ih, "긁어서 보기"))
            continue
        under = [lines(ix, iy + 6, iw, ih - 12, 26, LINE2), hand(ix + 8, iy + 34, a1, 20), hand(ix + 8, iy + 62, a2, 20)]
        g += under
        if i == 1:
            g.append(scratch(ix, iy, iw, ih, ""))
            rnd = random.Random(7)
            # 손가락이 지나간 띠 두 줄 — 글줄 위치(첫 줄 iy+27 · 둘째 줄 iy+55)를 따라간다
            pts = [(ix + 14 + t * (iw - 28) / 9, iy + 27 + math.sin(t / 9 * math.pi * 2) * 4) for t in range(10)]
            pts += [(ix + 14 + t * (iw * .62 - 14) / 6, iy + 55 + math.cos(t) * 3) for t in range(7)]
            blobs = [C(f"{px:.1f}", f"{py:.1f}", f"{rnd.uniform(10, 13):.1f}", fill="#fff", stroke="none") for px, py in pts]
            g += blobs
            g.append(f'<clipPath id="scr-reveal">{"".join(blobs)}</clipPath>')
            g.append(G(under, clip="scr-reveal"))
            for _ in range(16):  # 은박 가루
                g.append(C(f"{rnd.uniform(ix, ix + iw):.1f}", f"{rnd.uniform(iy, iy + ih):.1f}", f"{rnd.uniform(1, 2.2):.1f}", fill="#B3B6BE", stroke="none", opacity=.8))
            fx, fy = ix + iw * .62 + 12, iy + 55
            g += [P(f"M{ix + 16},{iy + 62} Q{ix + iw * .35},{iy + 48} {fx},{fy}", stroke=MUTED, sw=1.5, dash="4 4"), C(fx, fy, 7, fill="#fff", stroke=MUTED, sw=1.5)]
    for x, c in zip(xs, ["숨김", "긁는 중 · 70%면 전체 공개", "공개"]):
        g.append(_cap(x + cw / 2, y + ch + 22, c))
    for x in xs[:2]:
        g.append(_arrow(x + cw + 18, y + ch / 2 + 7))
    g.append(notif_pill(W / 2 - 150, 332, "전원이 답했어요 · 답이 공개됐어요", w=300))
    g.append(_cap(W / 2, 406, "손가락으로 긁어요 · 질문 공개 · 어드벤트 · 카운트다운에 써요"))
    return g


@_safe
def o_envelope(W, H):
    g = asset_bg(W, H, "paper")
    ew, eh, y = 200, 130, 118
    x1, x2 = 56, 384
    g += [envelope(x1, y, ew, eh, sealed=True), lock(x1 + ew - 18, y + 16, 12, MUTED),
          _cap(x1 + ew / 2, y + eh + 22, "봉인 · 2027.10.25 0시에 열려요"), _arrow(W / 2, y + eh / 2 + 7)]
    # 개봉: 뒷면 + 열린 덮개 → 편지 → 앞주머니
    g.append(envelope(x2, y, ew, eh, sealed=False))
    lx, ly, lw, lh = x2 + 36, y - 36, ew - 72, 110
    g += [R(lx, ly, lw, lh, fill="#fff", stroke=LINE, rx=2, filt="softshadow"), lines(lx + 8, ly + 6, lw - 16, 44, 14, LINE2), hand(lx + 10, ly + 22, "2027년의 우리에게", 14)]
    g.append(poly([(x2, y + eh), (x2 + ew, y + eh), (x2 + ew, y), (x2 + ew / 2, y + eh * .55), (x2, y)], fill=CREAM, stroke=LINE))
    g.append(_cap(x2 + ew / 2, y + eh + 22, "개봉 · 뜯는 애니메이션 1회"))
    # 왁스 종류
    wy = 328
    g += [C(100, wy, 15, fill=ROSE, stroke="none", filt="rough"), T(100, wy + 4, "DIO", 9, fill="#fff", anchor="middle", weight=800)]
    for i, (ch, col) in enumerate(MEMBERS):
        cx = 150 + i * 44
        g += [C(cx, wy, 15, fill=col, stroke="none", filt="rough"), T(cx, wy + 4, ch, 11, fill="#fff", anchor="middle", weight=800)]
    g.append(_cap(194, wy + 36, "DIO 왁스 · 멤버 색 왁스(각자 봉인)"))
    g.append(notif_pill(380, wy - 17, "타임캡슐이 열렸어요"))
    g.append(_cap(W / 2, 430, "상태: 봉인 → 개봉(지정일 0시) — 타임캡슐 · 서프라이즈 장"))
    return g


@_safe
def o_lock(W, H):
    g = asset_bg(W, H, "paper")
    bw, bh, y = 190, 130, 68
    x1, x2 = 60, 390
    g += [dashed_box(x1, y, bw, bh, color=LINE, dots=False), lock(x1 + bw / 2, y + bh / 2 - 2, 24, MUTED),
          _cap(x1 + bw / 2, y + bh + 22, "잠김 · 네 차례가 아니에요"), _arrow(W / 2, y + bh / 2 + 7),
          R(x2, y, bw, bh, fill="#fff", stroke=PERI, sw=1.5, dash="6 4", rx=8), lines(x2 + 14, y + 36, bw - 28, bh - 50, 26, LINE2),
          lock(x2 + 24, y + 20, 14, PERI, open_=True), T(x2 + 46, y + 26, "수아 · 네 차례야", 11, weight=700, fill=PERI), pen(x2 + bw - 26, y + 22, PERI),
          _cap(x2 + bw / 2, y + bh + 22, "열림 · 턴이 오면 열려요")]
    # 비밀 일기 — 나 / 친구
    py, pw, ph = 246, 170, 110
    xa, xb = 100, 370
    g += [R(xa, py, pw, ph, fill="#fff", stroke=LINE, rx=6, filt="softshadow"), lines(xa + 12, py + 30, pw - 24, ph - 44, 22, LINE2),
          hand(xa + 16, py + 52, "오늘은 비밀 얘기…", 18), hand(xa + 16, py + 74, "사실 나 걔 좋아해", 18),
          lock(xa + pw - 20, py + 16, 12, INK), label_tag(xa + 10, py + 8, "나만 보기", CHAR, 10),
          _cap(xa + pw / 2, py + ph + 20, "나 · 평소처럼 보여요"), _arrow(W / 2, py + ph / 2 + 7),
          R(xb, py, pw, ph, fill="#fff", stroke=LINE, rx=6, filt="softshadow"), R(xb + 10, py + 30, pw - 20, ph - 44, fill="url(#hatch)", stroke="none", rx=4, opacity=.45),
          lock(xb + pw / 2, py + ph / 2 - 4, 18, MUTED), T(xb + pw / 2, py + ph - 8, "민희만 볼 수 있어요", 10, fill=MUTED, anchor="middle"),
          label_tag(xb + 10, py + 8, "나만 보기", CHAR, 10), _cap(xb + pw / 2, py + ph + 20, "친구 · 잠긴 칸으로 보여요")]
    g.append(_cap(W / 2, 428, "열림 · 닫힘 2 상태 · 점선 테두리와 세트 — 비밀 일기는 '나만 보기'"))
    return g


@_safe
def o_turnpen(W, H):
    g = asset_bg(W, H, "paper")
    g.append(notif_pill(W / 2 - 100, 52, "수아, 네 차례야", w=200))
    cy, r = 226, 26
    xs = [140 + i * 120 for i in range(4)]
    status = ["썼어요", "네 차례", "다음", "대기"]
    for i in range(3):
        g += [L(xs[i] + r + 8, cy, xs[i + 1] - r - 10, cy, stroke=LINE, sw=1.5, dash="4 4"),
              poly([(xs[i + 1] - r - 8, cy), (xs[i + 1] - r - 16, cy - 5), (xs[i + 1] - r - 16, cy + 5)], fill=LINE, stroke="none")]
    for i, ((ch, col), nm) in enumerate(zip(MEMBERS, NAMES)):
        x = xs[i]
        g += [avatar(x, cy, r, col, ch, 20), T(x, cy + r + 20, nm, 12, weight=700, anchor="middle"),
              T(x, cy + r + 36, status[i], 11, fill=PERI if i == 1 else MUTED, anchor="middle", weight=700 if i == 1 else None)]
        if i == 0: g.append(G([C(x + r - 4, cy - r + 4, 9, fill=SAGE, stroke="#fff", sw=2), P(f"M{x + r - 8},{cy - r + 4} l3,3 l6,-6", stroke="#fff", sw=2)]))
        if i == 1: g += [C(x, cy, r + 5, stroke=PERI, sw=1.5, dash="3 3"), pen(x, cy - r - 26, PERI), T(x, cy - r - 46, "지금 펜은 여기", 11, fill=PERI, anchor="middle", weight=700)]
    hx, hy = xs[1] - 18, cy + r + 76
    g += [_hourglass(hx, hy, 24, CAMEL), T(hx + 20, hy + 5, "36시간 남음 · 48시간 지나면 리마인드", 11, fill=MUTED)]
    g.append(_cap(32, 421, "쓰고 넘기면 펜이 다음 사람에게", anchor="start"))
    g.append(notif_pill(W - 32 - 230, 396, "수아가 아직 안 썼어요", w=230))
    return g


@_safe
def o_emptyslot(W, H):
    g = asset_bg(W, H, "paper")
    sw_, sh, y1 = 126, 78, 54
    for i, ((ch, col), nm) in enumerate(zip(MEMBERS, NAMES)):
        x = 32 + i * (sw_ + 24)
        g += [R(x, y1, sw_, sh, stroke=col, sw=1.5, dash="4 4", rx=8), avatar(x + 16, y1 + 16, 10, col, ch, 9),
              T(x + sw_ / 2, y1 + sh / 2 + 9, "여기 채워 주세요", 12, fill=MUTED, anchor="middle")]
    g.append(_cap(W / 2, y1 + sh + 20, "멤버 색 점선 4 4 · 글 11 — 누구 칸인지 색으로"))
    bw, bh, y2 = 232, 150, 198
    x1, x2 = 32, W - 32 - bw
    ch, col = MEMBERS[0]
    g += [dashed_box(x1, y2, bw, bh, color=col, dots=False), avatar(x1 + 20, y2 + 20, 12, col, ch, 11), T(x1 + 38, y2 + 24, "민희", 11, weight=700),
          T(x1 + bw / 2, y2 + bh / 2 + 6, "여기 채워 주세요", 12, fill=MUTED, anchor="middle"), pen(x1 + bw - 26, y2 + 22, col),
          _cap(x1 + bw / 2, y2 + bh + 22, "비어 있음"), _arrow(W / 2, y2 + bh / 2 + 7),
          _card(x2, y2, bw, bh), avatar(x2 + 20, y2 + 20, 12, col, ch, 11), T(x2 + 38, y2 + 24, "민희", 11, weight=700),
          lines(x2 + 14, y2 + 40, bw - 28, bh - 56, 26, LINE2), hand(x2 + 18, y2 + 66, "소금빵 데이! 또 갔다", 20), hand(x2 + 18, y2 + 92, "다음엔 지우도 같이", 20),
          photo_filled(x2 + bw - 82, y2 + bh - 66, 68, 50, "cafe"), tape(x2 + bw - 76, y2 + bh - 72, 44, 12, "sky", -6),
          _cap(x2 + bw / 2, y2 + bh + 22, "채워짐")]
    g.append(_cap(W / 2, 428, "상태: 비어 있음 → 채워짐 · 모든 함께 속지의 기본 재료"))
    return g


@_safe
def o_ribbon(W, H):
    g = asset_bg(W, H, "paper")
    rnd = random.Random(11)
    cs, gap, y, x0 = 50, 6, 176, 44
    for i, wd in enumerate(["카페", "지각", "비", "소금빵", "야식"]):
        x = x0 + i * (cs + gap)
        g += [R(x, y, cs, cs, fill=TAPES["butter"][0], stroke=TAPES["butter"][1], sw=1.2, rx=6), hand(x + cs / 2, y + cs / 2 + 6, wd, 15, anchor="middle"),
              C(x + cs / 2, y + cs / 2, cs * .36, stroke=ROSE, sw=2.2, opacity=.85)]
    row_w = 5 * cs + 4 * gap
    g.append(L(x0 - 6, y + cs / 2, x0 + row_w + 6, y + cs / 2, stroke=ROSE, sw=3, opacity=.75))
    g += _confetti(rnd, x0 - 8, 70, x0 + row_w + 8, 166, 34)
    g.append(ribbon(x0 + row_w / 2, 132, 110, 28, ROSE, "1줄!"))
    g.append(_cap(x0 + row_w / 2, y + cs + 24, "줄 완성 — 리본 + 색종이"))
    mx, my, mc = 408, 98, 32
    for r_ in range(3):
        for c_ in range(3):
            x, yy = mx + c_ * (mc + 3), my + r_ * (mc + 3)
            g += [R(x, yy, mc, mc, fill=TAPES["butter"][0], stroke=TAPES["butter"][1], rx=4), C(x + mc / 2, yy + mc / 2, mc * .3, stroke=ROSE, sw=1.8, opacity=.85)]
    gw = 3 * mc + 6
    for k in range(11):
        a = math.radians(-160 + k * 140 / 10)
        x1 = mx + gw / 2 + math.cos(a) * (gw / 2 + 12); y1 = my + gw / 2 + math.sin(a) * (gw / 2 + 12)
        x2 = mx + gw / 2 + math.cos(a) * (gw / 2 + 40); y2 = my + gw / 2 + math.sin(a) * (gw / 2 + 40)
        g.append(L(f"{x1:.1f}", f"{y1:.1f}", f"{x2:.1f}", f"{y2:.1f}", stroke=INKS[k % 6], sw=2.2))
    g += [ribbon(mx + gw / 2, my + gw + 12, 100, 26, PERI, "올 빙고!"), sparkle(mx - 22, my + 16, 8), sparkle(mx + gw + 24, my + gw - 8, 7, LAV)]
    g.append(_cap(mx + gw / 2, y + cs + 24, "전부 완성 — 폭죽"))
    g.append(notif_pill(W / 2 - 110, 296, "빙고 한 줄 완성!", w=220))
    g.append(_cap(W / 2, 362, "한 번만 재생 — 그 뒤엔 종이 리본으로 남아요"))
    g.append(_cap(W / 2, 382, "사건: 줄 완성 · 전부 완성 (움직이는 스티커 효과 재활용)"))
    return g


# ── 자동 도장 ──────────────────────────────────────────────────────────────
@_safe
def o_datestamp(W, H):
    g = asset_bg(W, H, "paper")
    rnd = random.Random(3)
    g += [label_tag(32, 40, "오늘 날짜 자동", PERI, 11), _cap(W - 32, 56, "소스: 기기 날짜", anchor="end")]
    cy = 164
    g += [stamp(130, cy, 50, PERI, "2026.10.25", 13, -10),
          G([T(130, cy + 22, "SUN", 10, cls="m", fill=PERI, anchor="middle", weight=700, opacity=.85)], transform=f"rotate(-10 130 {cy})", filt="rough"),
          stamp_rect(248, cy - 32, 150, 64, ROSE, ["OCT 25", "2026"], 15, -5),
          G([T(520, cy + 6, "26.10.25 SUN", 17, cls="m", fill=INK, anchor="middle", weight=700, opacity=.85)], transform=f"rotate(-3 520 {cy})", filt="rough"),
          L(452, cy + 16, 588, cy + 16, stroke=INK, sw=1, opacity=.4, dash="1 3")]
    for cx_, col in [(130, PERI), (323, ROSE), (520, INK)]:
        for _ in range(6):
            g.append(C(f"{cx_ + rnd.uniform(-58, 58):.1f}", f"{cy + rnd.uniform(-34, 34):.1f}", f"{rnd.uniform(1.5, 4):.1f}", fill=col, stroke="none", opacity=f"{rnd.uniform(.12, .3):.2f}"))
    for cx_, c in [(130, "원형 소인"), (323, "네모"), (520, "타자")]:
        g.append(_cap(cx_, cy + 72, c))
    for i, col in enumerate(PENS):
        g.append(C(W / 2 - 90 + i * 30, 292, 9, fill=col, stroke="#fff", sw=2))
    g.append(_cap(W / 2, 320, "잉크 7색 · 번짐은 찍을 때마다 랜덤"))
    g += [stamp(200, 392, 26, MUTED, "10.24", 10, -8), _arrow(260, 399), stamp(320, 392, 26, PERI, "10.25", 10, -8), _arrow(380, 399),
          C(440, 392, 26, stroke=MUTED, sw=1.5, dash="4 3", opacity=.7), T(440, 396, "10.26", 10, fill=MUTED, anchor="middle", weight=700)]
    g.append(_cap(W / 2, 444, "어제 찍은 건 어제 날짜 그대로 · 오늘 찍으면 오늘 · 내일은 아직"))
    return g


@_safe
def o_weatherstamp(W, H):
    g = asset_bg(W, H, "paper")
    g += [stamp_rect(48, 94, 220, 84, PERI, ["☀ 18° / 9°", "서울 · 맑음"], 17, -4), _cap(158, 204, "오늘 · 최고 / 최저 · 동네")]
    for i, (gl, nm, col) in enumerate([("☁", "흐림", MUTED), ("☂", "비", PERI), ("❄", "눈", LAV), ("☾", "밤", CHAR)]):
        cx = 330 + i * 72
        g += [stamp(cx, 136, 27, col, gl, 22, -8 + i * 5), _cap(cx, 190, nm)]
    g.append(_cap(330 + 1.5 * 72, 210, "아이콘 5 — 맑음 · 흐림 · 비 · 눈 · 밤"))
    g += [R(48, 260, 220, 70, stroke=MUTED, sw=1.5, dash="5 4", rx=4), T(158, 292, "? °", 20, cls="m", fill=MUTED, anchor="middle", weight=700),
          T(158, 316, "위치 꺼짐 — 아이콘만 손으로 골라요", 10, fill=MUTED, anchor="middle"), _cap(158, 354, "위치 미허용"), _arrow(300, 302),
          stamp_rect(330, 260, 180, 70, SAGE, ["☂ 15° / 11°", "부산 · 비"], 15, 3), _cap(420, 354, "위치 허용 · 그 동네 날씨")]
    g.append(_cap(W / 2, 420, "자동 · 기상청 · 위치 허용 시 — 찍은 뒤엔 그날 값으로 굳어요"))
    return g


@_safe
def o_winstamp(W, H):
    g = asset_bg(W, H, "paper")
    cy = 158
    for i, (txt, col, cap) in enumerate([("승", PERI, "이김"), ("패", ROSE, "짐"), ("무", MUTED, "비김")]):
        cx = 110 + i * 120
        g += [stamp(cx, cy, 44, col, txt, 30, -14 + i * 6), _cap(cx, cy + 70, cap)]
    for i, (nm, col, y) in enumerate([("LG", PERI, 116), ("SSG", ROSE, 168)]):
        g += [R(470, y, 118, 38, fill="#fff", stroke=LINE, rx=19, filt="softshadow"), C(490, y + 19, 11, fill=col, stroke="none"),
              T(508, y + 24, nm, 15, weight=800), T(562, y + 24, "홈" if i == 0 else "원정", 10, fill=MUTED, anchor="middle")]
    g.append(_cap(529, 230, "팀 2색 + 이니셜 · 로고 없이"))
    g += [T(W / 2, 288, "LG 7 : 4 SSG  ·  2026.10.25  잠실", 13, cls="m", fill=MUTED, anchor="middle", weight=700),
          _cap(W / 2, 308, "소스: 스코어보드 속지 — 경기 끝나면 결과 따라 자동으로 찍혀요"),
          notif_pill(W / 2 - 120, 338, "오늘 직관 7:4 승", w=240), _cap(W / 2, 418, "시즌 7승 4패 · 승률 .636 — 승률 트래커로 모아요")]
    return g


@_safe
def o_placestamp(W, H):
    g = asset_bg(W, H, "paper")
    rnd = random.Random(5)
    g += [_postmark(130, 150, 58, CHAR, "SEOUL · JAMSIL", "2026.10.25", "잠실", "SUN 18:30", -6),
          _wavy(204, 134, 96, CHAR), _wavy(204, 150, 96, CHAR), _wavy(204, 166, 96, CHAR),
          _postmark(400, 150, 58, ROSE, "SEONGSU · SEOUL", "2026.10.25", "성수", "소금빵집", 4),
          _wavy(474, 134, 96, ROSE), _wavy(474, 150, 96, ROSE), _wavy(474, 166, 96, ROSE),
          _cap(170, 236, "잠실 야구장 · 2026.10.25 — 위치 체크인"), _cap(470, 236, "성수 소금빵집 — 가게 QR")]
    g += [_qr(130, 282, 54, rnd), _cap(157, 362, "QR 찍기"), _nfc(320, 309), _cap(320, 362, "NFC 태그"), _pin(480, 309), _cap(480, 362, "위치(허용 시)")]
    g.append(_cap(W / 2, 420, "체크인 · QR · NFC — 가게 · 동네 · 여행지 · 소스: 위치 · QR(허용 시)"))
    return g


@_safe
def o_attendstamp(W, H):
    g = asset_bg(W, H, "paper")
    kinds = ["rabbit", "bear", "cat", "chick"]
    knames = ["토끼", "곰", "고양이", "병아리"]
    for i, ((ch, col), nm) in enumerate(zip(MEMBERS, NAMES)):
        cx = 100 + i * 140
        g += [_animal_stamp(cx, 112, 38, col, kinds[i], -10 + i * 6), _cap(cx, 170, f"{nm} · {knames[i]}")]
    g.append(_cap(W / 2, 192, "멤버마다 다른 그림 · 색 — 아바타 색 + 동물 실루엣(얼굴 없음)"))
    cell, gap_, wy = 60, 6, 228
    x0 = (W - (7 * cell + 6 * gap_)) / 2
    marks = [[0, 1], [0, 2, 3], [1], [0, 1, 2], [0, 1, 2, 3], None, None]
    for d in range(7):
        x = x0 + d * (cell + gap_)
        today = d == 4
        g.append(T(x + cell / 2, wy - 8, "월화수목금토일"[d], 10, fill=ROSE if d == 6 else MUTED, anchor="middle"))
        if marks[d] is None:
            g.append(R(x, wy, cell, cell, stroke=LINE, dash="4 4", rx=6))
        else:
            g.append(R(x, wy, cell, cell, fill="#fff", stroke=PERI if today else LINE, sw=1.5 if today else 1, rx=6))
            for k, mi in enumerate(marks[d]):
                r_, c_ = divmod(k, 2)
                ch, col = MEMBERS[mi]
                g.append(G([C(x + 17 + c_ * 26, wy + 17 + r_ * 26, 11, stroke=col, sw=1.6, opacity=.85), _animal(x + 17 + c_ * 26, wy + 17 + r_ * 26, 6.5, col, kinds[mi])], filt="rough"))
        if today: g.append(T(x + cell / 2, wy + cell + 14, "오늘", 10, fill=PERI, anchor="middle", weight=700))
    g.append(notif_pill(W / 2 - 100, 338, "오늘 전원 출석!", w=200))
    g.append(_cap(W / 2, 414, "소스: 방 멤버 · 사건: 전원 출석 — 네 개 다 찍힌 날만 알림"))
    return g


@_safe
def o_exif_label(W, H):
    g = asset_bg(W, H, "paper")
    pw = 190; ph_ = pw * 1.21
    x1, x2, y = 64, 386, 66
    g.append(polaroid(x1, y, pw, "", -2, "cafe"))
    g.append(G([T(x1 + pw / 2, y + ph_ - pw * .1, "2026.10.25 · 성수동", 12, cls="m", fill=MUTED, anchor="middle", weight=700)], transform=f"rotate(-2 {x1 + pw / 2} {y + ph_ / 2})"))
    g += [label_tag(x1 + pw - 76, y - 12, "자동 · EXIF", PERI, 10), _cap(x1 + pw / 2, y + ph_ + 26, "라벨 보임 · 촬영 날짜 · 장소"), _arrow(W / 2, y + ph_ / 2 + 7),
          polaroid(x2, y, pw, "소금빵 성지!", 2, "cafe"), _cap(x2 + pw / 2, y + ph_ + 26, "라벨 숨김 · 손글씨 캡션"),
          check(x2 + pw - 92, y - 18, 14, MUTED, on=True), T(x2 + pw - 72, y - 6, "라벨 숨기기", 11, fill=MUTED)]
    g.append(_cap(W / 2, 376, "소스: 사진 EXIF — 장소는 사진에 위치가 있을 때만 · 글꼴 3 · 숨기기 옵션"))
    fy = 410
    g += [T(W / 2 - 150, fy, "2026.10.25", 12, cls="m", fill=MUTED, anchor="middle"), T(W / 2, fy, "2026.10.25", 12, fill=MUTED, anchor="middle"),
          hand(W / 2 + 150, fy + 2, "2026.10.25", 16, MUTED, anchor="middle"), _cap(W / 2 - 150, fy + 20, "타자"), _cap(W / 2, fy + 20, "고딕"), _cap(W / 2 + 150, fy + 20, "손글씨")]
    return g


# ── 살아 있는 스티커 ───────────────────────────────────────────────────────
@_safe
def o_dday_sticker(W, H):
    g = asset_bg(W, H, "paper")
    y = 112
    g += [G([label_tag(48, y, "D-37", PERI, 30)], transform=f"rotate(-4 113 {y + 20})"), _cap(113, y + 72, "라벨 · 시험까지"),
          _ticket(226, y - 10, 176, 64, "D-7", "콘서트 · 11.1 SUN"), _cap(314, y + 72, "티켓 · 콘서트"),
          stamp(522, y + 20, 42, ROSE, "D-DAY", 15, -12), _cap(522, y + 72, "도장 · 기념일")]
    sy = 246
    xs = [120, 250, 380, 510]
    for (s, col), x in zip([("D-37", MUTED), ("D-7", PERI), ("D-1", ROSE), ("D-DAY", ROSE)], xs):
        w = len(s) * 13 * .95 + 16
        g.append(label_tag(x - w / 2, sy, s, col, 13, fill="#fff" if col == MUTED else None))
    for i in range(3):
        g.append(_arrow((xs[i] + xs[i + 1]) / 2, sy + 17))
    g.append(_cap(W / 2, sy + 46, "매일 바뀌어요 · D-7 · D-1 · D-day에 알림"))
    g.append(notif_pill(W / 2 - 95, 344, "콘서트 D-7", w=190))
    g.append(_cap(W / 2, 418, "자동 계산 — 콘서트 · 시험 · 기념일 날짜만 넣으면 돼요"))
    return g


@_safe
def o_counter(W, H):
    g = asset_bg(W, H, "paper")
    y, w, h = 84, 160, 84
    for i, (num, lab, col) in enumerate([("7", "콘서트", PERI), ("2", "팬싸", ROSE), ("11", "직관", SAGE)]):
        x = 32 + i * 208
        g.append(_counter_stamp(x, y, w, h, col, num, lab, -4 + i * 3))
    g += [_plus_one(32 + w + 2, y - 2), _cap(112, y + h + 26, "누를 때마다 +1"), _cap(320, y + h + 26, "탭으로 세기"), _cap(528, y + h + 26, "스코어보드 속지에서 자동 집계")]
    ty = 254
    g += [R(32, ty, 250, 96, fill="#fff", stroke=LINE, rx=8, filt="softshadow"), T(48, ty + 22, "직관", 12, weight=700), T(266, ty + 22, "11회", 12, fill=MUTED, anchor="end"),
          _tally(50, ty + 40, 11, PEN, 26), _cap(157, ty + 96 + 22, "바를 정(正) 표기 옵션")]
    g += [stamp_rect(352, ty + 14, 70, 60, MUTED, ["6"], 24, -4), _arrow(447, ty + 50), stamp_rect(472, ty + 14, 70, 60, PERI, ["7"], 24, 3), _plus_one(552, ty + 14),
          _cap(452, ty + 96 + 22, "탭 → +1 (길게 누르면 되돌리기)")]
    g.append(_cap(W / 2, 430, "소스: 사용자 탭 · 속지 집계 — 숫자는 도장 글꼴로"))
    return g


@_safe
def o_vote_sticker(W, H):
    g = asset_bg(W, H, "paper")
    g.append(hand(W / 2, 64, "Q. 내일 아침은 소금빵 vs 크루아상?", 22, anchor="middle"))
    bw, bh, y = 236, 150, 90
    xa, xb = 48, W - 48 - bw
    for x, letter, opt, col, n in [(xa, "A", "소금빵", ROSE, 3), (xb, "B", "크루아상", MUST, 1)]:
        g += [R(x, y, bw, bh, fill="#fff", stroke=LINE, rx=14, filt="softshadow"), T(x + 16, y + 34, letter, 26, fill=MUTED, weight=800, opacity=.6),
              hand(x + 48, y + 32, opt, 20), stamp(x + bw - 30, y + 30, 20, col, str(n), 16, -10)]
    for (ch, col), (sx, sy) in zip(MEMBERS[:3], [(xa + 70, y + 100), (xa + 128, y + 92), (xa + 182, y + 106)]):
        g.append(_sticker_avatar(sx, sy, col, ch))
    ch, col = MEMBERS[3]
    bx, by = xb + bw / 2, y + 100
    g.append(_sticker_avatar(bx, by, col, ch))
    gx, gy = W / 2, 312
    g += [C(gx, gy, 22, stroke=col, sw=1.5, dash="4 3"), T(gx, gy + 6, ch, 16, fill=col, anchor="middle", weight=700, opacity=.5),
          _curve_arrow(gx + 26, gy - 8, bx - 14, by + 30, -26), T(gx, gy + 44, "내 아바타 스티커를 끌어다 놓아요", 11, fill=MUTED, anchor="middle")]
    g += [_cap(xa + bw / 2, y + bh + 22, "A — 3표"), _cap(xb + bw / 2, y + bh + 22, "B — 1표")]
    g.append(notif_pill(W / 2 - 150, 386, "전원 투표 완료 · 소금빵 3 : 1", w=300))
    g.append(_cap(W / 2, 448, "얼굴 없는 도형 아바타 · 프로필 색 · 전원 투표하면 결과 알림"))
    return g


@_safe
def o_linkcard(W, H):
    g = asset_bg(W, H, "paper")
    g += [T(32, 54, "붙여넣은 링크", 11, fill=MUTED, weight=700), T(126, 54, "https://youtu.be/xK9…   ·   https://blog.naver.com/salt…", 11, cls="m", fill=MUTED),
          _cap(W / 2, 82, "↓ OG 메타(이미지 · 제목)를 읽어 종이 카드로")]
    cw, chh = 220, 165
    x1, y1 = 60, 102
    g.append(phone_card(x1, y1, cw, chh, "지우 직캠 · 콘서트 1열 4K", "youtube.com · 3:42"))
    pcx, pcy = x1 + cw / 2, y1 + chh * .3
    g += [C(pcx, pcy, 20, fill="#fff", stroke="none", opacity=.92, filt="softshadow"), poly([(pcx - 6, pcy - 9), (pcx - 6, pcy + 9), (pcx + 10, pcy)], fill=INK, stroke="none"),
          tape(x1 - 14, y1 - 8, 64, 16, "sky", -10)]
    x2, y2 = 360, 116
    g += [phone_card(x2, y2, cw, chh, "성수 소금빵집 솔직 후기", "blog.naver.com"), tape(x2 + cw - 50, y2 - 8, 64, 16, "pink", 8),
          label_tag(x2 + cw - 72, y2 + chh - 30, "↗ 열기", PERI, 10, fill="#fff"),
          _cap(x1 + cw / 2, y1 + chh + 24, "유튜브 직캠 · 재생 표시"), _cap(x2 + cw / 2, y2 + chh + 24, "블로그 · 누르면 열림")]
    g += [_cap(W / 2, 358, "OG 이미지 · 제목 자동 · 누르면 열림"), _cap(W / 2, 378, "카드 비율 4:3 · 모서리 테이프 · 직캠 · 플리 · 블로그")]
    return g


@_safe
def o_daytape_piece(W, H):
    g = asset_bg(W, H, "paper")
    bg, fg = TAPES["butter"]
    ry = 104
    g.append(tape_roll(76, ry, 36, "butter"))
    sx, sw_ = 112, W - 32 - 112
    g.append(R(sx, ry - 14, sw_, 28, fill=bg, stroke="none"))
    n = 7; cw = sw_ / n
    for i in range(n):
        dx = sx + i * cw
        g += [L(dx, ry - 14, dx, ry + 14, stroke=fg, dash="2 3"), T(dx + cw / 2, ry + 5, f"10.{25 + i}" if 25 + i <= 31 else f"11.{25 + i - 31}", 12, anchor="middle", weight=700, fill=INK if i == 0 else fg)]
    g += [R(sx + 2, ry - 14, cw - 4, 28, stroke=INK, sw=1.2, dash="3 2", rx=2, opacity=.6), _cap(sx, ry + 36, "↑ 오늘 조각 — 뜯을 수 있어요 · 나머지는 잠김", anchor="start")]
    px, py = 120, 200
    g += [tape(px, py, 104, 30, "butter", -3), T(px + 52, py + 20, "10.25", 13, anchor="middle", weight=800), hand(px + 128, py + 24, "소금빵 데이", 24),
          _cap(px, py + 56, "뜯은 조각 — 찢은 끝 + 날짜 + 한 줄", anchor="start")]
    qy = 310
    g += [R(px, qy, 104, 30, stroke=fg, sw=1.2, dash="4 3", rx=2), T(px + 52, qy + 20, "10.26", 13, anchor="middle", weight=800, fill=fg),
          lock(px + 128, qy + 9, 12, MUTED), T(px + 148, qy + 20, "내일 0시에 뜯겨요", 12, fill=MUTED), _cap(px, qy + 56, "다음 조각 — 잠김", anchor="start")]
    # 지난 조각들 — 하루 한 장씩 쌓인다
    g.append(_cap(500, 196, "지난 조각 — 하루 한 장씩 쌓여요"))
    for i, (d, txt, ang) in enumerate([("10.22", "카페 투어", -3), ("10.23", "비 와서 집콕", 2), ("10.24", "빙고 1줄!", -2)]):
        yy = 214 + i * 54
        g += [tape(408, yy, 80, 26, "butter", ang), T(448, yy + 17, d, 11, anchor="middle", weight=700), hand(500, yy + 20, txt, 18)]
    g.append(_cap(W / 2, 436, "오늘 조각만 뜯겨요 · 내일은 0시에 — 트리거: 매일 0시"))
    return g


@_safe
def o_reaction(W, H):
    g = asset_bg(W, H, "paper")
    px, py, pw, ph = 40, 54, 310, 330
    g += [R(px, py, pw, ph, fill="#fff", stroke=LINE, rx=8, filt="softshadow"), lines(px + 16, py + 190, pw - 32, 110, 28, LINE2),
          photo_filled(px + 20, py + 18, pw - 40, 160, "cafe"), tape(px + 60, py + 10, 70, 16, "mint", -6, pattern="stripes"),
          hand(px + 22, py + 232, "소금빵 또 먹음 ㅎㅎ 3일 연속", 22), hand(px + 22, py + 260, "내일은 진짜 참는다", 22), T(px + 16, py + ph - 12, "민희 · 10.25", 10, fill=MUTED)]
    hx, hy = px + pw - 6, py + 118
    g += [sticker_outline(_heart_d(hx, hy, 19), ROSE), avatar(hx + 14, hy + 16, 9, ROSE, "수", 9)]
    sx_, sy_ = px + pw - 2, py + 212
    g += [sticker_outline(_star_d(sx_, sy_, 22), MUST), avatar(sx_ + 16, sy_ + 16, 9, SAGE, "지", 9)]
    bx, by = px + pw - 42, py + 282
    g += [speech(bx, by, 132, 36, "소금빵 또?!", tail="left", size=17), avatar(bx + 12, by + 36 + 20, 10, MUST, "현", 9)]
    lx = 420
    g += [heart(lx, 100, 11, ROSE), T(lx + 22, 104, "하트 — 가볍게", 12), star(lx, 142, 12, MUST), T(lx + 22, 146, "별 — 최고!", 12),
          speech(lx - 12, 170, 56, 24, "...", size=11), T(lx + 56, 188, "한마디 — 짧은 댓글", 12), _cap(lx + 60, 232, "붙인 사람 아바타가 함께")]
    g.append(notif_pill(W - 32 - 200, 290, "반응 3개가 도착했어요", w=200))
    g.append(_cap(W - 32, 346, "묶어서 알림 — 하루 한 번", anchor="end"))
    g.append(_cap(W / 2, 430, "친구가 내 장에 붙이는 작은 하트 · 별 · 한마디 — 사건: 반응 도착(묶어서)"))
    return g


# ── 내 에셋 · 나눔 ────────────────────────────────────────────────────────
@_safe
def o_photo_sticker(W, H):
    g = asset_bg(W, H, "paper")
    x1, y1, pw, ph = 40, 84, 200, 150
    g += [photo_filled(x1, y1, pw, ph, "cafe"), R(x1 + 16, y1 + ph * .62, pw - 32, 6, fill=CAMEL, stroke="none", rx=2, opacity=.5),
          _cup(x1 + pw / 2, y1 + ph * .54, 70, CREAM, outline=None), R(x1 + pw * .28, y1 + ph * .3, pw * .44, ph * .5, stroke=PERI, sw=1.5, dash="5 4", rx=6),
          _cap(x1 + pw / 2, y1 + ph + 24, "원본 사진 · 컵을 골라요"), _arrow(268, y1 + ph / 2 + 7)]
    cx2, cy2 = 328, y1 + ph / 2
    g += [_cup(cx2, cy2, 76, CREAM, outline="white"), _cap(cx2, y1 + ph + 24, "배경 제거 · 기기 내")]
    sx, sy, sw_, sh = 400, 70, 200, 180
    g.append(sticker_sheet(sx, sy, sw_, sh, label="씰 테두리 3"))
    for i, (ol, nm) in enumerate([("white", "흰"), (None, "없음"), ("holo", "홀로")]):
        cx = sx + 38 + i * 62
        g += [_cup(cx, sy + 72, 40, CREAM, outline=ol), _cap(cx, sy + 122, nm)]
    g.append(_cap(sx + sw_ / 2, sy + sh + 24, "씰 테두리 3 · 흰 · 없음 · 홀로"))
    ty = 300
    g.append(sticker_sheet(40, ty, 560, 100, label="내 보관함 · 기기 간 동기화"))
    g += [_cup(100, ty + 46, 44, CREAM), _cup(190, ty + 46, 44, TAPES["pink"][0]),
          sticker_outline(_ellipse_d(290, ty + 46, 30, 18), CAMEL), P(f"M275,{ty + 40} q15,-6 30,0", stroke="#fff", sw=2),
          sticker_outline(f"M372,{ty + 22} L404,{ty + 22} L398,{ty + 70} L378,{ty + 70} Z", TAPES["sky"][0]), L(392, ty + 14, 400, ty + 44, stroke=ROSE, sw=3),
          sticker_outline(_heart_d(480, ty + 44, 18), ROSE)]
    g.append(_cap(W / 2, 432, "내 보관함 동기화 — 어느 기기에서나 같은 스티커 · 사람 사진은 기기 안에서만 처리"))
    return g


@_safe
def o_drawn_sticker(W, H):
    g = asset_bg(W, H, "paper")
    x1, y1, pw, ph = 40, 66, 240, 220
    g += [R(x1, y1, pw, ph, fill="#fff", stroke=LINE, rx=8, filt="softshadow"), dotgrid(x1 + 14, y1 + 14, pw - 28, ph - 28, 20, "#E4DED0")]
    g += _doodle(x1 + 76, y1 + 96, x1 + 172, y1 + 128, 70)
    sel = (x1 + 26, y1 + 34, pw - 52, ph - 64)
    g.append(R(*sel, stroke=PERI, sw=1.2, dash="5 4", rx=6))
    for hx, hy in [(sel[0], sel[1]), (sel[0] + sel[2], sel[1]), (sel[0], sel[1] + sel[3]), (sel[0] + sel[2], sel[1] + sel[3])]:
        g.append(C(hx, hy, 4, fill="#fff", stroke=PERI, sw=1.5))
    g += [T(sel[0] + sel[2] - 2, sel[1] - 8, "획 9개 묶음", 10, fill=PERI, anchor="end", weight=700), _cap(x1 + pw / 2, y1 + ph + 24, "펜으로 그린 획을 묶어요"), _arrow(W / 2, y1 + ph / 2 + 7)]
    x2 = W - 40 - pw
    g.append(sticker_sheet(x2, y1, pw, ph, label="내 스티커"))
    g += _doodle(x2 + 76, y1 + 96, x2 + 172, y1 + 128, 70, sticker=True)
    g.append(_cap(x2 + pw / 2, y1 + ph + 24, "스티커로 저장 · 흰 테두리 옵션"))
    ry = 372
    for i, (cx, s, ang) in enumerate([(200, 22, -12), (320, 30, 6), (440, 38, -4)]):
        fd = _flower_d(cx, ry, s)
        g.append(G([sticker_outline(fd, TAPES["pink"][0], 3), P(fd, stroke=PEN, sw=1.8), C(cx, ry, s * .22, fill=MUST, stroke=PEN, sw=1.6)], transform=f"rotate({ang} {cx} {ry})"))
    g.append(_cap(W / 2, 432, "획 묶음 → 스티커로 저장 · 크기 · 회전 자유 · 내 보관함 · 방 나눔"))
    return g


@_safe
def o_handwriting_sticker(W, H):
    g = asset_bg(W, H, "paper")
    x1, y1, pw, ph = 40, 74, 230, 150
    g += [R(x1, y1, pw, ph, fill="#fff", stroke=LINE, rx=8, filt="softshadow"), lines(x1 + 14, y1 + 20, pw - 28, ph - 40, 30, LINE2),
          hand(x1 + 30, y1 + 88, "오운완!", 38), R(x1 + 20, y1 + 48, 132, 54, stroke=PERI, sw=1.2, dash="5 4", rx=6),
          T(x1 + 152, y1 + 42, "획 선택", 10, fill=PERI, anchor="end", weight=700), _cap(x1 + pw / 2, y1 + ph + 24, "손글씨 한 줄 → 투명 PNG"), _arrow(W / 2, y1 + ph / 2 + 7)]
    x2 = W - 40 - pw
    g.append(sticker_sheet(x2, y1, pw, ph))
    for i, (col, ang) in enumerate([(PEN, -4), (PENS[4], 3), (PENS[2], -2)]):
        sx, sy = x2 + 24 + i * 22, y1 + 14 + i * 40
        g.append(G([R(sx, sy, 134, 44, fill="#fff", stroke="none", rx=8, filt="shadow"), hand(sx + 14, sy + 33, "오운완!", 30, col)], transform=f"rotate({ang} {sx + 67} {sy + 22})"))
    g.append(_cap(x2 + pw / 2, y1 + ph + 24, "내 글씨 스티커 · 색 바꾸기 3"))
    ry = 318
    g.append(_cap(W / 2, ry - 14, "내 글씨 재사용 — 날마다 다시 쓰지 않아도"))
    for i, (d, col) in enumerate([("10.22", PEN), ("10.24", PENS[4]), ("10.25", PENS[2])]):
        cx = 170 + i * 150
        g += [tape(cx - 44, ry + 4, 56, 14, "butter", -4), T(cx - 16, ry + 15, d, 10, anchor="middle", weight=700),
              G([R(cx - 50, ry + 26, 100, 34, fill="#fff", stroke="none", rx=6, filt="softshadow"), hand(cx, ry + 51, "오운완!", 24, col, anchor="middle")], transform=f"rotate({-3 + i * 3} {cx} {ry + 43})")]
    g.append(_cap(W / 2, 430, "획 → 투명 PNG · 색 바꾸기 · 내 보관함"))
    return g


@_safe
def o_share_box(W, H):
    g = asset_bg(W, H, "paper")
    kb, kf = TAPES["kraft"]
    bx, by, bw, bh = 120, 196, 190, 110
    g += [R(bx + 10, by - 26, bw - 20, 30, fill=CREAM, stroke=kf, sw=1.2),
          R(bx + 12, by - 50, (bw - 24) / 2 - 3, 26, fill=CAMEL, stroke=kf, sw=1.2, rx=2), R(bx + bw / 2 + 3, by - 50, (bw - 24) / 2 - 3, 26, fill=CAMEL, stroke=kf, sw=1.2, rx=2),
          sticker_outline(_star_d(bx + 58, by - 38, 20), MUST), sticker_outline(_heart_d(bx + 116, by - 42, 17), ROSE),
          sticker_outline(_flower_d(bx + 160, by - 32, 30), LAV), C(bx + 160, by - 32, 6, fill=MUST, stroke="none"),
          R(bx, by, bw, bh, fill=kb, stroke=kf, sw=1.5, rx=3),
          poly([(bx, by), (bx - 50, by - 30), (bx - 50, by - 46), (bx, by - 16)], fill=CAMEL, stroke=kf, sw=1.2),
          poly([(bx + bw, by), (bx + bw + 50, by - 30), (bx + bw + 50, by - 46), (bx + bw, by - 16)], fill=CAMEL, stroke=kf, sw=1.2),
          label_tag(bx + 52, by + 34, "스티커 6개", CAMEL, 12, fill="#fff"), T(bx + bw / 2, by + 88, "민희의 나눔 상자", 11, fill=kf, anchor="middle", weight=700),
          sticker_outline(_star_d(bx - 42, by + 98, 14), PERI), sticker_outline(_heart_d(bx + bw + 42, by + 94, 12), SAGE),
          _cap(bx + bw / 2, by + bh + 28, "내가 만든 스티커를 올리면 · 방 멤버가 가져가요")]
    for i, ((ch, col), nm) in enumerate(zip(MEMBERS, NAMES)):
        y = 106 + i * 64
        taken = i in (1, 2)
        g += [avatar(420, y, 18, col, ch, 14), T(446, y - 2, nm, 12, weight=700)]
        if i == 0:
            g.append(T(446, y + 16, "나눈 사람", 11, fill=MUTED))
        else:
            g += [check(446, y + 5, 14, SAGE if taken else LINE, on=taken), T(466, y + 16, "가져감" if taken else "아직", 11, fill=SAGE if taken else MUTED, weight=700 if taken else None)]
    g.append(notif_pill(W / 2 - 160, 386, "민희가 스티커 6개를 나눴어요", w=320))
    g.append(_cap(W / 2, 448, "방 안에서만 · 가져간 사람 표시 — 띵(나눠 사기) · 덤(동봉 스티커) 문화"))
    return g


def _artist_card(x, y, w, h, ch, col, name, sub, price, subscribed, kind, seed):
    rnd = random.Random(seed)
    g = [R(x, y, w, h, fill="#fff", stroke=LINE, rx=12, filt="shadow"), avatar(x + 30, y + 30, 18, col, ch, 14), T(x + 56, y + 27, name, 13, weight=800), T(x + 56, y + 43, sub, 10, fill=MUTED)]
    sy = y + 62
    g.append(R(x + 14, sy, w - 28, 92, fill=PAPERS[1], stroke=LINE2, rx=8))
    if kind == "sticker":
        g += [sticker_outline(_star_d(x + 50, sy + 46, 18), MUST), sticker_outline(_heart_d(x + 104, sy + 44, 15), ROSE),
              sticker_outline(_flower_d(x + 160, sy + 46, 26), LAV), C(x + 160, sy + 46, 5, fill=MUST, stroke="none"), _cup(x + 214, sy + 46, 34, TAPES["mint"][0])]
    else:
        for i, tex in enumerate(["grid", "dots", "lines"]):
            g.append(paper_swatch(x + 26 + i * 72, sy + 12, 56, 68, PAPERS[rnd.randrange(len(PAPERS))], texture=tex, rx=3))
    g.append(label_tag(x + 14, y + h - 40, price, CAMEL, 11))
    if subscribed: g.append(label_tag(x + w - 86, y + h - 40, "구독 중", SAGE, 11))
    else: g.append(label_tag(x + w - 70, y + h - 40, "구독", MUTED, 11, fill="#fff"))
    return G(g)


@_safe
def o_market(W, H):
    g = asset_bg(W, H, "paper")
    g += [_artist_card(40, 66, 260, 232, "작", LAV, "작가A · 펄리버튼풍", "씰 스티커 · 낱개 판매", "₩2,500 · 낱개", True, "sticker", 1),
          stamp(262, 100, 28, ROSE, "OPEN", 11, -14),
          _artist_card(340, 66, 260, 232, "작", SAGE, "작가B · 레트로 문구", "속지 · 낱장 판매", "₩1,900 · 낱장", False, "paper", 2),
          label_tag(508, 80, "11.1 오픈", MUTED, 10, fill="#fff")]
    g.append(notif_pill(W / 2 - 106, 326, "작가A 통판이 열렸어요", w=212))
    g.append(_cap(W / 2, 392, "작가 마켓 · 통판 알림 — 상점 알림으로 분류(방 알림과 섞이지 않게)"))
    g.append(_cap(W / 2, 414, "작가 카드: 아바타(초성) · 작가명 · 미리보기 · 가격 · 구독 — 로고 · 캐릭터 IP 없이"))
    return g
