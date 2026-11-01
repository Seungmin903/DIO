# -*- coding: utf-8 -*-
"""코덱스 책갈피 시안(C안: 은색 금속 · 초승달 · 별 타공 · 라벤더 에나멜 · 체인 + 진주, 마젠타 #FF00FF 단색 배경) → 앱 소품 bookmark.png

python scripts/process-bookmark.py <코덱스 시안.png> <저장할 png>
마젠타를 색으로 따서 타공 구멍 · 체인 틈까지 실제로 투명하게 뚫는다 (흰 배경은 타공 안의 흰색과 구분이 안 돼 구멍이 막혔다).
가장자리 3~4px 안에서만 마젠타 번짐(despill)을 지우고 무채색 쪽으로 당긴다. 라벤더 에나멜 색은 건드리지 않는다.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def key_magenta(src: Path) -> Image.Image:
    rgb = np.asarray(Image.open(src).convert('RGB'), np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    magenta = np.minimum(r, b) - g  # 마젠타일수록 크다 (은색 · 라벤더는 작다)
    alpha = 1 - np.clip((magenta - 36) / 30, 0, 1)  # 라벤더 에나멜은 magenta 값이 최대 약 33 이라 안전하다
    edge = ndimage.binary_dilation(alpha < 0.5, iterations=3) & (alpha > 0)
    spill = np.clip(np.minimum(r, b) - g, 0, None) * edge
    rgb[..., 0] -= spill
    rgb[..., 2] -= spill
    # 체인은 얇아 전부 가장자리다: 마젠타가 비친 분홍 · 초록 테두리를 회색 쪽으로 당긴다 (은색은 원래 무채색)
    gray = (rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    near = ndimage.binary_dilation(alpha < 0.5, iterations=4)[..., None] & (alpha[..., None] > 0)
    rgb = np.where(near, rgb * 0.1 + gray * 0.9, rgb)
    out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())


if __name__ == '__main__':
    key_magenta(Path(sys.argv[1])).save(sys.argv[2])
