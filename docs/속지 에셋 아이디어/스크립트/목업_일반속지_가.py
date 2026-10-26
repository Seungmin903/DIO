# -*- coding: utf-8 -*-
"""① 일반 속지(오프라인) 목업 a — 기본 · 플래너 · 트래커 12종.

시그니처 fn(W, H, land) -> list[str]   (W=1024, H=768, land=True)
인쇄된 선 · 칸만 그린다(상태 · 알림 UI 없음). 예시 손글씨 · 사진 · 테이프는 전체의 20~30%만 채워 속지 구조가 보이게 한다.
날짜 예시는 2026년 10월(10 · 25 일). 강조색은 속지당 팔레트 한 색.
"""
from 목업_도형 import *  # noqa: F401,F403
import math  # noqa: F401
import random
import functools
import datetime as _dt

_TOP = M + 54  # 본문 시작 y (header 아래)
_WEEK = [("월", 19), ("화", 20), ("수", 21), ("목", 22), ("금", 23), ("토", 24), ("일", 25)]  # 2026 · 10 넷째 주


# ── 비공개 도우미 ─────────────────────────────────────────────────────────
def _safe(fn):
    """목업 함수는 절대 예외를 내지 않는다 — 실패하면 제목만 있는 빈 속지를 돌려준다."""
    @functools.wraps(fn)
    def wrap(W, H, land=True):
        try:
            return fn(W, H, land)
        except Exception as e:  # pragma: no cover
            return [header(W, fn.__name__.replace("p_", "").upper().replace("_", " "), f"render error: {type(e).__name__}", MUTED)]
    return wrap


def _wd_sun0(y, m, d=1):
    """일요일=0 기준 요일 번호."""
    try:
        return (_dt.date(y, m, d).weekday() + 1) % 7
    except Exception:
        return 4


def _daycol(dn):
    """요일 글자색: 일요일 ROSE · 토요일 PERI · 평일 INK"""
    return ROSE if dn == "일" else PERI if dn == "토" else INK


def _table(x, y, cols, n, hh, rh, head_fill=None):
    """표 틀: cols=[(라벨, 폭)], n줄. 바깥 LINE · 안쪽 LINE2. 돌려주는 값: (svg 목록, 열 시작 x 목록)"""
    w = sum(cw for _, cw in cols)
    g = [R(x, y, w, hh + n * rh, stroke=LINE, rx=4), L(x, y + hh, x + w, y + hh, stroke=LINE)]
    if head_fill:
        g.insert(0, R(x, y, w, hh, fill=head_fill, stroke="none", rx=4))
    xs = []
    cx = x
    for i, (name, cw) in enumerate(cols):
        xs.append(cx)
        g.append(T(cx + cw / 2, y + hh / 2 + 4, name, 11, fill=MUTED, anchor="middle", weight=700))
        cx += cw
        if i < len(cols) - 1:
            g.append(L(cx, y, cx, y + hh + n * rh, stroke=LINE2))
    for r in range(1, n):
        g.append(L(x, y + hh + r * rh, x + w, y + hh + r * rh, stroke=LINE2))
    return g, xs


def _block(x, y, w, h, color, text=None, size=18, opacity=0.35):
    """시간표 · 타임라인의 일정 블록(연한 팔레트 색 사각 + 손글씨)."""
    g = [R(x + 2, y + 1, w - 4, h - 2, fill=color, stroke="none", rx=4, opacity=opacity)]
    if text:
        g.append(hand(x + 8, y + min(h - 6, size + 4), text, size))
    return G(g)


def _hour_rows(x, y, w, hours, rh, label_x, start=6, every=1):
    """세로 시간축: 시간마다 가로선(LINE2) + 왼쪽 라벨(선 위치 기준)."""
    g = []
    for h in range(hours + 1):
        yy = y + h * rh
        if 0 < h < hours:
            g.append(L(x, yy, x + w, yy, stroke=LINE if (start + h) % 6 == 0 else LINE2))
        if h % every == 0:
            g.append(T(label_x, yy + 3, f"{start + h:02d}", 9, fill=MUTED, anchor="end"))
    return g


