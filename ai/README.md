# ai — 사진 속 대상 오리기 서버 (SAM 2)

사진에서 원하는 대상을 골라 그 대상만 잘라 **흰 테두리 다꾸 스티커 PNG**로 만들어 주는 서버입니다.
앱은 이 서버를 직접 부르지 않고, **로그인한 사용자의 요청을 Spring 백엔드가 받아 내부에서 호출**합니다.
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

## Docker (dev·운영 서버 배포)

dev 서버에서는 `infra/compose/compose.dev.yml`, 운영 서버에서는 `infra/compose/compose.prod.yml`의 `ai` 컨테이너로 뜹니다. 각각 `deploy-development`, `deploy-production` CI 잡이 `./ai`를 빌드합니다. 두 환경은 같은 EC2에서 돌아 AI 컨테이너만 최대 4GB를 쓸 수 있습니다. 운영 배포 전 호스트 총 메모리와 backend·DB·dev 스택 사용량을 합산해 여유를 확인합니다.

운영 배포는 AI 이미지 태그를 `ai/` 폴더 내용(git tree 해시)으로 정합니다. `ai/`가 바뀌지 않은 배포(backend만 수정)는 AI 빌드와 컨테이너 재생성을 건너뛰어, 모델 재로딩·임베딩 캐시 손실 없이 오리기 기능이 계속 동작합니다. `ai/`가 바뀐 배포에서는 새 AI가 healthy가 될 때까지(최대 3분) 오리기 요청이 실패할 수 있고, 그 뒤에 backend를 교체합니다. healthcheck는 이미지의 `HEALTHCHECK`(start-period 90초)를 쓰며, 중간에 unhealthy가 떠도 3분 안에 healthy로 돌아오면 성공으로 봅니다.

### 운영 배포 롤백

- 롤백 기준은 마지막으로 배포 전체가 성공한 이미지 `dio-backend:prod-last-good`·`dio-ai:prod-last-good`입니다. backend health까지 통과하면 그때 갱신합니다. 같은 커밋으로 재시도해도 이 기준으로 되돌아갑니다.
- 새 AI가 3분 안에 healthy가 되지 않거나 종료되면 `infra/scripts/up-ai-with-rollback.sh`가 AI를 되돌리고, backend는 교체하지 않은 채 실패합니다.
- 새 backend가 health에 응답하지 않으면 `infra/scripts/up-backend-with-rollback.sh`가 backend와 AI를 함께 되돌리고, 되돌린 backend의 health도 확인합니다.
- 정상 배포 기록이 없으면(첫 운영 배포) 되돌리지 않고 실패만 알립니다. 이때는 다음 성공 배포 전까지 해당 기능이 멈춥니다.
- **스키마는 되돌리지 않습니다.** 새 backend가 Flyway 마이그레이션을 적용한 뒤 실패하면 이전 backend가 새 스키마로 뜹니다. 컬럼 삭제·이름 변경처럼 이전 backend와 맞지 않는 마이그레이션은 추가 → 전환 → 정리(expand/contract) 단계로 나눠 배포합니다.
- 분기 검증: `bash infra/scripts/test-deploy-rollback.sh`(Docker 필요, 테스트용 작은 이미지로 7개 경우를 확인).

### 메모리

캐시 24장(약 1.3GB)에 모델 가중치와 torch 런타임이 더해집니다. 2GB 상한이 실제로 충분한지는 운영 부하에서 캐시가 찼을 때 `docker stats dio-prod-backend-ai-1`로 실측해 확인하고, 모자라면 `SAM2_CACHE_SIZE`를 줄입니다. OOM으로 재시작됐는지는 `docker inspect -f '{{.State.OOMKilled}} {{.RestartCount}}' dio-prod-backend-ai-1`로 봅니다.

- 이미지에 CPU 전용 torch와 모델을 미리 넣습니다. 실행 중에는 인터넷에서 모델을 받지 않습니다(`HF_HUB_OFFLINE=1`).
- 외부 포트가 없습니다. backend와 둘만 쓰는 `internal` 네트워크로 `http://ai:8000`에 접근합니다.
- 메모리 2GB, CPU 2코어 상한이 걸려 있습니다(운영은 스왑 포함 2GB, `memswap_limit`). worker는 하나입니다.
- `DIO_AI_API_KEY`는 서버 `dev.env`·`prod.env`에 넣고(환경마다 다른 값), 같은 환경의 backend와 ai가 같은 값을 받습니다. 비어 있으면 배포가 중단됩니다.

로컬에서 이미지 확인:

```bash
docker build -t dio-ai:local ./ai
docker run --rm -p 8000:8000 -e DIO_AI_API_KEY=local-test dio-ai:local
# 다른 터미널: curl http://localhost:8000/api/health
```

## 동작 방식

무거운 이미지 인코딩은 사진당 한 번만 하고, 붓질할 때마다는 가벼운 디코딩만 합니다.

