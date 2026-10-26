# -*- coding: utf-8 -*-
"""① 일반 속지(오프라인) 목업 b — 일기 · 마음 / 취향 · 덕질 / 구조 · 꾸밈 (14종)

시그니처 fn(W, H, land) -> list[str]  (W=1024, H=768, land=True). 그리기는 목업_도형 만 쓴다.
오프라인 속지: 인쇄된 선 · 칸만 있고 상태 · 알림 UI는 없다. 예시(손글씨 · 사진 · 테이프)는 20~30%만 채운다.
"""
from 목업_도형 import *  # noqa: F401,F403
import math  # noqa: F401
import random

_WD = ["목", "금", "토", "일", "월", "화", "수"]  # 2026년 10월 1일 = 목요일 (10월 25일 = 일요일)


def _wd(day):
    return _WD[(day - 1) % 7]


def _is_weekend(day):
    return _wd(day) in ("토", "일")


# ── 공용 소품(이 모듈 전용) ─────────────────────────────────────────────────
def _weather(x, y, sel=0, accent=MUST, r=13, gap=34):
    """날씨 원 5개, sel 번째에 강조 테두리."""
    g = []
    for i, w in enumerate(["☀", "☁", "☂", "❄", "☃"]):
        cx = x + i * gap
        g += [C(cx, y, r, stroke=LINE), T(cx, y + 5, w, 14, fill=MUTED, anchor="middle")]
    g.append(C(x + sel * gap, y, r, stroke=accent, sw=2.5))
    return G(g)


def _mood(x, y, sel=1, accent=MUST, r=15, gap=44):
    """기분 원 5개(표정), sel 번째 선택."""
    mouths = ["M-6,3 q6,7 12,0", "M-6,3 q6,4 12,0", "M-6,4 h12", "M-6,6 q6,-4 12,0", "M-6,7 q6,-7 12,0"]
    g = []
    for i, m in enumerate(mouths):
        cx = x + i * gap
        on = i == sel
        col = INK if on else "#B9B3A6"
        g.append(C(cx, y, r, fill=TAPES["butter"][0] if on else "none", stroke=accent if on else LINE, sw=2.5 if on else 1))
        g.append(G([C(-5, -4, 1.7, fill=col, stroke="none"), C(5, -4, 1.7, fill=col, stroke="none"), P(m, stroke=col, sw=1.6)],
                   transform=f"translate({cx} {y})"))
    return G(g)


def _ticket(x, y, w, h, cut=0.68):
    """절취선 있는 작은 티켓 사각(흰 바탕 · 점선 · 반원 홈)."""
    cx = x + w * cut
    return G([R(x, y, w, h, fill="#fff", stroke=LINE, rx=10), L(cx, y + 8, cx, y + h - 8, stroke=LINE, dash="4 4"),
              C(cx, y, 8, fill=PAPER, stroke=LINE), C(cx, y + h, 8, fill=PAPER, stroke=LINE),
              T(x + 16, y + 26, "TICKET", 10, fill=MUTED, ls="0.15em"),
              T(cx + (x + w - cx) / 2, y + h / 2 + 4, "티켓 사진", 11, fill=MUTED, anchor="middle")])


def _stamp_place(x, y, w, h, color=ROSE):
    """우표 자리: 크림 사각 + 종이색 점선으로 톱니 테두리."""
    return G([R(x, y, w, h, fill=CREAM, stroke="none"), R(x, y, w, h, stroke=PAPER, sw=5, dash="4 4"),
              R(x + 7, y + 7, w - 14, h - 14, stroke="#D7CDB9", sw=1), heart(x + w / 2, y + h / 2 - 8, 8, fill=color),
              T(x + w / 2, y + h / 2 + 18, "우표", 10, fill=MUTED, anchor="middle")])


def _cup(cx, cy, s, color="#CFC9BB"):
    """컵 선 그림(몸통 · 손잡이 · 받침)."""
    body = (f"M{cx - s * .5:.1f},{cy - s * .55:.1f} L{cx + s * .5:.1f},{cy - s * .55:.1f} L{cx + s * .4:.1f},{cy + s * .45:.1f} "
            f"Q{cx:.1f},{cy + s * .62:.1f} {cx - s * .4:.1f},{cy + s * .45:.1f} Z")
    handle = (f"M{cx + s * .47:.1f},{cy - s * .3:.1f} C{cx + s * .95:.1f},{cy - s * .35:.1f} {cx + s * .95:.1f},{cy + s * .3:.1f} "
              f"{cx + s * .43:.1f},{cy + s * .25:.1f}")
    return G([P(body, stroke=color, sw=1.5), P(handle, stroke=color, sw=1.5), E(cx, cy + s * .7, s * .72, s * .12, stroke=color, sw=1.2),
              T(cx, cy + s * .7 + 26, "컵", 10, fill=MUTED, anchor="middle")])


