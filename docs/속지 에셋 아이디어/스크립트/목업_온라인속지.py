# -*- coding: utf-8 -*-
"""② 온라인 속지 목업 15종 — fn(W, H, land) -> list[str]  (W=1024, H=768, land=True)

종이 속지처럼 보이되 '칸 상태'와 '알림 · 자동'이 눈에 보이게 그린다.
  칸 상태  비어 있음 = 점선 상자(dashed_box) · 채워짐 = 흰 카드 + 멤버 아바타 · 잠김 = lock + 점선 · 숨김 = scratch 은박 · envelope
  알림     모서리에 알약 하나(notif_pill) · 자동 입력 값에는 작은 '자동 · 잠긴 숫자' 라벨(_auto)
그리기는 목업_도형 만 쓴다. 날짜 예시 2026-10-25(일).
"""
import math  # noqa: F401
import random

from 목업_도형 import *  # noqa: F401,F403

KRAFT_DARK = TAPES["kraft"][1]   # 예산 초과 등 '같은 색의 진한 톤'
POCKET = "#F3F1EC"               # 포켓 · 틀 바탕


# ── 공통 도우미 ──────────────────────────────────────────────────────────
def _safe(fn):
    """목업 함수는 절대 예외를 올리지 않는다 — 실패하면 오류 글이 적힌 빈 장을 돌려준다."""
    def wrap(W, H, land=True):
        try:
            return fn(W, H, land)
        except Exception as e:  # noqa: BLE001
            return [header(W, fn.__name__[2:].upper().replace("_", " ")), T(M, M + 120, f"render error: {e}", 12, fill=ROSE)]
    wrap.__name__ = fn.__name__
    wrap.__doc__ = fn.__doc__
    return wrap


def _auto(x, y, text="자동 입력 · 잠긴 글자", anchor="start", size=10):
    """자동 입력 값 옆의 작은 라벨(자물쇠 + 회색 글)"""
    if anchor == "end":
        tw = len(text) * size * 0.92
        return G([lock(x - tw - 12, y - 7, 9, MUTED), T(x, y, text, size, fill=MUTED, anchor="end")])
    return G([lock(x + 6, y - 7, 9, MUTED), T(x + 18, y, text, size, fill=MUTED)])


def _pill(W, H, text, corner="br"):
    """알림 알약 하나 — 기본은 오른쪽 아래 모서리"""
    w = len(text) * 12.5 + 62
    x = W - M - w if corner.endswith("r") else M
    y = H - M - 34 if corner.startswith("b") else M + 54
    return notif_pill(x, y, text, w)


def _bar(x, y, w, h, ratio, color, track=LINE2, over=None):
    """가로 게이지. ratio > 1 이면 100% 눈금 뒤를 over 색으로 채운다."""
    g = [R(x, y, w, h, fill=track, stroke="none", rx=h / 2)]
    if ratio <= 1:
        g.append(R(x, y, max(h, w * ratio), h, fill=color, stroke="none", rx=h / 2))
    else:
        full = w / ratio
        g += [R(x, y, full, h, fill=color, stroke="none", rx=h / 2),
              R(x + full - h / 2, y, w - full + h / 2, h, fill=over or color, stroke="none", rx=h / 2),
              L(x + full, y - 3, x + full, y + h + 3, stroke=INK, sw=1)]
    return G(g)


def _qr(x, y, s, seed=3):
    """QR 느낌의 작은 사각(무작위 모듈 + 모서리 파인더 3)"""
    rnd = random.Random(seed)
    n = 21; pad = s * 0.07; c = (s - 2 * pad) / n; ox, oy = x + pad, y + pad
    g = [R(x, y, s, s, fill="#fff", stroke=LINE, rx=3)]
    for i in range(n):
        for j in range(n):
            finder = (i < 8 and j < 8) or (i < 8 and j >= n - 8) or (i >= n - 8 and j < 8)
            if not finder and rnd.random() < 0.42:
                g.append(R(ox + j * c, oy + i * c, c, c, fill=INK, stroke="none"))
    for fi, fj in [(0, 0), (0, n - 7), (n - 7, 0)]:
        fx, fy = ox + fj * c, oy + fi * c
        g += [R(fx + c / 2, fy + c / 2, 6 * c, 6 * c, fill="#fff", stroke=INK, sw=c), R(fx + 2 * c, fy + 2 * c, 3 * c, 3 * c, fill=INK, stroke="none")]
    return G(g)


def _cake(cx, cy, s, color=ROSE):
    """작은 사각 케이크 도장(초 + 불)"""
    return G([E(cx, cy + s * .42, s * .62, s * .12, fill="#fff", stroke="#D9D2C4"),
              R(cx - s / 2, cy - s * .1, s, s * .5, fill=color, stroke="none", rx=3),
              R(cx - s / 2, cy - s * .1, s, s * .14, fill="#fff", stroke="none", rx=3, opacity=.75),
              L(cx, cy - s * .1, cx, cy - s * .42, stroke="#D98B84", sw=2),
              C(cx, cy - s * .5, s * .09, fill=MUST, stroke="none")])


def _zigzag_rect(x, y, w, h, t=8):
    n = max(2, int(w / t)); t = w / n
    d = [f"M{x},{y + 5}"]
    for i in range(n):
        d.append(f"L{x + i * t + t / 2:.1f},{y} L{x + (i + 1) * t:.1f},{y + 5}")
    d.append(f"L{x + w},{y + h - 5}")
    for i in range(n):
        d.append(f"L{x + w - i * t - t / 2:.1f},{y + h} L{x + w - (i + 1) * t:.1f},{y + h - 5}")
    d.append("Z")
    return " ".join(d)


def _receipt(x, y, w, h, store, date, items, total, angle=0):
    """영수증 모양 스티커(위아래 지그재그 · 흰 · 그림자)"""
    g = [P(_zigzag_rect(x, y, w, h), fill="#fff", stroke="#DDD6C9", sw=1, filt="softshadow")]
    cy = y + 30
    g += [T(x + w / 2, cy, store, 13, weight=800, anchor="middle"), T(x + w / 2, cy + 16, date, 10, cls="m", fill=MUTED, anchor="middle"),
          L(x + 12, cy + 26, x + w - 12, cy + 26, stroke=LINE, dash="2 3")]
    yy = cy + 46
    for name, price in items:
        g += [T(x + 14, yy, name, 10), T(x + w - 14, yy, price, 10, cls="m", anchor="end")]; yy += 18
    g += [L(x + 12, yy - 6, x + w - 12, yy - 6, stroke=LINE, dash="2 3"),
          T(x + 14, yy + 14, "합계", 11, weight=700), T(x + w - 14, yy + 14, total, 13, cls="m", weight=800, anchor="end")]
    rnd = random.Random(len(store)); bx = x + 24; by = y + h - 40
    while bx < x + w - 24:
        bw = rnd.choice([1, 1, 2, 3]); g.append(R(bx, by, bw, 18, fill=INK, stroke="none", opacity=.8)); bx += bw + rnd.choice([1, 2, 3])
    g.append(T(x + w / 2, y + h - 11, "THANK YOU", 10, cls="m", fill=MUTED, anchor="middle", ls="0.2em"))
    return G(g, transform=f"rotate({angle} {x + w / 2} {y + h / 2})")


def _ticket(x, y, w, h, title, venue, seat, tone="night", serial="No. 0412", color=LAV, bg=POCKET):
    """티켓 모양으로 잘린 사진: 절취선 · 바코드 · 인쇄 글자"""
    cut = x + w * .72
    g = [R(x, y, w, h, fill="#fff", stroke="#DDD6C9", rx=8, filt="softshadow"),
         R(x + 2, y + 10, 5, h - 20, fill=color, stroke="none", rx=2),
         L(cut, y + 8, cut, y + h - 8, stroke=LINE, dash="4 4"),
         C(cut, y, 7, fill=bg, stroke="#DDD6C9"), C(cut, y + h, 7, fill=bg, stroke="#DDD6C9"),
         T(x + 20, y + 24, "TICKET", 10, fill=MUTED, ls="0.18em"), T(x + 20, y + 52, title, 15, weight=800),
         T(x + 20, y + 74, venue, 11, fill=MUTED), T(x + 20, y + 96, "좌석  " + seat, 11),
         photo_filled(cut - 86, y + 16, 72, h - 32, tone, rx=4)]
    rnd = random.Random(len(title)); bx = cut + 18
    while bx < x + w - 34:
        bw = rnd.choice([1, 1, 2, 3]); g.append(R(bx, y + 18, bw, h - 36, fill=INK, stroke="none", opacity=.8)); bx += bw + rnd.choice([1, 2, 3])
    g.append(T(x + w - 16, y + h / 2, serial, 10, cls="m", fill=MUTED, anchor="middle", rotate=90))
    return G(g)


