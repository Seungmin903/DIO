# remote-content — 앱 배포 없이 추가하는 글꼴·스티커·속지

이 폴더에 파일을 넣고 아래 두 명령을 실행하면, 앱을 다시 배포하지 않아도 사용자 앱에 새 글꼴·스티커·속지가 나타납니다.

```bash
pnpm assets:remote
sh scripts/upload-remote-assets.sh <버킷> static-assets
```

1. `pnpm assets:remote`(`frontend` 폴더에서 실행)가 `remote-assets-dist/`에 해시 이름의 파일과 `catalog.json`을 만듭니다. 형식이 틀리면 무엇이 틀렸는지 알려 주고 멈춥니다.
2. 업로드 스크립트가 파일을 먼저 올리고 `catalog.json`을 마지막에 올립니다.
3. 앱은 켜질 때 `catalog.json`을 받아 목록을 고칩니다. 오프라인이면 기기에 저장된 마지막 목록을 씁니다.

이 폴더는 git에 커밋합니다. `catalog.json`은 매번 이 폴더 전체로 새로 만들어지므로, 여기서 지운 항목은 다음 업로드 때 목록에서도 빠집니다.

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

```
remote-content/stickers/<id>/pack.json
```

```json
{ "name": "봄", "order": 10, "stickers": [
  { "id": "tulip", "name": "튤립", "w": 13, "h": 15, "paths": [["#ffffff", "M2 0h9v1h-9z"], ["#e85d75", "M3 1h7v1h-7z"]] }
] }
```

| 항목 | 설명 |
| --- | --- |
| `<id>` 폴더 이름 / 스티커 `id` | 영문 소문자·숫자·`-`, 40자 이내. 페이지에는 `remote:<팩>:<스티커>`로 저장되므로 **한 번 올린 뒤에는 바꾸지 않습니다.** |
| `name` | 보관함 분류 칩과 스티커 이름(1~40자). 검색에도 씁니다. |
| `w` · `h` | 도트 칸 수(1~64). 페이지에 처음 붙을 때 한 칸은 기본 스티커와 같은 크기입니다. |
| `paths` | 뒤에서 앞으로 칠하는 `[색 #RRGGBB, 경로]`, 32개 이하. 경로는 `viewBox 0 0 w h` 기준으로 `M·H·V·L·Z`와 숫자만 씁니다. 형식은 앱의 '디오&모아' 스티커(`src/editor/builtinStickers.js`)와 같습니다. |
| `hidden` | `true`면 보관함에서만 숨깁니다. 이미 붙인 스티커는 계속 그립니다. |

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
| `group` | 들어갈 탭: `note`(노트) · `planner`(플래너) · `diary`(일기) |
| `landscape` / `portrait` | 가로·세로 SVG 둘 다 필요합니다. 2 MiB 이하. `viewBox`가 위 크기와 정확히 같아야 합니다. |
| `hidden` | `true`면 속지 고르기에서만 숨깁니다. 이미 만든 페이지는 계속 그립니다. |

- 장수를 고르는 한 장짜리 속지로 들어갑니다(새 다이어리의 속지 묶음, 편집기의 페이지 추가).
- SVG에는 `<script>`, `<image>`, `<text>`, `<foreignObject>`, 외부 링크를 쓸 수 없습니다. 글자는 윤곽선(path)으로 바꿔 넣습니다. 앱 속지와 같은 규칙입니다.
- 앱의 속지 색 바꾸기, 속지 글꼴 바꾸기는 앱 속지의 색·글자 규칙에 맞춰 만든 SVG에만 적용됩니다. 기본은 그린 그대로 보입니다.
- 회원 다이어리는 서버 마이그레이션 V33(`dio-remote-landscape`·`dio-remote-portrait`)이 적용된 서버에서만 만들 수 있습니다.

## 지우기와 바꾸기

- **파일만 바꾸기**(예: 글꼴 새 버전): 같은 폴더에서 파일을 바꾸고 다시 올립니다. 해시 이름이 바뀌므로 앱이 새 파일을 받습니다.
- **목록에서 빼기**: 이미 쓴 문서가 있을 수 있으므로 지우지 말고 `"hidden": true`를 권합니다. 폴더를 지우면 그 글꼴로 쓴 글자는 기본 글꼴로, 그 스티커는 빈 자리로, 그 속지 페이지는 "내지를 불러오지 못했어요"로 보입니다.
- S3의 옛 파일은 지우지 않습니다. 이미 받은 기기와 구버전 목록이 계속 씁니다.