def _plate(cx, cy, r, color="#CFC9BB"):
    """접시 선 그림(타원 2겹)."""
    return G([E(cx, cy, r, r * .38, stroke=color, sw=1.5), E(cx, cy, r * .6, r * .2, stroke=color, sw=1),
              T(cx, cy + r * .38 + 22, "접시", 10, fill=MUTED, anchor="middle")])


def _pin(cx, cy, n, color=SAGE):
    return G([C(cx, cy, 11, fill=color, stroke="#fff", sw=2, filt="softshadow"), T(cx, cy + 4, str(n), 11, fill="#fff", anchor="middle", weight=800)])


# ── 일기 · 마음 ───────────────────────────────────────────────────────────
def p_photo_diary(W, H, land):
    """그림일기(사진 + 글) — 위 큰 사진 16:10, 오른쪽 날짜 · 날씨, 아래 줄 6. DIO의 원형."""
    g = [header(W, "PHOTO DIARY", "하루 한 장 사진 위에 글 · DIO의 원형", PERI, right="2026 · 10 · 25 · 일")]
    x0, y0, w = M, M + 66, W - 2 * M
    pw = int(w * 0.58); ph = int(pw * 10 / 16)  # 538 × 336
    g += [photo_filled(x0, y0, pw, ph, "cafe", rx=4),
          tape(x0 + pw - 36, y0 - 10, 72, 20, "pink", 45),           # 오른쪽 위 모서리
          tape(x0 - 36, y0 + ph - 10, 72, 20, "pink", 45)]           # 왼쪽 아래 모서리
    rx = x0 + pw + 30
    g += [T(rx, y0 + 64, "25", 76, cls="s"), T(rx + 96, y0 + 40, "OCT", 14, fill=MUTED, ls="0.15em"), T(rx + 96, y0 + 62, "일요일", 14, fill=MUTED),
          L(rx, y0 + 84, W - M, y0 + 84, stroke=LINE),
          T(rx, y0 + 108, "날씨", 10, fill=MUTED), _weather(rx + 14, y0 + 132, 0, PERI),
          T(rx, y0 + 176, "함께", 10, fill=MUTED), L(rx, y0 + 202, W - M, y0 + 202, stroke=LINE), hand(rx + 2, y0 + 198, "수아 · 지우 · 현아", 22),
          T(rx, y0 + 236, "오늘의 한 단어", 10, fill=MUTED), L(rx, y0 + 262, W - M, y0 + 262, stroke=LINE), hand(rx + 2, y0 + 258, "소금빵", 22),
          heart(rx + 96, y0 + 250, 8)]
    ly = y0 + ph + 20
    g += [lines(x0, ly, w, 180, 30, LINE),
          hand(x0 + 4, ly + 24, "셋이서 연남동 카페. 소금빵이 진짜 맛있어서 또 가기로 했어요", 22),
          hand(x0 + 4, ly + 54, "사진은 수아가 찍어 줬어요. 창가 자리가 최고", 22),
          T(W - M, H - M + 10, "사진 한 장 · 줄 6 · 하루 한 쪽", 10, fill=MUTED, anchor="end")]
    return g


def p_3line(W, H, land):
    """3줄 일기 — 날짜 × 3줄 블록 10개(2열 × 5행), 한 달 한 쪽."""
    g = [header(W, "3 LINES", "세 줄 일기 · 하루 세 줄 · 한 달 한 쪽", SAGE, right="10월 · 16 → 25")]
    x0, y0, w = M, M + 58, W - 2 * M
    gapx = 28; bw = (w - gapx) / 2
    bh = 112; gapy = (H - M - y0 - 5 * bh) / 4
    samples = {0: ["아침에 비. 우산 없이 나갔다가 수아 우산 같이 썼어요", "점심은 김치찌개. 역시 학식이 최고", "저녁엔 넷이 통화. 주말에 카페 가기로"],
               1: ["시험 끝! 홀가분해요", "현아가 준 스티커로 다꾸 시작"],
               6: ["소금빵 3개 먹음. 후회는 없어요"]}
    for i in range(10):
        c, r = divmod(i, 5); day = 16 + i
        x = x0 + c * (bw + gapx); y = y0 + r * (bh + gapy)
        wk = _is_weekend(day)
        g += [T(x, y + 16, str(day), 16, cls="s", fill=ROSE if wk else INK), T(x + 26, y + 16, _wd(day), 10, fill=ROSE if wk else MUTED),
              L(x + 44, y + 12, x + bw, y + 12, stroke=LINE2)]
        for k in range(3):
            g.append(L(x, y + 40 + k * 26, x + bw, y + 40 + k * 26, stroke=LINE))
        for k, s in enumerate(samples.get(i, [])):
            g.append(hand(x + 2, y + 36 + k * 26, s, 20))
    g.append(tape(x0 + bw - 70, y0 - 12, 80, 18, "mint", -4))
    return g


