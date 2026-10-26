# -*- coding: utf-8 -*-
"""md 6개(README · 01~05) → 속지 에셋 아이디어.html 한 파일 → (크롬 헤드리스) 속지 에셋 아이디어.pdf

실행:  python "docs/속지 에셋 아이디어/빌드.py"            (저장소 루트 또는 어디서나)
       python "docs/속지 에셋 아이디어/빌드.py" --no-pdf   HTML만
필요:  pip install markdown · 크롬 설치(PDF 단계, 없으면 HTML만 만든다)
순서:  스크립트/렌더.py(목업) → 스크립트/카탈로그_생성.py(02~05 md) → 이 스크립트. md가 원본이다.
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
DOCS = ["색인.md", "01 트렌드 조사.md", "02 일반속지 오프라인.md", "03 온라인속지.md", "04 에셋 오프라인.md", "05 에셋 온라인.md"]
OUT_HTML = HERE / "속지 에셋 아이디어.html"
OUT_PDF = HERE / "속지 에셋 아이디어.pdf"
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", "google-chrome", "chrome", "chromium"]


def doc_id(name: str) -> str:
    return "doc-" + (name[:2] if name[:2].isdigit() else "00")


def convert(name: str) -> str:
    text = (HERE / name).read_text(encoding="utf-8")
    # 문서 간 링크 → 같은 페이지 앵커
    text = re.sub(r"\]\((0\d%20[^)#\s]+\.md)#([^)]+)\)", r"](#\2)", text)
    text = re.sub(r"\]\((0\d%20[^)#\s]+\.md)\)", lambda m: f"](#{doc_id(m.group(1))})", text)
    text = text.replace("](색인.md)", "](#doc-00)")
    text = re.sub(r"\[(0\d [^\]#]+)\.md\]\(#", r"[\1](#", text)
    md = markdown.Markdown(extensions=["tables", "toc", "sane_lists", "fenced_code", "md_in_html", "attr_list"],
                           extension_configs={"toc": {"slugify": slugify_unicode, "separator": "-"}})
    body = shape(md.convert(text))
    title = re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S)
    title = re.sub(r"<[^>]+>", "", title.group(1)) if title else name
    return f'<section class="doc" id="{doc_id(name)}" data-title="{html.escape(title)}">\n{body}\n</section>'


def shape(body: str) -> str:
    """h2 절 단위로 블록을 감싸 PDF에서 가능하면 한 쪽에 담기게 하고, 스크린샷 figure는 .shot 으로."""
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
:root { --ink:#1D1D1F; --muted:#6B7280; --line:#E5E7EB; --bg:#FFFFFF; --soft:#F6F5F2; --accent:#5B6BC0; --accent-soft:#EDF0FA; --paper:#FFFFFF; }
* { box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.65 "Nanum Gothic","Malgun Gothic","Noto Sans KR",sans-serif; word-break:keep-all; }
a { color:var(--accent); text-decoration:none; } a:hover { text-decoration:underline; }
.wrap { display:grid; grid-template-columns:240px minmax(0,1fr); min-height:100vh; }
nav { position:sticky; top:0; height:100vh; overflow:auto; padding:24px 16px; border-right:1px solid var(--line); background:var(--soft); }
nav .brand { font-weight:800; font-size:13px; letter-spacing:.08em; color:var(--muted); margin-bottom:12px; }
nav ol { list-style:none; margin:0; padding:0; } nav li { margin:0 0 4px; }
nav a { display:block; padding:7px 10px; border-radius:8px; color:var(--ink); font-size:13.5px; line-height:1.35; }
nav a:hover, nav a.on { background:var(--accent-soft); color:var(--accent); text-decoration:none; }
nav .hint { margin-top:20px; font-size:12px; color:var(--muted); line-height:1.5; }
main { padding:32px 48px 96px; max-width:1280px; }
.doc { padding-bottom:40px; margin-bottom:40px; border-bottom:2px solid var(--line); } .doc:last-child { border-bottom:0; }
h1 { font-size:27px; margin:8px 0 16px; line-height:1.3; } h2 { font-size:20px; margin:40px 0 12px; padding-top:8px; border-top:1px solid var(--line); } h3 { font-size:16px; margin:28px 0 8px; }
blockquote { margin:0 0 20px; padding:12px 16px; background:var(--accent-soft); border-left:4px solid var(--accent); border-radius:0 8px 8px 0; font-size:13.5px; color:#374151; } blockquote p { margin:0; }
table { border-collapse:collapse; width:100%; margin:12px 0 20px; font-size:13px; line-height:1.5; display:block; overflow-x:auto; }
thead th { background:var(--soft); text-align:left; font-weight:700; }
th, td { border:1px solid var(--line); padding:7px 9px; vertical-align:top; }
tbody tr:nth-child(even) td { background:#FBFBFA; }
td:first-child, th:first-child { white-space:nowrap; }
img { max-width:100%; height:auto; border:1px solid var(--line); border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
code { font:12.5px/1.4 ui-monospace,Consolas,monospace; background:var(--soft); padding:1px 5px; border-radius:4px; }
li { margin:3px 0; } hr { border:0; border-top:1px solid var(--line); margin:28px 0; } strong { font-weight:800; }
/* 목업 그리드 (삼성노트 템플릿 고르기처럼 3열) */
.grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:18px 20px; margin:14px 0 18px; }
.grid figure.mock { margin:0; } .grid figure.mock img { width:100%; display:block; background:var(--paper); }
.grid figcaption { margin-top:6px; font-size:12.5px; line-height:1.45; color:#374151; }
.grid .ph { aspect-ratio:4/3; border:1px dashed var(--line); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:12px; background:var(--soft); }
/* 검색 스크린샷 */
.shots { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px 20px; margin:14px 0 18px; }
.shots figure { margin:0; } .shots img { width:100%; display:block; max-height:520px; object-fit:cover; object-position:top; }
.shots figcaption { margin-top:6px; font-size:12.5px; line-height:1.45; color:#374151; }
.shots.three { grid-template-columns:repeat(3, minmax(0,1fr)); } .shots.three img { max-height:400px; }
.note { font-size:12.5px; color:var(--muted); }
.kpi { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin:12px 0 20px; }
.kpi div { border:1px solid var(--line); border-radius:10px; padding:12px 14px; background:var(--soft); }
.kpi b { display:block; font-size:22px; line-height:1.2; margin-bottom:4px; } .kpi span { font-size:12px; color:var(--muted); line-height:1.4; display:block; }
@media (max-width:900px) { .wrap { grid-template-columns:1fr; } nav { position:static; height:auto; border-right:0; border-bottom:1px solid var(--line); } main { padding:20px 16px 60px; } .grid, .shots, .shots.three, .kpi { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media print {
  @page { size:A4 landscape; margin:11mm 12mm 13mm; }
  body { font-size:11px; } .wrap { display:block; } nav { display:none; } main { padding:0; max-width:none; }
  .doc { break-before:page; border:0; margin:0; padding:0; } .doc:first-child { break-before:auto; }
  h1 { font-size:22px; } h2 { font-size:16px; break-after:avoid; margin-top:6mm; } h3 { font-size:13px; break-after:avoid; }
  table { display:table; font-size:9.3px; } tr { break-inside:avoid; } thead { display:table-header-group; }
  img { box-shadow:none; }
  .sec2, .sec3 { break-inside:auto; } h2 + p, h3 + p { break-after:avoid; }
  .grid { grid-template-columns:repeat(3, minmax(0,1fr)) !important; gap:4mm 5mm; margin:3mm 0 4mm; } .grid figure.mock { break-inside:avoid; } .grid figcaption { font-size:9px; margin-top:1.5mm; }
  .shots { grid-template-columns:repeat(2, minmax(0,1fr)) !important; gap:4mm 5mm; margin:3mm 0 4mm; } .shots.three { grid-template-columns:repeat(3, minmax(0,1fr)) !important; } .shots img { max-height:118mm; } .shots.three img { max-height:92mm; } .shots figcaption { font-size:9px; } .shots figure { break-inside:avoid; }
  .kpi { grid-template-columns:repeat(4, minmax(0,1fr)) !important; gap:3mm; } .kpi b { font-size:16px; } .kpi span { font-size:9px; }
  a { color:var(--ink); }
  blockquote, thead th, tbody tr:nth-child(even) td, .kpi div, .grid .ph { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
"""


def build_html() -> None:
    sections = [convert(n) for n in DOCS]
    nav = "\n".join(f'<li><a href="#{doc_id(n)}">{re.search(r"data-title=\"([^\"]*)\"", s).group(1)}</a></li>' for n, s in zip(DOCS, sections))
    page = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DIO 속지 · 에셋 아이디어 — 10~20대 여성 다꾸 트렌드 조사와 4분류 카탈로그</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap">
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<nav>
<div class="brand">DIO · 속지 · 에셋 아이디어</div>
<ol>
{nav}
</ol>
<div class="hint">원본은 같은 폴더의 md 파일. 이 html · pdf는 빌드.py로 다시 만든다. 목업은 스크립트/렌더.py, 스크린샷은 스크립트/스크린샷찍기.py.</div>
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
    cmd = [exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--window-size=1600,1000", "--virtual-time-budget=30000",
           f"--print-to-pdf={OUT_PDF}", OUT_HTML.resolve().as_uri()]
    subprocess.run(cmd, check=True, capture_output=True, timeout=600)
    print("pdf:", OUT_PDF, OUT_PDF.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    build_html()
    if "--no-pdf" not in sys.argv:
        build_pdf()
