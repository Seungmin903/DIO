# -*- coding: utf-8 -*-
"""코덱스 바탕 그림 → 빛 지도 (표지 위에 같은 창빛을 얹기 위한 투명 PNG)

창빛이 닿은 곳은 바탕보다 밝다. 바탕 나무색과 창빛 밝기를 재서 0~1 로 펴고, 창빛 판 밖(소품 자리)은 지운다.
실행:  python "docs/다이어리 홈 햇살 책상/스크립트/빛지도.py"
결과:  이미지/코덱스/A안 빛 <태블릿|폰>.png (밝은 곳 = 불투명한 크림색) · A안 그늘 <태블릿|폰>.png (빛 밖 = 불투명한 갈색)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent.parent / "이미지" / "코덱스"
# 그림 비율 기준 창빛 판 범위 (x0, y0, x1, y1). 이 밖의 밝은 것(머그 · 화분)은 빛이 아니다.
AREA = {"태블릿": (0.14, 0.13, 0.82, 0.79), "폰": (0.0, 0.25, 1.0, 0.74)}


def build(name: str) -> None:
    src = Image.open(HERE / f"A안 바탕 {name}.png").convert("L").filter(ImageFilter.GaussianBlur(3))
    lum = np.asarray(src, dtype=np.float32)
    h, w = lum.shape
    x0, y0, x1, y1 = AREA[name]
    inside = lum[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    base, lit = np.percentile(lum, 30), np.percentile(inside, 92)  # 그늘진 나무 · 창빛
    m = np.clip((lum - base) / (lit - base), 0, 1)
    keep = np.zeros_like(m)
    keep[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 1
    keep = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18)), dtype=np.float32) / 255
    alpha = (m * keep * 255).astype(np.uint8)
    out = Image.new("RGBA", (w, h), (255, 244, 214, 0))
    out.putalpha(Image.fromarray(alpha))
    out.save(HERE / f"A안 빛 {name}.png", optimize=True)
    # 그늘: 창빛 밖은 모두 그늘이다 (소품 자리도 표지 입장에서는 그늘)
    shade = Image.new("RGBA", (w, h), (120, 88, 78, 0))
    shade.putalpha(Image.fromarray(((1 - m * keep) * 255).astype(np.uint8)))
    shade.save(HERE / f"A안 그늘 {name}.png", optimize=True)
    print(name, "base", round(float(base)), "lit", round(float(lit)))


if __name__ == "__main__":
    for n in AREA:
        build(n)