def p_gratitude(W, H, land):
    """감사 일기 — 큰 칸 3(세로) + 내일 기대 1 + 기분 원 5."""
    g = [header(W, "GRATITUDE", "감사 일기 · 오늘 감사한 것 3 · 내일 기대 1", MUST, right="2026 · 10 · 25")]
    x0, y0 = M, M + 58
    lw = 560; gap = 16; bh = (H - M - y0 - 2 * gap) / 3
    samples = [["수아가 우산을 같이 씌워 줬어요", "비 오는 날 냄새가 좋았어요"], ["현아가 준 스티커로 다꾸 시작"], []]
    for i in range(3):
        y = y0 + i * (bh + gap)
        g += [R(x0, y, lw, bh, fill="#fff", stroke=LINE, rx=10),
              T(x0 + 18, y + 40, str(i + 1), 32, cls="s", fill=MUST), T(x0 + 48, y + 24, "오늘 감사한 것", 10, fill=MUTED),
              lines(x0 + 48, y + 30, lw - 66, bh - 50, 30, LINE2)]
        for k, s in enumerate(samples[i]):
            g.append(hand(x0 + 52, y + 56 + k * 30, s, 22))
    rx = x0 + lw + 28; rw = W - M - rx
    fy = y0 + 290; fh = H - M - fy
    g += [R(rx, y0, rw, 150, fill="#fff", stroke=MUST, sw=1.2, dash="6 4", rx=10),
          T(rx + 18, y0 + 24, "내일 기대 1", 10, fill=MUTED), sparkle(rx + rw - 24, y0 + 22, 7, MUST),
          lines(rx + 18, y0 + 30, rw - 36, 100, 30, LINE2), hand(rx + 20, y0 + 56, "넷이 카페에서 다꾸!", 22),
          T(rx, y0 + 196, "오늘 기분", 10, fill=MUTED), _mood(rx + 18, y0 + 226, 1, MUST),
          T(rx, y0 + 280, "오늘을 한 단어로", 10, fill=MUTED),
          R(rx, fy, rw, fh, stroke=LINE, dash="3 4", rx=8), dotgrid(rx + 12, fy + 12, rw - 24, fh - 24, 24),
          hand(rx + rw / 2, fy + fh / 2 + 12, "포근", 40, anchor="middle"),
          star(rx + rw - 40, fy + 36, 10), heart(rx + 36, fy + fh - 36, 9)]
    return g


def p_letter(W, H, land):
    """편지지 — To · 줄 12 · 접는 점선 2 · From, 왼쪽 위 우표 자리 + 테이프."""
    g = [header(W, "LETTER", "편지지 · 접는 선 · 미래의 나 · 친구에게", ROSE, right="2026 · 10 · 25")]
    x0, y0, w = M, M + 58, W - 2 * M
    g += [_stamp_place(x0, y0 + 2, 64, 78, ROSE), tape(x0 - 12, y0 - 2, 70, 18, "pink", -8, pattern="stripes")]
    tx = x0 + 64 + 28
    g += [T(tx, y0 + 30, "To.", 18, cls="s", fill=ROSE), L(tx + 40, y0 + 34, tx + 360, y0 + 34, stroke=LINE), hand(tx + 48, y0 + 28, "1년 뒤의 민희에게", 24)]
    ly = y0 + 76
    g += [lines(x0, ly, w, 12 * 34, 34, LINE),
          hand(x0 + 4, ly + 28, "잘 지내고 있나요? 아직도 넷이 같이 일기 쓰고 있죠?", 22),
          hand(x0 + 4, ly + 62, "오늘은 비가 왔고, 소금빵을 먹었어요. 그때도 좋아하길", 22)]
    for fy in (263, 501):  # 가로 3등분 접는 선(줄 사이)
        g += [L(M - 20, fy, W - M + 20, fy, stroke="#C9C3B5", dash="8 6"), T(W - M, fy - 5, "접는 선", 10, fill=MUTED, anchor="end", opacity=0.8)]
    fy2 = ly + 12 * 34 + 78
    g += [T(W - M - 430, fy2, "From.", 18, cls="s", fill=ROSE), L(W - M - 376, fy2 + 4, W - M - 190, fy2 + 4, stroke=LINE),
          hand(W - M - 368, fy2 - 2, "2026년의 민희", 24), T(W - M - 178, fy2, "·", 14, fill=MUTED),
          T(W - M, fy2, "2026 · 10 · 25", 14, fill=MUTED, anchor="end"), heart(W - M - 450, fy2 - 6, 8)]
    return g


def p_oneline_monthly(W, H, land):
    """한 줄 먼슬리 — 31줄, 왼쪽 날짜 · 요일(주말 ROSE), 하루 한 줄."""
    g = [header(W, "ONE LINE", "한 줄 먼슬리 · 하루 한 줄 · 31줄", PERI, right="10월 · October")]
    x0, y0, w = M, M + 60, W - 2 * M
    rh = 19
    samples = {1: "개강. 넷이 다시 모였어요", 2: "비. 수아랑 우산 같이 씀", 3: "소금빵 맛집 발견", 4: "늦잠. 하루 종일 집", 5: "스티커 도착!", 6: "현아 생일 케이크", 25: "일요일. 다꾸 모임"}
    for d in range(1, 32):
        y = y0 + d * rh
        wk = _is_weekend(d); col = ROSE if wk else MUTED
        g += [T(x0 + 22, y - 5, str(d), 11, fill=col, anchor="end", weight=700 if wk else None), T(x0 + 32, y - 5, _wd(d), 10, fill=col),
              L(x0 + 56, y, x0 + w, y, stroke=LINE if _wd(d) == "일" else LINE2)]
        if d in samples:
            g.append(hand(x0 + 62, y - 4, samples[d], 17))
    g.append(T(W - M, H - M + 10, "주말은 분홍 · 일요일 아래 조금 진한 선", 10, fill=MUTED, anchor="end"))
    return g


