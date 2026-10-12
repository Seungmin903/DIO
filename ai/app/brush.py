"""붓질(stroke) → SAM 2 프롬프트 점 + 지우개 마스크.

- 선택 붓: 붓 자국을 따라 점을 뽑아 '포함' 힌트로 준다. (경계는 SAM 이 찾는다)
- 지우개: '제외' 힌트로도 주고, 칠한 영역은 결과 마스크에서 확실히 지운다.
"""
import cv2
import numpy as np

MAX_POINTS_PER_STROKE = 8
MAX_POINTS_TOTAL = 32


def _resample(path: np.ndarray, spacing: float, limit: int) -> np.ndarray:
    """선을 따라 거의 같은 간격으로 최대 limit 개의 점을 뽑는다."""
    if len(path) == 1:
        return path
    seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
    dist = np.concatenate([[0], np.cumsum(seg)])
    n = int(np.clip(dist[-1] / spacing, 1, limit))
    targets = np.linspace(0, dist[-1], n + 1)[1:] - dist[-1] / (2 * n)  # 각 구간의 가운데
    return np.stack([np.interp(targets, dist, path[:, i]) for i in range(2)], axis=1)


def prompt_points(strokes, w: int, h: int) -> list[tuple[float, float, int]]:
    """strokes → [(x, y, label)] (x, y 는 0~1 비율). label 1=포함, 0=제외."""
    points = []
    for s in strokes:
        path = np.array([[p.x * w, p.y * h] for p in s.points], dtype=np.float32)
        spacing = max(s.size * w * 3, 8)  # 붓 굵기의 몇 배 간격으로 점을 찍는다
        label = 1 if s.mode == "include" else 0
        points += [(float(x) / w, float(y) / h, label) for x, y in _resample(path, spacing, MAX_POINTS_PER_STROKE)]
    if len(points) > MAX_POINTS_TOTAL:
        idx = np.linspace(0, len(points) - 1, MAX_POINTS_TOTAL).round().astype(int)
        points = [points[i] for i in idx]
    return points


def erase_mask(strokes, w: int, h: int) -> np.ndarray:
    """지우개로 칠한 영역 (bool, H×W)."""
    out = np.zeros((h, w), np.uint8)
    for s in strokes:
        if s.mode != "exclude":
            continue
        radius = max(1, round(s.size * w))
        pts = np.array([[p.x * w, p.y * h] for p in s.points]).round().astype(np.int32)
        if len(pts) == 1:
            cv2.circle(out, tuple(int(v) for v in pts[0]), radius, 1, -1)
        else:
            cv2.polylines(out, [pts], False, 1, thickness=radius * 2, lineType=cv2.LINE_8)
            for x, y in (pts[0], pts[-1]):  # 둥근 붓 끝
                cv2.circle(out, (int(x), int(y)), radius, 1, -1)
    return out.astype(bool)
