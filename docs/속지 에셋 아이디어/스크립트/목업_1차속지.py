"""1차 제안안(1차 제안안/속지_디자인.py)의 속지 디자인 20종 — 목업_도형 기준으로 옮긴 사본.
시그니처 fn(W, H, land) -> list[str]. 원본은 1차 제안안 에 그대로 있다.
"""
from 목업_도형 import *  # noqa


# ── 속지 20종 ─────────────────────────────────────────────────────────────
def d_dot(W, H, land):
    g = [header(W, "DOT", right="날짜 ______ . ___ . ___"),
         dotgrid(M, M + 44, W - 2 * M, H - 2 * M - 44),
         tape(W - 220, M - 10, 150, 30, "mint", -4)]
    return g


def d_cornell(W, H, land):
    x0, y0, w, h = M, M + 58, W - 2 * M, H - 2 * M - 58
    cue = int(w * 0.26); summ = int(h * 0.2)
    g = [header(W, "CORNELL", "단서 · 노트 · 요약", right="주제 ______________"),
         R(x0, y0, w, h, stroke=LINE),
         L(x0 + cue, y0, x0 + cue, y0 + h - summ, stroke=INK, sw=1.2),
         L(x0, y0 + h - summ, x0 + w, y0 + h - summ, stroke=INK, sw=1.2),
         T(x0 + 8, y0 + 16, "단서 · 키워드", 10, fill=MUTED), T(x0 + cue + 8, y0 + 16, "노트", 10, fill=MUTED),
         T(x0 + 8, y0 + h - summ + 16, "요약", 10, fill=MUTED),
         lines(x0 + cue, y0 + 24, w - cue, h - summ - 30, 28, LINE2), lines(x0, y0 + 24, cue, h - summ - 30, 28, LINE2),
         lines(x0, y0 + h - summ + 24, w, summ - 30, 28, LINE2),
         hand(x0 + 10, y0 + 54, "핵심?", 20, MUTED), hand(x0 + cue + 12, y0 + 52, "온라인 속지 = 칸 + 상태 + 알림", 22)]
    return g


def d_manuscript(W, H, land):
    x0, y0, w, h = M, M + 58, W - 2 * M, H - 2 * M - 58
    cols = 20 if land else 15
    cell = w / cols; rows = int(h / cell)
    g = [header(W, "원고지", f"{cols * rows}자", right="제목 ______________")]
    for r in range(rows):
        for c in range(cols):
            g.append(R(x0 + c * cell, y0 + r * cell, cell, cell, stroke="#E2C9B8", sw=0.8))
        if (r + 1) % 2 == 0: g.append(L(x0, y0 + (r + 1) * cell, x0 + w, y0 + (r + 1) * cell, stroke="#D9A87F", sw=1))
    for i, ch in enumerate("우리가 같이 쓰는 이야기"):
        if ch != " ": g.append(hand(x0 + (i + 1) * cell + cell * 0.2, y0 + cell * 0.78, ch, int(cell * 0.72)))
    g.append(T(x0 + w, y0 + h + 14, f"{cols} × {rows}", 10, fill=MUTED, anchor="end"))
    return g


def d_1d1p(W, H, land):
    g = [header(W, "1D 1P", "하루 한 쪽", right="D+ ____")]
    if land:
        lx, ly, lw = M, M + 48, 300; rx, ry, rw, rh = M + 330, M + 48, W - 2 * M - 330, H - 2 * M - 48
    else:
        lx, ly, lw = M, M + 48, W - 2 * M; rx, ry, rw, rh = M, M + 330, W - 2 * M, H - M - (M + 330)
    g += [T(lx, ly + 48, "25", 56, cls="s"), T(lx + 72, ly + 48, "OCT · SUN", 14, fill=MUTED, ls="0.1em"),
          T(lx, ly + 70, "날씨", 10, fill=MUTED)]
    for i, w in enumerate(["☀", "☁", "☂", "❄", "☃"]):
        g.append(C(lx + 36 + i * 36, ly + 92, 13, stroke=LINE)); g.append(T(lx + 36 + i * 36, ly + 97, w, 14, fill=MUTED, anchor="middle"))
    g.append(C(lx + 36, ly + 92, 13, stroke=MUST, sw=2.5))
    g.append(T(lx, ly + 132, "오늘의 할 일 3", 10, fill=MUTED))
    for i in range(3):
        g += [check(lx, ly + 142 + i * 32, 18, on=i == 0), L(lx + 28, ly + 156 + i * 32, lx + lw, ly + 156 + i * 32, stroke=LINE)]
    g.append(hand(lx + 32, ly + 155, "빙고 한 칸 채우기", 20))
    g += [R(rx, ry, rw, rh, stroke=LINE, dash="3 4", rx=6), dotgrid(rx + 12, ry + 12, rw - 24, rh - 24, 24),
          T(rx + 12, ry + rh - 10, "자유 칸 · 사진 · 스티커 · 글", 10, fill=MUTED),
          photo(rx + rw * .55, ry + 18, rw * .4, rh * .34), tape(rx + rw * .62, ry + 8, 70, 22, "pink", -6)]
    g.append(hand(rx + 22, ry + 50, "오늘은 다 같이 카페에서 다꾸!", 24))
    return g