# ── 취향 · 덕질 ───────────────────────────────────────────────────────────
def p_movie(W, H, land):
    """영화 · 드라마 기록 — 포스터 2:3 + 정보 4줄 + 별점 + 명대사 + 티켓 자리 + 한 줄 평."""
    g = [header(W, "MOVIE", "영화 · 드라마 기록 · 포스터 · 별점 · 명대사 · 티켓", LAV, right="No. 07")]
    x0, y0, w = M, M + 54, W - 2 * M
    pw, ph = 150, 225
    g += [R(x0, y0, pw, ph, fill="#F0EAF7", stroke="#D8CDE6", rx=4), R(x0 + 10, y0 + 10, pw - 20, ph - 20, stroke="#D8CDE6", dash="3 3", rx=2),
          T(x0 + pw / 2, y0 + ph / 2, "포스터", 12, fill=MUTED, anchor="middle"), T(x0 + pw / 2, y0 + ph / 2 + 18, "2 : 3", 10, fill=MUTED, anchor="middle")]
    fx = x0 + pw + 24; fw = w - pw - 24
    half = (fw - 24) / 2
    fields = [(fx, 0, fw, "제목", "헤어질 결심"), (fx, 1, half, "감독", "박찬욱"), (fx + half + 24, 1, half, "본 곳", "CGV 용산 · 수아랑"),
              (fx, 2, half, "본 날", "2026 · 10 · 25"), (fx + half + 24, 2, half, "별점", "★★★★☆")]
    for x, r, ww, k, v in fields:
        y = y0 + 20 + r * 48
        g += [T(x, y, k, 10, fill=MUTED), L(x, y + 26, x + ww, y + 26, stroke=LINE), hand(x + 2, y + 22, v, 24 if r == 0 else 22)]
    qy = y0 + 170
    g += [T(fx, qy + 36, "“", 56, cls="s", fill=LAV), T(fx + 30, qy + 12, "명대사", 10, fill=MUTED),
          lines(fx + 30, qy + 16, fw - 30, 60, 30, LINE2), hand(fx + 34, qy + 42, "나는요, 완전히 붕괴됐어요", 22)]
    by = y0 + 280
    tw, th = 330, 120
    g += [T(x0, by - 8, "티켓 자리", 10, fill=MUTED), _ticket(x0, by, tw, th),
          T(x0 + 16, by + 56, "좌석 · 시간", 10, fill=MUTED), L(x0 + 16, by + 84, x0 + tw * .68 - 16, by + 84, stroke=LINE2), hand(x0 + 18, by + 80, "F열 12 · 19:30", 20),
          tape(x0 + tw - 90, by - 9, 70, 18, "lavender", 5),
          T(x0, by + th + 36, "함께 본 사람", 10, fill=MUTED), L(x0, by + th + 62, x0 + tw, by + th + 62, stroke=LINE), hand(x0 + 2, by + th + 58, "수아", 22),
          T(x0, by + th + 96, "다시 볼래요?", 10, fill=MUTED),
          check(x0, by + th + 106, 18, on=True), T(x0 + 26, by + th + 120, "네, 또 볼래요", 12),
          check(x0 + 140, by + th + 106, 18), T(x0 + 166, by + th + 120, "한 번이면 충분", 12)]
    rx = x0 + tw + 28; rw = W - M - rx
    g += [T(rx, by - 8, "한 줄 평 · 자유 칸", 10, fill=MUTED), R(rx, by, rw, H - M - by, stroke=LINE, dash="3 4", rx=8),
          dotgrid(rx + 12, by + 12, rw - 24, H - M - by - 24, 24),
          hand(rx + 18, by + 44, "마지막 장면에서 멍해졌어요. 바다 소리만 남았어요", 24), star(rx + rw - 34, by + 30, 11)]
    return g


