# -*- coding: utf-8 -*-
"""코덱스 'mock' 지시를 HTML 목업(목업/NN.html, 760×496)으로 그린다. 그림은 빌드.py 가 크롬으로 찍는다.
실행: python "docs/앱 디자인 점검 원 페이저/스크립트/목업 만들기.py"
아이콘은 Lucide(ISC) 선 모양을 줄여 옮긴 것. 표지 · 로고 · 소셜 버튼 · 캐릭터는 목업/소재/ 의 실제 화면 조각.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
MOCKS = HERE / "목업"

P = {
    "menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
    "book": '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h8M8 11h6"/>',
    "bookuser": '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><circle cx="12" cy="8" r="2"/><path d="M15 13a3 3 0 0 0-6 0"/>',
    "palette": '<circle cx="13.5" cy="6.5" r=".8"/><circle cx="17.5" cy="10.5" r=".8"/><circle cx="8.5" cy="7.5" r=".8"/><circle cx="6.5" cy="12.5" r=".8"/><path d="M12 2a10 10 0 0 0 0 20 1.7 1.7 0 0 0 1.7-1.7c0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.7 1.7 0 0 1 1.7-1.7h2a5.6 5.6 0 0 0 5.6-5.6C22 6 17.5 2 12 2Z"/>',
    "trash": '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    "more": '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    "dots": '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    "open": '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    "swap": '<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
    "grid": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    "star": '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "lib": '<path d="M4 4v16M8 4v16M12 4l4 16"/>',
    "scissors": '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    "pen": '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    "hl": '<path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    "eraser": '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21M22 21H7M5 11l9 9"/>',
    "text": '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    "sticker": '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6M9 13h.01M15 13h.01M9.5 16.5a3.5 3.5 0 0 0 5 0"/>',
    "tape": '<circle cx="9" cy="12" r="6"/><circle cx="9" cy="12" r="2"/><path d="M15 18h7"/>',
    "image": '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3-3-9 9"/>',
    "pointer": '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
    "hand": '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    "back": '<path d="m15 18-6-6 6-6"/>',
    "share": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    "export": '<path d="M12 3v12M8 7l4-4 4 4M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "edit": '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    "chev": '<path d="m9 18 6-6-6-6"/>',
    "fontT": '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    "cover": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/>',
    "page": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
}


def ic(name, size=20, color="#0B1766", sw=2):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">{P[name]}</svg>')


def cover(name, w, h=None, extra=""):
    h = h or round(w * 420 / 314)
    return f'<div class="cover" style="width:{w}px;height:{h}px;background-image:url(\'소재/표지 {name}.png\');{extra}"></div>'


def rail(sel, h, bg="#F7F8FD", width=64, trash_bottom=False, phone=False):
    items = [("book", "lib"), ("bookuser", "shared"), ("palette", "studio")] + ([] if trash_bottom else [("trash", "trash")])
    out = [f'<div style="position:absolute;left:0;top:0;width:{width}px;height:{h}px;background:{bg};border-right:1px solid #D9DCEF;display:flex;flex-direction:column;align-items:center;padding-top:16px;gap:12px">',
           f'<div style="height:36px;display:flex;align-items:center">{ic("menu", 20)}</div>']
    for icon, key in items:
        on = key == sel
        out.append(f'<div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:{"#DBDCF9" if on else "transparent"}">{ic(icon, 20, "#525FAD" if on else "#818AC3")}</div>')
    if trash_bottom:
        on = sel == "trash"
        out.append(f'<div style="position:absolute;bottom:64px;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:{"#DBDCF9" if on else "transparent"}">{ic("trash", 20, "#525FAD" if on else "#818AC3")}</div>')
    out.append('<div style="position:absolute;bottom:16px;width:30px;height:30px;border-radius:50%;background:url(\'소재/avatar-default.png\') center/cover"></div></div>')
    return "".join(out)


def desk(light=True, extra=""):
    """햇살 책상: #F3F3F7 + 우상단 44%×38% 안에만 창빛(대비 4~6%)."""
    glow = ('<div style="position:absolute;right:0;top:0;width:44%;height:38%;'
            'background:radial-gradient(ellipse at 70% 30%, rgba(254,240,191,0.30), rgba(254,240,191,0) 70%)"></div>'
            '<div style="position:absolute;right:16%;top:0;width:3px;height:38%;background:rgba(11,23,102,0.05)"></div>'
            '<div style="position:absolute;right:0;top:19%;width:44%;height:3px;background:rgba(11,23,102,0.05)"></div>') if light else ""
    return f'<div style="position:absolute;inset:0;background:#F3F3F7;{extra}">{glow}</div>'


