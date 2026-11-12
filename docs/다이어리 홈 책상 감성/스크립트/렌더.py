# -*- coding: utf-8 -*-
"""목업/장면.html#<장면> → 이미지/<번호> <장면>.jpg (크롬 헤드리스 2배) + 모음 그림(스토리보드 · 비교)

실행:  python "docs/다이어리 홈 책상 감성/스크립트/렌더.py"          전부
       python "docs/다이어리 홈 책상 감성/스크립트/렌더.py" 1안 기본   이름에 '1안 기본'이 들어간 장면만
필요:  pip install pillow · 크롬 · 인터넷(글씨체)
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent.parent
PAGE = HERE / "목업" / "장면.html"
OUT = HERE / "이미지"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
FONT = r"C:\Windows\Fonts\malgunbd.ttf"

# 장면 이름 → (파일 번호, 창 크기)
TABLET, PHONE = (1280, 800), (390, 844)
SIZES = {"폰": PHONE, "층 구조": (1600, 1240), "소품 도감": (1600, 1200), "표지 디테일": (1600, 1000)}


def size_of(name: str):
    for k, v in SIZES.items():
        if k in name:
            return v
    return TABLET


def scenes():
    src = (HERE / "목업" / "장면.js").read_text(encoding="utf-8")
    body = src[src.index("const SCENES = {"):]
    return [n for n in re.findall(r"^\s*'([^']+)':", body, re.M) if n != "폰 전환 비교"]


def shoot(name: str) -> Path:
    w, h = size_of(name)
    tmp = Path(tempfile.gettempdir()) / f"dio_desk_{abs(hash(name))}.png"
    url = PAGE.resolve().as_uri() + "#" + name
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--window-size={w},{h}", "--virtual-time-budget=6000", "--allow-file-access-from-files",
                    f"--screenshot={tmp}", url], check=True, capture_output=True, timeout=120)
    out = OUT / f"{name}.jpg"
    Image.open(tmp).convert("RGB").save(out, quality=86, optimize=True)
    tmp.unlink(missing_ok=True)
    print("ok", out.name)
    return out


def label(img: Image.Image, text: str, size=34):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, size)
    pad = 14
    tw = d.textlength(text, font=f)
    d.rounded_rectangle([24, 24, 24 + tw + pad * 2, 24 + size + pad * 1.6], radius=14, fill=(11, 25, 87))
    d.text((24 + pad, 24 + pad * .6), text, font=f, fill="white")


def sheet(names, labels, cols, out_name, gap=28, scale=1.0, bg=(246, 246, 244)):
    ims = [Image.open(OUT / f"{n}.jpg") for n in names]
    ims = [im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS) for im in ims]
    for im, t in zip(ims, labels):
        if t:
            label(im, t, size=int(34 * max(scale, .6) / .6 * .6) if scale < 1 else 34)
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * w + (cols + 1) * gap, rows * h + (rows + 1) * gap), bg)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        canvas.paste(im, (gap + c * (w + gap), gap + r * (h + gap)))
    canvas.save(OUT / f"{out_name}.jpg", quality=86, optimize=True)
    print("sheet", out_name)


def combos():
    sheet(["전환 1", "전환 2", "전환 3", "전환 4"], ["① 책상", "② 집어 들기", "③ 펼치기", "④ 편집기"], 2, "모음 전환 스토리보드", scale=.5)
    sheet(["계절 봄", "계절 여름", "계절 가을", "계절 겨울"], ["봄", "여름", "가을", "겨울"], 2, "모음 계절", scale=.5)
    sheet(["2안 아침", "2안 기본", "2안 밤"], ["아침", "오후", "밤"], 3, "모음 2안 시간대", scale=.5)
    sheet(["X 예시", "1안 기본"], ["✕ 감성이 UI를 덮음", "○ 감성은 바닥에만"], 2, "모음 OX 비교", scale=.5)
    sheet(["1안 폰", "1안 폰 한눈에", "2안 폰", "3안 폰", "6안 폰"], ["1안", "1안 한눈에", "2안", "3안", "6안"], 5, "모음 폰", scale=.6)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    only = " ".join(sys.argv[1:])
    if only != "--combos":
        for n in scenes():
            if not only or only in n:
                shoot(n)
    if not only or only == "--combos":
        combos()
