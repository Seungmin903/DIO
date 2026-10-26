# -*- coding: utf-8 -*-
"""분류표.py → 02~05 카탈로그 md 생성 (목업 그리드 + 항목 표)

실행: python 스크립트/카탈로그_생성.py   (어디서나)
md는 빌드.py가 HTML · PDF로 만든다. 항목을 고치려면 분류표.py를 고치고 이 스크립트를 다시 돌린다.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from 분류표 import CATEGORIES, 파일이름  # noqa: E402

ROOT = HERE.parent
NUM = {"paper-offline": "2", "paper-online": "3", "asset-offline": "4", "asset-online": "5"}
CIRCLED = "①②③④⑤⑥⑦⑧⑨"


def item_block(cat, grp, it, idx):
    key = 파일이름(cat["prefix"], it)
    img = f"목업/{key}.jpg"
    exists = (ROOT / img).exists()
    cap = f"{idx}. <b>{it['title']}</b> — {it['desc']}"
    fig = f'<figure class="mock"><img src="{img}" alt="{it["title"]}"><figcaption>{cap}</figcaption></figure>' if exists else f'<figure class="mock missing"><div class="ph">목업 준비 중</div><figcaption>{cap}</figcaption></figure>'
    return fig


def group_table(cat, grp):
    online = any("online" in it for it in grp["items"])
    head = "| # | 항목 | 왜 (조사 근거) | 칸 구성 · 옵션 |" + (" 상태 · 알림 · 소스 |" if online else "")
    sep = "|---|---|---|---|" + ("---|" if online else "")
    rows = [head, sep]
    for i, it in enumerate(grp["items"], 1):
        row = f"| {i} | **{it['title']}** | {it['why']} | {it['spec']} |"
        if online:
            row += f" {it.get('online', '—')} |"
        rows.append(row)
    return "\n".join(rows)


def render_category(cat):
    n = NUM[cat["id"]]
    out = [f"# {n}. {cat['title']}", "",
           f"> **한 줄**: {cat['one']}<br>",
           f"> 그룹 {len(cat['groups'])}개 · 항목 {sum(len(g['items']) for g in cat['groups'])}개 · 목업 캔버스 {cat['canvas'][0]}×{cat['canvas'][1]}"
           + (" (가로 · 태블릿 기준, 세로판은 같은 칸 구성을 위아래로 다시 배치)" if cat["canvas"][0] == 1024 else " (에셋 카드 · 한 묶음을 한 장에)")
           + " · 조사 근거는 [01 트렌드 조사.md](01 트렌드 조사.md)의 절 번호<br>",
           f"> 원본: `스크립트/분류표.py` → `스크립트/카탈로그_생성.py` 가 이 문서를, `스크립트/렌더.py` 가 `목업/` 를 만든다.", "",
           cat["intro"], ""]
    # 그룹 지도
    out += ["## 0. 묶음 지도", "", "| 묶음 | 항목 | 수 |", "|---|---|---|"]
    for gi, grp in enumerate(cat["groups"]):
        out.append(f"| {CIRCLED[gi]} {grp['title']} | {' · '.join(it['title'] for it in grp['items'])} | {len(grp['items'])} |")
    out.append("")
    for gi, grp in enumerate(cat["groups"], 1):
        out += [f"## {gi}. {grp['title']}", "", grp["intro"], "",
                '<div class="grid">', *[item_block(cat, grp, it, i) for i, it in enumerate(grp["items"], 1)], "</div>", "",
                group_table(cat, grp), ""]
    return "\n".join(out)


def main():
    for cat in CATEGORIES:
        p = ROOT / cat["file"]
        p.write_text(render_category(cat), encoding="utf-8")
        print("md:", p.name)


if __name__ == "__main__":
    main()