def page(body, bg="#FFFFFF"):
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="공통.css">
<style>body{{background:{bg};position:relative}}</style></head><body>{body}</body></html>"""


def tag(text, x, y):
    return f'<div class="note" style="left:{x}px;top:{y}px">{text}</div>'


M = {}

# 01 바탕 역할 분리: 보관함 = 햇살 책상, 작업 화면 = 흰 면, 바깥 셸 · 좌측 바는 둘 다 #F7F8FD
def mini_screen(kind):
    w, h = 352, 300
    inner = []
    if kind == "lib":
        inner.append(f'<div style="position:absolute;left:44px;top:0;right:0;bottom:0;overflow:hidden">{desk()}'
                     f'<div style="position:absolute;left:18px;top:14px;font-weight:800;font-size:15px">내 다이어리</div>'
                     f'<div style="position:absolute;left:18px;top:56px;display:flex;flex-wrap:wrap;width:280px;gap:14px">{cover("독서 노트", 52)}{cover("메모장", 52)}{cover("위클리 플래너", 52)}{cover("새 다이어리", 52)}{cover("교환일기", 52)}</div></div>')
        sel = "lib"
    else:
        tabs = "".join(f'<div style="width:46px;height:{22 if i == 1 else 18}px;border-radius:5px 5px 0 0;background:{"#DBDCF9" if i == 1 else "#F7F8FD"};font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center">{t}</div>'
                       for i, t in enumerate(["폰트", "스티커", "표지", "속지"]))
        inner.append(f'<div style="position:absolute;left:44px;top:0;right:0;bottom:0;background:#fff">'
                     f'<div style="position:absolute;left:18px;top:14px;font-weight:800;font-size:15px">꾸미기 공방</div>'
                     f'<div style="position:absolute;left:18px;right:18px;top:44px;display:flex;gap:4px;align-items:flex-end;border-bottom:1px solid #D9DCEF">{tabs}</div>'
                     f'<img src="소재/dio.png" style="position:absolute;left:50%;top:140px;width:62px;transform:translateX(-50%)"></div>')
        sel = "studio"
    r = (f'<div style="position:absolute;left:0;top:0;width:44px;height:{h}px;background:#F7F8FD;border-right:1px solid #D9DCEF;display:flex;flex-direction:column;align-items:center;padding-top:12px;gap:8px">'
         + "".join(f'<div style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:{"#DBDCF9" if k == sel else "transparent"}">{ic(i, 15, "#525FAD" if k == sel else "#818AC3")}</div>'
                   for i, k in [("book", "lib"), ("bookuser", "x"), ("palette", "studio"), ("trash", "t")]) + "</div>")
    return f'<div style="position:relative;width:{w}px;height:{h}px;border-radius:12px;overflow:hidden;border:1px solid #D9DCEF;background:#fff">{"".join(inner)}{r}</div>'


M[1] = page(f"""<div style="position:absolute;inset:0;background:#F7F8FD"></div>
<div style="position:absolute;left:20px;top:40px;display:flex;gap:16px">
 <div class="col" style="gap:10px">{mini_screen("lib")}<div class="label" style="color:#525FAD">보관함 · 햇살 책상 #F3F3F7</div></div>
 <div class="col" style="gap:10px">{mini_screen("work")}<div class="label" style="color:#525FAD">공방 · 휴지통 · 내 공간 · 흰 면</div></div>
</div>
<div style="position:absolute;left:20px;bottom:40px;right:20px;display:flex;gap:10px;font-size:12px;color:#525FAD;align-items:center">
 <span style="width:14px;height:14px;border-radius:4px;background:#F7F8FD;border:1px solid #D9DCEF"></span>좌측 바 · 바깥 셸 #F7F8FD 공통
 <span style="width:14px;height:14px;border-radius:4px;background:rgba(254,240,191,.6);margin-left:18px"></span>창빛은 우상단 44% × 38% 안에만
