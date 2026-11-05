"""미지원 기능 가리기 점검 2026-11-05 — md 원본을 PDF 한 파일로 만든다.

쓰는 법: 이 폴더에서 `PYTHONIOENCODING=utf-8 python 빌드.py`
(크롬 헤드리스는 절대 경로 · --window-size 가 필요하다. 다른 위치면 환경 변수 CHROME)
"""
import os
import re
import subprocess
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
NAME = '미지원 기능 가리기 점검 2026-11-05'
MD = HERE / f'{NAME}.md'
CHROME = os.environ.get('CHROME', r'C:\Program Files\Google\Chrome\Application\chrome.exe')

CSS = '''
@page { size: A4 landscape; margin: 12mm 12mm 14mm; }
body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #0B1766; font-size: 9.5pt; line-height: 1.5; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 4mm; }
h2 { font-size: 15pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid #D9DCEF; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; page-break-after: avoid; }
p { margin: 1.5mm 0; } ul, ol { margin: 1mm 0 2mm; padding-left: 5mm; } li { margin: 0.6mm 0; }
code { font-family: Consolas, 'D2Coding', monospace; font-size: 8.5pt; background: #F0F1F9; padding: 0 1mm; border-radius: 1mm; }
pre { background: #F7F8FD; border: 1px solid #D9DCEF; padding: 2mm 3mm; white-space: pre-wrap; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 8.5pt; }
th, td { border: 1px solid #D9DCEF; padding: 1.2mm 1.8mm; vertical-align: top; text-align: left; }
th { background: #F0F1F9; }
tr { page-break-inside: avoid; }
.shots { display: flex; gap: 3mm; margin: 2mm 0 3mm; page-break-inside: avoid; }
.shots figure { margin: 0; text-align: center; flex: 1; }
.shots img { max-height: 78mm; max-width: 100%; border: 1px solid #D5D9EE; border-radius: 2mm; object-fit: contain; }
.shots figcaption { font-size: 8pt; color: #5360A6; margin-top: 1mm; }
blockquote { margin: 2mm 0; padding: 1.5mm 3mm; border-left: 3px solid #ABB1D8; background: #F7F8FD; }
'''

SHOT_RE = re.compile(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$')


def convert_shots(text):
    """연속된 이미지 줄을 .shots 묶음으로 바꾼다."""
    out, buf = [], []

    def flush():
        if buf:
            figs = ''.join(f'<figure><img src="{src.replace(" ", "%20")}"><figcaption>{label}</figcaption></figure>' for label, src in buf)
            out.append(f'<div class="shots">{figs}</div>')
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
    text = convert_shots(MD.read_text(encoding='utf-8'))
    body = markdown.markdown(text, extensions=['tables', 'fenced_code', 'sane_lists'])
    html_doc = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{NAME}</title><style>{CSS}</style></head><body>{body}</body></html>'
    out = HERE / f'{NAME}.html'
    out.write_text(html_doc, encoding='utf-8')
    pdf = HERE / f'{NAME}.pdf'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--window-size=1600,1000', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', out.as_uri()], check=True)
    out.unlink()  # 임시 html 은 남기지 않는다
    print('PDF', pdf, pdf.stat().st_size)


if __name__ == '__main__':
    sys.exit(main())
