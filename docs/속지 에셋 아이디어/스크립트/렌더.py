# -*- coding: utf-8 -*-
"""분류표.py 의 모든 항목을 SVG → JPG 로 렌더 (크롬 헤드리스)

실행 (스크립트/ 안에서 또는 어디서나):
  python 렌더.py                 전부
  python 렌더.py --only po       접두어(po · pn · ao · an)만
  python 렌더.py --only po-blank 항목 하나
  python 렌더.py --svg-only      SVG만 만들고 JPG 생략
  python 렌더.py --contact       카테고리별 모음 시트(목업/_모음 <분류>.jpg)도 만든다
결과: 목업/벡터원본/<분류> <이름>.svg · 목업/<분류> <이름>.jpg  (이름은 분류표.파일이름 규칙)
"""
import importlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import 목업_도형  # noqa: E402
from 분류표 import CATEGORIES, PREFIX_KO, 파일이름  # noqa: E402

MOCK = HERE.parent / "목업"
SVG = MOCK / "벡터원본"
CHROME = next((c for c in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", "google-chrome", "chrome"]
               if Path(c).exists() or shutil.which(c)), None)


def resolve(fn_path):
    mod, fn = fn_path.rsplit(".", 1)
    try:
        m = importlib.import_module(mod)
    except ModuleNotFoundError:
        return None
    return getattr(m, fn, None)


def build_svg(cat, it):
    W, H = cat["canvas"]
    fn = resolve(it["fn"])
    if fn is None:
        return None
    body = "".join(fn(W, H, True) if W == 1024 else fn(W, H))
    return 목업_도형.frame(W, H, body, it["title"])


def render_jpg(svg_path, W, H, scale, out_jpg, tmp):
    from PIL import Image
    page = tmp / (svg_path.stem + ".html")
    page.write_text(f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#fff;overflow:hidden}}</style></head><body>{svg_path.read_text(encoding="utf-8")}</body></html>', encoding="utf-8")
    png = tmp / (svg_path.stem + ".png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={scale}", "--virtual-time-budget=8000",
                    f"--window-size={W},{H}", f"--screenshot={png}", page.resolve().as_uri()], check=True, capture_output=True, timeout=90)
    Image.open(png).convert("RGB").save(out_jpg, quality=84, optimize=True)


def contact_sheet(prefix, items, cols=4):
    from PIL import Image, ImageDraw
    imgs = [(it, MOCK / f"{파일이름(prefix, it)}.jpg") for it in items]
    imgs = [(it, p) for it, p in imgs if p.exists()]
    if not imgs:
        return
    tw = 360
    th = int(tw * (Image.open(imgs[0][1]).height / Image.open(imgs[0][1]).width))
    rows = -(-len(imgs) // cols)
    sheet = Image.new("RGB", (cols * (tw + 16) + 16, rows * (th + 40) + 16), "#F3F1EA")
    d = ImageDraw.Draw(sheet)
    for i, (it, p) in enumerate(imgs):
        r, c = divmod(i, cols)
        x, y = 16 + c * (tw + 16), 16 + r * (th + 40)
        sheet.paste(Image.open(p).resize((tw, th)), (x, y))
        d.text((x, y + th + 6), f"{prefix}-{it['id']}", fill="#333")
    out = MOCK / f"_모음 {PREFIX_KO[prefix]}.jpg"
    sheet.save(out, quality=80)
    print("contact:", out)


def main():
    args = sys.argv[1:]
    only = args[args.index("--only") + 1] if "--only" in args else None
    svg_only = "--svg-only" in args
    MOCK.mkdir(exist_ok=True); SVG.mkdir(exist_ok=True)
    tmp = SVG / f"_tmp-{os.getpid()}"; tmp.mkdir(exist_ok=True)
    done = missing = 0
    try:
        for cat in CATEGORIES:
            W, H = cat["canvas"]
            scale = 1.5 if W == 1024 else 2
            for grp in cat["groups"]:
                for it in grp["items"]:
                    key = f"{cat['prefix']}-{it['id']}"      # 코드용 식별자 (--only 비교 · 로그)
                    name = 파일이름(cat["prefix"], it)          # 실제 파일 이름
                    if only and not (key == only or key.startswith(only + "-") or cat["prefix"] == only):
                        continue
                    svg = build_svg(cat, it)
                    if svg is None:
                        print("  missing fn:", key, "->", it["fn"]); missing += 1; continue
                    svg_path = SVG / f"{name}.svg"
                    svg_path.write_text(svg, encoding="utf-8")
                    if not svg_only:
                        if not CHROME:
                            print("chrome 없음"); return
                        render_jpg(svg_path, W, H, scale, MOCK / f"{name}.jpg", tmp)
                    print("  ok", key); done += 1
            if "--contact" in args and (not only or only == cat["prefix"]):
                contact_sheet(cat["prefix"], [it for g in cat["groups"] for it in g["items"]])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"done {done} · missing {missing}")


if __name__ == "__main__":
    main()