</div>""")

# 02 한눈에 그리드: 왼쪽 64 · 위 56 기준, 표지 폭 164 · 간격 32, 제목은 표지 왼쪽 10 아래
names = [("독서 노트", "독서 노트"), ("메모장", "메모장"), ("위클리 플래너", "위클리 플래너"), ("새 다이어리", "새 다이어리")]
cells = "".join(f'<div class="col" style="gap:10px;width:118px">{cover(f, 118)}<div><div style="font-size:12px;font-weight:700">{t}</div><div class="sub">1페이지</div></div></div>' for f, t in names)
M[2] = page(f"""{desk()}{rail("lib", 496, width=56)}
<div style="position:absolute;left:84px;top:22px" class="title">내 다이어리</div>
<div style="position:absolute;left:84px;top:76px;display:flex;gap:32px;align-items:flex-start">{cells}</div>
<div style="position:absolute;left:84px;top:238px;width:646px;border-top:2px dashed #ABB1D8"></div>{tag("표지 아래 기준선 하나", 600, 222)}
<div style="position:absolute;left:84px;top:300px;display:flex;gap:32px;align-items:flex-end">{cover("교환일기", 118)}<div class="cover" style="width:158px;height:118px;background-image:url('소재/표지 테스트용.png')"></div></div>
{tag("왼쪽 64 · 위 56 기준", 420, 330)}{tag("열 간격 32 고정", 420, 360)}""")

# 03 보관함 머리줄: 필터 칩 2개 | 검색 · 더보기(테두리 없음) · 96×36 보기 전환 묶음
seg = "".join(f'<div style="width:30px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:{"#DBDCF9" if i == 1 else "transparent"}">{ic(n, 16, "#525FAD" if i == 1 else "#818AC3")}</div>' for i, n in enumerate(["open", "swap", "grid"]))
M[3] = page(f"""{desk()}
<div style="position:absolute;left:28px;right:28px;top:30px;display:flex;align-items:center;gap:10px">{ic("book", 26)}<span class="title" style="font-size:28px">내 다이어리</span></div>
<div style="position:absolute;left:28px;right:28px;top:96px;display:flex;align-items:center">
 <span class="chip on" style="height:36px">{ic("lib", 15)}전체 기록</span><span class="chip" style="height:36px;margin-left:8px">{ic("star", 15, "#525FAD")}즐겨찾기</span>
 <span style="flex:1"></span>
 <span style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center">{ic("search", 20)}</span>
 <span style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center">{ic("more", 20)}</span>
 <span style="width:96px;height:36px;border-radius:10px;background:#FFFFFF;display:flex;align-items:center;justify-content:space-around;padding:0 2px;margin-left:6px">{seg}</span>
</div>
{tag("테두리 없는 아이콘 40", 470, 146)}{tag("보기 전환 96×36 한 묶음", 590, 66)}
<div style="position:absolute;left:28px;top:190px;display:flex;gap:40px">{cover("독서 노트", 170)}{cover("메모장", 170)}{cover("위클리 플래너", 170)}</div>
<div style="position:absolute;left:0;right:0;top:0;height:170px;border-bottom:1px dashed transparent"></div>""")

# 04 좌측 바: 바탕 #F7F8FD, 선택 36 타일 #DBDCF9 + #525FAD, 휴지통은 아래 묶음
M[4] = page(f"""<div style="position:absolute;inset:0;background:#fff"></div>{rail("studio", 496, width=78, trash_bottom=True)}
<div style="position:absolute;left:110px;top:28px;display:flex;gap:10px;align-items:center">{ic("palette", 24)}<span class="title">꾸미기 공방</span></div>
<div style="position:absolute;left:110px;right:30px;top:86px;border-bottom:1px solid #D9DCEF;display:flex;gap:6px;align-items:flex-end">
 {''.join(f'<div style="width:104px;height:{42 if i == 0 else 36}px;border-radius:8px 8px 0 0;background:{"#DBDCF9" if i == 0 else "#F7F8FD"};margin-bottom:-1px;font-size:14px;font-weight:{700 if i == 0 else 500};display:flex;align-items:center;justify-content:center">{t}</div>' for i, t in enumerate(["폰트", "스티커", "표지", "속지", "프리셋"]))}
</div>
{tag("고른 곳만 36 라벤더 타일", 92, 158)}{tag("휴지통은 아래로 따로", 92, 400)}{tag("바 바탕 #F7F8FD", 92, 250)}
<img src="소재/dio.png" style="position:absolute;left:400px;top:220px;width:96px">""")

# 05 펼쳐서: 2:1 열린 책, 왼쪽 #F7F8FD · 오른쪽 #FFF · 가운데 2px 제본선, 다음 표지는 18%만, 간격 28
M[5] = page(f"""{desk()}
<div style="position:absolute;left:96px;top:58px;width:500px;height:322px;display:flex;border-radius:4px 8px 8px 4px;box-shadow:0 6px 8px rgba(11,23,102,.06);border:1px solid #D9DCEF;overflow:hidden">
 <div style="flex:1;background:#F7F8FD;border-right:2px solid #D9DCEF;position:relative">
   <div style="position:absolute;left:28px;right:28px;top:40px;bottom:40px;background:repeating-linear-gradient(#F7F8FD 0 23px,#E4E6F3 23px 24px)"></div></div>
 <div style="flex:1;background:#FFFFFF;position:relative">
   <div style="position:absolute;left:28px;right:28px;top:40px;bottom:40px;background:repeating-linear-gradient(#fff 0 23px,#ECEEF7 23px 24px)"></div></div>
