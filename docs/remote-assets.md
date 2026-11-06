# 원격 에셋(S3 + CloudFront)

에셋 저장소(S3 + CloudFront)는 두 가지 용도로 쓴다.

1. **번들에서 뺀 에셋**: 앱 코드가 이미 아는 큰 글꼴과 2026 속지. 목록(`manifest.js`)이 앱과 함께 배포된다.
2. **앱 배포 없이 추가하는 글꼴·스티커**: `frontend/remote-content/`에 넣고 올리면, 앱이 켜질 때 `catalog.json`을 받아 목록에 넣는다.
   - 올리는 방법과 파일 형식은 [remote-content/README.md](../frontend/remote-content/README.md)에 있다.
   - 앱 쪽 코드는 `src/shared/remoteAssets/remoteCatalog.js`(해석·불러오기)와 `remoteCatalogService.js`(앱 연결)다.
   - 원격 글꼴은 글꼴 목록에서 기본 글꼴 뒤에 놓인다. 문서에는 `remote-<id>`로 저장되고, 처음 쓸 때 파일을 받는다.
   - 원격 스티커 팩은 보관함의 기본 분류 칩으로 들어간다. 그림은 '디오&모아'와 같은 도트 형식이고, 페이지에는 `builtin: remote:<팩>:<스티커>`로 저장된다.
   - 목록은 기기에 저장해 두므로 오프라인에서도 마지막 목록을 쓴다. 목록을 아직 못 받은 기기에서는 원격 글꼴 글자를 기본 글꼴로, 원격 스티커를 빈 자리로 그린다. 받으면 다시 그린다.
   - 서버는 글꼴 id와 스티커 id를 검사하지 않으므로 백엔드 변경이 필요 없다.
   - **속지는 아직 이 방식으로 추가할 수 없다.** 회원 다이어리의 페이지는 서버 DB의 속지 행(`page_template`, Flyway 시드)을 참조하고, 페이지 설정은 `width·height·blank·paperAppearance` 키만 받는다. 백엔드 지원이 먼저 필요하다.

아래 "범위"·"동작" 절은 1번(번들에서 뺀 에셋)을 설명한다. 설정·인프라·업로드는 두 용도가 같다.

## 범위

| 구분 | 파일 | 위치 |
| --- | --- | --- |
| 원격 | 고운돋움 · 고운바탕(Regular·Bold) · 마루부리(Regular·Bold) TTF 5개, 약 40 MiB | 에셋 저장소 |
| 원격 | 2026 속지 SVG 262개(`2026-reusable-*` 제외), 약 14 MiB. 지금 만드는 다이어리는 만년형 속지를 쓰므로 주로 예전 다이어리가 사용 | 에셋 저장소 |
| 기본(번들) | Pretendard(UI 글꼴), 나눔 계열·손글씨 글꼴(npm 패키지), 만년형 속지, 2026 공용 속지(`2026-reusable-*`) 14개, 아이콘·캐릭터·브랜드 이미지 | 앱 번들 |

원본 파일은 그대로 `frontend/assets/`에 둔다. 속지·글꼴 생성 스크립트, 백엔드 테스트, CI가 이 경로를 읽는다. Metro는 `require()`한 파일만 번들에 넣으므로, 코드에서 `remoteAsset('<assets 기준 경로>')`로 바꾸면 번들에서 빠진다.

## 동작

- `pnpm assets:remote`(`scripts/build-remote-assets.mjs`)는 두 가지를 만든다.
  - `src/shared/remoteAssets/manifest.js`: 경로·크기·sha256
  - `remote-assets-dist/`: 업로드할 파일. git에 올리지 않는다.
- 객체 키에는 내용 해시 16자리가 붙는다(예: `fonts/maruburi/MaruBuri-Regular.254abb4c131316e1.ttf`). 파일이 바뀌면 키도 바뀌므로 덮어쓰기나 캐시 무효화가 필요 없다. 구버전 앱은 옛 키를 계속 쓰므로 옛 객체를 지우지 않는다.
- 네이티브는 `문서 폴더/dio-remote-assets/<키>`에 저장한다.
  - 임시 이름으로 받은 뒤 크기와 sha256을 확인하고 옮긴다.
  - 이미 받은 파일은 다시 받지 않는다.