def _daygrid(W, H, land, names, rowlabel, accent, title, sub, mark, memo="3개 다 채운 날엔 소금빵!"):
    """날짜 31 × 항목 N. 가로는 날짜가 가로, 세로는 날짜가 세로."""
    g = [header(W, title, sub, accent, right="10월")]
    x0, y0, w, h = M, M + 56, W - 2 * M, H - 2 * M - 56
    n = len(names); days = 31
    if land:
        lab = 120; cw = (w - lab) / days; rh = min(96, (h - 120) / n)
        for d in range(days):
            g.append(T(x0 + lab + d * cw + cw / 2, y0 - 6, str(d + 1), 9, fill=MUTED, anchor="middle"))
        for i, nm in enumerate(names):
            y = y0 + i * rh
            g += [R(x0, y, w, rh, stroke=LINE), T(x0 + 8, y + rh / 2 + 5, nm, 12, weight=700)]
            for d in range(days):
                x = x0 + lab + d * cw
                g.append(L(x, y, x, y + rh, stroke=LINE2))
                if (d, i) in mark: g.append(mark[(d, i)](x + cw / 2, y + rh / 2, min(cw, rh) * 0.36))
        g.append(T(x0, y0 + n * rh + 24, rowlabel, 10, fill=MUTED))
        my = y0 + n * rh + 40
        g += [T(x0, my + 12, "이달의 한 줄 · 보상 · 메모", 10, fill=MUTED), R(x0, my + 20, w, H - M - my - 20, stroke=LINE, dash="3 4", rx=8),
              dotgrid(x0 + 12, my + 32, w - 24, H - M - my - 44, 24), hand(x0 + 20, my + 66, memo, 24)]
    else:
        lab = 40; cw = (w - lab) / n; rh = min(28, (h - 20) / days)
        for i, nm in enumerate(names):
            g.append(T(x0 + lab + i * cw + cw / 2, y0 - 6, nm, 12, anchor="middle", weight=700))
        for d in range(days):
            y = y0 + d * rh
            g += [L(x0, y + rh, x0 + w, y + rh, stroke=LINE2), T(x0 + 4, y + rh / 2 + 4, str(d + 1), 9, fill=MUTED)]
            for i in range(n):
                x = x0 + lab + i * cw
                g.append(L(x, y0, x, y0 + days * rh, stroke=LINE))
                if (d, i) in mark: g.append(mark[(d, i)](x + cw / 2, y + rh / 2, rh * 0.36))
        g.append(R(x0, y0, w, days * rh, stroke=LINE))
        g.append(T(x0, y0 + days * rh + 20, rowlabel, 10, fill=MUTED))
    return g


def d_habit3(W, H, land):
    def chk(cx, cy, r): return C(cx, cy, r, fill=SAGE, stroke="none")
    mark = {(d, 0): chk for d in range(0, 9)} | {(d, 1): chk for d in [0, 1, 3, 4, 6, 8]} | {(d, 2): chk for d in range(0, 5)}
    g = _daygrid(W, H, land, ["물 2L", "10분 걷기", "일기 한 줄"], "습관은 3개만 · 연속일은 사슬로 이어진다", SAGE, "HABIT 3", "3개 습관 트래커", mark)
    return g


def d_attendance(W, H, land):
    def mk(color, ch):
        return lambda cx, cy, r: avatar(cx, cy, r + 2, color, ch, int(r * 1.1))
    mark = {}
    for i, (ch, col) in enumerate(MEMBERS):
        for d in [0, 1, 2, 3, 4, 6, 7] if i != 3 else [0, 2, 3, 7]:
            mark[(d, i)] = mk(col, ch)
    g = _daygrid(W, H, land, [m[0] + "희" if i == 0 else m[0] + "아" for i, m in enumerate(MEMBERS)], "전원 출석한 날에는 축하 알림 · 3일 빠지면 조용히 리마인드", PERI, "ATTENDANCE", "출석 도장판 (함께)", mark, memo="이번 달 전원 출석 2번! 보상은 카꾸")
    # 전원 출석 날 표시
    g.append(stamp(W - M - 60, H - M - 40, 30, ROSE, "전원!", 13))
    return g