def _chain(x0, cy, cw, checked, color, today):
    """연속 체크 = 사슬 고리(둥근 사각을 작은 고리로 연결) · 끊긴 자리 = 찢긴 지그재그(ROSE)"""
    g = []
    for d in sorted(checked):
        cx = x0 + (d - 1) * cw + cw / 2
        g.append(R(cx - cw * .46, cy - 9, cw * .92, 18, fill="#EDF3EA", stroke=color, sw=2.4, rx=9))
        if d + 1 in checked:
            g.append(R(x0 + d * cw - 6, cy - 4, 12, 8, fill=color, stroke="none", rx=4))
        elif d + 1 <= today:
            bx = x0 + d * cw
            g.append(P(f"M{bx + 2},{cy - 15} l4,5 l-7,5 l6,5 l-6,5 l4,6", stroke=ROSE, sw=2))
    return g


def _linkicon(cx, cy, color=MUTED):
    return G([R(-18, -7, 22, 14, stroke=color, sw=2, rx=7), R(-4, -7, 22, 14, stroke=color, sw=2, rx=7)], transform=f"translate({cx} {cy}) rotate(-45)")


# ── 함께 채우기 ──────────────────────────────────────────────────────────
@_safe
def n_rolling(W, H, land):
    g = [header(W, "ROLLING PAPER", "둘레 칸에 몰래 한마디 · 주인공에겐 생일 0시까지 봉투만 보여요", ROSE, right="수아 생일 · 2026 · 10 · 28")]
    cx, cy = W / 2, (M + 54 + H - M) / 2 + 4
    pw = 170
    g += [polaroid(cx - pw / 2, cy - 103, pw, "수아 ♡ 생일", -3, "pink"), tape(cx - 40, cy - 111, 80, 18, "pink", -5),
          sparkle(cx + 104, cy - 92, 7), sparkle(cx - 100, cy + 84, 5), heart(cx + 98, cy + 90, 8, ROSE)]
    cw, ch = 170, 110; ex, ey = 330, 212
    cards = [("filled", 0, "수아야 생일 축하해!!", "올해도 소금빵 같이 먹자"), ("filled", 2, "콘서트 같이 가자", "12월에 꼭!!"),
             ("filled", 3, "우리 수아", "태어나줘서 고마워 ♡"), ("envelope", None, "", ""), ("empty", None, "아직 비어 있어요", ""),
             ("empty", None, "여기도 한마디", ""), ("filled", 2, "케이크는 내가 쏜다", "초는 몇 개…?"), ("filled", 0, "생일 선물은 비밀~", "기대해도 됨")]
    for i, (st, mi, l1, l2) in enumerate(cards):
        th = math.radians(-90 + 45 * i)
        x, y = cx + ex * math.cos(th) - cw / 2, cy + ey * math.sin(th) - ch / 2
        if st == "filled":
            ch_, col = MEMBERS[mi]
            g += [R(x, y, cw, ch, fill="#fff", stroke=LINE, rx=10, filt="softshadow"), avatar(x + 20, y + 20, 12, col, ch_, 12),
                  T(x + 38, y + 24, NAMES[mi], 11, weight=700), lines(x + 12, y + 36, cw - 24, 60, 26, LINE2),
                  hand(x + 14, y + 58, l1, 19), hand(x + 14, y + 84, l2, 19)]
            g.append(heart(x + cw - 16, y + 16, 6, ROSE) if i % 2 else star(x + cw - 16, y + 16, 7))
        elif st == "empty":
            g.append(dashed_box(x, y, cw, ch, l1))
            if i == 4: g.append(pen(x + cw - 24, y + 22, MUTED))
        else:
            g.append(envelope(x + 5, y, 160, 112, sealed=True, label="당일까지 숨김"))
    g += [_pill(W, H, "생일 0시에 공개돼요", "bl"),
          T(W - M, H - M - 30, "주인공 수아에겐 봉투만 보여요", 10, fill=MUTED, anchor="end"), label_tag(W - M - 47, H - M - 21, "D-3", ROSE)]
    return g


@_safe
def n_vote(W, H, land):
    g = [header(W, "BALANCE GAME", "A · B 칸에 내 스티커를 끌어다 놓아요 · 전원 투표하면 결과가 열려요", PERI, right="2026 · 10 · 25 · 12번째 질문")]
    x0, y0, w = M, M + 54, W - 2 * M
    g += [T(x0, y0 + 30, "Q. 평생 소금빵 vs 평생 크루아상", 24, cls="s"), L(x0, y0 + 46, x0 + w, y0 + 46, stroke=INK, sw=1.2)]
    top, bh = y0 + 64, 270; bw = (w - 48) / 2
    boxes = [(x0, "A", "평생 소금빵", PERI, [0, 2, 3], [-6, 4, -3]), (x0 + bw + 48, "B", "평생 크루아상", ROSE, [1], [5])]
    for x, letter, title, col, voters, angs in boxes:
        g += [R(x, top, bw, bh, fill=col, stroke="none", rx=14, opacity=.16), R(x, top, bw, bh, stroke=col, sw=1.2, rx=14),
              T(x + 22, top + 50, letter, 40, cls="s", fill=col), T(x + 64, top + 46, title, 18, weight=800)]
        n = len(voters)
        for k, (mi, ang) in enumerate(zip(voters, angs)):
            ch_, mcol = MEMBERS[mi]; ax = x + bw / 2 + (k - (n - 1) / 2) * 96; ay = top + 158
            g += [G([avatar(ax, ay, 27, mcol, ch_, 22)], transform=f"rotate({ang} {ax} {ay})"), T(ax, ay + 48, NAMES[mi], 11, weight=700, anchor="middle")]
        if n == 1: g.append(T(x + bw / 2, top + bh - 18, "스티커를 여기로 끌어다 놓아요", 11, fill=MUTED, anchor="middle"))
    g += [C(W / 2, top + bh / 2, 18, fill=PAPER, stroke=INK, sw=1.2), T(W / 2, top + bh / 2 + 4, "VS", 12, weight=800, anchor="middle")]
    ry = top + bh + 22
    g += [T(x0, ry, "결과 · 3 : 1", 11, fill=MUTED), R(x0, ry + 10, w, 22, fill=ROSE, stroke="none", rx=11),
          R(x0, ry + 10, w * .75, 22, fill=PERI, stroke="none", rx=11), T(x0 + 14, ry + 25, "A · 3표 · 75%", 12, fill="#fff", weight=700),
          T(x0 + w - 14, ry + 25, "B · 1표 · 25%", 12, fill="#fff", weight=700, anchor="end"), _auto(x0, ry + 50, "자동 집계 · 전원 투표 완료")]
    cy0, chh = ry + 66, 150
    reasons = [(x0, 0, "A", PERI, "소금빵은 매일 먹어도 안 질려", "겉바속촉은 못 참지"), (x0 + bw + 48, 1, "B", ROSE, "크루아상 결 하나하나가 예술", "잼 발라 먹으면 끝")]
    for x, mi, letter, col, l1, l2 in reasons:
        ch_, mcol = MEMBERS[mi]
        g += [R(x, cy0, bw, chh, fill="#fff", stroke=LINE, rx=10), avatar(x + 22, cy0 + 22, 13, mcol, ch_, 12), T(x + 42, cy0 + 27, NAMES[mi] + "의 이유", 11, weight=700),
              label_tag(x + bw - 36, cy0 + 12, letter, col, 10), lines(x + 14, cy0 + 40, bw - 28, 90, 28, LINE2), hand(x + 18, cy0 + 64, l1, 22), hand(x + 18, cy0 + 92, l2, 22)]
    g.append(_pill(W, H, "전원 투표 완료 · 결과가 나왔어요"))
    return g


