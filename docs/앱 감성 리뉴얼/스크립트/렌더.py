# -*- coding: utf-8 -*-
"""목업/화면.html#<화면>|<안>|<기기> → 이미지/시안/<화면> <안> <기기>.jpg (크롬 헤드리스 2배)

실행:  python "docs/앱 감성 리뉴얼/스크립트/렌더.py"                전부
       python "docs/앱 감성 리뉴얼/스크립트/렌더.py" 홈 A           이름에 '홈 A'가 들어간 장면만
필요:  pip install pillow · 크롬 · 인터넷(글씨체)
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent.parent
PAGE = HERE / "목업" / "화면.html"
OUT = HERE / "이미지" / "시안"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SIZE = {"태블릿": (1280, 800), "폰": (390, 844)}

# 화면 → 기기들
DEVICES = {"로그인": ["태블릿", "폰"], "회원가입": ["폰"], "홈": ["태블릿", "폰"], "공방": ["태블릿", "폰"], "내공간": ["태블릿", "폰"], "휴지통": ["태블릿", "폰"]}
SKINS = ["지금", "A", "B", "C", "혼합"]
# 상태 장면: 화면 → (안들, 기기들)
EXTRA = {"홈도구": (["A"], ["태블릿"]), "홈빈": (["A", "B", "C", "혼합"], ["태블릿"]), "휴지통빈": (["A", "B", "C", "혼합"], ["태블릿"])}


def scenes():
    base = [(s, k, d) for s, ds in DEVICES.items() for k in SKINS for d in ds]
    return base + [(s, k, d) for s, (ks, ds) in EXTRA.items() for k in ks for d in ds]


def shoot(screen: str, skin: str, dev: str) -> Path:
    w, h = SIZE[dev]
    name = f"{screen} {skin} {dev}"
    tmp = Path(tempfile.gettempdir()) / f"dio_gam_{abs(hash(name))}.png"
    url = PAGE.resolve().as_uri() + "#" + f"{screen}|{skin}|{dev}"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--window-size={w},{h}", "--virtual-time-budget=8000", "--allow-file-access-from-files",
                    f"--screenshot={tmp}", url], check=True, capture_output=True, timeout=120)
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.jpg"
    Image.open(tmp).convert("RGB").save(out, quality=88, optimize=True)
    tmp.unlink(missing_ok=True)
    print("ok", out.name)
    return out

def store():
    """목업/스토어.html#<1~5> → 이미지/스토어/스토어 <n>.jpg (540 × 960 · 2배). 시안(홈 A 폰 등)이 먼저 있어야 한다."""
    out_dir = HERE / "이미지" / "스토어"
    out_dir.mkdir(parents=True, exist_ok=True)
    page = HERE / "목업" / "스토어.html"
    for n in range(1, 6):
        tmp = Path(tempfile.gettempdir()) / f"dio_store_{n}.png"
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                        "--window-size=540,960", "--virtual-time-budget=8000", "--allow-file-access-from-files",
                        f"--screenshot={tmp}", page.resolve().as_uri() + f"#{n}"], check=True, capture_output=True, timeout=120)
        Image.open(tmp).convert("RGB").save(out_dir / f"스토어 {n}.jpg", quality=88, optimize=True)
        tmp.unlink(missing_ok=True)
        print("ok 스토어", n)


if __name__ == "__main__":
    if sys.argv[1:2] == ["스토어"]:
        store()
        raise SystemExit
    keys = sys.argv[1:]
    for s, k, d in scenes():
        label = f"{s} {k} {d}"
        if keys and not all(x in label for x in keys):
            continue
        shoot(s, k, d)

