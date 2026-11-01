import json, html, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "지금 화면"
CROPS = HERE / "crops"
CROPS.mkdir(exist_ok=True)
data = json.loads((HERE / "세트.json").read_text(encoding="utf-8"))
CTX = 40
problems = []

for f in data:
    im = Image.open(SRC / f["file"]).convert("RGB")
    W, H = im.size
    x, y, w, h = f["box"]
    if x < 0 or y < 0 or x + w > W or y + h > H or w <= 0 or h <= 0:
        problems.append((f["no"], f"box {f['box']} outside image {W}x{H}"))
    x0, y0 = max(0, x - CTX), max(0, y - CTX)
    x1, y1 = min(W, x + w + CTX), min(H, y + h + CTX)
    c = im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * 2, (y1 - y0) * 2), Image.LANCZOS)
    d = ImageDraw.Draw(c)
    bx0, by0 = (max(x, 0) - x0) * 2, (max(y, 0) - y0) * 2
    bx1, by1 = (min(x + w, W) - x0) * 2, (min(y + h, H) - y0) * 2
    d.rectangle([bx0, by0, bx1 - 1, by1 - 1], outline="#E5484D", width=4)
    c.save(CROPS / f"{f['no']:02d}.png")

def chip(s):
    cls = "run" if s == "진行 中" else ""
    return f'<span class="chip {"run" if s == "진행 중" else "new"}">{html.escape(s)}</span>'

e = html.escape
css = """
@page { size: A4 landscape; margin: 12mm }
* { box-sizing: border-box }
body { margin:0; font-family:'Pretendard','Malgun Gothic',sans-serif; color:#0B1766; background:#fff; font-size:10.5pt; line-height:1.55 }
.page { break-after: page; height: 183mm; overflow: hidden }
.page:last-child { break-after: auto }
.chip { display:inline-block; padding:1px 10px; border-radius:999px; font-size:9pt; font-weight:600; border:1px solid #D9DCEF }
.chip.run { background:#DBDCF9 } .chip.new { background:#FEF0BF }
h1 { font-size:26pt; margin:6mm 0 2mm } .sub { color:#525FAD; margin:0 0 6mm }
.list { columns:2; column-gap:12mm; font-size:9.5pt } .list div { break-inside:avoid; padding:1.1mm 0; border-bottom:1px solid #D9DCEF; display:flex; gap:6px; align-items:center }
.list b { color:#606BB2; width:7mm; flex:none } .list .t { flex:1 }
header { display:flex; align-items:center; gap:4mm; border-bottom:2px solid #606BB2; padding-bottom:3mm; margin-bottom:5mm }
header .n { font-size:20pt; font-weight:700; color:#606BB2 } header h2 { font-size:15pt; margin:0; flex:1 }
header small { color:#525FAD; font-size:8.5pt }
.body { display:flex; gap:8mm } .l { width:55%; flex:none; display:flex; justify-content:center; align-items:flex-start }
.l img { max-width:100%; max-height:150mm; border:1px solid #D9DCEF; object-fit:contain }
.r { flex:1 } h3 { font-size:11pt; color:#606BB2; margin:0 0 1.5mm } .r p { margin:0 0 5mm }
ul { margin:0 0 5mm; padding-left:5mm } li { margin-bottom:1.5mm }
.memo { border:1px solid #D9DCEF; border-radius:3mm; padding:3mm 4mm } .memo div { color:#525FAD }
"""
pages = ['<section class="page"><h1>코덱스가 본 DIO의 안 예쁜 곳</h1>'
         '<p class="sub">2026-10-31 · 코덱스 판단 · 화면은 2026-10-31 오전 기준</p><div class="list">']
for f in data:
    pages.append(f'<div><b>{f["no"]}</b><span class="t">{e(f["title"])}</span>{chip(f["status"])}</div>')
pages.append('</div></section>')
for f in data:
    fix = "".join(f"<li>{e(t)}</li>" for t in f["fix"])
    memo = ""
    if f["fixSketch"]["kind"] != "none":
        memo = f'<div class="memo"><h3>고친 모습 메모</h3><div>{e(f["fixSketch"]["note"])}</div></div>'
    pages.append(f'''<section class="page"><header><span class="n">{f["no"]}</span><h2>{e(f["title"])}</h2>{chip(f["status"])}<small>{e(f["file"])}</small></header>
<div class="body"><div class="l"><img src="crops/{f["no"]:02d}.png"></div><div class="r"><h3>왜 안 예쁜지</h3><p>{e(f["why"])}</p><h3>이렇게 고치면</h3><ul>{fix}</ul>{memo}</div></div></section>''')
doc = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>코덱스 안 예쁜 곳</title><style>{css}</style></head><body>{"".join(pages)}</body></html>'
hp = HERE / "안 예쁜 곳.html"
hp.write_text(doc, encoding="utf-8")
pdf = HERE / "코덱스 안 예쁜 곳.pdf"
subprocess.run([r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "--headless=new", "--disable-gpu",
                "--no-pdf-header-footer", f"--print-to-pdf={pdf}", hp.as_uri()], check=True)
try:
    from pypdf import PdfReader
    print("pages:", len(PdfReader(str(pdf)).pages))
except ImportError:
    print("pages:", pdf.read_bytes().count(b"/Type /Page") - 1)
print("problems:", problems)