@_safe
def n_bucket(W, H, land):
    g = [header(W, "BUCKET LIST", "같이 하고 싶은 것 10 · 달성 사진을 붙이면 체크가 켜져요", SAGE, right="2026 가을 · 함께")]
    x0, y0 = M, M + 54
    items = ["한강 라면", "다 같이 카페 다꾸", "새벽 배달 떡볶이", "야구 직관", "노래방 4시간", "플리 교환", "소금빵 투어", "단풍 보러 가기", "인생네컷", "크리스마스 트리"]
    done = {0: (2, "10 · 12", "sky"), 1: (-1, "10 · 03", "cafe"), 3: (1, "10 · 18", "green"), 6: (2, "10 · 24", "pink")}
    together = {1, 3, 7, 9}
    rh, lw = 54, 660
    g += [T(x0 + 30, y0 + 10, "하고 싶은 것", 10, fill=MUTED), T(x0 + 330, y0 + 10, "누가", 10, fill=MUTED), T(x0 + 420, y0 + 10, "달성 사진", 10, fill=MUTED),
          T(x0 + 532, y0 + 10, "달성한 사람 · 날짜", 10, fill=MUTED), L(x0, y0 + 16, x0 + lw, y0 + 16, stroke=INK, sw=1)]
    for i, it in enumerate(items):
        y = y0 + 18 + i * rh; d = done.get(i)
        g += [L(x0, y + rh, x0 + lw, y + rh, stroke=LINE2), check(x0, y + 18, 18, SAGE if d else "#B9B3A6", on=bool(d)), hand(x0 + 30, y + 34, it, 22),
              label_tag(x0 + 330, y + 17, "다 같이" if i in together else "한 사람", SAGE, 10, fill=None if i in together else LINE2)]
        px, pw_, ph_ = x0 + 420, 96, 42
        if d:
            mi, date, tone = d
            g.append(photo_filled(px, y + 6, pw_, ph_, tone))
            if mi >= 0:
                ch_, col = MEMBERS[mi]; g += [avatar(x0 + 542, y + 27, 11, col, ch_, 11), T(x0 + 560, y + 31, date, 11)]
            else:
                for k, (ch_, col) in enumerate(MEMBERS): g.append(avatar(x0 + 541 + k * 14, y + 27, 10, col, ch_, 10))
                g.append(T(x0 + 596, y + 31, date, 11))
        else:
            g += [R(px, y + 6, pw_, ph_, stroke=LINE, dash="3 3", rx=4), T(px + pw_ / 2, y + 32, "+", 14, fill=MUTED, anchor="middle")]
    rx_, rw_ = 732, W - M - 732
    g += [T(rx_, y0 + 12, "달성", 11, fill=MUTED), T(rx_, y0 + 56, "4", 44, weight=800, fill=SAGE), T(rx_ + 34, y0 + 56, "/ 10", 18, fill=MUTED, weight=700),
          _bar(rx_, y0 + 72, rw_, 10, .4, SAGE), _auto(rx_, y0 + 102, "자동 집계 · 사진을 붙이면 체크"),
          T(rx_, y0 + 142, "누가 많이 달성했나", 11, fill=MUTED)]
    for k, ((ch_, col), n) in enumerate(zip(MEMBERS, [0, 1, 2, 0])):
        g += [avatar(rx_ + 16 + k * 52, y0 + 172, 14, col, ch_, 13), T(rx_ + 16 + k * 52, y0 + 206, str(n), 13, weight=800, anchor="middle", fill=INK if n else MUTED)]
    g += [T(rx_ + 216, y0 + 176, "다 같이", 10, fill=MUTED, anchor="middle"), T(rx_ + 216, y0 + 206, "1", 13, weight=800, anchor="middle"),
          T(rx_, y0 + 244, "이달의 메모", 11, fill=MUTED), dashed_box(rx_, y0 + 252, rw_, 190), hand(rx_ + 14, y0 + 294, "11월엔 단풍 보러", 22), hand(rx_ + 14, y0 + 324, "다 같이 가기!!", 22),
          stamp(rx_ + rw_ - 40, y0 + 400, 28, SAGE, "GO!", 13), _pill(W, H, "지우가 '한강 라면'을 달성했어요")]
    return g


# ── 자동 채움 ────────────────────────────────────────────────────────────
@_safe
def n_winrate(W, H, land):
    g = [header(W, "WIN RATE", "직관 결과가 달력에 도장으로 찍히고 승률은 자동으로 집계돼요", PERI, right="2026 시즌 · 10월")]
    cal_x, cal_y, cal_w, cal_h = M, M + 98, 520, 400
    results = {1: "승", 3: "패", 4: "승", 8: "승", 10: "승", 11: "패", 15: "승", 17: "패", 18: "승", 24: "패"}
    colors = {"승": PERI, "패": ROSE, "무": MUTED}
    marks = {d: (lambda cx, cy, r, s=s: stamp(cx, cy + 2, r * 1.05, colors[s], s, 13, -12)) for d, s in results.items()}
    marks[28] = lambda cx, cy, r: G([C(cx, cy, r * .85, stroke=MUTED, dash="3 3"), T(cx, cy + 4, "예정", 10, fill=MUTED, anchor="middle")])
    marks[31] = marks[28]
    g += [T(cal_x, cal_y - 24, "OCTOBER", 13, weight=800, ls="0.1em"), T(cal_x + 90, cal_y - 24, "직관 10번", 11, fill=MUTED),
          mini_calendar(cal_x, cal_y, cal_w, cal_h, 31, 4, marks, PERI)]
    cw, rh = cal_w / 7, cal_h / 5
    g.append(R(cal_x + 1, cal_y + 4 * rh + 1, cw - 2, rh - 2, stroke=PERI, sw=1.5, rx=4))  # 25 · 오늘
    ly = cal_y + cal_h + 30
    for k, (s, n) in enumerate([("승", 6), ("패", 4), ("무", 0)]):
        lx = cal_x + 16 + k * 96
        g += [stamp(lx, ly, 12, colors[s], s, 10, -12), T(lx + 20, ly + 4, f"{s} {n}", 12, weight=700)]
    g += [T(cal_x + 300, ly + 4, "오늘 25 · 예정 28 · 31", 11, fill=MUTED), hand(cal_x + 8, ly + 58, "주말 직관은 거의 다 이겼다 ㅎㅎ", 22),
          tape(cal_x + 330, ly + 40, 70, 18, "sky", -6), hand(cal_x + 8, ly + 90, "28일 홈 경기 → 수아 · 지우랑", 20)]
    px, pw = 612, W - M - 612
    g += [T(px, 118, "SEASON", 10, fill=MUTED, ls="0.15em")]
    for k, (lab, ratio, rec, num) in enumerate([("홈", .636, "7승 4패", ".636"), ("원정", .5, "4승 4패", ".500")]):
        y = 150 + k * 52
        g += [T(px, y, lab, 12, weight=700), _bar(px + 44, y - 11, 216, 12, ratio, PERI), T(px + pw, y + 3, num, 22, cls="m", weight=800, fill=PERI, anchor="end"),
              T(px + 44, y + 18, rec, 10, fill=MUTED)]
    g += [_auto(px, 250, "자동 집계 · 잠긴 숫자 · 스코어보드 속지에서"), T(px, 288, "10월", 11, fill=MUTED), T(px, 320, "6승 4패", 22, weight=800),
          T(px + 130, 320, ".600", 22, cls="m", weight=800, fill=PERI), T(px, 346, "시즌 총평", 11, fill=MUTED), dashed_box(px, 354, pw, 220),
          hand(px + 14, 396, "10월은 홈이 강했다", 22), hand(px + 14, 426, "원정은 5할… 가을야구 가자!!", 22), stamp(px + pw - 54, 520, 30, PERI, "6승", 13),
          T(px, 606, "다음 직관", 11, fill=MUTED), T(px, 628, "10 · 28 (수) 홈 · 수아 · 지우", 12), _pill(W, H, "이번 달 직관 승률 60%")]
    return g


