"""환경변수 설정. 기본값은 로컬 개발(키 없음, CPU, tiny 모델) 기준이다."""
import os


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


# Spring 이 보내는 내부 키. 비어 있으면 인증을 건너뛴다(로컬 개발용). 배포 환경에서는 반드시 설정한다.
API_KEY = os.getenv("DIO_AI_API_KEY", "")
API_KEY_HEADER = "X-Internal-Key"

# 입력 제한 (프론트 사진 선택기와 같은 값)
MAX_UPLOAD_BYTES = _int("DIO_AI_MAX_UPLOAD_BYTES", 20 * 1024 * 1024)
MAX_PIXELS = _int("DIO_AI_MAX_PIXELS", 40_000_000)

# 붓질 응답의 미리보기 PNG 긴 변 최대 픽셀. 앱이 원본 위에 늘려서 겹친다.
PREVIEW_MAX_SIDE = _int("SAM2_PREVIEW_MAX_SIDE", 768)

# 서버 시작 때 모델을 미리 올려 첫 요청이 느리지 않게 한다. 테스트에서는 0.
PRELOAD = os.getenv("SAM2_PRELOAD", "1") != "0"
