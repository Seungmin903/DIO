"""오류 응답 형식: {"code": "IMAGE_EXPIRED", "message": "..."} — Spring 이 code 로 분기한다."""
from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status, self.code, self.message = status, code, message


def unauthorized() -> ApiError:
    return ApiError(401, "UNAUTHORIZED", "내부 키가 없거나 맞지 않습니다")


def invalid_image() -> ApiError:
    return ApiError(400, "INVALID_IMAGE", "이미지 파일을 읽을 수 없습니다")


def unsupported_format() -> ApiError:
    return ApiError(415, "UNSUPPORTED_FORMAT", "JPG·PNG·WebP 사진만 사용할 수 있습니다")


def image_too_large(message: str) -> ApiError:
    return ApiError(413, "IMAGE_TOO_LARGE", message)


def image_expired() -> ApiError:
    return ApiError(404, "IMAGE_EXPIRED", "imageId 가 없거나 만료되었습니다. 사진을 다시 올려주세요")


def no_include() -> ApiError:
    return ApiError(422, "NO_INCLUDE", "포함할 곳을 한 번 이상 선택해 주세요")


def empty_selection() -> ApiError:
    return ApiError(422, "EMPTY_SELECTION", "선택된 영역이 없습니다")


async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)