@_safe
def n_weather_daily(W, H, land):
    g = [header(W, "1D 1P · WEATHER", "하루 한 쪽 · 날씨 도장은 아침마다 자동으로 찍혀요", MUST, right="D+ 298")]
    lx, ly, lw = M, M + 48, 300
    rx, ry, rw, rh = M + 330, M + 48, W - 2 * M - 330, H - 2 * M - 48
    g += [T(lx, ly + 48, "25", 56, cls="s"), T(lx + 72, ly + 48, "OCT · SUN", 14, fill=MUTED, ls="0.1em"), T(lx, ly + 70, "날씨 · 자동 도장", 10, fill=MUTED),
          stamp_rect(lx, ly + 78, 124, 40, MUST, ["☀ 18° / 9°"], 13, -4)]
    for i, wch in enumerate(["☁", "☂", "❄", "☃"]):
        cx_ = lx + 160 + i * 34
        g += [C(cx_, ly + 98, 13, stroke=LINE), T(cx_, ly + 103, wch, 14, fill=MUTED, anchor="middle")]
    g += [_auto(lx, ly + 138, "자동 · 기상청 · 서울 마포"), T(lx, ly + 168, "오늘의 할 일 3", 10, fill=MUTED)]
    todos = ["빙고 한 칸 채우기", "우산 안 챙겨도 됨", "한강 라면 (버킷!)"]
    for i, s in enumerate(todos):
        y = ly + 178 + i * 32
        g += [check(lx, y, 18, on=i != 1), L(lx + 28, y + 14, lx + lw, y + 14, stroke=LINE), hand(lx + 32, y + 13, s, 20)]
    g.append(T(lx, ly + 318, "시간대별 기온 · 자동", 10, fill=MUTED))
    temps = [11, 14, 17, 18, 16, 12]; pts = []
    for i, t in enumerate(temps):
        px_ = lx + 12 + i * 55; py_ = ly + 372 - (t - 8) * 3
        pts.append((px_, py_))
        g += [C(px_, py_, 3, fill=MUST, stroke="none"), T(px_, py_ - 8, f"{t}°", 10, fill=MUTED, anchor="middle"), T(px_, ly + 392, ["9", "12", "15", "18", "21", "24"][i], 10, fill=MUTED, anchor="middle")]
    g.append(P("M" + " L".join(f"{x},{y}" for x, y in pts), stroke=MUST, sw=1.5))
    g += [hand(lx, ly + 440, "해 좋아서 산책했다 ☀", 22), photo_filled(lx, ly + 460, 140, 100, "green"), tape(lx + 36, ly + 452, 60, 16, "butter", -5),
          hand(lx + 152, ly + 500, "낙엽 색", 20), T(lx, H - M - 4, "알림 없음 · 끌 수 있어요", 10, fill=MUTED)]
    g += [R(rx, ry, rw, rh, stroke=LINE, dash="3 4", rx=6), dotgrid(rx + 12, ry + 12, rw - 24, rh - 24, 24), T(rx + 12, ry + rh - 10, "자유 칸 · 사진 · 스티커 · 글", 10, fill=MUTED),
          photo_filled(rx + rw * .52, ry + 26, rw * .42, rh * .32, "sky"), tape(rx + rw * .6, ry + 16, 70, 20, "butter", -6),
          hand(rx + 22, ry + 60, "하늘 진짜 맑음. 다 같이 한강 가서", 24), hand(rx + 22, ry + 92, "라면 먹고 왔다 (버킷 달성!)", 24),
          star(rx + 60, ry + 130, 9), photo_filled(rx + 26, ry + rh * .52, 210, 150, "cafe"), tape(rx + 90, ry + rh * .52 - 8, 70, 18, "mint", 4),
          hand(rx + 260, ry + rh * .62, "라면 + 소금빵 조합 ★", 24), heart(rx + rw - 40, ry + rh - 50, 10, ROSE)]
    return g


@_safe
def n_budget_sum(W, H, land):
    g = [header(W, "BUDGET", "금액만 적으면 오늘 · 이번 주 · 이번 달 합계가 저절로 계산돼요", CAMEL, right="2026 · 10 · 넷째 주")]
    x0, ty, tw = M, M + 54, 592
    g += [T(x0 + 8, ty + 14, "날짜 · 내용", 10, fill=MUTED), T(x0 + 298, ty + 14, "분류", 10, fill=MUTED), T(x0 + tw - 8, ty + 14, "금액", 10, fill=MUTED, anchor="end"),
          L(x0, ty + 22, x0 + tw, ty + 22, stroke=INK, sw=1), L(x0 + 290, ty + 22, x0 + 290, ty + 542, stroke=LINE), L(x0 + 400, ty + 22, x0 + 400, ty + 542, stroke=LINE)]
    rows = [("10.20 소금빵 2개", "식비", "6,400"), ("10.20 버스", "교통", "1,500"), ("10.21 다꾸 스티커 2종", "취미", "12,000"),
            ("10.22 카페 라떼", "식비", "5,500"), ("10.24 영화", "문화", "15,000"), ("10.25 떡볶이", "식비", "7,800")]
    for i in range(12):
        y = ty + 22 + i * 40
        g.append(L(x0, y + 40, x0 + tw, y + 40, stroke=INK if i == 11 else LINE2, sw=1))
        if i < len(rows):
            a, b, c = rows[i]
            g += [hand(x0 + 8, y + 28, a, 20), hand(x0 + 298, y + 28, b, 20), hand(x0 + tw - 10, y + 28, c, 20, anchor="end")]
    sy = ty + 502
    g += [R(x0, sy, tw, 40, fill="#F4EFE4", stroke="none"), L(x0, sy + 40, x0 + tw, sy + 40, stroke=INK, sw=1), T(x0 + 8, sy + 26, "합계 · 이번 주", 12, weight=700),
          _auto(x0 + 120, sy + 26, "자동 계산"), T(x0 + tw - 10, sy + 27, "48,200", 18, cls="m", weight=800, fill=CAMEL, anchor="end"),
          hand(x0 + 4, sy + 82, "용돈 받기 전까지 버티기…!!", 22)]
    px, pw = 672, W - M - 672
    cards = [("오늘", "7,800", "10 · 25 · 1건"), ("이번 주", "48,200", "10 · 19 ~ 25 · 6건"), ("이번 달", "183,400", "10월 · 23건")]
    for i, (lab, val, sub) in enumerate(cards):
        cy = ty + i * 82
        g += [R(px, cy, pw, 70, fill="#fff", stroke=LINE, rx=10, filt="softshadow"), T(px + 14, cy + 22, lab, 11, fill=MUTED), T(px + 14, cy + 52, sub, 10, fill=MUTED),
              T(px + pw - 32, cy + 52, val, 30, weight=800, anchor="end"), T(px + pw - 14, cy + 52, "원", 11, fill=MUTED, anchor="end")]
    by = ty + 262
    g += [_auto(px, by, "자동 계산 · 잠긴 숫자 · 손으로 못 고쳐요"),
          T(px, by + 30, "이번 주 예산", 11, fill=MUTED), T(px + pw, by + 30, "48,200 / 45,000", 11, weight=700, fill=CAMEL, anchor="end"),
          _bar(px, by + 38, pw, 12, 48200 / 45000, CAMEL, over=KRAFT_DARK), T(px + pw, by + 66, "107% · 3,200 넘었어요", 10, fill=KRAFT_DARK, anchor="end"),
          T(px, by + 90, "이번 달 예산", 11, fill=MUTED), T(px + pw, by + 90, "183,400 / 220,000", 11, weight=700, fill=CAMEL, anchor="end"),
          _bar(px, by + 98, pw, 12, 183400 / 220000, CAMEL), T(px + pw, by + 126, "83%", 10, fill=MUTED, anchor="end"),
          T(px, by + 160, "분류별 · 이번 주", 11, fill=MUTED)]
    for j, (cat, amt, v) in enumerate([("식비", "19,700", 19700), ("문화", "15,000", 15000), ("취미", "12,000", 12000), ("교통", "1,500", 1500)]):
        y = by + 182 + j * 24
        g += [T(px, y, cat, 11), _bar(px + 40, y - 9, 170, 8, v / 19700, CAMEL), T(px + pw, y, amt, 10, cls="m", anchor="end")]
    g.append(_pill(W, H, "이번 주 예산을 넘었어요"))
    return g