# ── 기본 ──────────────────────────────────────────────────────────────────
@_safe
def p_blank(W, H, land):
    g = [header(W, "BLANK", "무지 · 스티커만으로 꾸미는 바탕(스꾸)", CAMEL, right="2026 · 10 · 25"),
         tape(W - 420, M - 10, 150, 30, "butter", -4, pattern="plain")]
    # 가운데 아래 작은 손글씨 + 스티커 느낌
    cx, cy = W / 2, H / 2 + 36
    g += [hand(cx, cy, "자유롭게", 30, anchor="middle"),
          star(cx - 116, cy - 34, 12), heart(cx + 104, cy - 30, 11), sparkle(cx + 142, cy - 2, 7, LAV),
          star(cx - 150, cy + 10, 7, fill=PERI), heart(cx + 76, cy + 16, 6, fill=LAV),
          P(f"M{cx - 70},{cy + 18} q40,14 80,0 t80,0", stroke=SAGE, sw=2)]
    # 하단: 종이 바탕 6색 견본 띠
    sw, sh, gap = 54, 36, 12
    by = H - M - sh - 18
    names = ["화이트", "크림", "세이지", "로즈", "스카이", "그레이"]
    g.append(T(M, by - 12, "종이 바탕 6색 · 질감(모눈지 · 크라프트 · 트레이싱)은 에셋으로", 10, fill=MUTED))
    for i, (c, nm) in enumerate(zip(PAPERS, names)):
        g.append(paper_swatch(M + i * (sw + gap), by, sw, sh, c, label=nm))
    return g


@_safe
def p_lined(W, H, land):
    y0 = _TOP; h = H - M - y0; gap = 28
    g = [header(W, "LINED", "7mm 줄 · 편지 · 일기 바탕", ROSE, right="2026 · 10 · 25"),
         lines(M, y0, W - 2 * M, h, gap, LINE),
         L(M + 40, y0 + 6, M + 40, H - M, stroke=ROSE, sw=1, opacity=0.55),
         hand(M + 52, y0 + gap * 2 - 7, "수아에게. 오늘 빵집 앞을 지나는데 네 생각이 났어", 22),
         hand(M + 52, y0 + gap * 3 - 7, "소금빵은 역시 둘이 나눠 먹어야 맛있더라", 22),
         polaroid(W - M - 170, y0 + gap * 5 + 6, 130, "빵집 앞", angle=4, tone="cafe"),
         tape(W - M - 150, y0 + gap * 5 - 4, 70, 18, "pink", -6),
         T(W - M, H - M + 12, "줄 간격 7mm · 8mm 두 가지 · 왼쪽 여백선은 옵션", 10, fill=MUTED, anchor="end")]
    return g


@_safe
def p_grid(W, H, land):
    gap = 20
    cols, rows = 45, 30
    w, h = cols * gap, rows * gap
    x0 = (W - w) / 2; y0 = M + 52
    g = [header(W, "GRID", "5mm 모눈 · 5칸마다 굵은 선", SAGE, right="2026 · 10 · 25"),
         grid(x0, y0, w, h, gap, LINE2, bold_every=5, bold_color=LINE)]
    # 손글씨 1줄 + 작은 그림(레이아웃 스케치)
    g += [hand(x0 + 24, y0 + gap * 3 - 6, "이번 주 다꾸 레이아웃 스케치", 22),
          R(x0 + 40, y0 + gap * 5, 140, 100, stroke=PEN, sw=1.5, rx=2), hand(x0 + 110, y0 + gap * 5 + 58, "사진", 20, anchor="middle"),
          C(x0 + 260, y0 + gap * 7 + 10, 34, stroke=PEN, sw=1.5), hand(x0 + 260, y0 + gap * 7 + 17, "날짜", 18, anchor="middle"),
          P(f"M{x0 + 40},{y0 + gap * 12} h140 M{x0 + 40},{y0 + gap * 13} h100 M{x0 + 40},{y0 + gap * 14} h120", stroke=PEN, sw=1.5),
          P(f"M{x0 + 200},{y0 + gap * 12} l40,0 l-8,-6 M{x0 + 240},{y0 + gap * 12} l-8,6", stroke=PEN, sw=1.5),
          hand(x0 + 250, y0 + gap * 12 + 6, "글은 왼쪽", 18),
          tape(x0 + w - 160, y0 - 10, 110, 22, "mint", -3, pattern="stripes"),
          T(W - M, H - M + 12, "5mm · 3mm 두 가지 · 격자 색 10종은 에셋(컬러 모눈)", 10, fill=MUTED, anchor="end")]
    return g