</div>
<div style="position:absolute;left:624px;top:84px;width:136px;height:296px;overflow:hidden">{cover("메모장", 220, 296)}</div>
<div style="position:absolute;left:96px;top:392px"><div style="font-size:13px;font-weight:700">독서 노트</div><div class="sub" style="font-size:12px">1 / 1</div></div>
<div style="position:absolute;left:556px;top:392px;display:flex;gap:6px">{ic("star", 18, "#525FAD")}{ic("dots", 18)}</div>
{tag("가운데 제본선 2px", 290, 30)}{tag("다음 책은 18%만 · 간격 28", 600, 52)}""")

# 06 표지 정보 줄: 제목 14/700 + 페이지 12, 오른쪽 위 28 ⋯ 고정, 별은 표지 왼쪽 위 12
def card6(f, t):
    return (f'<div class="col" style="width:160px;gap:10px">{cover(f, 160)}'
            f'<div style="position:relative;height:42px"><div style="font-size:14px;font-weight:700;padding-right:30px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{t}</div>'
            f'<div style="font-size:12px;color:rgba(11,23,102,.68);margin-top:3px">1페이지</div>'
            f'<div style="position:absolute;right:0;top:-4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">{ic("dots", 18)}</div></div></div>')
M[6] = page(f"""{desk()}
<div style="position:absolute;left:52px;top:44px;display:flex;gap:40px">{card6("독서 노트", "독서 노트")}{card6("위클리 플래너", "위클리 플래너 2026 여름")}{card6("메모장", "메모장")}</div>
{tag("표지 ↔ 제목 10 · 제목 ↔ 페이지 3", 52, 340)}{tag("⋯ 28×28 · 정보 줄 오른쪽 위", 420, 340)}{tag("별: 표지 왼쪽 위 12", 52, 20)}""")

# 07 빈 상태: 공방 = 흰 면 + 아주 옅은 점선 판 뒤 디오, 보관함 = 햇살 책상 + 모아(판 없음)
M[7] = page(f"""<div style="position:absolute;left:0;top:0;width:380px;height:496px;background:#fff;border-right:1px solid #D9DCEF">
  <div style="position:absolute;left:24px;top:22px;font-weight:800;font-size:18px">꾸미기 공방</div>
  <div style="position:absolute;left:102px;top:150px;width:176px;height:132px;border:1.5px dashed #D9DCEF;border-radius:12px;background:#F7F8FD"></div>
  <img src="소재/dio.png" style="position:absolute;left:50%;top:162px;height:112px;transform:translateX(-50%)">
  <div style="position:absolute;left:0;right:0;top:300px;text-align:center;font-size:14px;font-weight:700">아직 만든 폰트가 없어요</div></div>
<div style="position:absolute;left:380px;top:0;width:380px;height:496px;overflow:hidden">{desk()}
  <div style="position:absolute;left:24px;top:22px;font-weight:800;font-size:18px">공유된 다이어리</div>
  <img src="소재/moa.png" style="position:absolute;left:50%;top:168px;height:100px;transform:translateX(-50%)">
  <div style="position:absolute;left:0;right:0;top:300px;text-align:center;font-size:14px;font-weight:700">공유된 다이어리가 없어요</div></div>
{tag("캐릭터 → 글자 14 · 설명 줄 없음", 110, 340)}{tag("판 없이 책상만", 520, 340)}""")

# 08 공방 견출지 탭: 높이 36(고른 탭은 선을 덮음), 위 모서리 8, 고른 #DBDCF9 · 안 고른 #F7F8FD, 폰은 같은 폭
def tabs(widths, sel, labels, h=36, fs=14):
    return "".join(f'<div style="width:{w}px;height:{h + 4 if i == sel else h}px;border-radius:8px 8px 0 0;background:{"#DBDCF9" if i == sel else "#F7F8FD"};margin-bottom:-1px;font-size:{fs}px;font-weight:{700 if i == sel else 500};display:flex;align-items:center;justify-content:center;flex:none">{t}</div>'
                   for i, (w, t) in enumerate(zip(widths, labels)))
L5 = ["폰트", "스티커", "표지", "속지", "프리셋"]
M[8] = page(f"""<div style="position:absolute;left:24px;top:20px;font-size:12px;font-weight:700;color:#525FAD">태블릿</div>
<div style="position:absolute;left:24px;top:44px;font-weight:800;font-size:24px">꾸미기 공방</div>
<div style="position:absolute;left:24px;right:24px;top:90px;border-bottom:1px solid #D9DCEF;display:flex;gap:6px;align-items:flex-end">{tabs([104]*5, 1, L5)}</div>
<div style="position:absolute;left:24px;top:150px;font-weight:700;font-size:16px">스티커</div>
<div style="position:absolute;left:24px;top:220px;font-size:12px;font-weight:700;color:#525FAD">폰 · 좌우 16 안에서 같은 폭</div>
<div style="position:absolute;left:24px;top:244px;width:330px;height:236px;border:1px solid #D9DCEF;border-radius:16px;background:#fff;overflow:hidden">
 <div style="position:absolute;left:16px;top:14px;font-weight:800;font-size:20px">꾸미기 공방</div>
 <div style="position:absolute;left:16px;right:16px;top:58px;border-bottom:1px solid #D9DCEF;display:flex;gap:4px;align-items:flex-end">{tabs([56]*5, 1, L5, 34, 13)}</div>