@_safe
def n_recap(W, H, land):
    g = [header(W, "OCTOBER RECAP", "월말이면 이 달의 숫자 · 사진 · 친구별 기여가 저절로 한 장이 돼요", LAV, right="2026 · 10 · 31 자동 생성")]
    x0, y0, w = M, M + 54, W - 2 * M
    cw, ch = (w - 3 * 16) / 4, 104
    for i in range(4):
        x = x0 + i * (cw + 16)
        g.append(R(x, y0, cw, ch, fill="#fff", stroke=LINE, rx=10, filt="softshadow"))
    g += [T(x0 + 14, y0 + 22, "쓴 장수", 11, fill=MUTED), T(x0 + 14, y0 + 68, "23", 36, weight=800), T(x0 + 62, y0 + 68, "장", 12, fill=MUTED), T(x0 + 14, y0 + 90, "지난달보다 +5", 10, fill=MUTED)]
    x = x0 + (cw + 16)
    g += [T(x + 14, y0 + 22, "붙인 스티커", 11, fill=MUTED), T(x + 14, y0 + 68, "148", 36, weight=800), T(x + 84, y0 + 68, "개", 12, fill=MUTED), T(x + 14, y0 + 90, "하루 평균 4.8개", 10, fill=MUTED)]
    x = x0 + 2 * (cw + 16)
    g += [T(x + 14, y0 + 22, "많이 쓴 스티커", 11, fill=MUTED), star(x + 40, y0 + 60, 20), T(x + 70, y0 + 66, "별 스티커 · 31번", 13, weight=700), T(x + 14, y0 + 90, "2위 하트 · 3위 반짝이", 10, fill=MUTED)]
    x = x0 + 3 * (cw + 16)
    g.append(T(x + 14, y0 + 22, "친구별 기여", 11, fill=MUTED))
    for k, ((ch_, col), pct) in enumerate(zip(MEMBERS, [41, 28, 19, 12])):
        y = y0 + 34 + k * 18
        g += [avatar(x + 22, y + 4, 9, col, ch_, 10), R(x + 38, y, 136 * pct / 100, 8, fill=col, stroke="none", rx=4), T(x + 44 + 136 * pct / 100, y + 8, f"{pct}%", 10, fill=MUTED)]
    photos = [(x0 + 10, 250, 210, 150, -5, "sky", "pink"), (x0 + 240, 236, 190, 136, 4, "cafe", "butter"), (x0 + 400, 262, 150, 120, -3, "pink", "mint"),
              (x0 + 60, 440, 190, 140, 5, "green", "sky"), (x0 + 280, 420, 230, 170, -4, "night", "lavender")]
    for px_, py_, pw_, ph_, ang, tone, key in photos:
        g.append(G([photo_filled(px_, py_, pw_, ph_, tone), tape(px_ + pw_ / 2 - 30, py_ - 7, 60, 16, key, 0)], transform=f"rotate({ang} {px_ + pw_ / 2} {py_ + ph_ / 2})"))
    g += [T(x0, 660, "사진 5장 · 이달 반응 많은 순 · 자동", 10, fill=MUTED), hand(x0 + 300, 650, "넷이 다 나온 사진이 1등 ♡", 22)]
    rx_, rw_ = x0 + 600, w - 600
    g += [T(rx_, 242, "이달의 한 줄", 11, fill=MUTED), dashed_box(rx_, 250, rw_, 140), hand(rx_ + 14, 294, "10월은 빵집 투어의 달이었다", 22), hand(rx_ + 14, 326, "11월엔 콘서트!!", 22),
          R(rx_, 414, rw_, 96, fill="#fff", stroke=LINE, rx=10, filt="softshadow"), T(rx_ + 14, 436, "가장 북적인 날", 11, fill=MUTED), T(rx_ + 14, 466, "10 · 12 (월)", 18, weight=800),
          T(rx_ + 14, 490, "전원 참여 · 스티커 41개 · 사진 6장", 11), _auto(rx_, 536, "자동 생성 · 카드 자리는 옮길 수 있어요"),
          T(rx_, 572, "많이 쓴 테이프", 11, fill=MUTED), tape(rx_, 582, 90, 20, "butter", 0), tape(rx_ + 104, 582, 90, 20, "pink", 0), tape(rx_ + 208, 582, 90, 20, "mint", 0),
          _pill(W, H, "10월 리캡이 만들어졌어요")]
    return g


@_safe
def n_birthday_monthly(W, H, land):
    g = [header(W, "MONTHLY", "방 친구 생일 · 디데이가 먼슬리에 도장으로 미리 찍혀요", ROSE, right="2026 · 10")]
    x0, y0 = M, M + 54
    g += [T(x0, y0 + 40, "10", 44, cls="s", fill=ROSE), T(x0 + 62, y0 + 40, "October", 18, cls="s", fill=MUTED)]
    cal_x, cal_y, cal_w, cal_h = x0, y0 + 74, 620, 440
    cakes = {9: "현아 생일", 15: "지우 생일", 28: "수아 생일"}
    marks = {d: (lambda cx, cy, r, nm=nm: G([_cake(cx, cy - 6, 30), T(cx, cy + 30, nm, 10, fill=MUTED, anchor="middle")])) for d, nm in cakes.items()}
    marks[17] = lambda cx, cy, r: hand(cx, cy + 6, "다꾸 모임", 17, anchor="middle")
    marks[3] = lambda cx, cy, r: T(cx, cy + 4, "개천절", 10, fill=ROSE, anchor="middle")
    g.append(mini_calendar(cal_x, cal_y, cal_w, cal_h, 31, 4, marks, ROSE))
    cw, rh = cal_w / 7, cal_h / 5
    g += [R(cal_x + 3 * cw + 1, cal_y + 4 * rh + 1, cw - 2, rh - 2, stroke=ROSE, sw=1.5, rx=4), T(cal_x + 3 * cw + cw - 5, cal_y + 4 * rh + 12, "오늘", 10, fill=ROSE, weight=700, anchor="end"),
          label_tag(cal_x + 10, cal_y + 14, "D-12 콘서트", ROSE), T(cal_x + 10, cal_y + 54, "11 · 9 (월) · 자동", 10, fill=MUTED), heart(cal_x + 3 * cw + 12, cal_y + 10, 6, ROSE)]
    lx, lw = 700, W - M - 700
    g.append(T(lx, y0 + 12, "기념일 · 자동", 11, fill=MUTED))
    rows = [(3, "현아 생일", "10 · 9 (금)", "지남"), (2, "지우 생일", "10 · 15 (목)", "지남"), (1, "수아 생일", "10 · 28 (수)", "오늘!"), (None, "콘서트", "11 · 9 (월)", "D-12")]
    for i, (mi, nm, date, st) in enumerate(rows):
        y = y0 + 24 + i * 62
        g.append(R(lx, y, lw, 54, fill="#fff", stroke=LINE, rx=10, filt="softshadow"))
        if mi is None: g.append(star(lx + 24, y + 27, 12))
        else:
            ch_, col = MEMBERS[mi]; g.append(avatar(lx + 24, y + 27, 14, col, ch_, 13))
        g += [T(lx + 48, y + 23, nm, 13, weight=700), T(lx + 48, y + 42, date, 11, fill=MUTED)]
        if st == "지남": g.append(T(lx + lw - 14, y + 32, "지남 ✓", 11, fill=MUTED, anchor="end"))
        else: g.append(label_tag(lx + lw - 14 - (len(st) * 11 * .95 + 16), y + 16, st, ROSE, 11, fill=None if st == "오늘!" else LINE2))
    g += [_auto(lx, y0 + 290, "자동 입력 · 멤버 프로필 · 디데이 속지에서"), T(lx, y0 + 322, "이달의 메모", 11, fill=MUTED), dashed_box(lx, y0 + 330, lw, 180),
          hand(lx + 14, y0 + 372, "수아 생일 케이크 예약", 22), hand(lx + 14, y0 + 402, "→ 민희 담당!", 22), _pill(W, H, "오늘 수아 생일이에요")]
    return g


