# ai — 사진으로 스티커 만들기 (SAM 2 PoC)

사진에서 원하는 대상을 골라 그 대상만 잘라 **흰 테두리 다꾸 스티커 PNG**로 만들어 주는 실험용 서버입니다.
모델: [SAM 2.1 hiera-tiny](https://huggingface.co/facebook/sam2.1-hiera-tiny) (Apache 2.0), CPU 전용.

## 실행

[uv](https://docs.astral.sh/uv/)가 필요합니다. (Python 3.12는 uv가 알아서 설치)

```bash
cd ai
uv sync
uv run uvicorn app.main:app --port 8000 --reload
```

http://localhost:8000 에 접속하면 두 가지 버전을 고를 수 있습니다.

| 주소 | 버전 | 고르는 방식 |
|---|---|---|
| `/tap` | A안 · 탭 | 대상을 점으로 찍기. 제외 점은 AI 힌트로만 사용 |
| `/brush` | B안 · 붓 | 대상을 대충 칠하기. 지우개로 칠한 곳은 실제로도 지움 |

같은 와이파이의 팀원/휴대폰에서 접속하려면 `--host 0.0.0.0` 을 붙여 실행하고 `http://{내 PC IP}:8000` 으로 접속합니다.
`--reload` 옵션이 있으면 코드를 고칠 때 서버가 자동으로 재시작됩니다.
첫 실행 때 모델(약 150MB)을 Hugging Face에서 내려받아 시작이 30초 정도 걸립니다.

## 동작 방식

무거운 이미지 인코딩은 사진당 한 번만 하고, 붓질할 때마다는 가벼운 디코딩만 합니다.

| 단계 | API | CPU 소요 (노트북 기준) |
|---|---|---|
| 사진 분석 (1회) | `POST /api/stickers/images` (multipart `file`) → `{imageId}` | 약 1.5초 |
| 탭/붓질 → 스티커 | `POST /api/stickers/segment` → `{sticker, preview, segmentMs}` | 약 0.05~0.1초 |

`segment` 요청은 `points`(A안) 와 `strokes`(B안) 중 하나를 보냅니다.

```json
{ "imageId": "…", "points": [{ "x": 0.25, "y": 0.5, "label": 1 }, { "x": 0.1, "y": 0.2, "label": 0 }] }
```

```json
{
  "imageId": "…",
  "strokes": [
    { "mode": "include", "size": 0.03, "points": [{ "x": 0.2, "y": 0.6 }, { "x": 0.35, "y": 0.35 }] },
    { "mode": "exclude", "size": 0.06, "points": [{ "x": 0.38, "y": 0.1 }] }
  ]
}
```

- A안 `label`: 1=포함, 0=제외
- B안 `mode`: `include`=선택 붓, `exclude`=지우개 / `size`: 붓 반지름(사진 가로 대비 비율) / `x`, `y`: 0~1 비율 좌표
- 점이 하나뿐인 stroke 는 탭으로 취급합니다.
- **선택 붓**: 붓 자국을 따라 힌트 점을 뽑아 SAM 에 '포함'으로 전달합니다. 경계는 SAM 이 찾습니다.
- **지우개**: SAM 에 '제외' 힌트로 주고, 칠한 영역은 결과에서 확실히 지웁니다.
- 응답의 `sticker` 는 흰 테두리 스티커 PNG, `preview` 는 원본 위에 겹쳐 보여줄 선택 영역 PNG (둘 다 data URL)
- 실서비스에서는 사진 업로드 직후 1단계를 비동기로 돌려 두면 사용자는 기다리지 않습니다.
- PoC라 임베딩은 메모리에만 최근 32장 보관합니다. 서버를 재시작하면 사진을 다시 올려야 합니다.

## 코드 구조

| 파일 | 역할 |
|---|---|
| `app/main.py` | FastAPI 엔드포인트, 요청/응답 형식 |
| `app/segmenter.py` | SAM 2 모델 로딩, 사진 임베딩 계산·캐시, 점 → 마스크 |
| `app/brush.py` | 붓질 → SAM 힌트 점 추출, 지우개 영역 계산 |
| `app/sticker.py` | 마스크 다듬기, 스티커 PNG(흰 테두리·그림자), 미리보기 PNG |
| `app/static/index.html` | 버전 선택 화면 |
| `app/static/tap.html` | A안 테스트 페이지 (탭) |
| `app/static/brush.html` | B안 테스트 페이지 (붓) |

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `SAM2_MODEL_ID` | `facebook/sam2.1-hiera-tiny` | `-small` 등으로 바꾸면 품질↑ 속도↓ |
| `SAM2_DEVICE` | GPU 있으면 `cuda`, 없으면 `cpu` | |
| `SAM2_MAX_SIDE` | `1536` | 입력 사진 긴 변 최대 픽셀 |
| `SAM2_CACHE_SIZE` | `32` | 메모리에 보관할 사진 임베딩 수 |
