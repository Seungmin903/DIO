"""업로드 사진 검사: 형식(파일 앞부분 바이트), 용량, 화소 수, EXIF 회전."""
import io

from PIL import Image, ImageOps

from app import config, errors

# 화소 수는 아래에서 직접 검사한다. Pillow 기본 경고 대신 우리 기준(MAX_PIXELS)을 쓴다.
Image.MAX_IMAGE_PIXELS = None


def detect_format(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def read_limited(stream, limit: int = None) -> bytes:
    """limit 를 넘으면 끝까지 읽지 않고 바로 거절한다."""
    limit = config.MAX_UPLOAD_BYTES if limit is None else limit
    data = stream.read(limit + 1)
    if len(data) > limit:
        raise errors.image_too_large(f"{limit // (1024 * 1024)}MB 이하 사진을 올려 주세요")
    return data


def load_image(data: bytes) -> Image.Image:
    if not data:
        raise errors.invalid_image()
    if detect_format(data) is None:
        raise errors.unsupported_format()
    try:
        image = Image.open(io.BytesIO(data))
        w, h = image.size  # 헤더만 읽은 상태라 큰 사진도 여기서는 메모리를 쓰지 않는다
    except Exception:
        raise errors.invalid_image()
    if w * h > config.MAX_PIXELS:
        raise errors.image_too_large(f"사진이 너무 큽니다. 최대 {config.MAX_PIXELS:,}화소까지 지원해요")
    try:
        return ImageOps.exif_transpose(image).convert("RGB")
    except Exception:
        raise errors.invalid_image()
