import base64
import io
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from pydantic import BaseModel, Field, model_validator

from app.brush import erase_mask, prompt_points
from app.segmenter import DEVICE, MODEL_ID, Segmenter
from app.sticker import clean_mask, make_preview, make_sticker

app = FastAPI(title="dio-ai", description="SAM 2 스티커 만들기 PoC (A안: 탭 / B안: 붓)")
segmenter = Segmenter()
STATIC = Path(__file__).parent / "static"


class Point(BaseModel):
    x: float = Field(ge=0, le=1, description="가로 비율 좌표 (0~1)")
    y: float = Field(ge=0, le=1, description="세로 비율 좌표 (0~1)")


class TapPoint(Point):
    label: int = Field(1, ge=0, le=1, description="1=포함, 0=제외")


class Stroke(BaseModel):
    mode: Literal["include", "exclude"] = Field(description="include=선택 붓, exclude=지우개")
    size: float = Field(gt=0, le=0.5, description="붓 반지름 (사진 가로 대비 비율)")
    points: list[Point] = Field(min_length=1, description="붓이 지나간 경로. 점 하나면 탭")


class StickerRequest(BaseModel):
    """A안(탭)은 points, B안(붓)은 strokes 중 하나를 보낸다."""
    imageId: str
    points: list[TapPoint] | None = Field(None, min_length=1, description="A안: 탭한 점들 (힌트로만 사용)")
    strokes: list[Stroke] | None = Field(None, min_length=1, description="B안: 붓질 (지우개는 실제로도 지움)")

    @model_validator(mode="after")
    def one_of(self):
        if (self.points is None) == (self.strokes is None):
            raise ValueError("points 와 strokes 중 하나만 보내야 합니다")
        return self


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/tap", include_in_schema=False)
def tap_page():
    return FileResponse(STATIC / "tap.html")


@app.get("/brush", include_in_schema=False)
def brush_page():
    return FileResponse(STATIC / "brush.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_ID, "device": DEVICE}


@app.post("/api/stickers/images")
async def upload_image(file: UploadFile):
    """사진을 받아 SAM 2 이미지 임베딩을 미리 계산해 둔다. (실서비스에선 사진 업로드 직후 비동기로 수행)"""
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(await file.read())))
    except Exception:
        raise HTTPException(400, "이미지 파일이 아닙니다")
    image_id, elapsed = segmenter.embed(image)
    w, h = segmenter.get(image_id).image.size
    return {"imageId": image_id, "width": w, "height": h, "embedMs": round(elapsed * 1000)}


def _data_url(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@app.post("/api/stickers/segment")
def segment(req: StickerRequest):
    """탭한 점 또는 붓질로 피사체를 골라 스티커 PNG 와 선택 영역 미리보기를 반환한다."""
    item = segmenter.get(req.imageId)
    if item is None:
        raise HTTPException(404, "imageId 가 없거나 만료되었습니다. 사진을 다시 올려주세요")
    w, h = item.image.size
    if req.points is not None:
        points = [(p.x, p.y, p.label) for p in req.points]
        erase = None
    else:
        points = prompt_points(req.strokes, w, h)
        erase = erase_mask(req.strokes, w, h)
    if not any(label == 1 for _, _, label in points):
        raise HTTPException(422, "포함할 곳을 한 번 이상 선택해 주세요")
    mask, elapsed = segmenter.segment(item, points)
    mask = clean_mask(mask, erase)
    sticker = make_sticker(item.image, mask)
    if sticker is None:
        raise HTTPException(422, "선택된 영역이 없습니다")
    return {"sticker": _data_url(sticker), "preview": _data_url(make_preview(mask)),
            "segmentMs": round(elapsed * 1000), "promptPoints": len(points)}
