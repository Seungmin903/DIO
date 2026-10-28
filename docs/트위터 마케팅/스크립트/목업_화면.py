# -*- coding: utf-8 -*-
"""프로필 · 트윗 화면 목업(HTML) — 계정이 실제 화면에서 어떻게 보일지 폰 프레임으로 그린다

X 화면을 흉내 내지만 X 의 로고 · 아이콘을 그대로 쓰지 않고 일반적인 선 아이콘으로 그린다(기획용 목업).
레이아웃 수치는 2026-10-26 X 웹 · 모바일 관측값: 헤더 3:1, 인장 지름 약 20% 폭, 헤더 아래로 약 1/3 겹침.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from 목업_도형 import FONT, defs, render_html, svg_doc  # noqa: E402

ICON = {
    "reply": '<path d="M4 5h16v11H11l-5 4v-4H4z"/>',
    "repost": '<path d="M5 9l3-3 3 3M8 6v8a3 3 0 003 3h2M19 15l-3 3-3-3M16 18v-8a3 3 0 00-3-3h-2"/>',
    "like": '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
    "views": '<path d="M5 20V12M10 20V6M15 20v-8M20 20V9"/>',
    "bookmark": '<path d="M7 4h10v16l-5-4-5 4z"/>',
    "share": '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
    "back": '<path d="M15 5l-7 7 7 7"/>',
    "search": '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
    "more": '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    "pin": '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
    "link": '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"/>',
    "cal": '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
}


def icon(name, size=18, color="currentColor", sw=1.8):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{ICON[name]}</svg>'


def theme(dark):
    if dark:
        return dict(bg="#000000", fg="#E7E9EA", sub="#71767B", line="#2F3336", chip="#16181C", btn_bg="#EFF3F4", btn_fg="#0F1419")
    return dict(bg="#FFFFFF", fg="#0F1419", sub="#536471", line="#EFF3F4", chip="#F7F9F9", btn_bg="#0F1419", btn_fg="#FFFFFF")


def inline_svg(svg_text, width=None, height=None, style=""):
    """svg_doc() 가 만든 전체 SVG 를 HTML 안에 넣되 크기만 바꾼다."""
    if width:
        import re
        w0 = int(re.search(r'width="(\d+)"', svg_text).group(1))
        h0 = int(re.search(r'height="(\d+)"', svg_text).group(1))
        height = height or round(width * h0 / w0)
        svg_text = re.sub(r'<svg ([^>]*?)width="\d+" height="\d+"', rf'<svg \1width="{width}" height="{height}" style="display:block;{style}"', svg_text, count=1)
    return svg_text


BASE_CSS = """
*{box-sizing:border-box} html,body{margin:0}
body{font-family:%s;-webkit-font-smoothing:antialiased}
.phone{width:390px;position:relative;overflow:hidden;border-radius:34px;border:1px solid #cfd9de;box-shadow:0 12px 40px rgba(11,25,87,.18)}
.topbar{height:52px;display:flex;align-items:center;gap:22px;padding:0 14px}
.topbar .t{flex:1;line-height:1.15}.topbar .t b{font-size:17px;font-weight:800}.topbar .t span{display:block;font-size:12.5px}
.hdr{position:relative;height:130px;overflow:hidden}
.av{position:absolute;left:14px;top:-40px;width:82px;height:82px;border-radius:50%%;border:4px solid var(--bg);overflow:hidden;background:var(--bg)}
.av.sq{border-radius:18px}
.pf{position:relative;padding:0 16px 8px}
.pf .row{height:48px;display:flex;justify-content:flex-end;align-items:center;gap:8px}
.btn{border-radius:999px;padding:7px 16px;font-weight:800;font-size:14px}
.btn.o{border:1px solid var(--line)} .btn.f{background:var(--btn_bg);color:var(--btn_fg)}
.nm{font-size:20px;font-weight:800;line-height:1.2;margin-top:2px}.hd{font-size:15px}
.bio{font-size:15px;line-height:1.45;margin:10px 0 8px;white-space:pre-line}
.meta{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14px;color:var(--sub);align-items:center}
.meta span{display:inline-flex;align-items:center;gap:4px}
.cnt{display:flex;gap:18px;font-size:14px;margin-top:8px;color:var(--sub)}.cnt b{color:var(--fg);font-weight:800}
.tabs{display:flex;border-bottom:1px solid var(--line);margin-top:6px}
.tabs div{flex:1;text-align:center;padding:12px 0;font-size:15px;font-weight:600;color:var(--sub);position:relative}
.tabs div.on{color:var(--fg);font-weight:800}.tabs div.on:after{content:"";position:absolute;left:30%%;right:30%%;bottom:0;height:4px;border-radius:2px;background:#6E92C6}
.tw{display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
.tw .a{width:40px;height:40px;border-radius:50%%;overflow:hidden;flex:none}
.tw .b{flex:1;min-width:0}
.tw .h{font-size:15px;line-height:1.2}.tw .h b{font-weight:800}.tw .h i{font-style:normal;color:var(--sub)}
.tw p{margin:3px 0 8px;font-size:15px;line-height:1.42;white-space:pre-line;word-break:keep-all}
.tw .m{border-radius:16px;overflow:hidden;border:1px solid var(--line);margin-bottom:8px}
.tw .acts{display:flex;justify-content:space-between;color:var(--sub);font-size:13px;max-width:330px}
.tw .acts span{display:inline-flex;align-items:center;gap:5px}
.pinl{display:flex;align-items:center;gap:6px;color:var(--sub);font-size:13px;font-weight:700;padding:8px 16px 0 58px;margin-bottom:-6px}
""" % FONT


def avatar_html(svg_text, size=40):
    return inline_svg(svg_text, width=size, height=size)


def tweet(avatar_svg, name, handle, body, media_svg=None, when="2시간", stats=("12", "340", "1.2천", "4.5만"), t=None, media_ratio=None, pinned=False):
    t = t or theme(False)
    media = f'<div class="m">{media_svg}</div>' if media_svg else ""
    pin = f'<div class="pinl">{icon("pin", 14, t["sub"])} 고정된 게시물</div>' if pinned else ""
    acts = (f'<div class="acts"><span>{icon("reply", 17)}{stats[0]}</span><span>{icon("repost", 17)}{stats[1]}</span>'
            f'<span>{icon("like", 17)}{stats[2]}</span><span>{icon("views", 17)}{stats[3]}</span><span>{icon("bookmark", 17)}</span></div>')
    return (f'{pin}<div class="tw"><div class="a">{avatar_html(avatar_svg, 40)}</div><div class="b">'
            f'<div class="h"><b>{name}</b> <i>@{handle} · {when}</i></div><p>{body}</p>{media}{acts}</div></div>')


def phone_profile(avatar_svg, header_svg, name, handle, bio, tweets_html, dark=False, square=False, link="(랜딩 주소)", joined="2026년 11월에 가입함",
                  following="0", followers="0", location=None, post_count="0 게시물", height=None):
    t = theme(dark)
    css = f"--bg:{t['bg']};--fg:{t['fg']};--sub:{t['sub']};--line:{t['line']};--btn_bg:{t['btn_bg']};--btn_fg:{t['btn_fg']};"
    loc = f'<span>{icon("pin", 15, t["sub"])}{location}</span>' if location else ""
    meta = f'{loc}<span>{icon("link", 15, "#1D9BF0")}<a style="color:#1D9BF0">{link}</a></span><span>{icon("cal", 15, t["sub"])}{joined}</span>'
    h = f"height:{height}px;" if height else ""
    return (f'<div class="phone" style="{css}background:{t["bg"]};color:{t["fg"]};{h}">'
            f'<div class="topbar">{icon("back", 20)}<div class="t"><b>{name}</b><span style="color:{t["sub"]}">{post_count}</span></div>{icon("search", 20)}</div>'
            f'<div class="hdr">{inline_svg(header_svg, width=390, height=130)}</div>'
            f'<div class="pf"><div class="av{" sq" if square else ""}">{avatar_html(avatar_svg, 74)}</div>'
            f'<div class="row"><span class="btn o">{icon("more", 18)}</span><span class="btn f">팔로우</span></div>'
            f'<div class="nm">{name}</div><div class="hd" style="color:{t["sub"]}">@{handle}</div>'
            f'<div class="bio">{bio}</div><div class="meta">{meta}</div>'
            f'<div class="cnt"><span><b>{following}</b> 팔로잉</span><span><b>{followers}</b> 팔로워</span></div></div>'
            f'<div class="tabs"><div class="on">게시물</div><div>답글</div><div>재게시</div><div>미디어</div></div>'
            f'{tweets_html}</div>')


def page(inner, width, bg="#EEF2F9", pad=28, title=None, cols_gap=28):
    head = f'<div style="font-weight:900;font-size:24px;color:#0B1957;margin:0 0 18px">{title}</div>' if title else ""
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}body{{background:{bg};padding:{pad}px;width:{width}px}}'
            f'.row{{display:flex;gap:{cols_gap}px;align-items:flex-start}}.cap{{font-size:15px;font-weight:800;color:#0B1957;margin:0 0 10px}}.cap2{{font-size:13px;color:#4A5578;margin-top:10px;line-height:1.5;max-width:390px}}</style></head>'
            f'<body>{defs_holder()}{head}{inner}</body></html>')


def defs_holder():
    """HTML 문서 맨 앞에 최종 시안 <defs> 를 숨겨 둔다(같은 문서의 모든 inline svg 가 <use href="#finalart"> 로 찾는다)."""
    return f'<svg width="0" height="0" style="position:absolute">{defs()}</svg>'
