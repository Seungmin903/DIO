# -*- coding: utf-8 -*-
"""md 여러 개(색인 · 01~NN) → 스터디 플래너 속지.html 한 파일 → (크롬 헤드리스) 스터디 플래너 속지.pdf

실행:  python "docs/스터디 플래너 속지/빌드.py"            (저장소 루트 또는 어디서나)
       python "docs/스터디 플래너 속지/빌드.py" --no-pdf   HTML만
필요:  pip install markdown pillow · 크롬 설치(PDF 단계, 없으면 HTML만 만든다)
순서:  스크립트/스크린샷찍기.py · 렌더.py → 이 스크립트. md가 원본이다.
"""
import html
import re
import shutil
import subprocess
import sys
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

HERE = Path(__file__).resolve().parent
DOCS = ["색인.md", "01 레퍼런스 조사.md", "02 인터랙션 기능.md", "03 디자인.md"]
OUT_HTML = HERE / "스터디 플래너 속지.html"
OUT_PDF = HERE / "스터디 플래너 속지.pdf"
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", "google-chrome", "chrome", "chromium"]


def doc_id(name: str) -> str:
    return "doc-" + (name[:2] if name[:2].isdigit() else "idx")


def convert(name: str) -> str:
    text = (HERE / name).read_text(encoding="utf-8")
    # 문서 간 링크 → 같은 페이지 앵커
    text = re.sub(r"\]\((0\d%20[^)#\s]+\.md)#([^)]+)\)", r"](#\2)", text)
    text = re.sub(r"\]\((0\d%20[^)#\s]+\.md)\)", lambda m: f"](#{doc_id(m.group(1))})", text)
    text = text.replace("](색인.md)", "](#doc-idx)")
    text = re.sub(r"\[(0\d [^\]#]+)\.md\]\(#", r"[\1](#", text)
    md = markdown.Markdown(extensions=["tables", "toc", "sane_lists", "fenced_code", "md_in_html", "attr_list"],
                           extension_configs={"toc": {"slugify": slugify_unicode, "separator": "-"}})
    body = shape(md.convert(text))
    title = re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S)
    title = re.sub(r"<[^>]+>", "", title.group(1)) if title else name
    return f'<section class="doc" id="{doc_id(name)}" data-title="{html.escape(title)}">\n{body}\n</section>'


def shape(body: str) -> str:
    """h2 절 단위로 블록을 감싸 PDF에서 가능하면 한 쪽에 담기게 한다."""
    parts = re.split(r"(?=<h[23][ >])", body)
    out, h2 = [], None

    def close():
        nonlocal h2
        if h2 is not None:
            out.append(f'<div class="sec2{" has3" if any(p.startswith("<h3") for p in h2) else ""}">{"".join(h2)}</div>')
            h2 = None

    for p in parts:
        if p.startswith("<h2"):
            close(); h2 = [p]
        elif p.startswith("<h3"):
            (h2 if h2 is not None else out).append(f'<div class="sec3">{p}</div>')
        elif h2 is not None:
            h2.append(p)
        else:
            out.append(p)
    close()
    return "".join(out)


