# -*- coding: utf-8 -*-
"""1020 감성 점검.md → 1020 감성 점검.html → (크롬 헤드리스) 1020 감성 점검.pdf

실행:  python "docs/1020 감성 점검/빌드.py"            (어디서나)
       python "docs/1020 감성 점검/빌드.py" --no-pdf   HTML만
필요:  pip install markdown · 크롬 설치(PDF 단계, 없으면 HTML만 만들고 실패 코드로 끝낸다)
md가 원본이다. 그림(이미지/)은 목업/인덱스 탭과 소품.html 을 찍어 만든다.
"""
import shutil
import subprocess
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
SRC = HERE / "1020 감성 점검.md"
OUT_HTML = HERE / "1020 감성 점검.html"
OUT_PDF = HERE / "1020 감성 점검.pdf"
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "google-chrome", "chrome", "chromium"]

CSS = """
@page { size: A4; margin: 16mm 14mm; }
body { font-family: 'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif; color:#0B1766; font-size:10.5pt; line-height:1.6; }
h1 { font-size:22pt; margin:0 0 6pt; } h2 { font-size:15pt; margin:20pt 0 6pt; border-bottom:1px solid #D9DCEF; padding-bottom:3pt; break-after:avoid; }
h3 { font-size:12pt; } blockquote { margin:0 0 10pt; padding:6pt 10pt; background:#F0F1F9; border-radius:6pt; color:#525FAD; }
table { border-collapse:collapse; width:100%; margin:6pt 0 10pt; font-size:9pt; break-inside:auto; }
th, td { border:1px solid #D9DCEF; padding:4pt 6pt; vertical-align:top; } th { background:#F0F1F9; text-align:left; }
tr { break-inside:avoid; } img { max-width:100%; display:block; margin:6pt 0; break-inside:avoid; }
code { background:#F0F1F9; padding:0 3pt; border-radius:3pt; font-size:9pt; } a { color:#525FAD; }
"""


def main():
    body = markdown.markdown(SRC.read_text(encoding="utf-8"), extensions=["tables", "sane_lists", "attr_list"])
    OUT_HTML.write_text(f"<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>1020 감성 점검</title><style>{CSS}</style></head><body>{body}</body></html>", encoding="utf-8")
    print("HTML:", OUT_HTML)
    if "--no-pdf" in sys.argv:
        return
    chrome = next((c for c in CHROME if Path(c).exists() or shutil.which(c)), None)
    if not chrome:
        # PDF 도 커밋하는 파생물이라, 조용히 넘어가면 md 와 어긋난 PDF 가 남는다
        sys.exit("크롬이 없어 PDF를 만들지 못했어요. PDF가 md와 어긋나 있으니 크롬이 있는 곳에서 다시 돌리거나 --no-pdf 로 HTML만 만드세요.")
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--window-size=1280,1800",
                    f"--print-to-pdf={OUT_PDF}", OUT_HTML.as_uri()], check=True, timeout=180)
    print("PDF:", OUT_PDF)


if __name__ == "__main__":
    main()