# ── 시간이 흐르는 속지 ───────────────────────────────────────────────────
@_safe
def n_habit_chain(W, H, land):
    g = [header(W, "HABIT CHAIN", "체크한 날이 사슬로 이어져요 · 하루 빠지면 사슬이 끊겨요", SAGE, right="2026 · 10 · 25")]
    x0, y0, w = M, M + 54, W - 2 * M
    lab, days, today = 132, 31, 25
    cw = (w - lab) / days
    rows = [("물 2L", set(range(1, 13)) | set(range(17, 26)), 9, 12), ("10분 걷기", set(range(12, 19)) | set(range(20, 26)), 6, 7), ("일기 한 줄", set(range(21, 26)), 5, 5)]
    rh, top = 96, y0 + 22
    for d in range(1, days + 1):
        cx = x0 + lab + (d - 1) * cw + cw / 2
        if d == today: g.append(C(cx, y0 + 9, 8, fill=SAGE, stroke="none"))
        g.append(T(cx, y0 + 12, str(d), 10, fill="#fff" if d == today else MUTED, anchor="middle", weight=700 if d == today else None))
    g.append(R(x0 + lab + (today - 1) * cw, top, cw, 3 * rh, fill=SAGE, stroke="none", opacity=.08))
    for i, (nm, checked, cur, best) in enumerate(rows):
        y = top + i * rh
        g += [R(x0, y, w, rh, stroke=LINE), T(x0 + 10, y + rh / 2 - 2, nm, 13, weight=700), T(x0 + 10, y + rh / 2 + 16, f"연속 {cur}일 · 최장 {best}일", 10, fill=MUTED)]
        for d in range(days):
            x = x0 + lab + d * cw
            g.append(L(x, y, x, y + rh, stroke=LINE2))
            if d + 1 > today: g.append(R(x, y, cw, rh, fill=LINE2, stroke="none", opacity=.45))
        g += _chain(x0 + lab, y + rh / 2, cw, checked, SAGE, today)
    sy = top + 3 * rh + 30
    for i, (nm, checked, cur, best) in enumerate(rows):
        bx = x0 + i * (w / 3)
        g += [T(bx, sy, nm, 11, fill=MUTED), T(bx, sy + 44, str(cur), 40, weight=800, fill=SAGE), T(bx + len(str(cur)) * 24 + 6, sy + 44, "일 연속", 13, weight=700),
              T(bx, sy + 66, f"최장 {best}일 · 10월 {len(checked)}일 체크", 11, fill=MUTED)]
    g += [_auto(x0, sy + 92, "자동 집계 · 잠긴 숫자 · 체크는 손으로"), dashed_box(x0, sy + 108, 600, 124),
          hand(x0 + 14, sy + 150, "물은 텀블러 들고 다니니까 쉬움", 22), hand(x0 + 14, sy + 182, "걷기는 비 오면 실패… 우산 들고라도!", 22),
          _pill(W, H, "오늘 체크 안 하면 사슬이 끊겨요")]
    return g


@_safe
def n_advent(W, H, land):
    g = [header(W, "ADVENT", "12월 1일부터 24일까지 · 하루 한 칸만 긁혀요 · 지난 칸은 다시 볼 수 있어요", SAGE, right="2026 · 12 · 11")]
    rows = [1, 2, 3, 4, 5, 6, 3]; cw, ch, gap = 92, 66, 8
    tcx, top, today = 400, 132, 11
    past = {1: ("첫 캐럴 ♪", "star"), 2: ("트리 꾸밈", None), 3: ("붕어빵 3개", "photo:cafe"), 4: ("눈 왔다!!", "sparkle"), 5: ("목도리 완성", None),
            6: ("핫초코", "photo:pink"), 7: ("귤 10개", "heart"), 8: ("선물 준비", None), 9: ("눈사람 ☃", "photo:sky"), 10: ("시험 끝!!", "star")}
    g.append(star(tcx, 116, 13))
    n = 1
    for r, cnt in enumerate(rows):
        y = top + r * (ch + gap); xs = tcx - (cnt * cw + (cnt - 1) * gap) / 2
        for c in range(cnt):
            x = xs + c * (cw + gap)
            if n < today:
                txt, deco = past[n]
                g += [R(x, y, cw, ch, fill="#fff", stroke=LINE, rx=6, filt="softshadow"), T(x + 7, y + 13, str(n), 10, fill=MUTED, weight=700), hand(x + 8, y + 52, txt, 16)]
                if deco and deco.startswith("photo:"): g.append(photo_filled(x + cw - 44, y + 6, 38, 30, deco[6:], rx=3))
                elif deco == "star": g.append(star(x + cw - 16, y + 16, 7))
                elif deco == "heart": g.append(heart(x + cw - 16, y + 17, 6, ROSE))
                elif deco == "sparkle": g.append(sparkle(x + cw - 16, y + 16, 7))
            elif n == today:
                g += [scratch(x, y, cw, ch, ""), R(x, y, cw * .58, ch, fill="#fff", stroke="none", rx=4, filt="rough"), T(x + 7, y + 13, "11", 10, fill=SAGE, weight=800),
                      hand(x + 8, y + 50, "오늘!", 16), T(x + cw * .79, y + ch / 2 + 4, "긁는 중", 10, fill="#5B5F6B", anchor="middle", weight=700),
                      R(x - 2, y - 2, cw + 4, ch + 4, stroke=SAGE, sw=2, rx=8)]
            else:
                g.append(scratch(x, y, cw, ch, str(n)))
            n += 1
    px, pw = 724, W - M - 724
    g += [T(px, 122, "ADVENT · 하루 한 칸", 14, weight=800), T(px, 150, "열린 칸", 11, fill=MUTED), T(px, 196, "11", 44, weight=800, fill=SAGE), T(px + 62, 196, "/ 24", 18, fill=MUTED, weight=700),
          _bar(px, 212, pw, 10, 11 / 24, SAGE), T(px, 244, "남은 칸 13 · 크리스마스까지 D-14", 11, fill=MUTED), _auto(px, 272, "자동 · 매일 0시에 다음 칸이 열려요"),
          scratch(px, 300, 70, 26, ""), T(px + 80, 318, "은박 = 아직 못 긁어요", 11), R(px, 336, 70, 26, fill="#fff", stroke=LINE, rx=4), T(px + 80, 354, "흰 칸 = 열림 · 사진 · 한마디", 11),
          T(px, 396, "규칙", 11, fill=MUTED), T(px, 416, "· 오늘 칸만 긁을 수 있어요", 12), T(px, 436, "· 지난 칸은 언제든 다시 봐요", 12), T(px, 456, "· 24일에 다 열리면 리본 알림", 12),
          dashed_box(px, 486, pw, 150), hand(px + 14, 526, "11일: 수아랑 붕어빵", 20), hand(px + 14, 556, "3개 1,500원 득템", 20), _pill(W, H, "11일 칸이 열렸어요")]
    return g


