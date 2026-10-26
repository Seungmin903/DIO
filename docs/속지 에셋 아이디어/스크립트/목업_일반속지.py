# -*- coding: utf-8 -*-
"""① 일반 속지(오프라인) 목업 — 두 모듈을 합친다 (a: 기본 · 플래너 · 트래커, b: 일기 · 취향 · 구조)."""
try:
    from 목업_일반속지_가 import *  # noqa: F401,F403
except ImportError as e:  # 아직 안 만들어진 모듈은 건너뛴다
    print("목업_일반속지_가:", e)
try:
    from 목업_일반속지_나 import *  # noqa: F401,F403
except ImportError as e:
    print("목업_일반속지_나:", e)