def d_q365(W, H, land):
    x0, y0, w = M, M + 48, W - 2 * M
    g = [header(W, "Q 365", "오늘의 질문 · 3년 같은 질문", LAV, right="10월 25일"),
         T(x0, y0 + 40, "Q 298", 20, cls="s", fill=LAV),
         T(x0, y0 + 76, "올해 가장 자주 들은 노래는?", 24, cls="s"),
         L(x0, y0 + 92, x0 + w, y0 + 92, stroke=INK, sw=1.2)]
    block = (H - M - (y0 + 110)) / 3
    for i, yr in enumerate(["2026", "2027", "2028"]):
        y = y0 + 110 + i * block
        g += [T(x0, y + 14, yr, 12, fill=MUTED, weight=700), lines(x0, y + 4, w, block - 20, 30, LINE2)]
    g.append(hand(x0 + 50, y0 + 148, "NewJeans - Supernatural. 출근길마다", 22))
    g.append(T(x0 + w, H - M + 10, "한 쪽 = 질문 하나 · 답은 해마다 한 줄씩 쌓인다", 10, fill=MUTED, anchor="end"))
    return g


def d_mood(W, H, land):
    x0, y0, w, h = M, M + 60, W - 2 * M, H - 2 * M - 90
    months = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
    cols = [LAV, PERI, SAGE, MUST, ROSE, CHAR]
    legend = ["설렘", "평온", "뿌듯", "피곤", "속상", "무"]
    g = [header(W, "MOOD", "연간 무드 트래커 · 그날 기분 색으로 칠하기", ROSE, right="2026")]
    import random
    rnd = random.Random(7)
    if land:
        cw = w / 31; rh = h / 12
        for d in range(31): g.append(T(x0 + d * cw + cw / 2, y0 - 6, str(d + 1), 9, fill=MUTED, anchor="middle"))
        for mi, mo in enumerate(months):
            y = y0 + mi * rh
            g.append(T(x0 - 8, y + rh / 2 + 4, mo, 10, fill=MUTED, anchor="end"))
            for d in range(31):
                fill = cols[rnd.randrange(6)] if mi < 9 or (mi == 9 and d < 25) else "none"
                g.append(R(x0 + d * cw + 1, y + 1, cw - 2, rh - 2, fill=fill, stroke=LINE if fill == "none" else "none", rx=3, opacity=0.9))
    else:
        cw = w / 12; rh = h / 31
        for mi, mo in enumerate(months): g.append(T(x0 + mi * cw + cw / 2, y0 - 6, mo, 10, fill=MUTED, anchor="middle"))
        for d in range(31):
            y = y0 + d * rh
            g.append(T(x0 - 6, y + rh / 2 + 3, str(d + 1), 8, fill=MUTED, anchor="end"))
            for mi in range(12):
                fill = cols[rnd.randrange(6)] if mi < 9 or (mi == 9 and d < 25) else "none"
                g.append(R(x0 + mi * cw + 1, y + 1, cw - 2, rh - 2, fill=fill, stroke=LINE if fill == "none" else "none", rx=3, opacity=0.9))
    for i, (c, lb) in enumerate(zip(cols, legend)):
        lx = x0 + i * 78
        g += [R(lx, H - M - 4, 14, 14, fill=c, stroke="none", rx=3), T(lx + 20, H - M + 8, lb, 11, fill=MUTED)]
    return g


def d_bingo(W, H, land):
    g = [header(W, "BINGO", "같이 채우면 알림 · 한 줄 완성 시 축하", MUST, right="10월 우리 빙고")]
    size = min(W, H) - 2 * M - 70
    if land: bx, by = M, M + 60; sx = bx + size + 36
    else: bx, by = M + (W - 2 * M - size) / 2, M + 60; sx = None
    cell = size / 5
    items = ["카페 다꾸", "새 스티커", "운동 3번", "책 1권", "사진 찍기", "야식 금지", "산책", "편지 쓰기", "일찍 자기", "영화", "빵집", "플리 공유", "FREE", "청소", "물 2L", "생일 파티", "노래방", "친구 소개", "요리", "전시", "기록 7일", "야구 직관", "꽃 사기", "드라이브", "게임"]
    filled = {0, 1, 2, 3, 4, 7, 12, 17, 22}
    for i in range(25):
        r, c = divmod(i, 5); x, y = bx + c * cell, by + r * cell
        done = i in filled
        g += [R(x + 3, y + 3, cell - 6, cell - 6, fill=TAPES["butter"][0] if done else "none", stroke=LINE if not done else "none", dash=None if done else "4 4", rx=8),
              T(x + cell / 2, y + cell / 2 + (20 if done else 4), items[i], 11, fill=MUTED if not done else INK, anchor="middle", weight=700 if done else None)]
        if done:
            ch, col = MEMBERS[i % 4]
            g.append(avatar(x + cell / 2, y + cell / 2 - 10, 13, col, ch, 13))
    # 완성 줄 테이프
    g.append(tape(bx - 8, by + cell / 2 - 14, size + 16, 28, "pink", 0))
    g.append(stamp(bx + size - 30, by + 30, 34, ROSE, "1줄!", 15))
    info = [T(0, 0, "완성 줄", 11, fill=MUTED), T(0, 20, "가로 1 · 세로 0 · 대각 0", 13, weight=700),
            T(0, 56, "채운 칸  9 / 25", 13), T(0, 86, "참여", 11, fill=MUTED)]
    for i, (ch, col) in enumerate(MEMBERS): info.append(avatar(14 + i * 34, 104, 13, col, ch, 13))
    info += [T(0, 150, "알림", 11, fill=MUTED), T(0, 170, "· 칸 채움 — 소리 없음", 12), T(0, 190, "· 한 줄 완성 — 방 전체", 12), T(0, 210, "· 전체 완성 — 축하 + 리본", 12)]
    if land: g.append(G(info, transform=f"translate({sx} {by + 10})"))
    else: g.append(G(info, transform=f"translate({M} {by + size + 36})"))
    return g