</div>
{tag("고른 탭이 아래 선을 덮음", 140, 136)}{tag("테두리 · 그림자 없음", 420, 300)}""")

# 09 공방 주 동작: 제목줄 오른쪽에 #606BB2 버튼 하나(아이콘 16 + 13/700), 준비 중 버튼은 숨김
M[9] = page(f"""<div style="position:absolute;inset:0;background:#fff"></div>
<div style="position:absolute;left:28px;right:28px;top:24px;font-weight:800;font-size:22px">꾸미기 공방</div>
<div style="position:absolute;left:28px;right:28px;top:66px;border-bottom:1px solid #D9DCEF;display:flex;gap:6px;align-items:flex-end">{tabs([96]*5, 1, L5, 34, 13)}</div>
<div style="position:absolute;left:28px;right:28px;top:126px;display:flex;align-items:center">
 <span style="font-weight:700;font-size:17px">스티커</span><span style="flex:1"></span>
 <span style="height:36px;padding:0 14px;border-radius:10px;background:#606BB2;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">{ic("scissors", 16, "#fff")}사진 속 대상 오리기</span></div>
<img src="소재/dio.png" style="position:absolute;left:50%;top:214px;height:112px;transform:translateX(-50%)">
<div style="position:absolute;left:0;right:0;top:340px;text-align:center;font-size:14px;font-weight:700">아직 스티커 폴더가 없어요</div>
{tag("주 버튼 하나만 · 준비 중 버튼은 숨김", 450, 172)}""")

# 10 프리셋: 위에 72×72 종이 미리보기 4개, 아래 펜 · 형광펜 · 테이프 · 글자 섹션, 색 점 20, 고른 점만 #525FAD 2px 고리
PEN = ["#1B2148", "#B23A48", "#8A7A2A", "#2F7A55", "#2F6F8F", "#6D4AA8", "#5F6470"]
HL = ["#F7DD7A", "#F4B98A", "#F2A6A6", "#D9C2F0", "#B9C6F2", "#BFE6CF", "#E6DED3"]
def dots(cols, sel=0):
    return "".join(f'<span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;{"box-shadow:inset 0 0 0 2px #525FAD" if i == sel else ""}"><span style="width:20px;height:20px;border-radius:50%;background:{c}"></span></span>' for i, c in enumerate(cols))
def paper(line, hl):
    return (f'<div style="width:72px;height:72px;border-radius:8px;background:#fff;border:1px solid #D9DCEF;position:relative;overflow:hidden">'
            f'<div style="position:absolute;left:10px;right:10px;top:22px;height:9px;background:{hl};opacity:.8;border-radius:2px"></div>'
            f'<div style="position:absolute;left:12px;top:24px;width:40px;height:2px;background:{line}"></div>'
            f'<div style="position:absolute;left:12px;top:42px;width:48px;height:2px;background:{line};opacity:.6"></div>'
            f'<div style="position:absolute;left:12px;top:54px;width:30px;height:2px;background:{line};opacity:.6"></div></div>')
M[10] = page(f"""<div style="position:absolute;left:28px;top:20px;font-weight:700;font-size:17px">프리셋</div>
<div style="position:absolute;left:28px;top:56px;display:flex;gap:16px">{paper(PEN[0], HL[0])}{paper(PEN[5], HL[3])}{paper(PEN[4], HL[4])}{paper(PEN[1], HL[2])}</div>
<div style="position:absolute;left:28px;top:156px;display:grid;grid-template-columns:330px 330px;column-gap:40px;row-gap:24px">
 <div><div class="row" style="gap:6px;font-size:13px;font-weight:700;margin-bottom:8px">{ic("pen", 15)}펜</div><div class="row" style="gap:6px">{dots(PEN)}</div></div>
 <div><div class="row" style="gap:6px;font-size:13px;font-weight:700;margin-bottom:8px">{ic("hl", 15)}형광펜</div><div class="row" style="gap:6px">{dots(HL)}</div></div>
 <div><div class="row" style="gap:6px;font-size:13px;font-weight:700;margin-bottom:8px">{ic("tape", 15)}마스킹 테이프</div><div class="row" style="gap:6px">{dots(["#F2C6CF", "#FBE5A3", "#C9E4D4", "#C3DCEA", "#DBDCF9", "#3A3D4A"], 1)}</div></div>
 <div><div class="row" style="gap:6px;font-size:13px;font-weight:700;margin-bottom:8px">{ic("text", 15)}글자</div><div class="row" style="gap:6px">{dots(PEN)}</div></div>
