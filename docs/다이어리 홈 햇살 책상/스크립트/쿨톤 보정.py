# -*- coding: utf-8 -*-
"""웜톤 시안 → 쿨톤 시안. 상판 · 창빛처럼 '밝고 채도 낮은 따뜻한 색'만 차갑게 옮긴다.

표지 · 사진 · 캐릭터 · 테이프처럼 채도가 있는 색과 흰 버튼은 그대로라 글자 · 소품이 픽셀 그대로 남는다.
옮기는 양은 코덱스가 그린 쿨톤판(1안)의 상판 변화(R −6 · G +3 · B +16 안팎)에 맞췄다.
실행: python "스크립트/쿨톤 보정.py" <폴더>   ← 폴더 안 '*웜톤*.png' 마다 '*쿨톤*.png' 를 만든다
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def cool(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = .2126 * r + .7152 * g + .0722 * b
    chroma = rgb.max(-1) - rgb.min(-1)
    warm = np.clip(r - b, 0, None)  # 따뜻한 정도
    w = smooth(lum, 160, 205) * (1 - smooth(chroma, 26, 46))  # 밝고 채도 낮은 곳만
    out = np.stack([r - w * .30 * warm, g + w * .15 * warm, b + w * .90 * warm], -1)
    return np.clip(out, 0, 255)


def main(folder: Path) -> None:
    for src in sorted(folder.glob('*웜톤*.png')):
        im = Image.open(src).convert('RGB')
        out = cool(np.asarray(im).astype(np.float32)).astype(np.uint8)
        dst = src.with_name(src.name.replace('웜톤', '쿨톤'))
        Image.fromarray(out).save(dst, optimize=True)
        print('ok', dst.name)


if __name__ == '__main__':
    main(Path(sys.argv[1]))