def d_relay(W, H, land):
    g = [header(W, "Q RELAY", "질문 릴레이 · 전원 답하면 공개", LAV, right="10월 25일 · 질문 12")]
    x0, y0, w = M, M + 54, W - 2 * M
    g += [T(x0, y0 + 30, "Q. 우리 넷이 같이 가고 싶은 여행지는?", 24, cls="s"), L(x0, y0 + 46, x0 + w, y0 + 46, stroke=INK, sw=1.2)]
    top = y0 + 66; avail = H - M - top
    if land: cols, rows = 2, 2
    else: cols, rows = 1, 4
    cw = (w - (cols - 1) * 16) / cols; rh = (avail - (rows - 1) * 16) / rows
    states = ["done", "done", "scratch", "empty"]
    answers = ["제주 동쪽 — 성산에서 일출", "교토! 단풍 시즌에", "", ""]
    for i, (ch, col) in enumerate(MEMBERS):
        r, c = divmod(i, cols); x, y = x0 + c * (cw + 16), top + r * (rh + 16)
        st = states[i]
        g += [R(x, y, cw, rh, fill="#fff" if st != "empty" else "none", stroke=LINE, dash="4 4" if st == "empty" else None, rx=10),
              avatar(x + 24, y + 24, 14, col, ch, 13), T(x + 46, y + 29, ["민희", "수아", "지우", "현아"][i], 12, weight=700)]
        if st == "done": g += [lines(x + 14, y + 44, cw - 28, rh - 60, 28, LINE2), hand(x + 18, y + 72, answers[i], 22)]
        elif st == "scratch": g += [scratch(x + 14, y + 44, cw - 28, rh - 58, "답했어요 · 전원 답하면 공개")]
        else: g += [T(x + cw / 2, y + rh / 2 + 5, "아직 안 썼어요 — 내 차례", 13, fill=MUTED, anchor="middle"), pen(x + cw - 30, y + 24)]
    return g


def d_exchange(W, H, land):
    g = [header(W, "EXCHANGE", "교환일기 · 턴제 (쓰고 넘기면 다음 칸이 열린다)", PERI, right="10월 25일")]
    x0, y0, w, h = M, M + 54, W - 2 * M, H - M - (M + 54)
    if land: boxes = [(x0, y0, w / 2 - 10, h), (x0 + w / 2 + 10, y0, w / 2 - 10, h)]
    else: boxes = [(x0, y0, w, h / 2 - 10), (x0, y0 + h / 2 + 10, w, h / 2 - 10)]
    (x, y, bw, bh) = boxes[0]
    ch, col = MEMBERS[0]
    g += [R(x, y, bw, bh, fill="#fff", stroke=LINE, rx=10), avatar(x + 26, y + 26, 15, col, ch, 14), T(x + 50, y + 31, "민희 · 썼어요", 12, weight=700),
          lines(x + 16, y + 44, bw - 32, bh - 64, 30, LINE2), hand(x + 20, y + 76, "오늘 수아랑 같이 간 빵집 기억나? 거기 소금빵이", 22),
          hand(x + 20, y + 106, "진짜 맛있어서 또 가고 싶어. 다음엔 지우도 같이!", 22), photo(x + bw - 150, y + bh - 120, 130, 96), tape(x + bw - 140, y + bh - 128, 60, 18, "sky", 8)]
    (x, y, bw, bh) = boxes[1]
    ch, col = MEMBERS[1]
    g += [R(x, y, bw, bh, stroke=PERI, sw=1.5, dash="6 4", rx=10), avatar(x + 26, y + 26, 15, col, ch, 14), T(x + 50, y + 31, "수아 · 네 차례야", 12, weight=700, fill=PERI),
          pen(x + bw - 30, y + 26, PERI), lines(x + 16, y + 44, bw - 32, bh - 64, 30, LINE2),
          T(x + bw / 2, y + bh / 2 + 5, "수아가 쓰면 다음 칸(지우)이 열려요 · 48시간 지나면 리마인드", 12, fill=MUTED, anchor="middle")]
    g.append(G([lock(0, 0, 14, MUTED), T(22, 6, "지우 · 현아 — 잠김", 11, fill=MUTED)], transform=f"translate({W - M - 130} {H - M + 10})"))
    return g