def p_food(W, H, land):
    """먹다꾸 · 카페 기록 — 정사각 사진 2 + 가게 · 메뉴 · 가격 + 별점 + 재방문 + 컵 · 접시 그림 칸."""
    g = [header(W, "FOOD · CAFE", "먹다꾸 · 카페 기록 · 사진 · 가게 · 메뉴 · 별점 · 재방문", CAMEL, right="2026 · 10 · 25 · 연남")]
    x0, y0, w = M, M + 54, W - 2 * M
    s = 200
    g += [photo_filled(x0, y0, s, s, "cafe"), photo(x0 + s + 20, y0, s, s, "메뉴 사진"), tape(x0 + s - 40, y0 + s - 10, 70, 18, "kraft", -8)]
    rx = x0 + 2 * s + 44; rw = W - M - rx
    fields = [("가게", "르뱅 베이커리 · 연남"), ("메뉴", "소금빵 2 · 아이스 라떼"), ("가격", "4,200 × 2 + 5,000 = 13,400")]
    for i, (k, v) in enumerate(fields):
        y = y0 + 20 + i * 48
        g += [T(rx, y, k, 10, fill=MUTED), L(rx, y + 26, rx + rw, y + 26, stroke=LINE), hand(rx + 2, y + 22, v, 22)]
    y = y0 + 20 + 3 * 48
    hx = rx + rw / 2 + 12
    g += [T(rx, y, "별점", 10, fill=MUTED), L(rx, y + 26, rx + rw / 2 - 12, y + 26, stroke=LINE), hand(rx + 2, y + 22, "★★★★★", 22),
          T(hx, y, "재방문", 10, fill=MUTED), check(hx, y + 6, 18, on=True), T(hx + 26, y + 20, "또 갈래요", 12),
          check(hx + 110, y + 6, 18), T(hx + 136, y + 20, "글쎄요", 12)]
    by = y0 + 250
    dw = 2 * s + 20
    g += [T(x0, by - 8, "컵 · 접시 그림 칸", 10, fill=MUTED), R(x0, by, dw, H - M - by, stroke=LINE, dash="3 4", rx=8),
          _cup(x0 + 110, by + 150, 70), _plate(x0 + 300, by + 170, 80),
          E(x0 + 300, by + 166, 24, 13, stroke=PEN, sw=1.6), P(f"M{x0 + 290},{by + 158} q10,-6 20,0", stroke=PEN, sw=1.4),
          hand(x0 + 16, H - M - 20, "소금빵 또 먹고 싶다", 26)]
    g += [T(rx, by - 8, "메모 · 같이 간 사람", 10, fill=MUTED), lines(rx, by, rw, 330, 30, LINE2),
          hand(rx + 2, by + 24, "수아랑 창가 자리에서 2시간 다꾸", 22), hand(rx + 2, by + 54, "소금빵은 2시에 나와요. 미리 가기", 22)]
    return g


def p_travel(W, H, land):
    """여행 일기 — 지도 칸(점선 경로 + 핀 3) + 일정 5줄 + 폴라로이드 2 + 경비(항목 3 + 합계, 수기)."""
    g = [header(W, "TRAVEL", "여행 일기 · 지도 · 경로 · 사진 · 경비", SAGE, right="제주 · 2026 · 10 · 25")]
    x0, y0, w = M, M + 54, W - 2 * M
    mw, mh = 440, 320
    g += [R(x0, y0, mw, mh, fill="#EEF3EC", stroke=LINE, rx=10),
          P(f"M{x0 + 60},{y0 + 170} C{x0 + 40},{y0 + 90} {x0 + 160},{y0 + 40} {x0 + 260},{y0 + 70} C{x0 + 380},{y0 + 100} {x0 + 420},{y0 + 200} {x0 + 330},{y0 + 260} "
            f"C{x0 + 240},{y0 + 310} {x0 + 90},{y0 + 270} {x0 + 60},{y0 + 170} Z", fill="#E2EBDF", stroke="#C9D8C6", sw=1),
          P(f"M{x0 + 120},{y0 + 200} C{x0 + 160},{y0 + 120} {x0 + 230},{y0 + 130} {x0 + 280},{y0 + 110} S{x0 + 350},{y0 + 170} {x0 + 330},{y0 + 215}", stroke=SAGE, sw=2, dash="5 6"),
          _pin(x0 + 120, y0 + 200, 1), _pin(x0 + 280, y0 + 110, 2), _pin(x0 + 330, y0 + 215, 3),
          hand(x0 + 136, y0 + 212, "숙소", 18), hand(x0 + 296, y0 + 104, "성산 일출봉", 18), hand(x0 + 346, y0 + 230, "카페", 18),
          T(x0 + mw - 12, y0 + mh - 10, "지도 · 경로", 10, fill=MUTED, anchor="end")]
    py = y0 + mh + 26
    g += [polaroid(x0 + 20, py + 6, 160, "일출!", -5, "sky"), polaroid(x0 + 230, py + 14, 160, "", 4, "green"), tape(x0 + 250, py + 2, 60, 16, "mint", -6)]
    rx = x0 + mw + 28; rw = W - M - rx
    g += [T(rx, y0 + 12, "시간", 10, fill=MUTED), T(rx + 82, y0 + 12, "장소 · 할 일", 10, fill=MUTED)]
    sched = [("09:30", "성산 일출봉 · 해 뜨는 거 보기"), ("12:00", "고기국수 · 올레시장"), ("15:00", "카페 · 다꾸 타임"), ("", ""), ("", "")]
    for i, (t, p) in enumerate(sched):
        y = y0 + 22 + i * 40
        g += [L(rx, y + 28, rx + rw, y + 28, stroke=LINE), L(rx + 70, y + 6, rx + 70, y + 28, stroke=LINE2)]
        if t:
            g += [hand(rx + 4, y + 24, t, 20), hand(rx + 82, y + 24, p, 20)]
    ey = y0 + 240; eh = 230
    g += [T(rx, ey - 8, "경비", 10, fill=MUTED), R(rx, ey, rw, eh, fill="#fff", stroke=LINE, rx=10)]
    items = [("렌터카", "55,000"), ("고기국수 2인", "20,000"), ("카페", "11,000")]
    for i, (k, v) in enumerate(items):
        y = ey + 20 + i * 44
        g += [L(rx + 16, y + 28, rx + rw - 16, y + 28, stroke=LINE2), hand(rx + 20, y + 24, k, 22), hand(rx + rw - 20, y + 24, v, 22, anchor="end")]
    ty = ey + 20 + 3 * 44 + 10
    g += [L(rx + 16, ty, rx + rw - 16, ty, stroke=INK, sw=1.2), T(rx + 20, ty + 26, "합계", 12, weight=700), hand(rx + rw - 20, ty + 30, "86,000 원", 26, anchor="end"),
          T(rx + 20, ty + 46, "수기 합계 · 자동 계산 없음", 10, fill=MUTED)]
    sy = ey + eh + 40
    g += [T(rx, sy, "같이 간 사람", 10, fill=MUTED), L(rx, sy + 26, rx + rw - 120, sy + 26, stroke=LINE), hand(rx + 2, sy + 22, "수아 · 지우 · 현아", 22),
          stamp(W - M - 50, H - M - 50, 32, SAGE, "JEJU", 13)]
    return g