# ── 바깥과 이어진 속지 ───────────────────────────────────────────────────
@_safe
def n_ticketbook(W, H, land):
    g = [header(W, "TICKET BOOK", "티켓 사진을 넣으면 티켓 모양으로 잘려 포켓에 들어가요", LAV, right="2026 · 3 / 4 포켓")]
    x0, y0, w = M, M + 54, W - 2 * M
    pw, ph = 440, 168; gx = w - 2 * pw
    pockets = [(x0, y0 + 14), (x0 + pw + gx, y0 + 14), (x0, y0 + 14 + ph + 28), (x0 + pw + gx, y0 + 14 + ph + 28)]
    tickets = {0: ("WORLD TOUR · SEOUL", "KSPO DOME · 12 · 1 (화) 18:00", "2층 F구역 12열 7", "night", "No. 0412"),
               1: ("극장판 · 다시보기", "용산 · 10 · 18 (일) 19:30", "G열 12 · 13", "pink", "No. 0377"),
               3: ("뮤지컬 · 레미제라블", "블루스퀘어 · 10 · 24 (토) 14:00", "1층 B구역 5열 3", "cafe", "No. 0391")}
    for i, (x, y) in enumerate(pockets):
        g.append(R(x, y, pw, ph, fill=POCKET, stroke="#D8D2C6", rx=12))
        if i in tickets: g.append(_ticket(x + 14, y + 13, pw - 28, ph - 26, *tickets[i]))
        else: g.append(dashed_box(x + 14, y + 13, pw - 28, ph - 26, "티켓 사진을 넣어요 · QR도 돼요"))
        g.append(R(x, y, pw, ph, fill="url(#gloss)", stroke="none", rx=12))
    x, y = pockets[3]
    g += [avatar(x + pw - 6, y + 2, 13, ROSE, "수", 12), T(x + pw - 24, y + ph + 13, "수아가 붙였어요 · 방금", 10, fill=MUTED, anchor="end"),
          T(x0, y0 + 14 + ph + 13, "사진 → 티켓 모양으로 잘림 · 절취선 · 바코드 자동", 10, fill=MUTED),
          tape(x0 + 30, y0 + 6, 70, 18, "lavender", -6), tape(pockets[1][0] + pw - 100, pockets[1][1] - 6, 70, 18, "lavender", 5)]
    my = y0 + 14 + 2 * ph + 28 + 26
    g += [T(x0, my, "메모", 10, fill=MUTED), lines(x0, my + 6, w, 150, 30, LINE2), hand(x0 + 4, my + 32, "콘서트 티켓은 수령하면 바로 여기에!", 22),
          hand(x0 + 4, my + 62, "티켓 모양으로 잘려서 진짜 티켓북 같다", 22), _pill(W, H, "수아가 티켓을 붙였어요")]
    return g


@_safe
def n_linkcards(W, H, land):
    g = [header(W, "LINK CARDS", "유튜브 · 인스타 · 블로그 링크를 붙이면 OG 이미지 종이 카드가 돼요", PERI, right="2026 · 10 · 6칸")]
    x0, y0, w = M, M + 54, W - 2 * M
    cw, ch = 290, 212; gx = (w - 3 * cw) / 2
    cards = [("직캠 · 뮤직뱅크 1위", "youtube · 3:42", PERI, "영상", 1), ("10월 플리", "music · 24곡", LAV, "플리", 1), ("소금빵 맛집 블로그", "blog · 10 · 20", MUST, "블로그", 0),
             ("브이로그 · 카페 다꾸", "youtube · 12:08", ROSE, "영상", 2), None, None]
    for i, cd in enumerate(cards):
        r, c = divmod(i, 3); x, y = x0 + c * (cw + gx), y0 + 16 + r * (ch + 24)
        if cd is None:
            g += [dashed_box(x, y, cw, ch, "링크를 붙여요"), _linkicon(x + cw / 2, y + ch / 2 - 34)]; continue
        title, sub, col, kind, mi = cd
        g += [phone_card(x, y, cw, ch, title, sub), P(f"M{x},{y + 8} a8,8 0 0 1 8,-8 h{cw - 16} a8,8 0 0 1 8,8 v{ch * .45 - 8} h-{cw} Z", fill=col, stroke="none", opacity=.35)]
        if kind == "영상": g += [C(x + cw / 2, y + ch * .22, 18, fill="#fff", stroke="none", opacity=.92), poly([(x + cw / 2 - 6, y + ch * .22 - 9), (x + cw / 2 - 6, y + ch * .22 + 9), (x + cw / 2 + 10, y + ch * .22)], fill=INK)]
        elif kind == "플리": g.append(T(x + cw / 2, y + ch * .22 + 10, "♪", 30, fill="#fff", anchor="middle", weight=800))
        else: g += [C(x + cw / 2, y + ch * .22, 18, fill="#fff", stroke="none", opacity=.92), T(x + cw / 2, y + ch * .22 + 5, "Aa", 13, fill=INK, anchor="middle", weight=800)]
        ch_, mcol = MEMBERS[mi]
        g += [label_tag(x + 10, y + 10, kind, PERI, 10), avatar(x + cw - 20, y + ch - 20, 11, mcol, ch_, 11)]
        if i in (0, 3): g.append(tape(x + cw - 76, y - 8, 64, 16, "sky", -7))
        if i == 2: g.append(tape(x + 20, y - 8, 64, 16, "butter", 5))
    g += [_auto(x0, 598, "OG 이미지 · 제목 자동 · 누르면 열려요"), T(W - M, 598, "알림 없음", 10, fill=MUTED, anchor="end"),
          hand(x0 + 4, 648, "플리는 수아가 만든 거 ★ 출근길 필수", 22), heart(x0 + 300, 640, 9, ROSE), hand(x0 + 4, 684, "직캠은 1위 소감 부분부터 보기", 20)]
    return g


@_safe
def n_fourcut(W, H, land):
    g = [header(W, "4 CUT", "포토부스 QR을 찍으면 4컷이 프레임에 자동으로 들어가요", CHAR, right="2026 · 10 · 25 · 홍대")]
    x0, y0 = M, M + 54
    fw, fh, top = 150, 520, y0 + 14
    frames = [(x0 + 20, ["sky", "cafe", "pink", "green"]), (x0 + 230, ["night", "pink", "sky", "cafe"])]
    for x, tones in frames:
        g.append(R(x, top, fw, fh, fill="#1F1F22", stroke="none", rx=4, filt="shadow"))
        pw_, ph_ = fw - 24, (fh - 60 - 30) / 4
        for k, tone in enumerate(tones): g.append(photo_filled(x + 12, top + 12 + k * (ph_ + 12), pw_, ph_, tone, rx=2))
        g.append(T(x + fw / 2, top + fh - 11, "2026 · 10 · 25  DIO", 10, fill="#fff", anchor="middle", opacity=.85, ls="0.08em"))
    g += [tape(frames[0][0] + 40, top - 8, 70, 18, "ivory", -5), tape(frames[1][0] + 40, top - 8, 70, 18, "pink", 4),
          T(frames[0][0], top + fh + 20, "10 · 25 홍대 · 인생네컷", 11, weight=700), _auto(frames[0][0], top + fh + 38, "날짜 · 장소 자동"),
          T(frames[1][0], top + fh + 20, "10 · 25 홍대 · 2번째", 11, weight=700), hand(frames[1][0], top + fh + 44, "현아 눈 감음", 18)]
    x = x0 + 440
    g += [dashed_box(x, top, fw, fh), _qr(x + fw / 2 - 28, top + fh / 2 - 64, 56, 5), T(x + fw / 2, top + fh / 2 + 16, "QR로 가져와요", 12, fill=MUTED, anchor="middle"),
          T(x + fw / 2, top + fh / 2 + 34, "빈 프레임", 10, fill=MUTED, anchor="middle")]
    px, pw = 700, W - M - 700
    g += [T(px, y0 + 20, "포토부스 QR", 11, fill=MUTED), _qr(px, y0 + 30, 110, 9), T(px + 124, y0 + 62, "출력물 아래 QR을", 12), T(px + 124, y0 + 82, "앱 카메라로 찍으면", 12),
          T(px + 124, y0 + 102, "4컷 원본이 들어와요", 12), _auto(px, y0 + 162, "자동 · 포토부스 QR · 24시간 유효"),
          hand(px, y0 + 230, "넷이 다 눈 감음 ㅋㅋㅋ", 24), hand(px, y0 + 262, "다음엔 소품 챙기기", 24), heart(px + 232, y0 + 222, 10, ROSE),
          T(px, y0 + 296, "포즈 메모", 11, fill=MUTED), dashed_box(px, y0 + 304, pw, 210), hand(px + 14, y0 + 346, "1컷 브이 · 2컷 하트", 22), hand(px + 14, y0 + 376, "3컷 자유 · 4컷 ???", 22),
          star(px + pw - 30, y0 + 480, 10), T(W - M, H - M - 4, "알림 없음", 10, fill=MUTED, anchor="end")]
    return g


