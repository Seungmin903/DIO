# remote-content — 앱 배포 없이 추가하는 글꼴·스티커·속지

이 폴더에 파일을 넣고 커밋해 develop에 병합하면, 앱을 다시 배포하지 않아도 사용자 앱에 새 글꼴·스티커·속지가 나타납니다. 올리는 일은 GitLab CI가 합니다.

1. 이 폴더에 파일과 설명 json을 넣고(아래 형식) `frontend` 폴더에서 `pnpm assets:remote`로 형식을 확인합니다. 틀리면 무엇이 틀렸는지 알려 줍니다.
2. 커밋하고 MR을 올립니다. `remote-assets-check` 잡이 같은 검사를 다시 합니다.
3. develop에 병합되면 `publish-remote-assets-dev` 잡이 **개발** 에셋 버킷에 자동으로 올립니다.
4. 운영은 master 파이프라인에서 `publish-remote-assets-prod` 잡을 **직접 눌러** 올립니다.
5. 앱은 켜질 때 `catalog.json`을 받아 목록을 고칩니다(CloudFront 캐시로 최대 1분). 오프라인이면 기기에 저장된 마지막 목록을 씁니다.

- `catalog.json`은 매번 이 폴더 전체로 새로 만들어집니다. 이미 공개한 글꼴·스티커 팩·팩 안의 스티커·속지가 빠지면 업로드가 멈춥니다(안전장치). 내릴 때는 지우지 말고 `"hidden": true`를 쓰세요.
- 급할 때는 AWS 키가 있는 PC에서 직접 올릴 수도 있습니다. 같은 안전장치를 거칩니다: `pnpm assets:remote` 다음 `sh scripts/upload-remote-assets.sh <버킷> static-assets`.
- 로컬 미리보기: `pnpm assets:remote`, `pnpm assets:serve`를 실행하고 `.env`의 `EXPO_PUBLIC_ASSET_BASE_URL`을 비운 채 `pnpm web`.

## 글꼴

```
remote-content/fonts/<id>/
├── font.json
├── Hahmlet-Regular.ttf
├── Hahmlet-Bold.ttf      (굵게가 있을 때만)
└── OFL.txt               (필수: OFL.txt, LICENSE.txt, LICENSE 중 하나)
```

```json
{ "label": "함렛", "regular": "Hahmlet-Regular.ttf", "bold": "Hahmlet-Bold.ttf", "order": 10 }
```

| 항목 | 설명 |
| --- | --- |
| `<id>` 폴더 이름 | 영문 소문자·숫자·`-`, 40자 이내. 문서에는 `remote-<id>`로 저장되므로 **한 번 올린 뒤에는 바꾸지 않습니다.** |
| `label` | 글꼴 목록에 보일 이름(1~40자) |
| `regular` / `bold` | 같은 폴더의 `.ttf`·`.otf` 파일 이름(영문·숫자·`-_.`), 30 MiB 이하. `bold`는 생략할 수 있습니다. |
| `order` | 목록 순서(작을수록 앞). 생략하면 맨 뒤에 `id` 순으로 놓입니다. |
| `hidden` | `true`면 글꼴 목록에서만 숨깁니다. 이미 쓴 글자는 계속 그 글꼴로 그립니다. |

글꼴 목록에서는 기본 글꼴 뒤, 내 폰트 앞에 나옵니다. 사용자가 그 글꼴을 처음 쓸 때 파일을 내려받습니다.

## 스티커 팩

운영자가 올린 스티커 팩이 모든 사용자의 보관함에 나타납니다(사용자가 직접 올리는 '내 스티커'와는 별개입니다). 한 팩에 그림(PNG) 스티커와 도트 스티커를 섞을 수 있습니다.

```
remote-content/stickers/<id>/
├── pack.json
├── cherry.png        ← 그림 스티커 파일
└── ...
```

```json
{ "name": "봄", "order": 10, "stickers": [
  { "id": "cherry", "name": "벚꽃", "image": "cherry.png" },
  { "id": "tulip", "name": "튤립", "w": 13, "h": 15, "paths": [["#ffffff", "M2 0h9v1h-9z"], ["#e85d75", "M3 1h7v1h-7z"]] }
] }
```

- **그림 스티커(`image`)**: 같은 폴더의 PNG 파일 이름. 투명 배경 PNG, 2 MiB · 한 변 2048px 이하. 크기는 빌드가 파일에서 읽습니다. 페이지에 처음 붙을 때 긴 변 110에 그림 비율을 맞추고, 테두리 · 그림자 꾸미기도 됩니다.
- **도트 스티커(`w`·`h`·`paths`)**: 아래 형식.

| 항목 | 설명 |
| --- | --- |
| `<id>` 폴더 이름 / 스티커 `id` | 영문 소문자·숫자·`-`, 40자 이내. 페이지에는 `remote:<팩>:<스티커>`로 저장되므로 **한 번 올린 뒤에는 바꾸지 않습니다.** |
| `name` | 보관함 분류 칩과 스티커 이름(1~40자). 검색에도 씁니다. |
| `w` · `h` | 도트 칸 수(1~64). 페이지에 처음 붙을 때 한 칸은 기본 스티커와 같은 크기입니다. |
| `paths` | 뒤에서 앞으로 칠하는 `[색 #RRGGBB, 경로]`, 32개 이하. 경로는 `viewBox 0 0 w h` 기준으로 `M·H·V·L·Z`와 숫자만 씁니다. 형식은 앱의 '디오&모아' 스티커(`src/editor/builtinStickers.js`)와 같습니다. |
| `hidden` | 팩에 쓰면 팩 전체를, 스티커 하나에 쓰면 그 스티커만 보관함과 검색에서 숨깁니다. 이미 붙인 스티커는 계속 그립니다. 팩 안의 스티커를 지우면 업로드 안전장치가 막으므로, 내릴 때는 스티커에 `"hidden": true`를 씁니다. |