| 단계 | API | 응답 | CPU 소요 (노트북 기준) |
|---|---|---|---|
| 사진 분석 (1회) | `POST /api/stickers/images` (multipart `file`) | `{imageId, width, height, embedMs}` | 약 1.5~2초 |
| 붓질할 때마다 | `POST /api/stickers/segment` | `{preview, segmentMs, promptPoints}` | 약 0.1~0.2초 |
| 결과 확인·저장 (1회) | `POST /api/stickers/render` | 스티커 PNG 바이트 (`image/png`) | 약 0.2초 + 합성 |

`segment`와 `render`는 같은 본문을 받습니다. `points`(A안 탭)와 `strokes`(B안 붓) 중 하나를 보냅니다.

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
- 점이 하나뿐인 stroke 는 탭으로 취급합니다. 획은 최대 150개, 획당 점은 최대 1200개입니다.
- **선택 붓**: 붓 자국을 따라 힌트 점을 뽑아 SAM 에 '포함'으로 전달합니다. 경계는 SAM 이 찾습니다.
- **지우개**: SAM 에 '제외' 힌트로 주고, 칠한 영역은 결과에서 확실히 지웁니다.
- `segment` 응답의 `preview`는 원본 위에 늘려 겹쳐 보여줄 선택 영역 PNG(data URL)이고, 긴 변 768px 이하로 줄여 보냅니다.
- 최종 스티커는 `render`로 한 번만 받습니다. 테스트 페이지처럼 붓질마다 스티커가 필요하면 `segment`에 `"includeSticker": true`를 넣습니다.

### 입력 제한

JPG·PNG·WebP(파일 앞부분 바이트로 판별), 20MB, 4천만 화소까지 받습니다. 사진은 EXIF 회전을 적용한 뒤 긴 변 1536px로 줄여 계산합니다. 좌표는 **회전을 적용한 사진** 기준입니다.

### 오류 응답

모든 오류는 `{"code": "...", "message": "..."}` 형식입니다. Spring 은 `code`로 분기합니다.

| HTTP | code | 상황 |
|---|---|---|
| 400 | `INVALID_IMAGE` | 사진을 읽을 수 없음 |
| 401 | `UNAUTHORIZED` | 내부 키가 없거나 다름 |
| 404 | `IMAGE_EXPIRED` | `imageId`가 없거나 만료됨 → 사진을 다시 올림 |
| 413 | `IMAGE_TOO_LARGE` | 20MB 또는 4천만 화소 초과 |
| 415 | `UNSUPPORTED_FORMAT` | JPG·PNG·WebP가 아님 |
| 422 | `NO_INCLUDE` | 포함 붓·탭이 하나도 없음 |
| 422 | `EMPTY_SELECTION` | 지우개로 다 지워 남은 영역이 없음 |

(요청 형식이 틀리면 FastAPI 기본 422 `detail` 응답이 나옵니다.)

### 내부 키와 운영 주의

- `DIO_AI_API_KEY`를 설정하면 `/api/stickers/*` 요청은 `X-Internal-Key` 헤더가 같아야 합니다. `/api/health`와 테스트 페이지는 키 없이 열립니다. **이 서버 포트는 외부에 열지 않고 Spring 에서만 접근**하게 둡니다.
- 사진 임베딩은 메모리에만 보관합니다(최근 32장, 마지막 사용 후 30분). 서버를 재시작하면 `IMAGE_EXPIRED`가 나므로 사진을 다시 올리면 됩니다.
- 같은 이유로 **프로세스는 하나만** 띄웁니다(`--workers` 옵션 쓰지 않기). 여러 개면 다른 프로세스가 `imageId`를 모릅니다.

## 테스트

```bash
uv run pytest
```

모델을 올리지 않고 가짜 세그멘터로 입력 검사·오류 형식·응답 모양을 확인합니다.

## 코드 구조

| 파일 | 역할 |
|---|---|
| `app/main.py` | FastAPI 엔드포인트, 요청/응답 형식, 내부 키 확인 |
| `app/config.py` | 환경변수 설정 |
| `app/images.py` | 업로드 사진 검사 (형식·용량·화소·EXIF 회전) |
| `app/errors.py` | 오류 코드와 응답 형식 |
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
| `SAM2_CACHE_TTL_SEC` | `1800` | 마지막 사용 후 이 시간(초)이 지나면 임베딩 삭제 |
| `SAM2_PREVIEW_MAX_SIDE` | `768` | 붓질 미리보기 PNG 긴 변 최대 픽셀 |
| `SAM2_STICKER_MAX_SIDE` | `1024` | 저장용 스티커 PNG 긴 변 최대 픽셀 (미디어 5MB 한도 대비) |
| `SAM2_PRELOAD` | `1` | 서버 시작 때 모델을 미리 올림. `0`이면 첫 요청 때 올림 |
| `DIO_AI_API_KEY` | (없음) | Spring 과 맞출 내부 키. 비우면 키 검사 안 함(로컬 개발 전용) |
| `DIO_AI_MAX_UPLOAD_BYTES` | `20971520` | 업로드 최대 바이트 (20MB) |
| `DIO_AI_MAX_PIXELS` | `40000000` | 업로드 최대 화소 수 |