def d_indextab(W, H, land):
    g = [header(W, "INDEX", "구분지 · 오른쪽 탭이 책장 넘길 때 보인다", CAMEL, right="2026")]
    x0, y0, w, h = M, M + 54, W - 2 * M - 30, H - M - (M + 54)
    g += [R(x0, y0, w, h, fill="#fff", stroke=LINE, rx=10), T(x0 + 32, y0 + 110, "10", 96, cls="s", fill=CAMEL), T(x0 + 150, y0 + 110, "October", 28, cls="s", fill=MUTED),
          T(x0 + 32, y0 + 150, "이달의 목표 · 사진 · 한 줄", 12, fill=MUTED), lines(x0 + 32, y0 + 160, w - 64, 100, 30, LINE2),
          photo(x0 + 32, y0 + 290, 180, 130), hand(x0 + 230, y0 + 330, "10월: 다 같이 빙고 1줄 완성하기", 24)]
    # 탭 12개 (오른쪽 가장자리)
    th = h / 12
    for i in range(12):
        on = i == 9
        g += [R(W - M - 30, y0 + i * th, 30 if on else 22, th - 3, fill=CAMEL if on else CREAM, stroke="none", rx=5),
              T(W - M - (15 if on else 11), y0 + i * th + th / 2 + 4, str(i + 1), 10, fill="#fff" if on else MUTED, anchor="middle", weight=700)]
    return g


def d_tracing(W, H, land):
    # 아래: 1년 전 오늘 페이지(흐림). 위: 반투명 트레이싱지
    under = [T(W - M, H - M + 10, "아래 장: 2025 · 10 · 25 (1년 전 오늘)", 11, fill=MUTED, anchor="end"), lines(M, M + 60, W - 2 * M, H - 2 * M - 60, 32, LINE),
             hand(M + 10, M + 100, "처음으로 넷이 같이 쓴 날. 아직 어색하다", 26, INK), photo(W - M - 240, M + 140, 220, 160), tape(W - M - 230, M + 130, 80, 22, "pink", -5),
             hand(M + 10, M + 150, "빙고는 아직 0줄 ㅎㅎ", 24, INK)]
    g = [G(under, opacity=0.9), R(0, 0, W, H, fill="#fff", stroke="none", opacity=0.68),
         R(M - 14, M - 14, W - 2 * M + 28, H - 2 * M + 28, stroke="#C9C3B5", dash="2 6", rx=8),
         header(W, "TRACING", "트레이싱 간지 · 앞장이 비친다 · 위에 덧쓰기", SAGE, right="2026 · 10 · 25"),
         hand(M + 14, H / 2 + 40, "1년 뒤: 빙고 9칸, 소금빵 단골", 30, PEN), tape(M + 10, H / 2 + 56, 120, 20, "mint", 3)]
    return g


def d_capsule(W, H, land):
    g = [header(W, "TIME CAPSULE", "쓰고 봉인 → 지정한 날에 뜯긴다", ROSE, right="열리는 날 2027 · 10 · 25")]
    x0, y0, w, h = M, M + 54, W - 2 * M, H - M - (M + 54)
    if land: wa = (x0, y0, w * 0.55, h); ea = (x0 + w * 0.6, y0, w * 0.4, h)
    else: wa = (x0, y0, w, h * 0.55); ea = (x0, y0 + h * 0.6, w, h * 0.4)
    (x, y, bw, bh) = wa
    g += [T(x, y + 12, "1년 뒤의 우리에게", 11, fill=MUTED), lines(x, y + 20, bw, bh - 30, 30, LINE2),
          hand(x + 4, y + 52, "2027년의 우리, 아직도 같이 쓰고 있지?", 24), hand(x + 4, y + 82, "그때도 소금빵 좋아하면 인정", 24)]
    (x, y, bw, bh) = ea
    ex, ey, ew, eh = x + bw * 0.08, y + bh * 0.2, bw * 0.84, bh * 0.56
    g += [R(ex, ey, ew, eh, fill=CREAM, stroke="#D7CDB9", rx=6), P(f"M{ex},{ey} L{ex + ew / 2},{ey + eh * .55} L{ex + ew},{ey}", fill="#E3DAC6", stroke="#D7CDB9"),
          C(ex + ew / 2, ey + eh * .52, 16, fill=ROSE, stroke="#D98B84", sw=2), T(ex + ew / 2, ey + eh * .52 + 5, "DIO", 9, fill="#fff", anchor="middle", weight=800),
          T(ex + ew / 2, ey + eh + 24, "봉인됨 · 2027 · 10 · 25 0시에 열림", 11, fill=MUTED, anchor="middle"),
          T(ex + ew / 2, ey + eh + 42, "멤버 4명 모두 넣음", 11, fill=MUTED, anchor="middle"), lock(ex + ew - 18, ey + 16, 12, "#B9AE98")]
    return g