보관함의 기본 분류 칩에 '디오&모아' 다음으로 나옵니다. 사용자는 이 칩을 숨기거나 순서를 바꿀 수 있지만 지울 수는 없습니다.

## 속지

```
remote-content/templates/<id>/
├── template.json
├── spring-landscape.svg   (가로, viewBox="0 0 1024 768")
└── spring-portrait.svg    (세로, viewBox="0 0 768 1024")
```

```json
{ "name": "봄 노트", "group": "note", "landscape": "spring-landscape.svg", "portrait": "spring-portrait.svg", "order": 10 }
```

| 항목 | 설명 |
| --- | --- |
| `<id>` 폴더 이름 | 영문 소문자·숫자·`-`, 40자 이내. 페이지에는 `remote-<id>-<방향>`(서버는 `dio-remote-<방향>` + `remoteTemplate: <id>`)으로 저장되므로 **한 번 올린 뒤에는 바꾸지 않습니다.** |
| `name` | 속지 고르기 칸에 보일 이름(1~40자) |
| `group` | 들어갈 탭: 앱 탭 `note`(노트) · `planner`(플래너) · `diary`(일기), 또는 아래 `template-groups.json`에 적은 새 탭의 `id` |
| `landscape` / `portrait` | 가로·세로 SVG 둘 다 필요합니다. 2 MiB 이하. `viewBox`가 위 크기와 정확히 같아야 합니다. |
| `hidden` | `true`면 속지 고르기에서만 숨깁니다. 이미 만든 페이지는 계속 그립니다. |

- 장수를 고르는 한 장짜리 속지로 들어갑니다(새 다이어리의 속지 묶음, 편집기의 페이지 추가).
- **앱 속지와 같은 DIO 속지 형식만 받습니다**(`scripts/template-svg-rules.mjs`, 앱 속지 286장이 모두 이 검사를 통과합니다). 그래야 사용자의 속지 색·선 색 바꾸기가 그대로 적용됩니다.
  1. 루트 `<svg>`의 `width`·`height`·`viewBox`가 위 크기와 같아야 합니다.
  2. 처음 그리는 요소는 종이 전체를 덮는 `<rect width=".." height=".." fill="#ffffff"/>`입니다.
  3. `fill`·`stroke`는 `none` 또는 선 색 6가지(`#292929` `#666666` `#aeb3b8` `#bfc1c4` `#d7d9dc` `#e8e9eb`)만 씁니다. 진한 색일수록 진한 선이 됩니다.
  4. 도형(`path` `line` `rect` `circle` `ellipse` `polyline` `polygon`)과 `g`·`title`·`metadata`만 씁니다. 글자는 윤곽선(path)으로 바꿉니다. `style` 속성, `<style>`, `<text>`, `<image>`, 링크, 필터는 쓸 수 없습니다.
  5. 모든 도형에 `fill`이 있어야 합니다(자기나 감싼 `g`에). 없으면 검정으로 칠해집니다.
- 틀린 곳이 있으면 `pnpm assets:remote`가 파일과 이유를 알려 줍니다.
- 회원 다이어리는 서버 마이그레이션 V34(`dio-remote-landscape`·`dio-remote-portrait`)이 적용된 서버에서만 만들 수 있습니다.

### 속지 탭 더하기

속지 고르기의 탭(노트 · 플래너 · 일기)도 앱 배포 없이 더할 수 있습니다. `remote-content/template-groups.json`에 적습니다.

```json
[
  { "id": "travel", "name": "여행", "order": 1 },
  { "id": "season", "name": "계절", "order": 2 }
]
```

| 항목 | 설명 |
| --- | --- |
| `id` | 영문 소문자·숫자·`-`, 40자 이내. 속지의 `group`에 이 값을 씁니다. `note`·`planner`·`diary`는 앱 탭이라 쓸 수 없습니다. |
| `name` | 탭 이름(1~40자). 짧을수록 좋습니다(2~4글자). |
| `order` | 탭 순서. 새 탭은 앱 탭 3개 뒤에 이 순서로 붙습니다. |
| `hidden` | `true`면 탭과 그 안의 속지를 고르기에서 숨깁니다. 이미 만든 페이지는 계속 그립니다. |

- 속지가 하나도 없는 탭은 보이지 않습니다.
- 탭이 4개를 넘으면 탭 줄이 가로로 넘어갑니다.
- 앱 탭(노트 · 플래너 · 일기)의 이름이나 순서는 바꿀 수 없습니다. 앱 안의 속지가 그 탭에 묶여 있기 때문입니다.

## 지우기와 바꾸기

- **파일만 바꾸기**(예: 글꼴 새 버전): 같은 폴더에서 파일을 바꾸고 다시 올립니다. 해시 이름이 바뀌므로 앱이 새 파일을 받습니다.
- **목록에서 빼기**: 이미 쓴 문서가 있을 수 있으므로 지우지 말고 `"hidden": true`를 권합니다. 폴더를 지우면 그 글꼴로 쓴 글자는 기본 글꼴로, 그 스티커는 빈 자리로, 그 속지 페이지는 "내지를 불러오지 못했어요"로 보입니다.
- S3의 옛 파일은 지우지 않습니다. 이미 받은 기기와 구버전 목록이 계속 씁니다.

