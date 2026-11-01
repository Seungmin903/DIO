"""API 계약 테스트. 모델 대신 가짜 segmenter 로 입력 검사·오류 형식·응답 모양을 확인한다."""
import base64
import io
import uuid
from dataclasses import dataclass

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import config
from app.main import app, get_segmenter


@dataclass
class FakeItem:
    image: Image.Image


class FakeSegmenter:
    """포함 점 둘레를 원으로 칠한 마스크를 돌려준다."""

    def __init__(self) -> None:
        self.items: dict[str, FakeItem] = {}

    def embed(self, image):
        image_id = uuid.uuid4().hex
        self.items[image_id] = FakeItem(image)
        return image_id, 0.01

    def get(self, image_id):
        return self.items.get(image_id)

    def segment(self, item, points):
        w, h = item.image.size
        yy, xx = np.mgrid[0:h, 0:w]
        mask = np.zeros((h, w), bool)
        for x, y, label in points:
            if label == 1:
                mask |= (xx - x * w) ** 2 + (yy - y * h) ** 2 < (min(w, h) * 0.2) ** 2
        return mask, 0.01


@pytest.fixture
def client():
    fake = FakeSegmenter()
    app.dependency_overrides[get_segmenter] = lambda: fake
    yield TestClient(app)
    app.dependency_overrides.clear()


def png_bytes(size=(400, 300), fmt="PNG") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 160, 200)).save(buf, fmt)
    return buf.getvalue()


def upload(client, data: bytes, headers=None):
    return client.post("/api/stickers/images", files={"file": ("photo", data, "application/octet-stream")}, headers=headers or {})


def test_upload_returns_image_id_and_size(client):
    res = upload(client, png_bytes())
    assert res.status_code == 200
    body = res.json()
    assert body["imageId"] and body["width"] == 400 and body["height"] == 300


@pytest.mark.parametrize("fmt", ["JPEG", "WEBP"])
def test_upload_accepts_jpeg_and_webp(client, fmt):
    assert upload(client, png_bytes(fmt=fmt)).status_code == 200


def test_upload_rejects_gif_with_code(client):
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "GIF")
    res = upload(client, buf.getvalue())
    assert res.status_code == 415
    assert res.json()["code"] == "UNSUPPORTED_FORMAT"


def test_upload_rejects_broken_file(client):
    res = upload(client, b"\x89PNG\r\n\x1a\n" + b"broken")
    assert res.status_code == 400 and res.json()["code"] == "INVALID_IMAGE"


def test_upload_rejects_too_many_bytes(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 100)
    res = upload(client, png_bytes())
    assert res.status_code == 413 and res.json()["code"] == "IMAGE_TOO_LARGE"


def test_upload_rejects_too_many_pixels(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_PIXELS", 1000)
    res = upload(client, png_bytes())
    assert res.status_code == 413 and res.json()["code"] == "IMAGE_TOO_LARGE"


def test_segment_returns_small_preview_without_sticker(client, monkeypatch):
    monkeypatch.setattr(config, "PREVIEW_MAX_SIDE", 100)
    image_id = upload(client, png_bytes()).json()["imageId"]
    res = client.post("/api/stickers/segment", json={
        "imageId": image_id,
        "strokes": [{"mode": "include", "size": 0.03, "points": [{"x": 0.5, "y": 0.5}, {"x": 0.55, "y": 0.5}]}],
    })
    assert res.status_code == 200
    body = res.json()
    assert "sticker" not in body
    preview = Image.open(io.BytesIO(base64.b64decode(body["preview"].split(",", 1)[1])))
    assert max(preview.size) == 100


def test_segment_can_include_sticker_for_test_pages(client):
    image_id = upload(client, png_bytes()).json()["imageId"]
    res = client.post("/api/stickers/segment", json={"imageId": image_id, "points": [{"x": 0.5, "y": 0.5}], "includeSticker": True})
    assert res.status_code == 200 and res.json()["sticker"].startswith("data:image/png;base64,")


def test_render_returns_png_bytes(client):
    image_id = upload(client, png_bytes()).json()["imageId"]
    res = client.post("/api/stickers/render", json={"imageId": image_id, "points": [{"x": 0.5, "y": 0.5}]})
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(res.content)).mode == "RGBA"


def test_unknown_image_is_expired(client):
    res = client.post("/api/stickers/segment", json={"imageId": "nope", "points": [{"x": 0.5, "y": 0.5}]})
    assert res.status_code == 404 and res.json()["code"] == "IMAGE_EXPIRED"


def test_only_exclude_strokes_need_include(client):
    image_id = upload(client, png_bytes()).json()["imageId"]
    res = client.post("/api/stickers/render", json={
        "imageId": image_id, "strokes": [{"mode": "exclude", "size": 0.05, "points": [{"x": 0.5, "y": 0.5}]}]})
    assert res.status_code == 422 and res.json()["code"] == "NO_INCLUDE"


def test_eraser_over_whole_selection_is_empty(client):
    image_id = upload(client, png_bytes()).json()["imageId"]
    res = client.post("/api/stickers/render", json={"imageId": image_id, "strokes": [
        {"mode": "include", "size": 0.01, "points": [{"x": 0.5, "y": 0.5}]},
        {"mode": "exclude", "size": 0.5, "points": [{"x": 0.5, "y": 0.5}]},
    ]})
    assert res.status_code == 422 and res.json()["code"] == "EMPTY_SELECTION"


def test_internal_key_required_when_configured(client, monkeypatch):
    monkeypatch.setattr(config, "API_KEY", "secret")
    assert upload(client, png_bytes()).status_code == 401
    assert upload(client, png_bytes(), {"X-Internal-Key": "wrong"}).json()["code"] == "UNAUTHORIZED"
    assert upload(client, png_bytes(), {"X-Internal-Key": "secret"}).status_code == 200


def test_health_is_open_even_with_key(client, monkeypatch):
    monkeypatch.setattr(config, "API_KEY", "secret")
    assert client.get("/api/health").json()["status"] == "ok"