</div>
{tag("완성된 분위기 먼저", 380, 84)}{tag("섹션 사이 선 대신 여백 24", 420, 420)}""")

# 11 휴지통: 보관함 한눈에와 같은 표지 크기 · 정보 줄, 별 없음, 남은 날(30일 후 영구 삭제) 유지
def card11(f, t, s, chip=False):
    sub = (f'<span style="font-size:11px;font-weight:600;background:#FEF0BF;border-radius:6px;padding:1px 6px">{s}</span>' if chip else f'<span style="font-size:12px;color:#525FAD">{s}</span>')
    return (f'<div class="col" style="width:150px;gap:10px">{cover(f, 150)}<div style="position:relative;height:42px">'
            f'<div style="font-size:14px;font-weight:700;padding-right:30px">{t}</div><div style="margin-top:3px">{sub}</div>'
            f'<div style="position:absolute;right:0;top:-4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">{ic("dots", 18)}</div></div></div>')
M[11] = page(f"""<div style="position:absolute;inset:0;background:#fff"></div>{rail("trash", 496, width=64)}
<div style="position:absolute;left:96px;top:24px;display:flex;gap:10px;align-items:center">{ic("trash", 24)}<span class="title">휴지통</span></div>
<div style="position:absolute;left:96px;top:96px;display:flex;gap:32px">{card11("교환일기", "우리 반 교환일기", "30일 후 영구 삭제")}{card11("제주", "제주 여행 일기", "3일 후 영구 삭제", True)}</div>
{tag("보관함과 같은 표지 크기 · 정보 줄", 470, 120)}{tag("별 없음 · 남은 날 그대로", 470, 150)}""")

# 12 내 공간: #F0F1F9 r16 프로필 카드 하나, 아바타 48, 조용한 수정 버튼 92×32, 아래는 바탕 위 섹션(행 48 · 선 #D9DCEF · 켬 #818AC3)
def tog(on):
    return (f'<span style="width:44px;height:26px;border-radius:13px;background:{"#818AC3" if on else "#D9DCEF"};position:relative;flex:none">'
            f'<span style="position:absolute;top:3px;{"right" if on else "left"}:3px;width:20px;height:20px;border-radius:50%;background:#fff"></span></span>')
def rows(items):
    return "".join(f'<div class="row" style="height:48px;border-bottom:1px solid #D9DCEF;font-size:14px"><span style="flex:1">{t}</span>{r}</div>' for t, r in items)
def section(title, items):
    return f'<div style="margin-top:24px"><div style="font-size:14px;font-weight:700;margin-bottom:4px">{title}</div>{rows(items)}</div>'
phone_a = (f'<div style="padding:18px 16px"><div class="row" style="gap:8px;margin-bottom:16px">{ic("user", 22)}<span style="font-weight:800;font-size:20px">내 공간</span></div>'
           f'<div style="background:#F0F1F9;border-radius:16px;padding:16px;display:flex;align-items:center;gap:12px">'
           f'<div style="width:48px;height:48px;border-radius:50%;background:url(\'소재/avatar-default.png\') center/cover"></div>'
           f'<div style="flex:1"><div style="font-weight:700;font-size:16px">방문자</div><div class="sub">방문자님의 기록 공간</div></div>'
           f'<span style="width:92px;height:32px;border:1px solid #ABB1D8;border-radius:10px;color:#525FAD;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:4px;background:#fff">{ic("edit", 12, "#525FAD")}프로필 수정</span></div>'
           + section("알림", [("알림", tog(True)), ("다이어리 초대", tog(True)), ("공유된 다이어리 소식", tog(True)), ("매일 기록 알림", tog(False))]) + "</div>")
phone_b = ('<div style="padding:4px 16px">' + section("보안", [("앱 잠금", tog(False))]) + section("환경 설정", [("홈 책상 실시간 조명", tog(True))])
           + section("앱 정보", [("개인정보 처리방침", ic("chev", 16, "#818AC3")), ("문의 이메일", '<span class="sub">dioapp.official@gmail.com</span>')]) + "</div>")
M[12] = page(f"""<div style="position:absolute;inset:0;background:#F7F8FD"></div>
<div style="position:absolute;left:24px;top:16px;width:340px;height:464px;background:#fff;border:1px solid #D9DCEF;border-radius:16px;overflow:hidden">{phone_a}</div>
<div style="position:absolute;left:396px;top:16px;width:340px;height:464px;background:#fff;border:1px solid #D9DCEF;border-radius:16px;overflow:hidden">{phone_b}</div>
{tag("이어서 ↓", 396, 0)}""")

# 13 로그인: 흰 카드 위 여백 40, 로고 아래 오른쪽에 72×10 테이프 한 조각, 입력칸 48 · 간격 12, 소셜 44 원 · 간격 20
inp = lambda t: f'<div style="height:48px;border:1px solid #818AC3;border-radius:10px;padding:0 14px;display:flex;align-items:center;font-size:13px;color:rgba(11,23,102,.5)">{t}</div>'
M[13] = page(f"""<div style="position:absolute;inset:0;background:#F7F8FD"></div>
<div style="position:absolute;left:200px;top:-6px;width:360px;height:520px;background:#fff;border:1px solid #D9DCEF;border-radius:16px;padding:40px 28px 0">
 <div style="position:relative;height:56px"><img src="소재/로고.png" style="position:absolute;left:50%;top:0;height:52px;transform:translateX(-50%)">
  <div style="position:absolute;left:184px;top:44px;width:72px;height:10px;background:#FBE5A3;opacity:.92;transform:rotate(-4deg);clip-path:polygon(2% 0,98% 0,100% 50%,98% 100%,2% 100%,0 50%)"></div></div>
 <div style="text-align:center;font-weight:800;font-size:19px;margin-top:12px">DIO에 오신 걸 환영해요</div>
 <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px">{inp("이메일을 입력해 주세요")}{inp("비밀번호를 입력해 주세요")}</div>
 <div style="height:46px;border-radius:10px;background:#ABB1D8;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:16px">로그인</div>
 <div style="display:flex;justify-content:center;gap:20px;margin-top:28px">{''.join(f'<img src="소재/{n}.png" style="width:44px;height:44px">' for n in ["카카오", "구글", "애플"])}</div>