@_safe
def n_receipt_ledger(W, H, land):
    g = [header(W, "RECEIPTS", "영수증 사진이 영수증 모양 스티커로 붙고 금액은 합계에 자동으로 더해져요", CAMEL, right="2026 · 10 · 넷째 주")]
    x0, y0 = M, M + 54
    rw, rh = 192, 250
    receipts = [(x0 + 12, y0 + 24, -4, "소금빵집 르뱅", "2026-10-20 08:12", [("소금빵 ×2", "6,400"), ("아메리카노", "4,500")], "10,900"),
                (x0 + 236, y0 + 14, 3, "다꾸 문방구", "2026-10-21 17:40", [("스티커 2종", "12,000"), ("마테 1롤", "4,800")], "16,800"),
                (x0 + 460, y0 + 28, -2, "분식 한강점", "2026-10-25 13:05", [("떡볶이", "7,800"), ("순대", "5,000"), ("튀김", "4,500"), ("음료", "3,200")], "20,500")]
    for x, y, ang, store, date, items, total in receipts:
        g += [_receipt(x, y, rw, rh, store, date, items, total, ang), tape(x + rw / 2 - 30, y - 6, 60, 16, "kraft", ang)]
    g += [T(x0, y0 + 302, "사진 → 영수증 모양으로 잘림 · 금액은 1차엔 손으로 적어요", 10, fill=MUTED), hand(x0 + 4, y0 + 346, "이번 주 = 빵 + 스티커 + 떡볶이… 반성", 22),
          dashed_box(x0, y0 + 368, 652, 196), photo_filled(x0 + 16, y0 + 384, 150, 100, "cafe"), tape(x0 + 56, y0 + 376, 60, 16, "butter", -4),
          hand(x0 + 190, y0 + 428, "영수증 모으는 재미가 있다", 22), hand(x0 + 190, y0 + 458, "다음 주 예산 40,000", 22)]
    px, pw = 724, W - M - 724
    by = y0 + 140
    g += [T(px, y0 + 16, "이번 주 합계", 11, fill=MUTED), T(px, y0 + 58, "48,200", 36, weight=800, fill=CAMEL), T(px + 136, y0 + 58, "원", 12, fill=MUTED),
          T(px, y0 + 80, "영수증 3장 · 10 · 19 ~ 25", 11, fill=MUTED), _auto(px, y0 + 104, "자동 · 잠긴 숫자"),
          T(px, by, "주간 예산 45,000", 11, fill=MUTED), T(px + pw, by, "107%", 11, weight=700, fill=KRAFT_DARK, anchor="end"),
          _bar(px, by + 8, pw, 12, 48200 / 45000, CAMEL, over=KRAFT_DARK), T(px + pw, by + 36, "3,200 넘었어요", 10, fill=KRAFT_DARK, anchor="end"),
          T(px, by + 70, "가게별", 11, fill=MUTED)]
    for j, (store, amt, v) in enumerate([("분식 한강점", "20,500", 20500), ("다꾸 문방구", "16,800", 16800), ("소금빵집 르뱅", "10,900", 10900)]):
        y = by + 92 + j * 26
        g += [T(px, y, store, 11), _bar(px + 92, y - 9, 96, 8, v / 20500, CAMEL), T(px + pw, y, amt, 10, cls="m", anchor="end")]
    g += [stamp(px + pw - 44, by + 230, 32, CAMEL, "정산", 14), _pill(W, H, "영수증 3장 · 이번 주 48,200원")]
    return g


@_safe
def n_shareview(W, H, land):
    g = [header(W, "SHARE VIEW", "완성한 장을 방 밖 사람이 넘겨 보는 보기 전용 페이지 · 꾸미기는 잠겨요", PERI, right="dio.app/s/9f2k3a")]
    x0, y0 = M, M + 54
    bx, by, bw, bh = x0, y0 + 10, 584, 470
    g += [R(bx, by, bw, bh, fill="#fff", stroke=LINE, rx=12, filt="shadow"), L(bx, by + 30, bx + bw, by + 30, stroke=LINE)]
    for i in range(3): g.append(C(bx + 16 + i * 14, by + 15, 4, fill=LINE, stroke="none"))
    g += [R(bx + 64, by + 7, 220, 16, fill=POCKET, stroke="none", rx=8), T(bx + 174, by + 18, "dio.app/s/9f2k3a", 10, cls="m", fill=MUTED, anchor="middle")]
    px_, py_, pw_, ph_ = bx + 16, by + 46, bw - 32, bh - 62
    g += [R(px_, py_, pw_, ph_, fill=PAPER, stroke=LINE2, filt="softshadow"), R(px_ + 14, py_ + 14, 6, 6, fill=PERI, stroke="none", rx=1),
          T(px_ + 26, py_ + 20, "OCT 25 · 카페 다꾸", 10, weight=800, ls="0.06em"), L(px_ + 14, py_ + 30, px_ + pw_ - 14, py_ + 30, stroke=LINE, dash="2 4"),
          G([photo_filled(px_ + 20, py_ + 46, 250, 180, "cafe"), tape(px_ + 60, py_ + 38, 70, 18, "butter", -5)], transform=f"rotate(-2 {px_ + 145} {py_ + 136})"),
          hand(px_ + 290, py_ + 90, "다 같이 카페에서 다꾸!", 22), hand(px_ + 290, py_ + 120, "소금빵은 역시 르뱅", 22), heart(px_ + 500, py_ + 70, 9, ROSE), star(px_ + 300, py_ + 160, 10),
          G([photo_filled(px_ + 300, py_ + 190, 160, 110, "pink"), tape(px_ + 350, py_ + 182, 60, 16, "pink", 4)], transform=f"rotate(3 {px_ + 380} {py_ + 245})"),
          lines(px_ + 20, py_ + 240, 250, 110, 28, LINE2), hand(px_ + 24, py_ + 264, "지우: 스티커 너무 많이 붙였나", 18), hand(px_ + 24, py_ + 292, "현아: 아니 딱 좋아", 18)]
    for i, (ch_, col) in enumerate(MEMBERS): g.append(avatar(px_ + 26 + i * 22, py_ + ph_ - 20, 9, col, ch_, 10))
    g += [T(px_ + 124, py_ + ph_ - 16, "민희 · 수아 · 지우 · 현아가 함께 꾸민 장", 10, fill=MUTED),
          T(bx + bw / 2, by + bh + 24, "‹   3 / 12   ›", 13, fill=MUTED, anchor="middle", weight=700),
          T(bx + bw / 2, by + bh + 46, "방 밖 사람은 넘겨 볼 수만 있어요 · 스티커 · 글 수정 불가", 10, fill=MUTED, anchor="middle"),
          hand(x0 + 4, 684, "친구들한테 자랑하기용 링크 ♡", 22)]
    px, pw = 664, W - M - 664
    g += [_qr(px, y0 + 12, 120, 11), label_tag(px + 136, y0 + 16, "보기 전용", PERI), T(px + 136, y0 + 58, "dio.app/s/9f2k3a", 13, cls="m", weight=700),
          T(px + 136, y0 + 78, "링크 아는 사람만 · 7일 뒤 만료", 10, fill=MUTED), _auto(px + 136, y0 + 106, "꾸미기 · 댓글 잠김 · 보기만")]
    ry_ = y0 + 170
    g += [R(px, ry_, pw, 92, fill="#fff", stroke=LINE, rx=10, filt="softshadow"), heart(px + 32, ry_ + 38, 14, ROSE), T(px + 56, ry_ + 48, "12", 28, weight=800), T(px + 96, ry_ + 48, "하트", 12, fill=MUTED),
          T(px + 170, ry_ + 48, "12", 28, weight=800), T(px + 210, ry_ + 48, "본 사람", 12, fill=MUTED), T(px + 14, ry_ + 76, "반응은 하트만 · 댓글은 방 안에서만", 10, fill=MUTED)]
    vy = ry_ + 120
    g.append(T(px, vy, "방 밖에서 본 사람 · 익명", 11, fill=MUTED))
    for i in range(6): g += [C(px + 14 + i * 26, vy + 26, 11, fill=LINE2, stroke="#fff", sw=2), T(px + 14 + i * 26, vy + 30, "?", 11, fill=MUTED, anchor="middle", weight=700)]
    g += [T(px + 14 + 6 * 26 + 2, vy + 30, "+6", 11, fill=MUTED), dashed_box(px, vy + 60, pw, 190), hand(px + 14, vy + 102, "엄마한테도 보냄 ㅋㅋ", 22),
          hand(px + 14, vy + 132, "댓글은 못 달지만 하트는 돼요", 20), _pill(W, H, "방 밖에서 12명이 봤어요")]
    return g
