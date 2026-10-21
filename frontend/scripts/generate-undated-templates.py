"""기존 날짜형 SVG에서 만년형을 생성한다. 원본과 글꼴 출처는 보존한다."""
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/templates/2026/SVG'
TARGET = ROOT / 'assets/templates/undated'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
SOURCES = {
    'cover': '2026-cover', 'divider': '2026-divider-01', 'monthly': '2026-monthly-01',
    'weekly-blocks': '2026-weekly-blocks-2026-01-05', 'weekly-journal': '2026-weekly-journal-2026-01-05',
}


def generate(kind, orientation):
    tree = ET.parse(SOURCE / f'{SOURCES[kind]}-{orientation}.svg')
    root = tree.getroot()
    root.set('id', f'undated-{kind}-{orientation}')
    root.set('aria-label', '만년형 ' + {'cover': '첫 장 표지', 'divider': '월별 구분 페이지', 'monthly': '월간 달력', 'weekly-blocks': '주간 계획', 'weekly-journal': '주간 계획'}[kind])
    for parent in list(root.iter()):
        for child in list(parent):
            label = child.get('aria-label', '')
            header = parent is root and label and (
                kind == 'cover' and label == '2026'
                or kind in ('divider', 'monthly') and label == '1월'
                or kind.startswith('weekly') and (label == '1월 2주차' or '2026.' in label)
            )
            day_number = parent.get('data-weekday') is not None and label.isdecimal()
            if child.get('data-calendar-date') is not None or header or day_number:
                parent.remove(child)
    for element in root.iter():
        element.attrib.pop('data-iso', None)
    root.find(f'{{{NS}}}title').text = '만년형 ' + kind
    # 어느 달에도 사용할 수 있도록 기존 달력을 6행으로 나눈다.
    if kind == 'monthly':
        calendar = next(e for e in root if e.get('data-calendar'))
        x, y, w, h = (float(calendar.get(k)) for k in ('x', 'y', 'width', 'height'))
        for line in list(root):
            if line.tag == f'{{{NS}}}line' and line.get('x1') != line.get('x2') and float(line.get('x1', -1)) == x and y < float(line.get('y1', -1)) < y+h:
                root.remove(line)
        calendar.set('data-rows', '6')
        calendar.set('data-weeks', '6')
        for i in range(1, 6):
            ET.SubElement(root, f'{{{NS}}}line', {
                'x1': str(x), 'x2': str(x+w), 'y1': str(y+h*i/6), 'y2': str(y+h*i/6),
                'stroke': '#d7d9dc', 'stroke-width': '1', 'fill': 'none',
            })
    if kind != 'divider':
        y = '230' if kind == 'cover' else '86'
        ET.SubElement(root, f'{{{NS}}}line', {
            'x1': '40', 'x2': '240', 'y1': y, 'y2': y, 'stroke': '#d7d9dc', 'stroke-width': '1', 'fill': 'none',
        })
    TARGET.mkdir(parents=True, exist_ok=True)
    tree.write(TARGET / f'undated-{kind}-{orientation}.svg', encoding='utf-8', xml_declaration=True)


if __name__ == '__main__':
    for orientation in ('landscape', 'portrait'):
        for kind in SOURCES:
            generate(kind, orientation)