# ── 플래너 ────────────────────────────────────────────────────────────────
@_safe
def p_monthly(W, H, land):
    y0 = _TOP
    memo_w, gap, hh = 180, 20, 20
    cal_w = W - 2 * M - memo_w - gap
    cw = cal_w / 7
    start = _wd_sun0(2026, 10)
    days = 31
    rows = -(-(days + start) // 7)
    gy = y0 + hh
    rh = (H - M - gy) / rows
    g = [header(W, "MONTHLY", "10월 · 일요일 시작 · 오른쪽 메모 띠", PERI, right="2026 · OCTOBER")]
    for i, d in enumerate("일월화수목금토"):
        g.append(T(M + i * cw + cw / 2, y0 + 14, d, 11, fill=_daycol(d) if d in "일토" else MUTED, anchor="middle", weight=700))
    g.append(R(M, gy, cal_w, rows * rh, stroke=LINE))
    for i in range(1, 7):
        g.append(L(M + i * cw, gy, M + i * cw, gy + rows * rh, stroke=LINE2))
    for r in range(1, rows):
        g.append(L(M, gy + r * rh, M + cal_w, gy + r * rh, stroke=LINE))
    hol = {3: "개천절", 9: "한글날"}

    def cell(d):
        r, c = divmod(d - 1 + start, 7)
        return M + c * cw, gy + r * rh, c

    for d in range(1, days + 1):
        x, y, c = cell(d)
        col = ROSE if (c == 0 or d in hol) else PERI if c == 6 else INK
        g.append(T(x + 8, y + 18, str(d), 12, fill=col, weight=700))
        if d in hol:
            g.append(T(x + cw - 8, y + 18, hol[d], 10, fill=ROSE, anchor="end"))
    # 채운 예시(4칸)
    x, y, _ = cell(10); g.append(hand(x + 8, y + 48, "빵집 투어", 20))
    x, y, _ = cell(17); g += [hand(x + 8, y + 48, "수아 생일", 20), star(x + cw - 18, y + 32, 7)]
    x, y, _ = cell(25); g += [hand(x + 8, y + 48, "카페 다꾸!", 20), hand(x + 8, y + 72, "14시 성수", 18), heart(x + cw - 18, y + 32, 7)]
    x, y, _ = cell(31); g += [hand(x + 8, y + 48, "할로윈", 20), sparkle(x + cw - 18, y + 32, 6)]
    # 메모 띠
    mx = W - M - memo_w
    g += [T(mx, y0 + 14, "MEMO", 10, fill=MUTED, ls="0.15em"), R(mx, gy, memo_w, rows * rh, stroke=LINE),
          lines(mx + 8, gy + 4, memo_w - 16, rows * rh - 12, 28, LINE2),
          hand(mx + 12, gy + 26, "이달의 목표", 18, MUTED), hand(mx + 12, gy + 54, "빙고 한 줄 완성", 20),
          check(mx + 10, gy + 100, 14, on=True), hand(mx + 32, gy + 112, "속지 주문", 18),
          check(mx + 10, gy + 128, 14), hand(mx + 32, gy + 140, "사진 인화", 18),
          tape(mx + memo_w / 2 - 36, gy - 9, 72, 18, "sky", 4),
          T(W - M, H - M + 12, "월요일 시작 · 날짜 없는 만년형 옵션", 10, fill=MUTED, anchor="end")]
    return g


@_safe
def p_weekly(W, H, land):
    y0 = _TOP
    side_w, gap = 220, 12
    area_w = W - 2 * M - side_w - 24
    bh = (H - M - y0 - gap) / 2
    g = [header(W, "WEEKLY", "블록 위클리 · 위 4칸 · 아래 3칸 · 이번 주 할 일", SAGE, right="2026 · 10 · 19 – 25")]
    w4 = (area_w - 3 * gap) / 4
    w3 = (area_w - 2 * gap) / 3
    boxes = [(M + i * (w4 + gap), y0, w4, bh) for i in range(4)] + [(M + i * (w3 + gap), y0 + bh + gap, w3, bh) for i in range(3)]
    for (dn, dd), (x, y, w, h) in zip(_WEEK, boxes):
        g += [R(x, y, w, h, stroke=LINE, rx=6), T(x + 10, y + 21, str(dd), 15, fill=_daycol(dn), weight=800), T(x + 36, y + 21, dn, 11, fill=MUTED),
              L(x, y + 30, x + w, y + 30, stroke=LINE2), lines(x + 8, y + 30, w - 16, h - 44, 28, LINE2)]
    # 채운 예시: 월 · 수 · 토 · 일
    x, y, w, h = boxes[0]; g.append(hand(x + 12, y + 52, "팀 회의 10시", 20))
    x, y, w, h = boxes[2]; g += [hand(x + 12, y + 52, "치과 15:00", 20), hand(x + 12, y + 80, "수아랑 저녁", 20)]
    x, y, w, h = boxes[5]; g += [photo_filled(x + w - 112, y + 42, 100, 74, "cafe"), tape(x + w - 98, y + 34, 56, 14, "mint", -6), hand(x + 12, y + 52, "성수 빵집", 20), hand(x + 12, y + 80, "소금빵 2개", 20)]
    x, y, w, h = boxes[6]; g += [hand(x + 12, y + 52, "카페 다꾸!", 22), heart(x + w - 24, y + 50, 8)]
    # 오른쪽: 이번 주 할 일 + 메모
    sx = W - M - side_w
    g.append(T(sx, y0 + 14, "이번 주 할 일", 11, weight=700))
    ty = y0 + 28
    todos = ["속지 주문", "빙고 한 칸", None, None, None]
    for i, t in enumerate(todos):
        yy = ty + i * 34
        g += [check(sx, yy + 4, 16, on=t is not None), L(sx + 24, yy + 20, sx + side_w, yy + 20, stroke=LINE)]
        if t: g.append(hand(sx + 30, yy + 17, t, 20))
    my = ty + 5 * 34 + 28
    g += [T(sx, my - 6, "MEMO", 10, fill=MUTED, ls="0.15em"), dashed_box(sx, my, side_w, H - M - my),
          hand(sx + 14, my + 40, "이번 주 소금빵", 20), hand(sx + 14, my + 66, "두 번이나 ㅎㅎ", 20),
          tape(sx + side_w - 90, my - 8, 70, 16, "mint", 6)]
    return g


@_safe
def p_weekly_vertical(W, H, land):
    y0 = _TOP; lab = 36; hh = 22; memo_h = 96
    gx = M + lab; gw = W - M - gx; cw = gw / 7
    gy = y0 + hh; gh = H - M - memo_h - gy
    hours = 18; rh = gh / hours
    g = [header(W, "WEEKLY VERTICAL", "요일 × 시간 · 06 ~ 24시 · 아래 메모", PERI, right="2026 · 10 · 19 – 25")]
    for i, (dn, dd) in enumerate(_WEEK):
        g.append(T(gx + i * cw + cw / 2, y0 + 15, f"{dd} {dn}", 11, fill=_daycol(dn), anchor="middle", weight=700))
    g.append(R(gx, gy, gw, gh, stroke=LINE))
    for i in range(1, 7):
        g.append(L(gx + i * cw, gy, gx + i * cw, gy + gh, stroke=LINE))
    g += _hour_rows(gx, gy, gw, hours, rh, gx - 6)
    # 일정 블록 예시 3개 (월 10~12 · 수 15~16 · 토 13~17)
    g += [_block(gx + 0 * cw, gy + 4 * rh, cw, 2 * rh, PERI, "팀 회의"),
          _block(gx + 2 * cw, gy + 9 * rh, cw, rh, PERI, "치과", 16),
          _block(gx + 5 * cw, gy + 7 * rh, cw, 4 * rh, PERI, "카페 다꾸 · 성수")]
    g.append(heart(gx + 5 * cw + cw - 18, gy + 7 * rh + 18, 6))
    # 아래 메모
    my = gy + gh + 14
    g += [T(M, my + 8, "MEMO", 10, fill=MUTED, ls="0.15em"), lines(M, my, W - 2 * M, memo_h - 20, 24, LINE2),
          hand(M + 6, my + 48 - 5, "이번 주 목표 · 물 2L 매일, 카페 다꾸 준비물 미리 챙기기", 20),
          tape(W - M - 110, my - 4, 90, 16, "sky", -4)]
    return g


@_safe
def p_timeline(W, H, land):
    y0 = _TOP; lab = 40; hh = 22; colw = 190
    gx = M + lab; gy = y0 + hh; gh = H - M - gy
    hours = 18; rh = gh / hours
    g = [header(W, "TIMELINE 24H", "하루를 시간 순서로 · 계획 · 실제 두 줄", LAV, right="2026 · 10 · 25 · 일")]
    for i, nm in enumerate(["계획", "실제"]):
        g.append(T(gx + i * colw + colw / 2, y0 + 15, nm, 11, anchor="middle", weight=700))
    g += [R(gx, gy, colw * 2, gh, stroke=LINE), L(gx + colw, gy, gx + colw, gy + gh, stroke=LINE)]
    g += _hour_rows(gx, gy, colw * 2, hours, rh, gx - 8)
    # 계획(LAV) · 실제(SAGE) 블록
    plan = [(7, 8, "기상 · 스트레칭"), (9, 12, "과제"), (14, 17, "카페 다꾸"), (21, 23, "일기 · 독서")]
    real = [(8, 9, "늦잠 ㅎㅎ"), (10, 12.5, "과제"), (14, 18, "카페 다꾸 (연장)"), (22, 23.5, "일기")]
    for s, e, t in plan:
        g.append(_block(gx, gy + (s - 6) * rh, colw, (e - s) * rh, LAV, t, 18))
    for s, e, t in real:
        g.append(_block(gx + colw, gy + (s - 6) * rh, colw, (e - s) * rh, SAGE, t, 18, 0.4))
    # 오른쪽: 할 일 + 메모
    rx = gx + 2 * colw + 24; rw = W - M - rx
    g.append(T(rx, y0 + 15, "TO DO", 10, fill=MUTED, ls="0.15em"))
    todos = ["과제 제출", "다꾸 준비물", None, None, None]
    for i, t in enumerate(todos):
        yy = gy + i * 32
        g += [check(rx, yy + 2, 16, on=t is not None), L(rx + 24, yy + 17, rx + rw, yy + 17, stroke=LINE)]
        if t: g.append(hand(rx + 30, yy + 15, t, 20))
    my = gy + 5 * 32 + 26
    g += [T(rx, my - 6, "MEMO", 10, fill=MUTED, ls="0.15em"), dashed_box(rx, my, rw, H - M - my),
          hand(rx + 16, my + 40, "계획보다 1시간 늦게 시작했지만", 22), hand(rx + 16, my + 68, "다꾸는 1시간 더 했으니 OK", 22),
          polaroid(rx + rw - 160, my + 110, 130, "성수 카페", angle=5, tone="cafe"),
          tape(rx + rw - 140, my - 9, 90, 18, "lavender", 6)]
    return g


@_safe
def p_study(W, H, land):
    y0 = _TOP
    tr_w = 304; tx = W - M - tr_w
    lw = tx - 24 - M
    g = [header(W, "STUDY", "과목 · 목표 · 실제 · 체크 · 타임 트래커(10분)", SAGE, right="2026 · 10 · 25 · 일")]
    # 과목 표 6줄
    cols = [("과목", lw - 300), ("목표", 110), ("실제", 110), ("✓", 80)]
    hh, rh, n = 22, 36, 6
    tbl, xs = _table(M, y0, cols, n, hh, rh)
    g += tbl
    for r in range(n):
        g.append(check(xs[3] + 32, y0 + hh + r * rh + 10, 16, on=r < 2))
    rows = [("수학 — 미적분 3단원", "2h", "1h 30m"), ("영어 — 단어 100개", "1h", "1h"), ("국어 — 비문학 3지문", "1h", "1h 20m")]
    for r, (s, t, a) in enumerate(rows):
        yy = y0 + hh + r * rh + 25
        g += [hand(xs[0] + 10, yy, s, 20), hand(xs[1] + 55, yy, t, 20, anchor="middle")]
        if a: g.append(hand(xs[2] + 55, yy, a, 20, anchor="middle"))
    # 총 공부 시간 · 디데이
    by = y0 + hh + n * rh + 20
    bw = (lw - 20) / 2
    g += [R(M, by, bw, 70, stroke=LINE, rx=6), T(M + 12, by + 18, "총 공부 시간", 10, fill=MUTED), hand(M + bw / 2, by + 52, "3h 50m", 30, anchor="middle"),
          R(M + bw + 20, by, bw, 70, stroke=LINE, rx=6), T(M + bw + 32, by + 18, "D-DAY", 10, fill=MUTED, ls="0.1em"),
          hand(M + bw + 20 + bw / 2, by + 52, "D-23 중간고사", 28, anchor="middle")]
    # 오늘의 한 줄
    my = by + 70 + 24
    g += [T(M, my - 6, "오늘의 한 줄", 10, fill=MUTED), lines(M, my, lw, H - M - my, 30, LINE2),
          hand(M + 6, my + 30 - 7, "수학은 역시 저녁에 집중이 잘 됨", 22), tape(M + lw - 120, my - 8, 90, 18, "mint", 5)]
    # 타임 트래커 6 × 18 (06 ~ 24시)
    hl = 28; cw = (tr_w - hl) / 6
    gy = y0 + 22; rh2 = (H - M - gy) / 18
    g += [T(tx + hl + (tr_w - hl) / 2, y0 + 15, "TIME TRACKER · 10분 한 칸", 10, fill=MUTED, anchor="middle", ls="0.06em"),
          R(tx + hl, gy, tr_w - hl, 18 * rh2, stroke=LINE)]
    for i in range(1, 6):
        g.append(L(tx + hl + i * cw, gy, tx + hl + i * cw, gy + 18 * rh2, stroke=LINE2))
    for h in range(18):
        yy = gy + h * rh2
        if h: g.append(L(tx + hl, yy, tx + tr_w, yy, stroke=LINE2))
        g.append(T(tx + hl - 6, yy + rh2 / 2 + 3, f"{6 + h:02d}", 9, fill=MUTED, anchor="end"))
    filled = [(9, 0, 6), (10, 0, 3), (14, 0, 6), (20, 0, 6), (21, 0, 2)]  # (시, 시작 칸, 칸 수) → 3h 50m
    for hr, s, cnt in filled:
        for c in range(s, s + cnt):
            g.append(R(tx + hl + c * cw + 2, gy + (hr - 6) * rh2 + 2, cw - 4, rh2 - 4, fill=SAGE, stroke="none", rx=3, opacity=0.7))
    return g


# ── 트래커 ────────────────────────────────────────────────────────────────
@_safe
def p_budget(W, H, land):
    y0 = _TOP
    w = W - 2 * M
    cols = [("날짜", 110), ("항목", w - 110 - 200), ("금액  ( + 들어온 돈 · − 나간 돈 )", 200)]
    hh, n = 22, 14
    sum_h, gap = 76, 22
    rh = (H - M - sum_h - gap - y0 - hh) / n
    g = [header(W, "BUDGET", "용돈 기입장 · 들어온 돈 · 나간 돈 · 남은 돈", MUST, right="2026 · 10월 넷째 주")]
    tbl, xs = _table(M, y0, cols, n, hh, rh)
    g += tbl
    rows = [("10 · 20", "용돈 받음", "+ 50,000"), ("10 · 21", "소금빵 2개", "− 6,400"), ("10 · 23", "마스킹테이프 2개", "− 8,900"), ("10 · 25", "카페 라떼", "− 8,200")]
    for r, (d, item, amt) in enumerate(rows):
        yy = y0 + hh + r * rh + rh / 2 + 7
        g += [hand(xs[0] + 12, yy, d, 20), hand(xs[1] + 12, yy, item, 20), hand(xs[2] + 200 - 14, yy, amt, 20, anchor="end")]
    g += [star(xs[1] + 110, y0 + hh + rh / 2, 7), heart(xs[1] + 170, y0 + hh + 2 * rh + rh / 2, 6)]
    # 합계 칸 3개
    sy = y0 + hh + n * rh + gap
    bw = (w - 2 * 20) / 3
    sums = [("들어온 돈", "50,000"), ("나간 돈", "23,500"), ("남은 돈", "26,500")]
    for i, (lb, v) in enumerate(sums):
        x = M + i * (bw + 20)
        g += [R(x, sy, bw, sum_h, stroke=LINE, rx=6), T(x + 12, sy + 18, lb, 10, fill=MUTED),
              hand(x + bw - 16, sy + 56, v, 30, anchor="end"), T(x + 12, sy + 56, "원", 11, fill=MUTED)]
    g.append(tape(M + 520, y0 - 9, 100, 18, "butter", 4))
    return g


@_safe
def p_water_sleep(W, H, land):
    y0 = _TOP; lab = 40
    gx = M + lab; gw = W - M - gx
    days = 31; cw = gw / days
    rnd = random.Random(26)
    g = [header(W, "WATER · SLEEP", "물 8컵 체크 · 취침 → 기상 띠", PERI, right="2026 · 10월")]
    # 물 트래커 31 × 8
    cups, ch = 8, 18
    wy = y0 + 18
    g.append(T(M, y0 + 10, "물 8컵", 10, fill=MUTED))
    for d in range(days):
        g.append(T(gx + d * cw + cw / 2, y0 + 10, str(d + 1), 9, fill=MUTED, anchor="middle"))
    for c in range(cups):
        g.append(T(gx - 6, wy + c * ch + ch / 2 + 3, str(cups - c), 9, fill=MUTED, anchor="end"))
    today = 10  # 채운 예시는 10일까지만(전체의 약 30%)
    for d in range(days):
        nfill = rnd.randint(4, 8) if d < today else 0
        for c in range(cups):
            on = (cups - c) <= nfill
            g.append(R(gx + d * cw + 3, wy + c * ch + 2, cw - 6, ch - 4, fill=PERI if on else "none", stroke="none" if on else LINE, rx=3, opacity=0.55 if on else None))
    g.append(T(W - M, wy + cups * ch + 14, "컵 하나 = 250ml · 아래부터 칠한다", 10, fill=MUTED, anchor="end"))
    # 수면 띠 31일 (22시 → 08시)
    sy = wy + cups * ch + 40
    sh = H - M - sy; ph = sh / 10
    g += [T(M, sy - 10, "수면 · 취침 → 기상", 10, fill=MUTED), R(gx, sy, gw, sh, stroke=LINE)]
    for i in range(1, days):
        g.append(L(gx + i * cw, sy, gx + i * cw, sy + sh, stroke=LINE2, opacity=0.7))
    labels = ["22", "23", "24", "01", "02", "03", "04", "05", "06", "07", "08"]
    for h in range(11):
        yy = sy + h * ph
        if 0 < h < 10: g.append(L(gx, yy, gx + gw, yy, stroke=LINE if h % 2 == 0 else LINE2))
        if h % 2 == 0: g.append(T(gx - 6, yy + 3, labels[h], 9, fill=MUTED, anchor="end"))
    for d in range(today):
        bed = rnd.uniform(1.0, 3.2)          # 22시 기준 경과 시간(23:00 ~ 01:12)
        wake = rnd.uniform(8.3, 9.9)         # 06:18 ~ 07:54
        g.append(R(gx + d * cw + 6, sy + bed * ph, cw - 12, (wake - bed) * ph, fill=PERI, stroke="none", rx=4, opacity=0.4))
    g += [hand(W - M, sy - 8, "평균 7시간 10분 · 목표는 11시 취침", 20, anchor="end"),
          tape(gx + 260, sy - 28, 80, 16, "sky", -3)]
    return g


@_safe
def p_workout(W, H, land):
    y0 = _TOP
    lw = 500; rx = M + lw + 24; rw = W - M - rx
    g = [header(W, "WORKOUT", "오운완 · 종목 · 세트 · 시간 · 인증 사진", ROSE, right="2026 · 10 · 25 · 일")]
    # 종목 4줄
    cols = [("종목", lw - 250), ("세트", 100), ("시간", 100), ("✓", 50)]
    hh, rh, n = 22, 44, 4
    tbl, xs = _table(M, y0, cols, n, hh, rh)
    g += tbl
    rows = [("러닝 5km (한강)", "—", "30분", True), ("스쿼트", "3 × 15", "10분", True), ("플랭크", "3 × 1분", "5분", False)]
    for r in range(n):
        g.append(check(xs[3] + 17, y0 + hh + r * rh + 14, 16, on=r < len(rows) and rows[r][3]))
    for r, (s, st, tm, _) in enumerate(rows):
        yy = y0 + hh + r * rh + 29
        g += [hand(xs[0] + 10, yy, s, 20), hand(xs[1] + 50, yy, st, 20, anchor="middle"), hand(xs[2] + 50, yy, tm, 20, anchor="middle")]
    # 주간 요약(7일 원)
    wy = y0 + hh + n * rh + 26
    g.append(T(M, wy, "이번 주 운동한 날", 10, fill=MUTED))
    done = {0, 2, 4, 6}
    for i, dn in enumerate("월화수목금토일"):
        cx, cy = M + 16 + i * 44, wy + 30
        on = i in done
        g += [C(cx, cy, 14, fill=ROSE if on else "none", stroke="none" if on else LINE, sw=1, opacity=0.85 if on else None),
              T(cx, cy + 4, dn, 10, fill="#fff" if on else MUTED, anchor="middle", weight=700)]
    g.append(hand(M + 7 * 44 + 20, wy + 36, "4일 달성!", 20))
    # 오운완 손글씨 + 메모
    my = wy + 66
    g += [hand(M + 2, my + 30, "오운완 !!", 32), heart(M + 150, my + 20, 10),
          dashed_box(M, my + 48, lw, H - M - (my + 48)),
          hand(M + 16, my + 48 + 40, "한강 러닝 30분 컷. 다음엔 28분 도전", 22),
          tape(M + lw - 120, my + 40, 90, 18, "pink", 5)]
    # 인증 사진 + 기록
    ph1 = 250
    g += [photo_filled(rx, y0, rw, ph1, "green"), tape(rx + rw / 2 - 40, y0 - 9, 80, 20, "pink", -4),
          T(rx, y0 + ph1 + 16, "인증 사진 · 한강 러닝", 10, fill=MUTED)]
    ky = y0 + ph1 + 38
    fields = [("거리", "5.0 km"), ("시간", "30 : 12"), ("페이스", "6'02\""), ("칼로리", "320 kcal")]
    for i, (k, v) in enumerate(fields):
        yy = ky + i * 38
        g += [T(rx, yy + 14, k, 10, fill=MUTED), L(rx, yy + 26, rx + rw, yy + 26, stroke=LINE), hand(rx + 60, yy + 22, v, 22)]
    py = ky + 4 * 38 + 18
    g.append(photo(rx, py, rw, H - M - py, "인증 사진 2"))
    return g


@_safe
def p_todo(W, H, land):
    y0 = _TOP
    colw = (W - 2 * M - 40) / 2
    n, rh = 10, 30
    g = [header(W, "TO DO", "오늘 · 이번 주 · 우선순위는 별 3단계", MUST, right="2026 · 10 · 25 · 일")]
    secs = [("TODAY", "오늘", M), ("THIS WEEK", "이번 주", M + colw + 40)]
    items = [[("과제 제출", 3, True), ("물 2L", 1, True), ("카페 다꾸 준비물 챙기기", 2, True), ("수아한테 답장", 2, False)],
             [("빙고 한 줄 완성", 3, False), ("소금빵 빵집 가기", 1, True), ("10월 사진 정리", 2, False)]]
    for (en, ko, x), its in zip(secs, items):
        g += [T(x, y0 + 14, en, 11, weight=800, ls="0.08em"), T(x + len(en) * 8.6 + 8, y0 + 14, ko, 10, fill=MUTED),
              T(x + colw, y0 + 14, "★★★ 급함 · ★ 여유", 10, fill=MUTED, anchor="end")]
        ry = y0 + 30
        for i in range(n):
            yy = ry + i * rh
            for s in range(3):
                g.append(star(x + 8 + s * 14, yy + 14, 5.5, fill="none", stroke=LINE, sw=1))
            g += [check(x + 52, yy + 6, 16), L(x + 78, yy + 22, x + colw, yy + 22, stroke=LINE)]
        for i, (txt, pr, on) in enumerate(its):
            yy = ry + i * rh
            for s in range(pr):
                g.append(star(x + 8 + s * 14, yy + 14, 5.5, fill=MUST))
            if on: g.append(check(x + 52, yy + 6, 16, on=True))
            g.append(hand(x + 84, yy + 19, txt, 20))
    my = y0 + 30 + n * rh + 28
    g += [T(M, my - 6, "MEMO", 10, fill=MUTED, ls="0.15em"), dashed_box(M, my, W - 2 * M, H - M - my),
          hand(M + 16, my + 40, "이번 주는 할 일보다 다꾸가 먼저 ㅎㅎ", 22),
          tape(W - M - 130, my - 9, 100, 18, "butter", 5)]
    return g