def d_daytape(W, H, land):
    g = [header(W, "DAILY TAPE", "일력 마테 · 하루 한 조각만 뜯긴다", MUST, right="10월")]
    x0, y0, w = M, M + 54, W - 2 * M
    # 롤
    rx, ry = x0, y0 + 10
    g += [C(rx + 36, ry + 36, 36, fill="#F3EBD6", stroke="#D9CBA6", sw=2), C(rx + 36, ry + 36, 14, fill=PAPER, stroke="#D9CBA6"),
          R(rx + 72, ry + 22, w - 72, 28, fill=TAPES["butter"][0], stroke="none")]
    for i in range(10):
        dx = rx + 72 + i * ((w - 72) / 10)
        day = 25 + i
        g += [L(dx, ry + 22, dx, ry + 50, stroke=TAPES["butter"][1], dash="2 3"),
              T(dx + (w - 72) / 20, ry + 41, f"10.{day}" if day <= 31 else f"11.{day - 31}", 11, anchor="middle", weight=700, fill=INK if i == 0 else "#B59A4A")]
    g += [T(rx + 72, ry + 66, "오늘 조각 ↑ 뜯을 수 있음 · 내일 조각은 내일 0시에", 10, fill=MUTED),
          dotgrid(x0, y0 + 110, w, H - M - (y0 + 110), 24)]
    # 뜯어 붙인 조각들
    for i, (px, py, ang, key) in enumerate([(x0 + 30, y0 + 150, -3, "butter"), (x0 + 30, y0 + 250, 2, "butter"), (x0 + 30, y0 + 350, -2, "butter")]):
        g += [tape(px, py, 90, 28, key, ang), T(px + 45, py + 19, f"10.{22 + i}", 12, anchor="middle", weight=700), hand(px + 110, py + 22, ["소금빵 데이", "비 와서 집콕", "빙고 1줄 완성!"][i], 22)]
    g.append(stamp(W - M - 70, H - M - 60, 34, SAGE, "오늘", 14))
    return g


