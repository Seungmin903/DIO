# -*- coding: utf-8 -*-
"""원 페이저.json + 지금 화면/ + 목업/ → 이미지/ → 앱 디자인 점검 원 페이저.html → .pdf

실행:  python "docs/앱 디자인 점검 원 페이저/빌드.py"            (어디서나, PYTHONIOENCODING=utf-8 권장)
       python "docs/앱 디자인 점검 원 페이저/빌드.py" --no-pdf   HTML까지만
필요:  Pillow · 크롬(목업 렌더와 PDF). json이 원본이다.
한 쪽 = 한 항목: 왼쪽 '안 예쁜 부분 · 이유'(지금 화면을 잘라 빨간 네모), 오른쪽 '바꿀 방향 · 좋은 이유'(목업 그림).
"""
import html
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / "원 페이저.json").read_text(encoding="utf-8"))
SHOTS = HERE / "지금 화면"
MOCKS = HERE / "목업"
IMG = HERE / "이미지"
OUT_HTML = HERE / "앱 디자인 점검 원 페이저.html"
OUT_PDF = HERE / "앱 디자인 점검 원 페이저.pdf"
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "google-chrome", "chrome", "chromium"]
RED = "#E5484D"  # 문서 표시용(앱 UI 색 아님)
e = html.escape


def chrome():
    found = next((c for c in CHROME if Path(c).exists() or shutil.which(c)), None)
    if not found:
        sys.exit("크롬이 없어 목업 · PDF를 만들지 못했어요.")
    return found


def crop(item):
    """지금 화면에서 문제 부분을 보여 주고 빨간 네모를 친다. box 는 화면 비율 [x, y, w, h].
    whole = 화면 전체, view = 보여 줄 영역(비율), 둘 다 없으면 box 둘레 pad. grid = 화면 여러 장을 2열로 붙인다(네모 없음)."""
    if item.get("grid"):
        return grid(item)
    im = Image.open(SHOTS / f"{item['shot']}.png").convert("RGB")
    W, H = im.size
    x, y, w, h = item["box"]
    pad = item.get("pad", 0.06)
    if item.get("whole"):
        x0, y0, x1, y1 = 0, 0, W, H
    elif item.get("view"):
        vx, vy, vw, vh = item["view"]
        x0, y0, x1, y1 = round(vx * W), round(vy * H), round((vx + vw) * W), round((vy + vh) * H)
    else:
        x0, y0 = max(0, round((x - pad) * W)), max(0, round((y - pad) * H))
        x1, y1 = min(W, round((x + w + pad) * W)), min(H, round((y + h + pad) * H))
    c = im.crop((x0, y0, x1, y1))
    d = ImageDraw.Draw(c)
    if not item.get("nobox"):
        d.rectangle([round(x * W) - x0, round(y * H) - y0, round((x + w) * W) - x0 - 1, round((y + h) * H) - y0 - 1],
                    outline=RED, width=max(4, round(c.width / 220)))
    out = IMG / f"지금 {item['no']:02d}.png"
    c.save(out)
    return out.name


