# -*- coding: utf-8 -*-
"""시안/벡터원본/*.svg → 시안/*.jpg (크롬 헤드리스, 2배). 실행: python 렌더.py [이름접두어]
아이콘/벡터원본/*.svg → 아이콘/*.png 도 같은 방식 (python 렌더.py --icons)."""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
CONCEPTS = HERE.parent / "시안"
ICONS = HERE.parent / "아이콘"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def size_of(svg_text):
    m = re.search(r'width="(\d+)" height="(\d+)"', svg_text)
    return int(m.group(1)), int(m.group(2))


def render(svg_path, out_dir, scale=2, fmt="jpg"):
    tmp = svg_path.parent / f"_tmp-{os.getpid()}"
    tmp.mkdir(exist_ok=True)
    txt = svg_path.read_text(encoding="utf-8")
    W, H = size_of(txt)
    page = tmp / (svg_path.stem + ".html")
    page.write_text(f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#fff;overflow:hidden}}</style></head><body>{txt}</body></html>', encoding="utf-8")
    png = tmp / (svg_path.stem + ".png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={scale}", "--virtual-time-budget=8000",
                    f"--window-size={W},{H}", f"--screenshot={png}", page.resolve().as_uri()], check=True, capture_output=True, timeout=120)
    out = out_dir / f"{svg_path.stem}.{fmt}"
    im = Image.open(png)
    if fmt == "jpg":
        im.convert("RGB").save(out, quality=86, optimize=True)
    else:
        im.save(out, optimize=True)
    shutil.rmtree(tmp, ignore_errors=True)
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--icons" in args:
        src, out, fmt = ICONS / "벡터원본", ICONS, "png"
        args.remove("--icons")
    else:
        src, out, fmt = CONCEPTS / "벡터원본", CONCEPTS, "jpg"
    prefix = args[0] if args else ""
    for p in sorted(src.glob(f"{prefix}*.svg")):
        o = render(p, out, fmt=fmt)
        print("ok", o.name, o.stat().st_size // 1024, "KB")