def d_dday(W, H, land):
    g = [header(W, "D-DAY", "날마다 숫자가 바뀐다 · D-7 · D-1 · 당일 알림", PERI, right="2026 · 12 · 1 콘서트")]
    x0, y0, w, h = M, M + 54, W - 2 * M, H - M - (M + 54)
    g += [T(x0, y0 + 96, "D-37", 110, cls="s", fill=PERI), T(x0 + 300 if land else x0, y0 + (96 if land else 130), "첫 콘서트까지", 20, cls="s", fill=MUTED)]
    top = y0 + (130 if land else 160)
    cols = 20 if land else 12
    cell = w / cols
    for i in range(37):
        r, c = divmod(i, cols); x, y = x0 + c * cell, top + r * cell
        done = i < 9
        g.append(R(x + 3, y + 3, cell - 6, cell - 6, fill=PERI if done else "none", stroke="none" if done else LINE, rx=6, opacity=0.85 if done else None))
        if not done: g.append(T(x + cell / 2, y + cell / 2 + 4, str(37 - i), 10, fill=MUTED, anchor="middle"))
    rows = -(-37 // cols)
    fy = top + rows * cell + 16
    g += [T(x0, fy + 12, "하루 지나면 한 칸씩 칠해진다 · 스크래치로 직접 긁어도 됨", 10, fill=MUTED), dotgrid(x0, fy + 24, w, H - M - fy - 24, 24),
          hand(x0 + 10, fy + 70, "티켓팅 성공 ㅠㅠ 2층이지만 괜찮아", 24)]
    return g


def d_baseball(W, H, land):
    g = [header(W, "BALLPARK", "직관 기록지 · 결과는 자동으로 도착 · 그 위에 꾸민다", SAGE, right="2026 · 10 · 25 · 잠실")]
    x0, y0, w = M, M + 54, W - 2 * M
    innings = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "R", "H", "E"]
    lab = 120; cw = (w - lab) / 12; rh = 34
    g.append(R(x0, y0, w, rh * 3, fill="#fff", stroke=LINE, rx=8))
    for i, s in enumerate(innings):
        g.append(T(x0 + lab + i * cw + cw / 2, y0 + 22, s, 11, fill=MUTED, anchor="middle", weight=700))
        g.append(L(x0 + lab + i * cw, y0, x0 + lab + i * cw, y0 + rh * 3, stroke=LINE2))
    teams = [("LG", PERI, [0, 2, 0, 1, 0, 3, 0, 1, 0, 7, 11, 0]), ("SSG", ROSE, [1, 0, 0, 2, 0, 0, 1, 0, 0, 4, 8, 1])]
    for ti, (nm, col, sc) in enumerate(teams):
        y = y0 + rh * (ti + 1)
        g += [L(x0, y, x0 + w, y, stroke=LINE2), R(x0 + 8, y + 8, 6, rh - 16, fill=col, stroke="none", rx=2), T(x0 + 22, y + 22, nm, 13, weight=800)]
        for i, v in enumerate(sc):
            g.append(T(x0 + lab + i * cw + cw / 2, y + 22, str(v), 13 if i < 9 else 15, anchor="middle", weight=800 if i >= 9 else None, fill=INK if i < 9 else col))
    g.append(T(x0 + w, y0 + rh * 3 + 14, "자동 입력 · 잠긴 글자 (KBO 결과)", 9, fill=MUTED, anchor="end"))
    # 정보 칸
    iy = y0 + rh * 3 + 30
    fields = ["선발  김윤식 / 엘리아스", "결승타  ______", "좌석  1루 블루석 214", "날씨  ☀ 18°", "동행  수아 · 지우", "먹은 것  ______"]
    fc = 3 if land else 2; fw = w / fc
    for i, f in enumerate(fields):
        r, c = divmod(i, fc)
        g += [T(x0 + c * fw, iy + 14 + r * 30, f, 12), L(x0 + c * fw, iy + 20 + r * 30, x0 + c * fw + fw - 16, iy + 20 + r * 30, stroke=LINE)]
    rows = -(-len(fields) // fc)
    fy = iy + rows * 30 + 14
    g += [R(x0, fy, w, H - M - fy, stroke=LINE, dash="3 4", rx=8), dotgrid(x0 + 12, fy + 12, w - 24, H - M - fy - 24, 24),
          stamp(x0 + w - 70, fy + 60, 36, PERI, "승", 22, -14), hand(x0 + 20, fy + 50, "6회 쓰리런!! 목 쉼", 26), photo(x0 + 20, fy + 70, 150, 100, "직관 사진"),
          T(x0 + 12, H - M - 10, "시즌 직관  7승 4패 · 승률 .636 (자동 집계)", 11, fill=SAGE, weight=700)]
    return g


def d_photocard(W, H, land):
    g = [header(W, "PHOTOCARD", "포카 바인더 · 사진 넣으면 카드 비율로 잘린다", LAV, right="최애 · 2026")]
    x0, y0, w, h = M, M + 54, W - 2 * M, H - M - (M + 54)
    cols, rows = (4, 2) if land else (3, 3)
    gap = 18
    pw = (w - (cols - 1) * gap) / cols; ph = pw * 85 / 55
    if ph * rows + gap * (rows - 1) > h:
        ph = (h - gap * (rows - 1)) / rows; pw = ph * 55 / 85
    ox = x0 + (w - (pw * cols + gap * (cols - 1))) / 2
    for i in range(cols * rows):
        r, c = divmod(i, cols); x, y = ox + c * (pw + gap), y0 + r * (ph + gap)
        g.append(R(x, y, pw, ph, fill="#F4F2EE", stroke="#D3CFC6", rx=8))
        if i in (0, 1, 5):
            g += [R(x + 6, y + 6, pw - 12, ph - 12, fill="url(#card)", stroke="none", rx=6), T(x + pw / 2, y + ph / 2 + 6, "♡", 28, fill="#fff", anchor="middle")]
        else:
            g.append(T(x + pw / 2, y + ph / 2 + 4, "포켓", 11, fill=MUTED, anchor="middle"))
        g.append(R(x, y, pw, ph, fill="url(#gloss)", stroke="none", rx=8))
    g.append(tape(ox + pw - 20, y0 - 8, 60, 18, "lavender", -8))
    return g


def d_reading(W, H, land):
    g = [header(W, "READING", "독서 기록 · 제목 치면 표지 · 저자가 카드로", CAMEL, right="No. 14")]
    x0, y0, w, h = M, M + 54, W - 2 * M, H - M - (M + 54)
    cw = 150; ch = 225
    g += [R(x0, y0, cw, ch, fill="#F1E8D9", stroke="#D7CDB9", rx=4), R(x0 + 10, y0 + 10, cw - 20, ch - 20, stroke="#D7CDB9", dash="3 3", rx=2),
          T(x0 + cw / 2, y0 + ch / 2, "표지", 12, fill=MUTED, anchor="middle"), T(x0 + cw / 2, y0 + ch / 2 + 18, "(자동)", 10, fill=MUTED, anchor="middle")]
    fx = x0 + cw + 24; fw = w - cw - 24
    fields = [("제목", "죽고 싶지만 떡볶이는 먹고 싶어"), ("저자", "백세희"), ("읽은 날", "10 · 12 → 10 · 25"), ("별점", "★★★★☆")]
    for i, (k, v) in enumerate(fields):
        y = y0 + 20 + i * 44
        g += [T(fx, y, k, 10, fill=MUTED), L(fx, y + 26, fx + fw, y + 26, stroke=LINE), hand(fx + 2, y + 22, v, 22 if i else 24)]
    qy = y0 + ch + 24 if not land else y0 + 200
    qx = x0 if not land else fx
    qw = w if not land else fw
    g += [T(qx, qy + 40, "“", 60, cls="s", fill=CAMEL), lines(qx + 30, qy + 10, qw - 30, 90, 30, LINE2),
          hand(qx + 34, qy + 36, "마음은 서서히 나아진다, 눈치채지 못할 만큼", 22)]
    ry = qy + 120
    g += [T(x0, ry, "한 줄 평", 10, fill=MUTED), R(x0, ry + 8, w, H - M - ry - 8, stroke=LINE, dash="3 4", rx=8), dotgrid(x0 + 10, ry + 18, w - 20, H - M - ry - 28, 24),
          hand(x0 + 16, ry + 50, "수아 추천. 울다가 웃었다.", 24), tape(x0 + w - 130, ry, 90, 20, "kraft", 6)]
    return g


def d_concert(W, H, land):
    g = [header(W, "CONCERT", "콘서트 기록 · 티켓 포켓 · 셋리스트", ROSE, right="D-DAY · 2026 · 12 · 1")]
    x0, y0, w, h = M, M + 54, W - 2 * M, H - M - (M + 54)
    tw, th = (w * 0.45, 120) if land else (w, 120)
    # 티켓
    g += [R(x0, y0, tw, th, fill="#fff", stroke=LINE, rx=10), L(x0 + tw * .7, y0 + 8, x0 + tw * .7, y0 + th - 8, stroke=LINE, dash="4 4"),
          C(x0 + tw * .7, y0, 8, fill=PAPER, stroke=LINE), C(x0 + tw * .7, y0 + th, 8, fill=PAPER, stroke=LINE),
          T(x0 + 16, y0 + 28, "TICKET", 10, fill=MUTED, ls="0.15em"), T(x0 + 16, y0 + 58, "WORLD TOUR · SEOUL", 16, weight=800),
          T(x0 + 16, y0 + 82, "KSPO DOME · 12.1 18:00", 12, fill=MUTED), T(x0 + 16, y0 + 104, "좌석  2층 F구역 12열 7", 12),
          T(x0 + tw * .85, y0 + th / 2 + 4, "티켓 사진", 11, fill=MUTED, anchor="middle"), tape(x0 + 20, y0 - 8, 70, 18, "pink", -6)]
    # 응원봉 · 동행
    ix = x0 + tw + 24 if land else x0; iy = y0 if land else y0 + th + 20
    g += [P(f"M{ix + 20},{iy + 70} v-30 a14,14 0 1 1 20,0 v30 z", fill=ROSE, stroke="#D98B84"), R(ix + 24, iy + 70, 12, 26, fill="#D98B84", stroke="none", rx=3),
          T(ix + 50, iy + 56, "응원봉 ✓ · 동행 수아", 12), T(ix + 50, iy + 80, "교통  지하철 · 저녁  ______", 12, fill=MUTED)]
    # 셋리스트
    sy = (y0 + th + 24) if land else (iy + 110)
    sx = x0; sw = w * 0.5 if land else w
    g.append(T(sx, sy + 10, "SETLIST", 10, fill=MUTED, ls="0.15em"))
    n = 14 if land else 16
    for i in range(n):
        y = sy + 20 + i * 24
        g += [T(sx, y + 14, f"{i + 1:02d}", 10, fill=MUTED), L(sx + 24, y + 18, sx + sw - 10, y + 18, stroke=LINE2)]
    for i, s in enumerate(["Super Shy", "Ditto", "Hype Boy"]): g.append(hand(sx + 28, sy + 34 + i * 24, s, 20))
    # 자유 칸
    fx = x0 + w * 0.55 if land else x0; fy = sy if land else sy + 20 + n * 24 + 10
    fw = w * 0.45 if land else w
    g += [R(fx, fy, fw, H - M - fy, stroke=LINE, dash="3 4", rx=8), dotgrid(fx + 10, fy + 10, fw - 20, H - M - fy - 20, 24),
          photo(fx + 14, fy + 14, 140, 100, "현장 사진"), hand(fx + 170, fy + 50, "앵콜 때 울었음", 24)]
    return g