</div>
{tag("테이프 72×10 한 조각", 580, 70)}{tag("입력칸 48 · 포커스는 2px로 굵기만", 580, 160)}{tag("소셜 44 · 간격 20", 580, 400)}""")

# 14 새 다이어리: 처음엔 '기본' 단계만, 가운데 표지 180×240 + 이름 입력, 아래 오른쪽 '만들기' 104×40
steps = "".join(f'<div class="row" style="height:44px;gap:10px;padding:0 12px;border-radius:10px;{"background:#DBDCF9;" if i == 0 else ""}color:{"#0B1766" if i == 0 else "#525FAD"};font-size:14px;font-weight:{700 if i == 0 else 500}">{ic(n, 18, "#525FAD" if i == 0 else "#818AC3")}{t}</div>'
                for i, (n, t) in enumerate([("edit", "기본"), ("cover", "표지"), ("page", "속지"), ("palette", "속지 색")]))
M[14] = page(f"""<div style="position:absolute;inset:0;background:#fff"></div>
<div style="position:absolute;left:0;right:0;top:0;height:52px;border-bottom:1px solid #D9DCEF;display:flex;align-items:center;padding:0 20px"><span class="sub" style="font-size:13px">취소</span><span style="flex:1;text-align:center;font-weight:700">새 다이어리</span><span style="width:26px"></span></div>
<div style="position:absolute;left:20px;top:72px;width:150px;display:flex;flex-direction:column;gap:4px">{steps}</div>
<div style="position:absolute;left:190px;top:52px;bottom:0;width:1px;background:#D9DCEF"></div>
<div style="position:absolute;left:230px;top:96px">{cover("새 다이어리", 180, 240)}</div>
<div style="position:absolute;left:450px;top:120px;width:272px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">다이어리 이름</div>{inp("새 다이어리")}</div>
<div style="position:absolute;right:28px;bottom:28px;width:104px;height:40px;border-radius:10px;background:#606BB2;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center">만들기</div>
{tag("안 연 단계는 #525FAD 보통 굵기", 20, 260)}{tag("처음엔 표지 + 이름만", 450, 196)}""")

# 15 편집기: 머리줄 = 뒤로 · 이름 · 공유 · 내보내기(나머지는 ⋯), 도구 막대 r12 40 아이콘(코덱스 6 + 테이프 · 사진), 고른 도구만 #DBDCF9, 아래 한 줄 옵션
tools = [("pointer", 0), ("pen", 1), ("hl", 0), ("eraser", 0), ("text", 0), ("sticker", 0), ("tape", 0), ("image", 0)]
tb = "".join(f'<span style="width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:{"#DBDCF9" if on else "transparent"}">{ic(n, 20, "#525FAD" if on else "#0B1766")}</span>' for n, on in tools)
M[15] = page(f"""<div style="position:absolute;inset:0;background:#F7F8FD"></div>
<div style="position:absolute;left:0;right:0;top:0;height:56px;background:#fff;border-bottom:1px solid #D9DCEF;display:flex;align-items:center;padding:0 16px;gap:10px">
 {ic("back", 20)}<span style="font-weight:700;font-size:15px">여름 방학</span><span style="flex:1"></span>
 <span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center">{ic("share", 20)}</span>
 <span style="height:36px;padding:0 14px;border-radius:10px;background:#606BB2;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">{ic("export", 16, "#fff")}내보내기</span>
 <span style="width:36px;height:40px;display:flex;align-items:center;justify-content:center">{ic("more", 20)}</span></div>