CSS = """
:root { --ink:#0B1957; --text:#1D1D1F; --muted:#6B7280; --line:#E1E6F0; --bg:#FFFFFF; --soft:#F3F5FA; --accent:#6E92C6; --accent-soft:#EAF0FA; --cream:#FEF0BF; --lilac:#DBDCF9; --danger:#E5484D; --danger-soft:#FDECEC; --ok:#1E9E6A; --ok-soft:#E7F6EF; --warn-soft:#FFF6DB; }
* { box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.65 "Pretendard","Nanum Gothic","Malgun Gothic","Noto Sans KR",sans-serif; word-break:keep-all; }
a { color:var(--accent); text-decoration:none; } a:hover { text-decoration:underline; }
.wrap { display:grid; grid-template-columns:240px minmax(0,1fr); min-height:100vh; }
nav { position:sticky; top:0; height:100vh; overflow:auto; padding:24px 16px; border-right:1px solid var(--line); background:var(--soft); }
nav .brand { font-weight:800; font-size:13px; letter-spacing:.06em; color:var(--muted); margin-bottom:12px; }
nav ol { list-style:none; margin:0; padding:0; } nav li { margin:0 0 4px; }
nav a { display:block; padding:7px 10px; border-radius:8px; color:var(--text); font-size:13.5px; line-height:1.35; }
nav a:hover, nav a.on { background:var(--accent-soft); color:var(--accent); text-decoration:none; }
nav .hint { margin-top:20px; font-size:12px; color:var(--muted); line-height:1.5; }
main { padding:32px 48px 96px; max-width:1280px; }
.doc { padding-bottom:40px; margin-bottom:40px; border-bottom:2px solid var(--line); } .doc:last-child { border-bottom:0; }
h1 { font-size:27px; margin:8px 0 16px; line-height:1.3; color:var(--ink); } h2 { font-size:20px; margin:40px 0 12px; padding-top:8px; border-top:1px solid var(--line); color:var(--ink); } h3 { font-size:16px; margin:28px 0 8px; color:var(--ink); } h4 { font-size:14px; margin:18px 0 6px; }
blockquote { margin:0 0 20px; padding:12px 16px; background:var(--accent-soft); border-left:4px solid var(--accent); border-radius:0 8px 8px 0; font-size:13.5px; color:#374151; } blockquote p { margin:0; }
table { border-collapse:collapse; width:100%; margin:12px 0 20px; font-size:13px; line-height:1.5; display:block; overflow-x:auto; }
thead th { background:var(--soft); text-align:left; font-weight:700; }
th, td { border:1px solid var(--line); padding:7px 9px; vertical-align:top; }
tbody tr:nth-child(even) td { background:#FAFBFD; }
td:first-child, th:first-child { white-space:nowrap; }
table.wrapcol td:first-child, table.wrapcol th:first-child { white-space:normal; }
img { max-width:100%; height:auto; border:1px solid var(--line); border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
code { font:12.5px/1.4 ui-monospace,Consolas,monospace; background:var(--soft); padding:1px 5px; border-radius:4px; }
pre { background:var(--soft); padding:10px 14px; border-radius:8px; overflow:auto; font-size:12px; } pre code { background:none; padding:0; }
li { margin:3px 0; } hr { border:0; border-top:1px solid var(--line); margin:28px 0; } strong { font-weight:800; }
figure { margin:0; } figcaption { margin-top:6px; font-size:12.5px; line-height:1.45; color:#374151; }
/* 스크린샷 · 이미지 묶음 */
.shots { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px 20px; margin:14px 0 18px; }
.shots img { width:100%; display:block; max-height:520px; object-fit:cover; object-position:top; }
.shots.three { grid-template-columns:repeat(3, minmax(0,1fr)); } .shots.three img { max-height:400px; }
.shots.profile img { max-height:none; object-fit:contain; }
.shots.four { grid-template-columns:repeat(4, minmax(0,1fr)); } .shots.four img { max-height:none; object-fit:contain; }
.wide img { width:100%; display:block; }
.grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:18px 20px; margin:14px 0 18px; }
.grid.two { grid-template-columns:repeat(2, minmax(0,1fr)); } .grid.four { grid-template-columns:repeat(4, minmax(0,1fr)); } .grid.five { grid-template-columns:repeat(5, minmax(0,1fr)); }
.grid img { width:100%; display:block; background:#fff; }
.grid figcaption { font-size:12.5px; }
.note { font-size:12.5px; color:var(--muted); }
.xtl { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; margin:14px 0 18px; }
.xp { border:1px solid var(--line); border-radius:14px; padding:12px 14px; background:#fff; break-inside:avoid; font-size:13.5px; line-height:1.5; }
.xh { display:flex; gap:8px; align-items:center; } .xh .av { width:34px; height:34px; border-radius:50%; object-fit:cover; flex:none; } .xh b { font-size:13.5px; } .xh span { color:var(--muted); font-size:11.5px; display:block; } .xh i { margin-left:auto; font-style:normal; font-size:11px; background:var(--accent-soft); color:var(--ink); border-radius:8px; padding:1px 7px; white-space:nowrap; }
.xp p { margin:8px 0; } .xi { width:100%; border-radius:10px; border:1px solid var(--line); display:block; max-height:300px; object-fit:contain; background:var(--soft); }
.xr { margin-top:6px; padding:5px 9px; border-radius:8px; font-size:12px; background:var(--soft); } .xr.a { background:var(--accent-soft); margin-left:14px; }
.xn { margin-top:8px; font-size:11.5px; color:var(--muted); border-top:1px dashed var(--line); padding-top:6px; }
.kpi { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin:12px 0 20px; }
.kpi div { border:1px solid var(--line); border-radius:10px; padding:12px 14px; background:var(--soft); }
.kpi b { display:block; font-size:22px; line-height:1.2; margin-bottom:4px; color:var(--ink); } .kpi span { font-size:12px; color:var(--muted); line-height:1.4; display:block; }
/* 강조 상자 */
.warn, .ok, .info, .stop { border-radius:10px; padding:12px 16px; margin:14px 0 18px; font-size:13.5px; line-height:1.6; }
.warn { background:var(--warn-soft); border:1px solid #F0D98A; } .ok { background:var(--ok-soft); border:1px solid #B9E3D0; } .info { background:var(--accent-soft); border:1px solid #CBD9F0; } .stop { background:var(--danger-soft); border:1px solid #F5C2C4; }
.warn p, .ok p, .info p, .stop p { margin:4px 0; } .warn ul, .ok ul, .info ul, .stop ul { margin:4px 0; padding-left:20px; }
.tag { display:inline-block; padding:0 7px; border-radius:999px; font-size:11.5px; font-weight:800; line-height:1.6; white-space:nowrap; }
.tag.hi { background:#FDECEC; color:#B3262B; } .tag.mid { background:#FFF1C9; color:#8A5A00; } .tag.lo { background:#E7F6EF; color:#157A52; } .tag.ref { background:#EAF0FA; color:#2F4E8E; }
@media (max-width:900px) { .wrap { grid-template-columns:1fr; } nav { position:static; height:auto; border-right:0; border-bottom:1px solid var(--line); } main { padding:20px 16px 60px; } .grid, .shots, .shots.three, .kpi { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media print {
  @page { size:A4 landscape; margin:11mm 12mm 13mm; }
  body { font-size:11px; } .wrap { display:block; } nav { display:none; } main { padding:0; max-width:none; }
  .doc { break-before:page; border:0; margin:0; padding:0; } .doc:first-child { break-before:auto; }
  h1 { font-size:22px; } h2 { font-size:16px; break-after:avoid; margin-top:6mm; } h3 { font-size:13px; break-after:avoid; }
  table { display:table; font-size:9.3px; } tr { break-inside:avoid; } thead { display:table-header-group; }
  img { box-shadow:none; }
  .sec2, .sec3 { break-inside:auto; } h2 + p, h3 + p { break-after:avoid; }
  .grid { grid-template-columns:repeat(3, minmax(0,1fr)) !important; gap:4mm 5mm; margin:3mm 0 4mm; } .grid.two { grid-template-columns:repeat(2, minmax(0,1fr)) !important; } .grid.four { grid-template-columns:repeat(4, minmax(0,1fr)) !important; } .grid.five { grid-template-columns:repeat(5, minmax(0,1fr)) !important; }
  .grid figure { break-inside:avoid; } .grid img { max-height:150mm; width:auto; max-width:100%; margin:0 auto; object-fit:contain; } .grid figcaption { text-align:center; } .grid figcaption { font-size:9px; margin-top:1.5mm; }
  .shots { grid-template-columns:repeat(2, minmax(0,1fr)) !important; gap:4mm 5mm; margin:3mm 0 4mm; } .shots.three { grid-template-columns:repeat(3, minmax(0,1fr)) !important; } .shots.four { grid-template-columns:repeat(4, minmax(0,1fr)) !important; }
  .shots img { max-height:118mm; } .shots.three img { max-height:92mm; } .shots.profile img, .shots.four img { max-height:none; } .shots figcaption { font-size:9px; } .shots figure { break-inside:avoid; }
  .wide { break-inside:avoid; } .wide img { width:auto; max-width:100%; max-height:160mm; margin:0 auto; display:block; } .wide figcaption { font-size:9px; text-align:center; }
  .kpi { grid-template-columns:repeat(4, minmax(0,1fr)) !important; gap:3mm; } .kpi b { font-size:16px; } .kpi span { font-size:9px; }
  .warn, .ok, .info, .stop { font-size:10px; break-inside:avoid; padding:2.5mm 4mm; }
  a { color:var(--text); }
  blockquote, thead th, tbody tr:nth-child(even) td, .kpi div, .warn, .ok, .info, .stop, .tag { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
"""