def grid(item):
    ims = [Image.open(SHOTS / f"{name}.png").convert("RGB") for name in item["grid"]]
    w, h = ims[0].width // 2, ims[0].height // 2
    gap = 24
    sheet = Image.new("RGB", (w * 2 + gap, h * 2 + gap), "#FFFFFF")
    for i, im in enumerate(ims):
        sheet.paste(im.resize((w, h), Image.LANCZOS), ((i % 2) * (w + gap), (i // 2) * (h + gap)))
        ImageDraw.Draw(sheet).rectangle([(i % 2) * (w + gap), (i // 2) * (h + gap), (i % 2) * (w + gap) + w - 1, (i // 2) * (h + gap) + h - 1], outline="#D9DCEF", width=2)
    out = IMG / f"지금 {item['no']:02d}.png"
    sheet.save(out)
    return out.name


def render_mock(item, exe):
    src = MOCKS / f"{item['no']:02d}.html"
    out = IMG / f"목업 {item['no']:02d}.png"
    w, h = item["mockSize"]
    subprocess.run([exe, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--window-size={w},{h}", f"--screenshot={out}", src.as_uri()], check=True, timeout=120,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out.name


CSS = """
@page { size: A4 landscape; margin: 9mm 11mm; }
* { box-sizing: border-box; }
body { margin:0; font-family:'Pretendard','Malgun Gothic',sans-serif; color:#0B1766; font-size:9.6pt; line-height:1.5; }
.page { break-after: page; height: 190mm; overflow: hidden; display:flex; flex-direction:column; }
.page:last-child { break-after: auto; }
header { display:flex; align-items:baseline; gap:4mm; border-bottom:1.5px solid #606BB2; padding-bottom:2mm; margin-bottom:3.5mm; }
header .n { font-size:19pt; font-weight:800; color:#606BB2; min-width:10mm; }
header h2 { font-size:15pt; font-weight:700; margin:0; flex:1; }
header small { color:#525FAD; font-size:8.3pt; }
.cols { display:grid; grid-template-columns: 1fr 1fr; gap:7mm; flex:1; min-height:0; }
.col { display:flex; flex-direction:column; min-height:0; }
.tag { display:inline-block; font-size:8.5pt; font-weight:700; padding:0.6mm 3mm; border-radius:99px; margin-bottom:2mm; align-self:flex-start; }
.tag.bad { background:#F0F1F9; color:#525FAD; border:1px solid #D9DCEF; }
.tag.fix { background:#FEF0BF; color:#0B1766; }
figure { margin:0 0 2.5mm; height:88mm; display:flex; align-items:center; justify-content:center; background:#F0F1F9; border-radius:3mm; overflow:hidden; }
figure img { max-width:100%; max-height:88mm; object-fit:contain; display:block; }
h3 { font-size:10pt; margin:0 0 1mm; color:#606BB2; }
p { margin:0 0 2mm; } ul { margin:0 0 2mm; padding-left:4.5mm; } li { margin-bottom:0.8mm; }
.cover h1 { font-size:26pt; margin:8mm 0 2mm; } .cover .sub { color:#525FAD; margin:0 0 5mm; }
.verdict { background:#F0F1F9; border-radius:3mm; padding:4mm 5mm; margin-bottom:5mm; font-size:10.5pt; }
.list { columns:2; column-gap:10mm; font-size:9.5pt; }
.list div { break-inside:avoid; padding:1.2mm 0; border-bottom:1px solid #D9DCEF; display:flex; gap:3mm; }
.note { font-size:8.2pt; color:#525FAD; border-top:1px dashed #D9DCEF; padding-top:1.5mm; margin-top:auto; }
.list b { color:#606BB2; width:7mm; flex:none; } .list span.s { color:#525FAD; margin-left:auto; font-size:8.3pt; }
"""


def main():
    IMG.mkdir(exist_ok=True)
    exe = chrome()
    meta, items = DATA["meta"], DATA["items"]
    pages = [f"""<section class="page cover"><h1>{e(meta['title'])}</h1><p class="sub">{e(meta['sub'])}</p>
<div class="verdict">{meta['verdict']}</div><div class="list">"""
             + "".join(f"<div><b>{i['no']}</b><span>{e(i['title'])}</span><span class='s'>{e(i['area'])}</span></div>" for i in items)
             + "</div></section>"]
    for i in items:
        now, mock = crop(i), render_mock(i, exe)
        fix = "".join(f"<li>{e(t)}</li>" for t in i["fix"])
        note = f"<p class='note'>클로드 보정 · {e(i['note'])}</p>" if i.get("note") else ""
        pages.append(f"""<section class="page"><header><span class="n">{i['no']:02d}</span><h2>{e(i['title'])}</h2><small>{e(' · '.join(i['screens']))}</small></header>
<div class="cols"><div class="col"><span class="tag bad">안 예쁜 부분</span><figure><img src="이미지/{now}"></figure>
<p>{e(i['bad'])}</p><h3>안 예쁜 이유</h3><p>{e(i['why'])}</p></div>
<div class="col"><span class="tag fix">바꿀 수 있는 방향</span><figure><img src="이미지/{mock}"></figure>
<ul>{fix}</ul><h3>그게 좋은 이유</h3><p>{e(i['good'])}</p>{note}</div></div></section>""")
    OUT_HTML.write_text(f"<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>{e(meta['title'])}</title><style>{CSS}</style></head><body>{''.join(pages)}</body></html>", encoding="utf-8")
    print("HTML:", OUT_HTML)
    if "--no-pdf" in sys.argv:
        return
    subprocess.run([exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--window-size=1600,1000",
                    f"--print-to-pdf={OUT_PDF}", OUT_HTML.as_uri()], check=True, timeout=180,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("PDF:", OUT_PDF)


if __name__ == "__main__":
    main()
