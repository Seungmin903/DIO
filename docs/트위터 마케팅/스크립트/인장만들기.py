# -*- coding: utf-8 -*-
"""인장(X 프로필 이미지) 시안 — 800×800 마스터 6안 + 크기 · 모양 · 밝기 비교 시트

실행:  python "docs/트위터 마케팅/스크립트/인장만들기.py"
결과:  목업/인장 A 디오.png … (800×800, X 는 이 이미지를 원 또는 둥근 네모로 잘라 보여 준다)
       목업/인장 비교.jpg (원 · 둥근 네모 · 96/48/32px · 밝은 · 어두운 화면)
       목업/인장 시즌 변형.jpg (같은 바탕에 소품만 바꾸는 시즌 인장 3종)
규칙:  중요한 그림은 지름 680(85%) 원 안에. 바탕은 모서리까지 꽉 채운다(원으로 잘려도 · 둥근 네모로 잘려도 빈 데가 안 생김).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from 목업_도형 import (COAT, CREAM, FONT, LILAC, NAVY, SOFT, WHITE, art_c, logo, render, sticker, svg_doc, text)  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "목업"
S = 800  # 마스터 크기


def bg(color):
    return f'<rect width="{S}" height="{S}" fill="{color}"/>'


# ───────────────────────── 후보 6안 (각각 800×800 안에 그린 SVG 조각) ─────────────────────────
def cand_a():
    """A 디오 — 노란 다이어리 한 명. 가장 단순 · 가장 눈에 띔(노랑 × 하늘 바탕은 보색)."""
    return bg(SOFT) + art_c("dio_all", 400, 408, h=560)


def cand_a2():
    """A2 디오 크게 — 다리를 잘라 표지를 크게. 작은 크기에서 얼굴이 더 남는다."""
    return bg(SOFT) + art_c("dio_body", 392, 400, h=640)


def cand_b():
    """B 디오 클로즈업 — 표지 한 장이 화면 전체. 작은 크기에서도 눈 · 입이 크게 남는다."""
    return bg(CREAM) + art_c("dio_face", 400, 400, w=900)


def cand_c():
    """C 둘이(빼꼼) — 두리가 디오 뒤에서 빼꼼. '함께'를 한 장에."""
    return (bg(SOFT)
            + art_c("duri_head", 598, 318, h=340, rot=6)
            + art_c("dio_all", 292, 448, h=500, rot=-3))


def cand_d():
    """D 로고 D — 앱 · 스토어와 같은 얼굴. 흰 바탕."""
    return bg(WHITE) + logo(190, 165, 470)


def cand_e():
    """E 디오 + 스티커 — 오늘 친구들이 붙인 만큼 표정이 나는 모습(행복). 이벤트 · 소식용 변형의 바탕."""
    return (cand_a()
            + sticker("heart", 600, 205, size=118, rot=12)
            + sticker("star", 205, 590, size=96, rot=-14)
            + sticker("sparkle_pink", 640, 560, size=70, rot=8))


def cand_f():
    """F 두리 — 목도리 친구 한 명. 흰 머리 + 라일락 목도리, 노랑 바탕."""
    return bg(CREAM) + art_c("duri_head", 400, 430, h=640)


CANDS = [
    ("A 디오", cand_a, "노란 다이어리 한 명. 가장 단순하고 하늘색 바탕 위에서 눈에 띈다"),
    ("A2 디오 크게", cand_a2, "A에서 다리를 잘라 표지를 키움. 작은 크기에서 얼굴이 더 남는다"),
    ("B 디오 얼굴", cand_b, "표지 클로즈업. 작은 크기에서도 얼굴이 남는다"),
    ("C 둘이", cand_c, "두리가 디오 뒤에서 빼꼼. '함께'를 한 장에"),
    ("D 로고", cand_d, "앱 로고 D. 스토어와 같은 얼굴이지만 캐릭터 없음"),
    ("E 디오 스티커", cand_e, "A에 스티커. 이벤트 · 시즌 교체의 바탕"),
    ("F 두리", cand_f, "목도리 친구 한 명. 디오 없이는 설명이 어렵다"),
]


# ───────────────────────── 비교 시트 ─────────────────────────
def avatar(fn, x, y, size, shape="circle", ring=None):
    """800 마스터를 size px 로 줄여 (x, y) 에 놓고 모양대로 자른다."""
    k = size / S
    uid = f"av{abs(hash((fn.__name__, x, y, size, shape))) % 999999}"
    if shape == "circle":
        clip = f'<circle cx="{S / 2}" cy="{S / 2}" r="{S / 2}"/>'
    else:
        clip = f'<rect width="{S}" height="{S}" rx="{S * 0.16}"/>'
    s = (f'<g transform="translate({x},{y}) scale({k:.5f})"><clipPath id="{uid}">{clip}</clipPath>'
         f'<g clip-path="url(#{uid})">{fn()}</g></g>')
    if ring:
        s += (f'<circle cx="{x + size / 2}" cy="{y + size / 2}" r="{size / 2 - 0.5}" fill="none" stroke="{ring}" stroke-width="1"/>' if shape == "circle"
              else f'<rect x="{x + .5}" y="{y + .5}" width="{size - 1}" height="{size - 1}" rx="{size * .16}" fill="none" stroke="{ring}" stroke-width="1"/>')
    return s


def timeline_row(fn, x, y, w, dark, name="DIO 디오", handle="@handle"):
    """타임라인 한 줄(48px 인장 + 이름 · 아이디 · 한 줄)."""
    bgc, fg, sub, line = ("#000000", "#E7E9EA", "#71767B", "#2F3336") if dark else ("#FFFFFF", "#0F1419", "#536471", "#EFF3F4")
    return (f'<rect x="{x}" y="{y}" width="{w}" height="86" fill="{bgc}"/>'
            f'<line x1="{x}" y1="{y + 86}" x2="{x + w}" y2="{y + 86}" stroke="{line}"/>'
            + avatar(fn, x + 14, y + 14, 48, "circle")
            + text(x + 74, y + 34, name, size=15, weight=800, fill=fg)
            + text(x + 74 + 15 * 0.62 * len(name) + 6, y + 34, handle, size=14, weight=500, fill=sub)
            + text(x + 74, y + 58, "오늘의 한 장, 같이 꾸며요", size=14, weight=500, fill=fg))


def sheet(cands=None, title=None):
    cands = cands or CANDS
    cw, ch_ = 330, 560  # 후보 한 칸
    cols = len(cands)
    W, H = cw * cols + 60, ch_ + 150
    body = text(30, 52, title or "인장 — 원 · 둥근 네모 · 96/48/32px · 밝은/어두운 화면", size=26, weight=900)
    body += text(30, 82, "인장은 타임라인에서 48px 안팎으로 보인다. 같은 그림이 모양과 밝기를 바꿔도 알아볼 수 있는지가 기준이다.", size=14, weight=500, fill="#4A5578")
    for i, (name, fn, note) in enumerate(cands):
        col, row = i % cols, 0
        x0, y0 = 30 + col * cw, 110 + row * ch_
        body += f'<rect x="{x0}" y="{y0}" width="{cw - 20}" height="{ch_ - 20}" rx="18" fill="#FFFFFF" stroke="#D5DDEE"/>'
        body += text(x0 + 18, y0 + 34, name, size=20, weight=900)
        body += avatar(fn, x0 + 18, y0 + 50, 170, "circle", ring="#D5DDEE")
        body += avatar(fn, x0 + 200, y0 + 50, 80, "square", ring="#D5DDEE")      # 조직 인증(둥근 네모)
        body += text(x0 + 200, y0 + 150, "조직 인증 모양", size=11, weight=600, fill="#6B7280")
        for j, sz in enumerate((96, 48, 32)):
            body += avatar(fn, x0 + 18 + [0, 110, 170][j], y0 + 238, sz, "circle", ring="#D5DDEE")
        body += text(x0 + 18, y0 + 352, "96 · 48 · 32px", size=11, weight=600, fill="#6B7280")
        body += timeline_row(fn, x0 + 8, y0 + 366, cw - 36, dark=False)
        body += timeline_row(fn, x0 + 8, y0 + 454, cw - 36, dark=True)
    return svg_doc(W, H, body, bg="#EEF2F9"), W, H


# ───────────────────────── 시즌 변형 ─────────────────────────
def season_dec():
    return cand_a2() + sticker("bow", 150, 150, size=170, rot=-14) + sticker("sparkle", 650, 150, size=110, rot=10) + sticker("sparkle_pink", 640, 650, size=84, rot=-8)


def season_jan():
    return cand_a2() + sticker("star", 640, 140, size=150, rot=12) + sticker("sparkle_pink", 150, 170, size=100, rot=-8) + sticker("confetti", 600, 650, size=150)


def season_mar():
    return cand_a2() + sticker("flower_pink", 150, 150, size=150, rot=-12) + sticker("flower_pink", 660, 330, size=100, rot=20) + sticker("flower_pink", 560, 660, size=130, rot=8)


def season_nov():
    return cand_a2() + sticker("star", 150, 150, size=150, rot=-12) + sticker("check", 650, 160, size=110, rot=8)


def seasonal():
    """같은 바탕(A2 디오)에 소품만 바꿔 얹는 시즌 인장. 월 1회 이하, 소품은 스티커 2~3개까지. 눈 · 얼굴 자리는 가리지 않는다."""
    items = [("11월 수능 응원", season_nov), ("12월 첫눈", season_dec), ("1월 새해", season_jan), ("3월 벚꽃", season_mar)]
    W, H = len(items) * 300 + 60, 430
    body = text(30, 46, "시즌 인장 — 바탕은 그대로, 스티커만 바꿔 붙인다", size=22, weight=900)
    for i, (name, fn) in enumerate(items):
        x0 = 30 + i * 300
        body += f'<rect x="{x0}" y="70" width="280" height="320" rx="18" fill="#FFFFFF" stroke="#D5DDEE"/>'
        body += avatar(fn, x0 + 20, 90, 240, "circle", ring="#D5DDEE")
        body += text(x0 + 20, 366, name, size=18, weight=800)
    return svg_doc(W, H, body, bg="#EEF2F9"), W, H


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, fn, _ in CANDS:
        render(svg_doc(S, S, fn()), OUT / f"인장 {name}.png", S, S, scale=1)
        print("ok", name)
    svg, W, H = sheet(CANDS[:4], "인장 A · A2 · B · C — 원 · 둥근 네모 · 96/48/32px · 밝은/어두운 화면")
    render(svg, OUT / "인장 비교 1.jpg", W, H, scale=2)
    svg, W, H = sheet(CANDS[4:], "인장 D · E · F — 원 · 둥근 네모 · 96/48/32px · 밝은/어두운 화면")
    render(svg, OUT / "인장 비교 2.jpg", W, H, scale=2)
    svg, W, H = seasonal()
    render(svg, OUT / "인장 시즌 변형.jpg", W, H, scale=2)
    print("done")