def build_html() -> None:
    sections = [convert(n) for n in DOCS if (HERE / n).exists()]
    names = [n for n in DOCS if (HERE / n).exists()]
    nav = "\n".join(f'<li><a href="#{doc_id(n)}">{re.search(r"data-title=\"([^\"]*)\"", s).group(1)}</a></li>' for n, s in zip(names, sections))
    page = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>스터디 플래너 속지</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<nav>
<div class="brand">DIO · 스터디 플래너 속지</div>
<ol>
{nav}
</ol>
<div class="hint">원본은 같은 폴더의 md 파일. 이 html · pdf는 빌드.py로 다시 만든다. 목업은 스크립트/렌더.py(시안.html), 스크린샷은 스크립트/스크린샷찍기.py.</div>
</nav>
<main>
{"".join(sections)}
</main>
</div>
<script>
const links=[...document.querySelectorAll('nav a')],secs=[...document.querySelectorAll('.doc')];
const io=new IntersectionObserver(es=>{{es.forEach(e=>{{if(e.isIntersecting){{links.forEach(l=>l.classList.toggle('on',l.getAttribute('href')==='#'+e.target.id));}}}})}},{{rootMargin:'-20% 0px -70% 0px'}});
secs.forEach(s=>io.observe(s));
</script>
</body>
</html>
"""
    OUT_HTML.write_text(page, encoding="utf-8")
    print("html:", OUT_HTML)


def build_pdf() -> None:
    exe = next((c for c in CHROME if Path(c).exists() or shutil.which(c)), None)
    if not exe:
        print("chrome 없음 → pdf 생략"); return
    cmd = [exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--window-size=1600,1000", "--virtual-time-budget=40000",
           f"--print-to-pdf={OUT_PDF}", OUT_HTML.resolve().as_uri()]
    subprocess.run(cmd, check=True, capture_output=True, timeout=900)
    print("pdf:", OUT_PDF, OUT_PDF.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    build_html()
    if "--no-pdf" not in sys.argv:
        build_pdf()
