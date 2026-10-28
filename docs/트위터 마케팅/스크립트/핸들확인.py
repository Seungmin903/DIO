"""핸들(사용자명) 후보가 이미 쓰이고 있는지 확인 — X · 인스타그램 · 틱톡 · 유튜브의 공개 프로필 화면을 본다

실행:  python "docs/트위터 마케팅/스크립트/핸들확인.py" dio_diary diodiary ...      (X 만, 핸들을 직접 줄 때)
       python "docs/트위터 마케팅/스크립트/핸들확인.py"                                  (X 만, 아래 CANDIDATES 전부)
       python "docs/트위터 마케팅/스크립트/핸들확인.py" --sns diodiary_app withdio      (X · 인스타 · 틱톡 · 유튜브를 한 줄로)
읽는 법:
  X        x.com/<핸들> 응답 코드. 200 = 이미 있는 계정(정지된 계정 포함 — 정지 계정의 핸들도 못 쓴다) / 404 = 없는 계정(쓸 수 있을 가능성)
  인스타    렌더된 화면 제목에 '(@핸들)' 이 있으면 사용 중, '이용할 수 없습니다' 면 비어 있음
  틱톡      렌더된 화면 제목이 '이 계정을 찾을 수 없습니다' 면 비어 있음
  유튜브    youtube.com/@<핸들> 응답 코드 200 = 사용 중 / 404 = 비어 있음
한계:  로그인 없이 보이는 공개 응답만 본다. 삭제 후 아직 풀리지 않은 핸들 · 유보된 핸들 · 제한된 핸들은 '비어 있음' 이어도 가입 화면에서 막힐 수 있다.
       그러므로 **계정을 만드는 순간 각 서비스 가입 화면의 중복 확인이 최종 판단**이다. 이 표는 후보를 거르는 용도다.
       1.2초 간격을 둔다. 크롬이 필요하다(인스타 · 틱톡 확인).
"""
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

CONTROLS = [("nasa", "있어야 함(200)"), ("zq8xk2vw9tr4mlp", "없어야 함(404)")]

CANDIDATES = [
    "dio", "dio_", "dio_kr", "diokr", "dio_app", "dioapp", "dio_official", "dio_diary", "diodiary", "diodiary_kr",
    "diodiary_app", "dio_daily", "diodaily", "dio_dakku", "diodakku", "dio_ddakku", "dio_duri", "dioduri",
    "dio_and_duri", "dear_dio", "deardio", "hello_dio", "hi_dio", "dio_haru", "haru_dio", "dio_hanjang",
    "dio_oneday", "dio_room", "dio_note", "dio_page", "with_dio", "withdio", "dio_with", "dio_story",
    "dio_diary_kr", "dio_diary_app", "diary_dio", "diary_with_dio", "dio_dayone", "dio_today", "todaydio",
    "dio_world", "dio_log", "diolog", "dio_book", "diobook", "dio_cover", "dio_sticker", "dio_deco",
]


def http_status(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:  # 네트워크 오류
        return f"ERR {type(e).__name__}"


def x_status(handle):
    return http_status(f"https://x.com/{handle}")


def rendered_title(url, budget=12000):
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--lang=ko-KR", f"--user-agent={UA}", f"--virtual-time-budget={budget}", "--dump-dom", url],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90)
    m = re.search(r"<title>(.*?)</title>", r.stdout, re.S)
    return m.group(1).strip() if m else ""


def instagram(handle):
    t = rendered_title(f"https://www.instagram.com/{handle}/")
    if "이용할 수 없습니다" in t or "isn't available" in t or "isn&#x27;t available" in t:
        return "비어 있음"
    return "사용 중" if f"@{handle.lower()}" in t.lower() else f"확인 필요({t[:30]})"


def tiktok(handle):
    t = rendered_title(f"https://www.tiktok.com/@{handle}")
    if "찾을 수 없습니다" in t or "Couldn't find" in t:
        return "비어 있음"
    return "사용 중" if t else "확인 필요"


def youtube(handle):
    s = http_status(f"https://www.youtube.com/@{handle}")
    return {200: "사용 중", 404: "비어 있음"}.get(s, f"확인 필요({s})")


def x_label(handle):
    n, s = len(handle), x_status(handle)
    if n > 15:
        return "15자 초과"
    return {200: "사용 중", 404: "비어 있음"}.get(s, f"확인 필요({s})")


def main_x(handles):
    print(time.strftime("확인 시각 %Y-%m-%d %H:%M"))
    print("| 핸들 | 글자 수 | 응답 | 해석 |")
    print("|---|---|---|---|")
    for h, note in CONTROLS:
        print(f"| {h} (대조) | {len(h)} | {x_status(h)} | {note} |")
        time.sleep(1.2)
    for h in handles:
        n, s = len(h), x_status(h)
        why = "15자 초과 — 못 씀" if n > 15 else {200: "사용 중(못 씀)", 404: "비어 있음(가능성)"}.get(s, "다시 확인")
        print(f"| {h} | {n} | {s} | {why} |")
        time.sleep(1.2)


def main_sns(handles):
    print(time.strftime("확인 시각 %Y-%m-%d %H:%M"))
    print("| 핸들 | 글자 수 | X | 인스타그램 | 틱톡 | 유튜브 |")
    print("|---|---|---|---|---|---|")
    for h in handles:
        row = (x_label(h), instagram(h), tiktok(h), youtube(h))
        print(f"| {h} | {len(h)} | " + " | ".join(row) + " |", flush=True)
        time.sleep(1.2)


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--sns" in args:
        args.remove("--sns")
        main_sns(args or ["diodiary_app"])
    else:
        main_x(args or CANDIDATES)
