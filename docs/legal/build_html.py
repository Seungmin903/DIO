"""Render the checked-in legal Markdown sources without external dependencies.

Run: python docs/legal/build_html.py
This small renderer supports only the headings, lists, tables and inline syntax used here.
It escapes raw HTML; the output has no remote assets, scripts, analytics or cookies.
"""
from html import escape
from pathlib import Path
import re


def inline(text):
    text = escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    return re.sub(r"\[([^\]]+)\]\(((?:https://|mailto:)[^ )]+)\)",
                  r'<a href="\2" rel="noreferrer">\1</a>', text)


def render(source):
    lines = source.splitlines()
    output = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if not line or line == '---':
            continue
        if line.startswith('|'):
            rows = [line]
            while index < len(lines) and lines[index].strip().startswith('|'):
                rows.append(lines[index].strip())
                index += 1
            output.append('<div class="table-wrap"><table>')
            for row_index, row in enumerate(rows):
                cells = [cell.strip() for cell in row.strip('|').split('|')]
                if all(re.fullmatch(r':?-+:?', cell) for cell in cells):
                    continue
                tag = 'th' if row_index == 0 else 'td'
                output.append('<tr>' + ''.join(f'<{tag}>{inline(cell)}</{tag}>' for cell in cells) + '</tr>')
            output.append('</table></div>')
            continue
        heading = re.match(r'^(#{1,6}) (.+)$', line)
        if heading:
            level = len(heading[1])
            output.append(f'<h{level}>{inline(heading[2])}</h{level}>')
            continue
        if line.startswith('>'):
            if line[1:].strip():
                output.append('<aside>' + inline(line[1:].strip()) + '</aside>')
            continue
        item = re.match(r'^(\d+)\. (.+)$', line)
        if item:
            output.append(f'<p class="item">{item[1]}. {inline(item[2])}</p>')
        elif line.startswith('- '):
            output.append('<p class="item">• ' + inline(line[2:]) + '</p>')
        else:
            output.append('<p>' + inline(line) + '</p>')
    return '\n'.join(output)


def build():
    for source in sorted(Path(__file__).parent.joinpath('v2').glob('*.md')):
        title = next(line.lstrip('# ').strip() for line in source.read_text(encoding='utf-8').splitlines() if line.startswith('# '))
        document = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{escape(title)}</title>
<style>body{{max-width:900px;margin:0 auto;padding:24px;font:16px/1.8 system-ui,sans-serif;color:#20232a;overflow-wrap:anywhere}}h1{{font-size:26px}}h2{{font-size:21px;margin-top:36px}}aside{{padding:12px;border-left:4px solid #b65726;background:#fff6eb}}.table-wrap{{overflow-x:auto}}table{{width:100%;border-collapse:collapse}}th,td{{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}}th{{background:#f4f5f7}}a{{color:#285d9a}}code{{background:#f4f5f7;padding:2px 4px}}.item{{padding-left:12px}}</style></head>
<body><main>{render(source.read_text(encoding='utf-8'))}</main></body></html>
'''
        source.with_suffix('.html').write_text(document, encoding='utf-8')
        print(source.with_suffix('.html').name)


if __name__ == '__main__':
    build()