def p_playlist(W, H, land):
    """플레이리스트 — 곡 카드 10(5열 × 2행): 커버 정사각 + 제목 · 아티스트 줄."""
    g = [header(W, "PLAYLIST", "10월의 노래 · 곡 카드 10 · 앨범 커버 자리", LAV, right="PLAYLIST · 10월의 노래")]
    x0, y0, w = M, M + 72, W - 2 * M
    cols, rows, gap = 5, 2, 20
    cw = (w - (cols - 1) * gap) / cols
    card_h = cw + 58; rowgap = 26
    rnd = random.Random(10)
    filled = {0: ("Ditto", "NewJeans", LAV), 1: ("밤편지", "아이유", PERI), 5: ("Love Dive", "IVE", ROSE)}
    for i in range(cols * rows):
        r, c = divmod(i, cols)
        x = x0 + c * (cw + gap); y = y0 + r * (card_h + rowgap)
        g.append(T(x, y - 6, f"{i + 1:02d}", 10, fill=MUTED))
        if i in filled:
            title, artist, col = filled[i]
            fx, fy = rnd.uniform(.55, .7), rnd.uniform(.3, .45)
            g += [R(x, y, cw, cw, fill=col, stroke="none", rx=8),
                  C(x + cw * fx, y + cw * fy, cw * 0.22, fill="#fff", stroke="none", opacity=0.35),
                  C(x + cw * (1 - fx), y + cw * (1 - fy + .1), cw * 0.12, fill="#fff", stroke="none", opacity=0.25),
                  R(x, y, cw, cw, fill="url(#gloss)", stroke="none", rx=8),
                  hand(x + 2, y + cw + 24, title, 20), hand(x + 2, y + cw + 48, artist, 16)]
        else:
            g += [R(x, y, cw, cw, stroke=LINE, dash="4 4", rx=8), T(x + cw / 2, y + cw / 2 + 7, "♪", 22, fill="#CFC9BB", anchor="middle")]
        g += [L(x, y + cw + 28, x + cw, y + cw + 28, stroke=LINE), L(x, y + cw + 52, x + cw, y + cw + 52, stroke=LINE2)]
    my = y0 + 2 * card_h + rowgap + 24
    g += [T(x0, my, "이 플리는 이럴 때 들어요", 10, fill=MUTED), L(x0, my + 30, x0 + w, my + 30, stroke=LINE), L(x0, my + 62, x0 + w, my + 62, stroke=LINE),
          hand(x0 + 4, my + 26, "비 오는 날 창가에서 다꾸할 때. 수아 추천곡이 많아요", 22), tape(x0 + w - 150, my - 14, 90, 18, "lavender", -5)]
    return g