<div style="position:absolute;left:50%;top:72px;transform:translateX(-50%);background:#fff;border-radius:12px;border:1px solid #D9DCEF;padding:4px;display:flex;gap:4px">{tb}</div>
<div style="position:absolute;left:50%;top:128px;transform:translateX(-50%);height:36px;display:flex;align-items:center;gap:8px;background:#fff;border-radius:10px;border:1px solid #D9DCEF;padding:0 12px">{dots(PEN[:5])}<span style="width:1px;height:20px;background:#D9DCEF;margin:0 4px"></span>
 {''.join(f'<span style="width:24px;height:24px;display:flex;align-items:center;justify-content:center"><span style="width:16px;height:{h}px;border-radius:2px;background:#0B1766"></span></span>' for h in (2, 4, 6))}</div>
<div style="position:absolute;left:120px;right:120px;top:180px;bottom:20px;background:#fff;box-shadow:0 6px 8px rgba(11,23,102,.06)"></div>
{tag("페이지 · 레이어는 ⋯ 안으로", 470, 60)}{tag("고른 도구의 옵션만 한 줄", 560, 134)}""")

# 16 새 다이어리 버튼: 태블릿은 '+ 새 다이어리' 글자 버튼(높이 40 · r12), 폰은 44×44, 오른쪽 · 아래 16
M[16] = page(f"""<div style="position:absolute;left:0;top:0;width:470px;height:496px;overflow:hidden">{desk()}
  <div style="position:absolute;left:24px;top:40px;display:flex;gap:28px">{cover("독서 노트", 120)}{cover("메모장", 120)}{cover("위클리 플래너", 120)}</div>
  <div style="position:absolute;right:16px;bottom:16px;height:40px;padding:0 16px;border-radius:12px;background:#606BB2;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">{ic("plus", 16, "#fff")}새 다이어리</div>
  <div style="position:absolute;left:16px;top:12px;font-size:12px;font-weight:700;color:#525FAD">태블릿</div></div>
<div style="position:absolute;left:490px;top:0;width:270px;height:496px;overflow:hidden;border-left:1px solid #D9DCEF">{desk(False)}
  <div style="position:absolute;left:0;top:0;bottom:0;width:44px;background:#F7F8FD;border-right:1px solid #D9DCEF"></div>
  <div style="position:absolute;left:62px;top:40px;display:flex;gap:16px">{cover("독서 노트", 88)}{cover("메모장", 88)}</div>
  <div style="position:absolute;right:16px;bottom:16px;width:44px;height:44px;border-radius:12px;background:#606BB2;display:flex;align-items:center;justify-content:center">{ic("plus", 20, "#fff")}</div>
  <div style="position:absolute;left:62px;top:12px;font-size:12px;font-weight:700;color:#525FAD">폰</div></div>
{tag("오른쪽 · 아래 16", 330, 400)}""")


if __name__ == "__main__":
    for n, html in M.items():
        (MOCKS / f"{n:02d}.html").write_text(html, encoding="utf-8")
    print("목업", len(M), "장")
