# -*- coding: utf-8 -*-
"""최종/ 의 모아 · 디오 SVG → 앱 벡터 데이터(frontend/src/shared/characterShapes.js) 다시 만들기.

실행: python "docs/캐릭터 디자인/스크립트/앱 그림 만들기.py" (저장소 어디서든, 표준 라이브러리만 쓴다)

- 완성(빈 화면 EmptyState) · 윤곽(표지 무늬 CoverPattern) 두 벌을 react-native-svg 로 그릴 수 있는 배열로 옮긴다.
  PNG 를 줄여 그리면 안드로이드가 큰 그림을 건너뛰며 디코딩해 먹선이 들쭉날쭉해져서(2026-11-08 실기기) 벡터로 그린다.
  좌표는 원본 SVG 그대로(소수 첫째 자리) 둔다 — 반올림하지 않는다.
- 기본 프로필 얼굴(shared/DefaultAvatar.js) 좌표를 출력한다: 두 눈 사이 249 · 얼굴 가운데 (255.5, 265.7)
그림 크기가 바뀌면 frontend/src/shared/characterScale.js 의 CHARACTER_ART 도 같이 고친다(테스트가 viewBox 와 맞는지 본다).
메모 위젯(editor/widgets/memoArt.js) 캐릭터는 완성 SVG 를 예전 캐릭터 자리(높이 · 오른쪽 아래 끝)에 맞춰 넣었다(2026-11-08).
"""
import json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SRC = HERE / '최종'
OUT = HERE.parent.parent / 'frontend' / 'src' / 'shared' / 'characterShapes.js'

ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def shapes(path):
    s = path.read_text(encoding='utf-8')
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    out = []
    for tag, attrs in re.findall(r'<(path|circle)\s([^>]*?)/?>', s):
        a = dict(ATTR.findall(attrs))
        if tag == 'circle':
            out.append(['c', float(a['cx']), float(a['cy']), float(a['r']), a.get('fill')])
        elif a.get('fill') == 'none':
            out.append(['s', a['d'], a['stroke'], float(a['stroke-width'])])
        else:
            out.append(['p', a['d'], a['fill'], a.get('fill-rule') == 'evenodd'])
    return {'viewBox': vb, 'shapes': out}


data = {key: {'full': shapes(SRC / f'{who} 완성.svg'), 'line': shapes(SRC / f'{who} 윤곽.svg')}
        for who, key in (('모아', 'moa'), ('디오', 'dio'))}
head = ('// 자동 생성: docs/캐릭터 디자인/스크립트/앱 그림 만들기.py — 손으로 고치지 않는다.\n'
        '// 원본: docs/캐릭터 디자인/최종/(2026-11-08) 모아 · 디오 완성 · 윤곽 SVG.\n'
        "// shape: ['p', d, fill, evenodd] 면 · ['s', d, stroke, width] 선(끝 둥글게) · ['c', cx, cy, r, fill] 동그라미\n")
OUT.write_text(head + 'export const CHARACTER_SHAPES = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n',
               encoding='utf-8', newline='\n')
for k, v in data.items():
    print(k, 'full', v['full']['viewBox'], len(v['full']['shapes']), 'line', len(v['line']['shapes']))
print('wrote', OUT, OUT.stat().st_size, 'bytes')

# 기본 프로필 얼굴
s = (SRC / '모아 윤곽.svg').read_text(encoding='utf-8')
eyes = sorted(tuple(map(float, m)) for m in re.findall(r'<circle fill="#1C1C1C" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', s))
m = re.search(r'stroke-width="([\d.]+)" stroke-linecap="round" d="M([\d. ]+)C([\d. ]+)"', s)
sw = float(m.group(1))
P = [tuple(map(float, m.group(2).split()))] + [tuple(map(float, xy)) for xy in zip(*[iter(m.group(3).split())] * 2)]
ex, k = (eyes[0][0] + eyes[1][0]) / 2, 249 / (eyes[1][0] - eyes[0][0])
bez = lambda t: sum(c * p[1] for c, p in zip(((1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3), P))
cy = (min(e[1] - e[2] for e in eyes) + max(bez(t / 100) for t in range(101)) + sw / 2) / 2
T = lambda x, y: (255.5 + (x - ex) * k, 265.7 + (y - cy) * k)
print('MOA_EYES', [[round(T(x, y)[0], 1), round(T(x, y)[1], 1), round(r * k, 1)] for x, y, r in eyes])
print('MOA_MOUTH', 'M' + ' '.join(f'{v:.1f}' for v in T(*P[0])) + 'C' + ' '.join(f'{v:.1f}' for p in P[1:] for v in T(*p)), 'width', round(sw * k))