# ── 구조 · 꾸밈 ───────────────────────────────────────────────────────────
def p_cover_inner(W, H, land):
    """면지 — 큰 제목(명조) + 시작일, 멤버 명함 칸 4(2×2), 올해의 한마디."""
    g = [header(W, "INNER COVER", "면지 · 이름 · 방 멤버 · 시작일 · 올해의 한마디", PERI, right="2026")]
    x0, y0, w = M, M + 54, W - 2 * M
    g += [T(x0, y0 + 56, "우리 교환일기", 46, cls="s"), T(x0, y0 + 84, "시작일  2026 · 10 · 1   ·   멤버 4", 12, fill=MUTED),
          hand(x0 + 350, y0 + 50, "넷이서, 하루 한 장", 26), stamp_rect(W - M - 150, y0 + 12, 130, 54, PERI, ["SINCE", "2026 · 10 · 01"], 11, -4)]
    cy0 = y0 + 110
    gap = 20; cw = (w - gap) / 2; ch = (H - M - 70 - cy0 - gap) / 2
    infos = [["ENFP", "소금빵 · 다꾸"], [], [], []]
    names = [NAMES[0], NAMES[1], NAMES[2], ""]
    for i, (ch_, col) in enumerate(MEMBERS):
        r, c = divmod(i, 2)
        x = x0 + c * (cw + gap); y = cy0 + r * (ch + gap)
        g += [R(x, y, cw, ch, fill="#fff", stroke=LINE, rx=10), avatar(x + 40, y + 44, 24, col, ch_, 20),
              T(x + 76, y + 36, "이름", 10, fill=MUTED), L(x + 76, y + 60, x + cw - 20, y + 60, stroke=LINE)]
        if names[i]:
            g.append(hand(x + 80, y + 56, names[i], 24))
        for k, lab in enumerate(["MBTI", "최애", "한 줄"]):
            ly = y + 100 + k * 36
            g += [T(x + 24, ly, lab, 10, fill=MUTED), L(x + 72, ly + 2, x + cw - 20, ly + 2, stroke=LINE2)]
            if k < len(infos[i]):
                g.append(hand(x + 76, ly, infos[i][k], 20))
    by = H - M - 40
    g += [T(x0, by - 12, "올해의 한마디", 10, fill=MUTED), L(x0, by + 20, x0 + w, by + 20, stroke=LINE), hand(x0 + 4, by + 16, "올해는 넷이 빙고 한 줄 완성!", 24),
          tape(x0 + cw - 50, cy0 - 10, 80, 18, "sky", -5)]
    return g


def p_tracing(W, H, land):
    """트레이싱 간지 — 아래 흐린 앞장(줄 · 손글씨 · 사진) 위에 68% 흰 장 + 점선 테두리, 위에 덧쓴 한 줄."""
    under = [lines(M, M + 60, W - 2 * M, H - 2 * M - 60, 32, LINE),
             hand(M + 10, M + 100, "오늘은 넷이 처음으로 같이 쓴 날이에요", 26, INK), hand(M + 10, M + 150, "연남동 카페 · 소금빵 · 비", 24, INK),
             photo_filled(W - M - 240, M + 140, 220, 160, "cafe"), tape(W - M - 230, M + 130, 80, 22, "pink", -5),
             T(W - M, H - M + 10, "아래 장: 앞장 (2026 · 10 · 24)", 11, fill=MUTED, anchor="end")]
    g = [G(under, opacity=0.9), R(0, 0, W, H, fill="#fff", stroke="none", opacity=0.68),
         R(M - 14, M - 14, W - 2 * M + 28, H - 2 * M + 28, stroke="#C9C3B5", dash="2 6", rx=8),
         header(W, "TRACING", "반투명 간지 · 앞장이 비친다", SAGE, right="2026 · 10 · 25"),
         hand(M + 14, H / 2 + 40, "앞장 위에 덧써요. 비치는 글 위로 한 줄", 30, PEN), tape(M + 10, H / 2 + 56, 120, 20, "mint", 3),
         T(M, H - M + 10, "불투명 68% 흰 장 + 점선 테두리", 10, fill=MUTED)]
    return g


def p_pocket(W, H, land):
    """포켓 속지 — 위 반 메모 줄, 아래 반 반투명 포켓(비닐 광택) 안에 스티커 · 폴라로이드가 반쯤 비친다."""
    g = [header(W, "POCKET", "포켓 속지 · 위 반 메모 · 아래 반 반투명 포켓", MUST, right="2026 · 10")]
    x0, y0, w = M, M + 54, W - 2 * M
    g += [lines(x0, y0, w, 270, 30, LINE), hand(x0 + 4, y0 + 24, "이번 달 받은 스티커 · 사진은 아래 포켓에", 22), hand(x0 + 4, y0 + 54, "현아가 준 별 스티커, 제주 폴라로이드", 22)]
    py = y0 + 310; ph = H - M - py
    # 포켓 안 내용물(포켓보다 먼저 그려서 비치게)
    g += [polaroid(x0 + 60, py - 26, 170, "제주 · 일출", -7, "sky"),
          star(x0 + 330, py + 70, 26), star(x0 + 390, py + 130, 16, fill=ROSE), heart(x0 + 470, py + 60, 22), heart(x0 + 530, py + 120, 14, fill=LAV),
          sparkle(x0 + 600, py + 90, 18), star(x0 + 560, py + 220, 30, fill=PERI), heart(x0 + 860, py + 230, 24, fill=MUST),
          polaroid(x0 + 660, py + 30, 140, "", 6, "green")]
    g += [R(x0, py, w, ph, fill="#fff", stroke=LINE, rx=10, opacity=0.55), R(x0, py, w, ph, fill="url(#gloss)", stroke="none", rx=10),
          R(x0 + 10, py + 10, w - 20, ph - 20, stroke=LINE, dash="3 3", rx=6, opacity=0.8),
          L(x0, py, x0 + w, py, stroke="#C9B873", sw=1.2, dash="6 4"),
          T(W / 2, py - 8, "여기에 스티커 · 사진 보관", 11, fill=MUTED, anchor="middle")]
    return g


