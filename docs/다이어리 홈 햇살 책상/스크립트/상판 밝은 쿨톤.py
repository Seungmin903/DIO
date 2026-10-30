# -*- coding: utf-8 -*-
"""코덱스 상판(빈 책상) → 더 밝고 차가운 판. 나뭇결 · 창빛 모양은 그대로 두고 색만 옮긴다.

1) 밝게: 흰색 쪽으로 28% 끌어올린다.
2) 노란 기 줄이기: 회색 쪽으로 채도를 낮추되, 창빛(가장 밝은 곳)은 햇살 느낌이 남게 덜 낮춘다.
3) 색 입히기: 밝은 쿨톤은 R −2 · B +4, 라벤더는 R −1 · G −3 · B +7(분홍 쪽이 아니라 보랏빛으로 R 은 올리지 않는다).
실행: python "스크립트/상판 밝은 쿨톤.py" <원본 상판.png> <결과.png> [밝은 쿨톤 | 라벤더]
"""
import sys

import numpy as np
from PIL import Image

LIFT = 0.28
KEEP_SHADE, KEEP_LIGHT = 0.5, 0.75  # 남기는 채도: 그늘 · 창빛
CASTS = {'밝은 쿨톤': (-2, 0, 4), '라벤더': (-1, -3, 7)}
CAST = np.array(CASTS['밝은 쿨톤'], np.float32)


def grade(rgb: np.ndarray) -> np.ndarray:
    lum = rgb @ np.array([.2126, .7152, .0722], np.float32)
    lo, hi = np.percentile(lum, 20), np.percentile(lum, 97)
    light = np.clip((lum - lo) / (hi - lo), 0, 1)[..., None]  # 0 = 그늘, 1 = 창빛 한가운데
    x = 255 - (255 - rgb) * (1 - LIFT)
    m = x.mean(-1, keepdims=True)
    x = m + (x - m) * (KEEP_SHADE + (KEEP_LIGHT - KEEP_SHADE) * light)
    return np.clip(x + CAST, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    if len(sys.argv) > 3:
        CAST = np.array(CASTS[sys.argv[3]], np.float32)
    src = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
    Image.fromarray(grade(src)).save(sys.argv[2], optimize=True)
    print('ok', sys.argv[2])