- 웹은 파일을 저장하지 않고 CloudFront 주소를 그대로 쓴다.
- 받지 못했을 때의 처리:
  - 글꼴: 기본 글꼴로 보여 준다. 30초가 지나면 다음 요청에서 다시 받는다.
  - 속지: "내지를 불러오지 못했어요" 오류가 나고, 다시 열면 다시 받는다.
- `remote-assets.test.js`가 매니페스트와 `assets/`가 같은지 검사한다. 원격 파일을 바꾸거나 추가했으면 `pnpm assets:remote`를 다시 실행하고 매니페스트를 함께 커밋한다.

## 설정

| 위치 | 값 |
| --- | --- |
| `EXPO_PUBLIC_ASSET_BASE_URL` | CloudFront 주소 + 접두사(예: `https://<배포ID>.cloudfront.net/static-assets`). 출시 빌드·웹 배포본은 HTTPS가 아니면 원격 에셋을 쓰지 않는다. `eas.json`의 preview·production `env`에 넣는다. |
| 개발 실행 | 값을 비우면 `http://<PC>:8090`(Android 에뮬레이터는 `10.0.2.2`)을 쓴다. `pnpm assets:remote` 후 `pnpm assets:serve`로 띄운다. 실제 기기는 PC의 LAN IP를 넣는다. |

## 인프라

1. **버킷**: 미디어 버킷의 `static-assets/` 접두사나 전용 버킷을 쓴다. dev·prod는 분리한다. 퍼블릭 접근 차단은 그대로 둔다.
2. **CloudFront**:
   - 오리진은 그 버킷으로 하고, OAC(Origin Access Control)로 연결한다.
   - 버킷 정책은 그 배포에 `static-assets/*`에 대한 `s3:GetObject`만 허용한다.
   - 캐시 정책은 오리진의 `Cache-Control`을 따른다.
3. **CORS**: 웹은 다른 출처에서 글꼴(@font-face)과 SVG(fetch)를 읽는다. CloudFront 응답 헤더 정책에서 허용 Origin(웹 배포 주소)과 `GET`·`HEAD`를 열고, 오리진 요청 정책이 `Origin` 헤더를 넘기게 한다. 네이티브 앱은 CORS가 필요 없다.
4. **업로드**: `sh frontend/scripts/upload-remote-assets.sh <버킷> [static-assets]`
   - 확장자별로 `Content-Type`(`font/ttf`, `image/svg+xml`)과 `Cache-Control: public, max-age=31536000, immutable`을 붙여 `aws s3 sync`한다.
   - `--delete`는 쓰지 않는다.
   - 업로드 권한은 `static-assets/*`에 대한 `s3:PutObject`만 준다. 백엔드 IAM에는 추가하지 않는다.
   - `catalog.json`은 맨 마지막에 `Cache-Control: public, max-age=60`으로 올린다. 앱이 새 목록을 받았을 때 그 안의 파일이 이미 올라가 있어야 하기 때문이다.
5. **배포 순서**:
   - 번들에서 뺀 에셋: 에셋을 먼저 올리고, 그다음 매니페스트가 바뀐 앱을 배포한다.
   - `remote-content/`에 추가한 글꼴·스티커: 올리기만 하면 된다. 앱은 다음 실행 때 반영한다.

## 라이선스

`OFL.txt`도 같은 접두사 아래 글꼴 폴더 경로(예: `fonts/maruburi/OFL.txt`)에 함께 올린다. 앱 안의 라이선스 고지는 바뀌지 않는다.

## 검증 범위

- 단위 테스트: 매니페스트 일치, 주소 정책, 웹 주소, 원격 글꼴 실패 후 재시도, catalog.json·스티커 팩 해석, 목록 불러오기(저장본·오프라인·깨진 응답), remote-content 빌드와 형식 오류 안내, 숨긴 글꼴·팩 처리
- 웹 개발 서버 + 예시 remote-content(글꼴 1개, 스티커 팩 1개): 앱이 catalog.json과 팩을 받아 기기에 저장하고, 글꼴 목록에 원격 글꼴을 넣어 불러오고, 보관함 칩에서 원격 스티커를 골라 페이지에 붙여 그리는 것을 확인했다.
- 웹 개발 서버 + `assets:serve`: 2026 월간 속지 SVG와 고운바탕 Regular·Bold를 원격에서 받아 적용하는 것을 확인했다.
- 아직 확인하지 않은 것:
  - 네이티브(Android·iOS) 다운로드와 sha256 검사
  - 실제 S3·CloudFront·CORS 설정
