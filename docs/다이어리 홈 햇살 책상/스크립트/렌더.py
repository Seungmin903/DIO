# -*- coding: utf-8 -*-
"""목업/장면.html#<장면> → 이미지/<장면>.jpg (크롬 헤드리스 2배) + 모음 그림(네 안 · 폰 · 시간대 · 전환)

실행:  python "docs/다이어리 홈 햇살 책상/스크립트/렌더.py"          전부
       python "docs/다이어리 홈 햇살 책상/스크립트/렌더.py" B안 기본   이름에 'B안 기본'이 들어간 장면만
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
SIZES = {"폰": PHONE, "색 근거": (1600, 480), "캐릭터 쓰임": (1600, 560)}


def size_of(name: str):
    for k, v in SIZES.items():
        if k in name:
            return v
    return TABLET


def scenes():
    src = (HERE / "목업" / "장면.js").read_text(encoding="utf-8")
    body = src[src.index("const NEW = {"):]
    return re.findall(r"^\s*'([^']+)':", body, re.M)


def shoot(name: str) -> Path:
    w, h = size_of(name)
    tmp = Path(tempfile.gettempdir()) / f"dio_sun_{abs(hash(name))}.png"
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
    y = 24 if img.width > img.height else img.height - 24 - size - pad * 1.6  # 폰은 상태 표시줄을 피해 아래에
    d.rounded_rectangle([24, y, 24 + tw + pad * 2, y + size + pad * 1.6], radius=14, fill=(11, 25, 87))
    d.text((24 + pad, y + pad * .6), text, font=f, fill="white")


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
    sheet(["A안 기본", "B안 기본", "C안 기본", "D안 기본"], ["A 다듬은 나무 책상", "B 햇살 한 조각", "C 창가", "D 햇살 카드"], 2, "모음 네 안", scale=.5)
    sheet(["A안 폰", "B안 폰", "C안 폰", "D안 폰"], ["A", "B", "C", "D"], 4, "모음 폰", scale=.6)
    sheet(["B안 아침", "B안 기본", "B안 밤"], ["아침", "오후", "밤"], 3, "모음 B안 시간대", scale=.5)
    sheet(["B안 전환 1", "B안 전환 2", "B안 전환 3", "B안 전환 4"], ["① 햇살 책상", "② 집어 들기 · 빛이 빠짐", "③ 그늘 = 앱 바탕", "④ 편집기"], 2, "모음 B안 전환", scale=.5)
    sheet(["B안 폰 한눈에", "B안 폰 빈 책상"], ["한눈에", "빈 책상"], 2, "모음 B안 폰 더", scale=.6)
    sheet(["00 지금 2안", "B안 기본"], ["지금 2안", "B 햇살 한 조각"], 2, "모음 지금과 B안", scale=.5)
    # A안 코덱스판
    sheet(["A2 지금", "A2 기본"], ["지금 앱", "A안 코덱스판"], 2, "모음 A2 지금과 A안", scale=.5)
    sheet(["A2 옆 표지 투명", "A2 기본"], ["옆 표지 투명도 .36 (지금 방식)", "채도 · 밝기만 낮춤"], 2, "모음 A2 옆 표지", scale=.5)
    sheet(["A2 빛 덮개 없음", "A2 기본"], ["바닥에만 빛", "표지 위까지 빛"], 2, "모음 A2 빛 덮개", scale=.5)
    sheet(["A2 한눈에 지금", "A2 한눈에"], ["지금 앱", "A안 코덱스판"], 2, "모음 A2 한눈에", scale=.5)
    sheet(["A2 폰 지금", "A2 폰"], ["지금 앱", "A안 코덱스판"], 2, "모음 A2 폰", scale=.8)
    codex_previews()


def codex_previews():
    """코덱스 원본 png → 문서용 jpg (PDF 크기를 줄인다)"""
    src = OUT / "코덱스"
    for name in ["A안 바탕 태블릿", "A안 바탕 태블릿 소품 없음", "A안 바탕 폰", "A안 빛 태블릿"]:
        im = Image.open(src / f"{name}.png")
        if im.mode == "RGBA":  # 빛 지도는 어두운 판 위에 얹어 보인다
            bg = Image.new("RGB", im.size, (46, 44, 60)); bg.paste(im, mask=im.split()[3]); im = bg
        im.convert("RGB").save(OUT / f"코덱스 {name}.jpg", quality=84, optimize=True)
    print("codex previews")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    only = " ".join(sys.argv[1:])
    if only != "--combos":
        for n in scenes():
            if not only or only in n:
                shoot(n)
    if not only or only == "--combos":
        combos()
