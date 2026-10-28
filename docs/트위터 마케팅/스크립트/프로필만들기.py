# -*- coding: utf-8 -*-
"""프로필 조합 목업 — 인장 + 헤더 + 이름 · 아이디 · 소개 · 고정 게시물을 폰 화면에 얹어 본다

실행:  python "docs/트위터 마케팅/스크립트/프로필만들기.py"
결과:  목업/프로필 조합.jpg (단계별 3안 나란히 — ① 지금(만드는 중) ② 베타 모집 ③ 겨울 시즌, 밝은 2 + 어두운 1)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import 게시물이미지 as posts  # noqa: E402
import 인장만들기 as jang  # noqa: E402
import 헤더만들기 as hdr  # noqa: E402
from 목업_도형 import FONT_LINK, render_html, svg_doc  # noqa: E402
from 목업_화면 import BASE_CSS, defs_holder, inline_svg, phone_profile, theme, tweet  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "목업"

NAME = "DIO 디오 | 같이 꾸미는 공유 다이어리"
HANDLE = "diodiary_app"
BIO0 = "하루 한 장의 사진 위에 친구들과 같이 꾸며요\n공유 다이어리 DIO를 만드는 중이에요 · 디오 × 두리\n소식은 이 계정에서 가장 먼저"
BIO1 = "하루 한 장의 사진 위에 친구들과 같이 꾸며요\n베타 테스터 모집 중 · 신청은 고정 게시물에서\n[DIO팀]은 평일 11~18시에 답해요"
BIO2 = "하루 한 장의 사진 위에 친구들과 같이 꾸며요\n겨울 스티커 팩이 나왔어요 · 업데이트 노트는 고정 게시물\n[DIO팀]은 평일 11~18시에 답해요"


def avatar(fn):
    return svg_doc(800, 800, fn())


def media(fn, w=308):
    svg, W, H = fn()
    return inline_svg(svg, width=w)


def build(avatar_fn, header_fn, pinned_fn, tl_fns, bio, dark=False, square=False, pinned_text="", tl_texts=(), following="12", followers="0"):
    t = theme(dark)
    av = avatar(avatar_fn)
    items = tweet(av, NAME, HANDLE, pinned_text, media(pinned_fn), when="11월 2일", t=t, pinned=True, stats=("3", "28", "114", "2.1천"))
    for fn, tx in zip(tl_fns, tl_texts):
        items += tweet(av, NAME, HANDLE, tx, media(fn), when="2시간", t=t)
    return phone_profile(av, header_fn(), NAME, HANDLE, bio, items, dark=dark, square=square, link="(랜딩 주소)", joined="2026년 11월에 가입함",
                         following=following, followers=followers, height=900)


def main():
    a = build(jang.cand_a2, hdr.h1, posts.img_explain, [posts.img_today, posts.img_question], BIO0,
              pinned_text="DIO는 하루 한 장의 사진 위에\n친구들과 같이 스티커와 낙서를 얹는 다이어리예요.\n지금은 만드는 중이에요. 소식은 이 계정에서 가장 먼저 알려요.",
              tl_texts=("오늘의 한 장, 디오가 먼저 붙여 봤어요", "오늘 하루를 사진 한 장으로 말한다면?\n답글에 사진 한 장 ↓"))
    b = build(jang.cand_a2, hdr.h5, posts.img_notice, [posts.img_today, posts.img_comic3], BIO1,
              pinned_text="[DIO팀] 베타 테스터를 모집해요.\n친구 한 명과 같이 써 볼 분이면 좋아요.\n태블릿에서 가장 편해요(폰도 돼요). 신청은 아래 링크에서 ↓",
              tl_texts=("오늘의 한 장, 같이 꾸며요", "디오의 하루"), following="38", followers="412")
    c = build(jang.season_dec, hdr.h4, posts.img_stickers, [posts.img_recap, posts.img_question], BIO2, dark=True,
              pinned_text="[DIO팀] 12월 스티커 팩이 나왔어요.\n사진 위에 얹어서 올려 주세요.",
              tl_texts=("2026 한 장 결산, 같이 만들어요", "오늘 하루를 사진 한 장으로 말한다면?"), following="52", followers="2,314")
    inner = (f'<div class="row"><div><p class="cap">① 지금 — 만드는 중 (헤더 1 기본형 + 인장 A2)</p>{a}</div>'
             f'<div><p class="cap">② 베타 모집 (헤더 5 공지형 + 인장 A2)</p>{b}</div>'
             f'<div><p class="cap">③ 겨울 시즌 · 어두운 화면 (헤더 4 + 12월 인장)</p>{c}</div></div>')
    css = (f'<style>{BASE_CSS}body{{background:#EEF2F9;padding:28px;width:1290px}}'
           '.row{display:flex;gap:30px;align-items:flex-start}.cap{font-size:15px;font-weight:800;color:#0B1957;margin:0 0 12px}</style>')
    html = f'<!doctype html><html><head><meta charset="utf-8">{FONT_LINK}{css}</head><body>{defs_holder()}{inner}</body></html>'
    return render_html(html, OUT / "프로필 조합.jpg", 1290, 1010, scale=2)


if __name__ == "__main__":
    print(main())
