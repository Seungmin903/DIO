"""QA 점검 2026-11-04 — md 원본을 PDF 한 파일로 만든다.

쓰는 법: 이 폴더에서 `PYTHONIOENCODING=utf-8 python 빌드.py`
(크롬 헤드리스는 절대 경로 · --window-size 가 필요하다. 다른 위치면 환경 변수 CHROME)
md 안의 이미지 경로(이미지/…)는 그대로 쓰고, 표·목록은 python-markdown 으로 바꾼다.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
MD = HERE / 'QA 점검 2026-11-04.md'
CHROME = os.environ.get('CHROME', r'C:\Program Files\Google\Chrome\Application\chrome.exe')

CSS = '''
@page { size: A4; margin: 12mm 12mm 14mm; }
body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #0B1766; font-size: 9.5pt; line-height: 1.5; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 4mm; }
h2 { font-size: 15pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid #D9DCEF; page-break-before: always; }
h2.first { page-break-before: auto; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; color: #0B1766; page-break-after: avoid; }
h4 { font-size: 10pt; margin: 4mm 0 1.5mm; color: #5360A6; page-break-after: avoid; }
p { margin: 1.5mm 0; } ul, ol { margin: 1mm 0 2mm; padding-left: 5mm; } li { margin: 0.6mm 0; }
code { font-family: Consolas, 'D2Coding', monospace; font-size: 8.5pt; background: #F0F1F9; padding: 0 1mm; border-radius: 1mm; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 8.5pt; page-break-inside: auto; }
th, td { border: 1px solid #D9DCEF; padding: 1.2mm 1.8mm; vertical-align: top; text-align: left; }
th { background: #F0F1F9; }
tr { page-break-inside: avoid; }
.shots { display: flex; flex-wrap: wrap; gap: 3mm; margin: 2mm 0 3mm; }
.shots figure { margin: 0; text-align: center; page-break-inside: avoid; }
.shots img { max-height: 95mm; max-width: 60mm; border: 1px solid #D5D9EE; border-radius: 2mm; object-fit: contain; }
.shots img.wide { max-width: 120mm; max-height: 75mm; }
.shots figcaption { font-size: 8pt; color: #5360A6; margin-top: 1mm; }
.sev { display: inline-block; font-weight: 700; padding: 0 1.5mm; border-radius: 1mm; font-size: 8.5pt; margin-right: 1mm; }
.P0 { background: #B52E52; color: #fff; } .P1 { background: #606BB2; color: #fff; } .P2 { background: #DBDCF9; color: #0B1766; } .P3 { background: #F0F1F9; color: #5360A6; }
blockquote { margin: 2mm 0; padding: 1.5mm 3mm; border-left: 3px solid #ABB1D8; background: #F7F8FD; }
hr { border: 0; border-top: 1px solid #D9DCEF; margin: 4mm 0; }
'''

SHOT_RE = re.compile(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$')


def convert_shots(text):
    """연속된 이미지 줄(![이름](이미지/x.jpg))을 .shots 묶음(HTML)으로 바꾼다. 가로 캡처는 이름에 (가로) 가 있으면 wide."""
    out, buf = [], []

    def flush():
        if not buf:
            return
        figs = []
        for label, src in buf:
            cls = ' class="wide"' if '가로' in label or '폰' not in label and 'wide' in src else ''
            if '(가로)' in label:
                cls = ' class="wide"'
            figs.append(f'<figure><img src="{src}"{cls}><figcaption>{label}</figcaption></figure>')
        out.append('<div class="shots">' + ''.join(figs) + '</div>')
        buf.clear()

    for line in text.splitlines():
        m = SHOT_RE.match(line)
        if m:
            buf.append((m.group(1), m.group(2)))
            continue
        flush()
        out.append(line)
    flush()
    return '\n'.join(out)


def main():
    text = MD.read_text(encoding='utf-8')
    text = convert_shots(text)
    body = markdown.markdown(text, extensions=['tables', 'fenced_code', 'sane_lists'])
    body = re.sub(r'\[(P[0-3])\]', r'<span class="sev \1">\1</span>', body)
    body = body.replace('<h2>', '<h2 class="first">', 1)
    html_doc = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>QA 점검 2026-11-04</title><style>{CSS}</style></head><body>{body}</body></html>'
    out = HERE / 'QA 점검 2026-11-04.html'
    out.write_text(html_doc, encoding='utf-8')
    pdf = HERE / 'QA 점검 2026-11-04.pdf'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--window-size=1200,1600', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', out.as_uri()], check=True)
    print('PDF', pdf, pdf.stat().st_size)


if __name__ == '__main__':
    sys.exit(main())
