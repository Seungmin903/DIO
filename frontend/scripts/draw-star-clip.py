# -*- coding: utf-8 -*-
"""별 클립 그리기 → 철사 한 줄이 별 모양으로 두 바퀴 감겨 들어가는 은색 클립, 위에서 곧게 내려다본 납작한 그림.

python scripts/draw-star-clip.py <저장할 png>
바깥 별에서 시작해 안쪽 별로 감겨 들어간다(루프끼리 닿거나 겹치지 않는다). 뾰족한 끝은 Chaikin 으로 둥글린다.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw

SIZE = 1400
WIRE = 0.034  # 별 폭에 대한 철사 굵기
TURNS = 2
SHRINK = 0.46  # 마지막에 바깥 별의 (1 - SHRINK) 크기까지 감겨 든다
TIP, VALLEY = 1.0, 0.46  # 별 끝 · 안쪽 꼭지점 반지름 비율


def chaikin(points, rounds, cut=0.25):
    pts = np.array(points, float)
    for _ in range(rounds):
        mid = pts[:-1] * (1 - cut) + pts[1:] * cut, pts[:-1] * cut + pts[1:] * (1 - cut)
        new = np.empty((len(pts) * 2 - 2, 2))
        new[0::2], new[1::2] = mid
        pts = np.vstack([pts[:1], new, pts[-1:]])
    return pts


def render(out):
    n = 10 * TURNS  # 한 바퀴 = 끝 5 + 꼭지점 5
    seq = []
    for k in range(1, n + 1):  # 안쪽 꼭지점에서 시작해 철사 끝이 별 밖으로 삐져나오지 않게
        shrink = 1 - SHRINK * k / n
        radius = (TIP if k % 2 == 0 else VALLEY) * shrink
        angle = -np.pi / 2 + k * np.pi / 5  # 첫 끝이 위
        seq.append((np.cos(angle) * radius, np.sin(angle) * radius))
    pts = chaikin(seq, 4, cut=0.14)  # 모서리를 조금만 깎아 별 끝이 살아 있게
    scale = SIZE * 0.4
    xy = pts * scale + SIZE / 2
    seg = np.hypot(*np.diff(xy, axis=0).T)
    t = np.concatenate([[0], np.cumsum(seg)])
    dense = np.stack([np.interp(np.linspace(0, t[-1], int(t[-1] / 1.2)), t, xy[:, i]) for i in (0, 1)], 1)
    r = WIRE * 2 * scale / 2
    layers = [  # (반지름 비율, 중심 이동(빛 쪽), 색) — 은색
        (1.00, (0, 0), (112, 118, 114)),
        (0.86, (-0.05, -0.07), (186, 190, 186)),
        (0.62, (-0.14, -0.2), (224, 227, 223)),
        (0.30, (-0.3, -0.4), (248, 249, 247)),
        (0.12, (-0.38, -0.5), (255, 255, 255)),
    ]
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    for k, shift, color in layers:
        layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for x, y in dense:
            cx, cy, rr = x + shift[0] * r, y + shift[1] * r, r * k
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=color + (255,))
        if k < 1:
            layer.putalpha(Image.fromarray(np.minimum(np.asarray(layer.getchannel('A')), np.asarray(img.getchannel('A')))))
        img.alpha_composite(layer)
    img.crop(img.getchannel('A').getbbox()).save(out)


if __name__ == '__main__':
    render(sys.argv[1])
