# 사진 속 대상 오리기 AI 서버 (SAM 2.1, CPU 전용)
# - 백엔드만 내부망으로 부른다. 외부 포트는 열지 않는다(compose.dev.yml).
# - 모델은 빌드 때 이미지에 넣어 두고, 실행 중에는 인터넷에서 받지 않는다(HF_HUB_OFFLINE=1).
# - 레이어 순서: 의존성 → 모델 → 코드. 코드만 바뀌면 앞의 두 레이어는 캐시를 그대로 쓴다.
FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    HF_HOME=/opt/hf \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# 1) 의존성: CPU 전용 torch (pyproject.toml의 pytorch-cpu 인덱스, uv.lock 고정)
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) 모델: SAM2_MODEL_ID와 같은 모델을 미리 받아 둔다
ARG SAM2_MODEL_ID=facebook/sam2.1-hiera-tiny
ENV SAM2_MODEL_ID=${SAM2_MODEL_ID}
RUN python -c "import os; from transformers import Sam2Model, Sam2Processor; m=os.environ['SAM2_MODEL_ID']; Sam2Processor.from_pretrained(m); Sam2Model.from_pretrained(m)"

# 3) 코드
COPY app ./app

RUN useradd --system --uid 10001 --no-create-home dio-ai
USER dio-ai

ENV HF_HUB_OFFLINE=1 \
    SAM2_DEVICE=cpu

EXPOSE 8000

# 모델 로딩(약 10~30초)이 끝나야 /api/health가 응답한다.
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

# 임베딩 캐시가 프로세스 메모리에 있으므로 worker는 하나만 띄운다(README 참고).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