def p_checker(W, H, land):
    """체커 콜라주 그리드 — 4×3 큰 칸, 번갈아 CREAM, 몇 칸에 사진 · 손글씨 · 스티커."""
    g = [header(W, "CHECKER", "체커 콜라주 그리드 4 × 3 · 칸마다 사진 · 스티커", ROSE, right="10월")]
    x0, y0, w = M, M + 58, W - 2 * M
    cols, rows = 4, 3
    cw = w / cols; ch = (H - M - y0) / rows
    for i in range(cols * rows):
        r, c = divmod(i, cols)
        g.append(R(x0 + c * cw, y0 + r * ch, cw, ch, fill=CREAM if (r + c) % 2 == 0 else "none", stroke=LINE))
    g += [photo_filled(x0 + 14, y0 + 14, cw - 28, ch - 28, "sky", rx=3), tape(x0 + 40, y0 + 4, 70, 18, "pink", -6)]
    x, y = x0 + cw, y0 + ch
    g += [hand(x + cw / 2, y + ch / 2 - 10, "10월", 40, anchor="middle"), hand(x + cw / 2, y + ch / 2 + 30, "넷째 주", 26, anchor="middle"),
          star(x + cw - 34, y + 30, 11), star(x + 30, y + ch - 32, 8, fill=ROSE)]
    x, y = x0 + 2 * cw, y0 + 2 * ch
    g.append(photo_filled(x + 14, y + 14, cw - 28, ch - 28, "pink", rx=3))
    x, y = x0 + 3 * cw, y0
    g += [heart(x + cw / 2, y + ch / 2 - 10, 34), hand(x + cw / 2, y + ch - 28, "소금빵 데이", 22, anchor="middle")]
    g.append(T(W - M, H - M + 10, "빈 칸은 크림 · 종이 번갈아 (체커보드)", 10, fill=MUTED, anchor="end"))
    return g


def p_frame_window(W, H, land):
    """사진 창 타공 속지 — 가운데 4:3 창이 뚫려 다음 장이 비친다. 둘레는 꾸밈 여백."""
    g = [header(W, "WINDOW", "사진 창 타공 속지 · 가운데 창으로 다음 장이 비친다", CAMEL, right="창 4 : 3")]
    ww, wh = 520, 390
    wx = (W - ww) / 2; wy = (M + 54 + H - M) / 2 - wh / 2
    inner = [R(wx, wy, ww, wh, fill="#FFFFFF", stroke="none"), lines(wx + 16, wy + 20, ww - 32, wh - 50, 28, LINE2),
             hand(wx + 24, wy + 62, "다음 장: 10월 26일 월요일", 24, PEN), hand(wx + 24, wy + 90, "오늘은 월요일. 다시 학교", 22, PEN),
             photo(wx + ww - 180, wy + wh - 150, 150, 110)]
    g += [G(inner, opacity=0.5),
          R(wx + 4, wy + 4, ww - 8, wh - 8, stroke="#6B6459", sw=8, opacity=0.06), R(wx + 2, wy + 2, ww - 4, wh - 4, stroke="#6B6459", sw=4, opacity=0.06),
          R(wx, wy, ww, wh, stroke="#CFC8BA", sw=2), R(wx - 5, wy - 5, ww + 10, wh + 10, stroke=LINE, sw=1)]
    for cx, cy, ang in [(wx, wy, -45), (wx + ww, wy, 45), (wx, wy + wh, 45), (wx + ww, wy + wh, -45)]:
        g.append(tape(cx - 30, cy - 8, 60, 16, "kraft", ang, pattern="plain", opacity=0.8))
    g += [hand(M + 6, wy - 40, "창 둘레는 마음껏 꾸며요", 24), star(W - M - 60, wy - 60, 12), heart(W - M - 110, wy - 48, 10), sparkle(W - M - 30, wy - 30, 9),
          heart(M + 70, wy + 70, 18), star(M + 130, wy + 130, 14), sparkle(M + 60, wy + 200, 12, LAV),
          hand(M + 40, wy + wh - 20, "창 너머로 보이는 하루", 22, rotate=-90),
          tape(W - M - 120, wy + 150, 110, 24, "pink", 90), heart(W - M - 150, wy + 300, 12, fill=LAV), star(W - M - 60, wy + 330, 10, fill=PERI),
          hand(M + 6, H - M - 20, "2026 · 10 · 25 · 비 온 뒤 맑음", 24), stamp(W - M - 60, H - M - 50, 32, CAMEL, "창", 16)]
    return g
