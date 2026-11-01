"""마스크 → 다꾸 스티커 PNG (투명 배경 + 흰 테두리 + 옅은 그림자)."""
import cv2
import numpy as np
from PIL import Image


def _remove_specks(mask: np.ndarray) -> np.ndarray:
    """가장 큰 덩어리 기준으로 너무 작은 조각은 버린다."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        keep = np.where(areas >= areas.max() * 0.05)[0] + 1
        mask = np.isin(labels, keep).astype(np.uint8)
    return mask


def clean_mask(mask: np.ndarray, erase: np.ndarray | None = None) -> np.ndarray:
    """SAM 마스크 다듬기: 잡티 제거 → 구멍 메우기 → (지우개 영역 빼기) → 잡티 제거. uint8 0/1 반환."""
    mask = _remove_specks(mask.astype(np.uint8))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    mask = np.zeros_like(mask)
    cv2.drawContours(mask, contours, -1, 1, thickness=cv2.FILLED)
    # 지우개는 구멍 메우기 뒤에 적용해야 일부러 뚫은 구멍이 다시 메워지지 않는다.
    if erase is not None:
        mask[erase] = 0
        mask = _remove_specks(mask)
    return mask


def make_preview(mask: np.ndarray, max_side: int | None = None) -> Image.Image:
    """원본 위에 겹쳐 보여줄 선택 영역 표시용 PNG (반투명 색 + 외곽선).

    max_side 를 주면 그 크기로 줄여서 만든다. 붓질마다 오가는 응답이라 작을수록 빠르다.
    """
    h, w = mask.shape
    if max_side and max(h, w) > max_side:
        scale = max_side / max(h, w)
        mask = cv2.resize(mask, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_NEAREST)
        h, w = mask.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[mask > 0] = (232, 115, 90, 110)
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out, contours, -1, (255, 255, 255, 255), thickness=max(2, w // 400))
    return Image.fromarray(out, "RGBA")


def make_sticker(image: Image.Image, mask: np.ndarray) -> Image.Image | None:
    """clean_mask 를 거친 마스크(uint8 0/1)로 스티커를 만든다."""
    if mask.sum() == 0:
        return None

    ys, xs = np.nonzero(mask)
    size = max(xs.max() - xs.min(), ys.max() - ys.min())
    border = max(4, int(size * 0.025))
    pad = border * 3

    rgb = np.array(image.convert("RGB"))
    rgb = cv2.copyMakeBorder(rgb, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    mask = cv2.copyMakeBorder(mask, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)

    # 부드러운 알파 (경계 안티앨리어싱). 1px 깎아서 배경색이 테두리에 묻어나는 것을 줄인다.
    inner = cv2.erode(mask, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(inner.astype(np.float32), (0, 0), 1.2)

    # 흰 테두리: 마스크를 원형으로 부풀린 영역
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (border * 2 + 1, border * 2 + 1))
    outline = cv2.dilate(mask, k).astype(np.float32)
    outline = cv2.GaussianBlur(outline, (0, 0), 1.0)

    # 그림자: 테두리를 아래로 살짝 밀고 흐리게
    shadow = np.roll(outline, max(2, border // 2), axis=0)
    shadow = cv2.GaussianBlur(shadow, (0, 0), border * 0.8) * 0.35

    h, w = mask.shape
    out = np.zeros((h, w, 4), np.float32)
    # 아래에서 위로: 그림자 → 흰 테두리 → 원본 피사체
    out[..., 3] = shadow
    out[..., :3] = 0
    out = _over(out, np.dstack([np.full((h, w, 3), 255.0), outline]))
    out = _over(out, np.dstack([rgb.astype(np.float32), alpha]))

    ys, xs = np.nonzero(out[..., 3] > 0.01)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out[..., 3] *= 255
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def _over(dst: np.ndarray, src: np.ndarray) -> np.ndarray:
    """알파 합성: src 를 dst 위에 얹는다. 두 배열 모두 RGB 0~255, A 0~1."""
    sa, da = src[..., 3:4], dst[..., 3:4]
    oa = sa + da * (1 - sa)
    rgb = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb, oa], axis=-1)
