import base64
import hmac
import io
import logging
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Request, UploadFile
from fastapi.responses import FileResponse, Response
from PIL import Image
from pydantic import BaseModel, Field, model_validator

from app import config, errors
from app.brush import erase_mask, prompt_points
from app.images import load_image, read_limited
from app.sticker import clean_mask, make_preview, make_sticker

log = logging.getLogger("dio-ai")
STATIC = Path(__file__).parent / "static"


@lru_cache(maxsize=1)
def get_segmenter():
    # torch·모델 로딩이 무거워서 처음 쓸 때 가져온다. 테스트는 dependency_overrides 로 바꿔 끼운다.
    from app.segmenter import Segmenter
    return Segmenter()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not config.API_KEY:
        log.warning("DIO_AI_API_KEY 가 비어 있어 내부 키 검사를 하지 않습니다. 로컬 개발에서만 이렇게 쓰세요.")
    if config.PRELOAD:
        get_segmenter()
    yield


app = FastAPI(title="dio-ai", description="SAM 2 사진 속 대상 오리기 서버 (Spring 내부 호출용)", lifespan=lifespan)
app.add_exception_handler(errors.ApiError, errors.handle_api_error)


def require_key(request: Request) -> None:
    """Spring 만 부를 수 있게 내부 키를 확인한다. 키를 설정하지 않은 로컬 개발에서는 통과."""
    if not config.API_KEY:
        return
    given = request.headers.get(config.API_KEY_HEADER, "")
    if not hmac.compare_digest(given.encode(), config.API_KEY.encode()):
        raise errors.unauthorized()


class Point(BaseModel):
    x: float = Field(ge=0, le=1, description="가로 비율 좌표 (0~1)")
    y: float = Field(ge=0, le=1, description="세로 비율 좌표 (0~1)")


class TapPoint(Point):
    label: int = Field(1, ge=0, le=1, description="1=포함, 0=제외")


class Stroke(BaseModel):
    mode: Literal["include", "exclude"] = Field(description="include=선택 붓, exclude=지우개")
    size: float = Field(gt=0, le=0.5, description="붓 반지름 (사진 가로 대비 비율)")
    points: list[Point] = Field(min_length=1, max_length=1200, description="붓이 지나간 경로. 점 하나면 탭")


class StickerRequest(BaseModel):
    """A안(탭)은 points, B안(붓)은 strokes 중 하나를 보낸다."""
    imageId: str
    points: list[TapPoint] | None = Field(None, min_length=1, max_length=64, description="A안: 탭한 점들 (힌트로만 사용)")
    strokes: list[Stroke] | None = Field(None, min_length=1, max_length=150, description="B안: 붓질 (지우개는 실제로도 지움)")

    @model_validator(mode="after")
    def one_of(self):
        if (self.points is None) == (self.strokes is None):
            raise ValueError("points 와 strokes 중 하나만 보내야 합니다")
        return self


class SegmentRequest(StickerRequest):
    includeSticker: bool = Field(False, description="true 면 최종 스티커 PNG 도 함께 돌려준다 (테스트 페이지용)")


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
    from app.segmenter import DEVICE, MODEL_ID
    return {"status": "ok", "model": MODEL_ID, "device": DEVICE}


def _data_url(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _mask(req: StickerRequest, segmenter):
    item = segmenter.get(req.imageId)
    if item is None:
        raise errors.image_expired()
    w, h = item.image.size
    if req.points is not None:
        points = [(p.x, p.y, p.label) for p in req.points]
        erase = None
    else:
        points = prompt_points(req.strokes, w, h)
        erase = erase_mask(req.strokes, w, h)
    if not any(label == 1 for _, _, label in points):
        raise errors.no_include()
    mask, elapsed = segmenter.segment(item, points)
    mask = clean_mask(mask, erase)
    if mask.sum() == 0:
        raise errors.empty_selection()
    return item, mask, elapsed, len(points)


# 무거운 계산은 일반 def 로 둔다. FastAPI 가 스레드에서 실행하므로 계산 중에도 다른 요청을 받는다.
@app.post("/api/stickers/images", dependencies=[Depends(require_key)])
def upload_image(file: UploadFile, segmenter=Depends(get_segmenter)):
    """사진을 받아 SAM 2 이미지 임베딩을 미리 계산해 둔다."""
    image = load_image(read_limited(file.file))
    image_id, elapsed = segmenter.embed(image)
    w, h = segmenter.get(image_id).image.size
    return {"imageId": image_id, "width": w, "height": h, "embedMs": round(elapsed * 1000)}


@app.post("/api/stickers/segment", dependencies=[Depends(require_key)])
def segment(req: SegmentRequest, segmenter=Depends(get_segmenter)):
    """붓질마다 호출. 원본 위에 겹칠 작은 선택 영역 미리보기를 돌려준다."""
    item, mask, elapsed, count = _mask(req, segmenter)
    body = {"preview": _data_url(make_preview(mask, config.PREVIEW_MAX_SIDE)),
            "segmentMs": round(elapsed * 1000), "promptPoints": count}
    if req.includeSticker:
        body["sticker"] = _data_url(make_sticker(item.image, mask))
    return body


@app.post("/api/stickers/render", dependencies=[Depends(require_key)],
          responses={200: {"content": {"image/png": {}}}})
def render(req: StickerRequest, segmenter=Depends(get_segmenter)):
    """확정한 선택으로 흰 테두리 스티커 PNG 를 만든다. 결과 확인·저장 때 한 번 호출."""
    item, mask, elapsed, _ = _mask(req, segmenter)
    buf = io.BytesIO()
    make_sticker(item.image, mask).save(buf, "PNG", optimize=True)
    return Response(buf.getvalue(), media_type="image/png", headers={"X-Segment-Ms": str(round(elapsed * 1000))})
