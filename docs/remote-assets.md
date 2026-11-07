# 원격 에셋(S3 + CloudFront)

에셋 저장소(S3 + CloudFront)는 두 가지 용도로 쓴다.

1. **번들에서 뺀 에셋**: 앱 코드가 이미 아는 큰 글꼴과 2026 속지. 목록(`manifest.js`)이 앱과 함께 배포된다.
2. **앱 배포 없이 추가하는 글꼴·스티커·속지**: `frontend/remote-content/`에 넣고 올리면, 앱이 켜질 때 `catalog.json`을 받아 목록에 넣는다.
   - 올리는 방법과 파일 형식은 [remote-content/README.md](../frontend/remote-content/README.md)에 있다.
   - 앱 쪽 코드는 `src/shared/remoteAssets/remoteCatalog.js`(해석·불러오기)와 `remoteCatalogService.js`(앱 연결)다.
   - 원격 글꼴은 글꼴 목록에서 기본 글꼴 뒤에 놓인다. 문서에는 `remote-<id>`로 저장되고, 처음 쓸 때 파일을 받는다.
   - 원격 스티커 팩(운영자가 올림)은 보관함의 기본 분류 칩으로 들어간다. 스티커는 그림(PNG) 또는 '디오&모아'와 같은 도트 형식이고, 페이지에는 그림 주소 없이 `builtin: remote:<팩>:<스티커>`만 저장된다.
     - 그림 스티커는 팩의 원격 PNG를 받아(`useRemoteAssetUri`) 그림 스티커 경로(`MediaImage`, 테두리·그림자 실루엣)로 그린다. 서버 미디어(`mediaFileId`)를 쓰지 않으므로 공동편집·서버 저장 규칙에 걸리지 않는다. 내보내기는 그림이 올라온 뒤 찍고, 받지 못하면 오류로 알린다.
   - 원격 속지 SVG는 앱 속지와 같은 DIO 속지 형식만 받는다(`scripts/template-svg-rules.mjs`). 크기·종이 사각형·선 색 6가지·도형만 쓰는 규칙이라 속지 색 바꾸기가 그대로 적용된다. 앱 속지 286장 전부가 이 검사를 통과한다(`tests/template-svg-rules.test.js`).
   - 목록은 기기에 저장해 두므로 오프라인에서도 마지막 목록을 쓴다. 목록을 아직 못 받은 기기에서는 원격 글꼴 글자를 기본 글꼴로, 원격 스티커를 빈 자리로 그린다. 받으면 다시 그린다.
   - 서버는 글꼴 id와 스티커 id를 검사하지 않는다.
   - 원격 속지는 한 장짜리 속지로, 속지 고르기의 노트·플래너·일기 탭 끝에 붙는다. 앱 안에서는 `remote-<id>-<방향>`이다.
     - 속지 탭도 목록(`templateGroups`, 원본 `remote-content/template-groups.json`)으로 더한다. 새 탭은 앱 탭 3개 뒤에 붙고, 속지가 없거나 숨긴 탭은 보이지 않는다. 탭이 4개를 넘으면 가로로 넘긴다(`PaperTabs`).
     - 서버(V34)에는 방향마다 범용 속지 행 `dio-remote-landscape`·`dio-remote-portrait`가 하나씩 있다. 페이지 설정 `remoteTemplate: <id>`가 어떤 그림인지 정한다. 서버는 id 형식만 검사하고, 그림은 앱이 catalog.json에서 찾는다.
     - 다이어리 생성(`JdbcDiaryInitialPages`)은 `remoteTemplate`을 원격 행에서만 받고, 원격 행에는 꼭 요구한다. 페이지 추가·수정 API(`PageService`)도 같은 규칙(`page.domain.RemoteTemplates`)으로 검사한다. 속지 코드는 템플릿 행 또는 설정의 `templateCode`로 판단하며, 어긋나면 400 `INVALID_PAGE_REQUEST`다. 공유 다이어리의 다른 구성원 앱이 이 값으로 속지를 찾으므로 잘못된 값이 저장되지 않게 한다. 원격 속지 페이지에서 속지를 바꾸지 않고 설정만 통째로 바꾸는 PATCH(속지 글꼴 변경 등)는 빠진 속지 정체 키(`templateCode`·`templateVersion`·`remoteTemplate`)를 저장된 설정에서 이어받고, 저장 기준 속지 코드는 템플릿 행이 없으면 저장된 설정의 `templateCode`로 정한다. 설정만으로 원격 ↔ 일반 속지를 바꾸는 요청은 거부한다(속지 코드가 없는 빈 종이 페이지도 일반 속지로 본다). 원격 속지 페이지는 설정만으로 방향 행(`dio-remote-landscape` ↔ `portrait`)도 바꿀 수 없다. 방향은 `templateId`로 바꾸고, 원격 속지 페이지에 원격 행 `templateId`만 보내면 저장된 `remoteTemplate`을 이어받는다. 일반 페이지를 원격 행으로 바꿀 때는 `templateConfig.remoteTemplate`이 꼭 있어야 한다.
     - 앱 쪽 연결: `editor/templates/remoteTemplates.js`(ID·목록), `serverCatalog.js`(서버 코드↔앱 ID), `collaboration/serverPages.js`(페이지 추가·읽기), `diary/utils/paperChoice.js`(고르기 탭).
     - 목록을 아직 못 받은 기기는 페이지 크기·방향은 ID로 알고, 그림은 목록이 올 때까지 최대 10초 기다린 뒤 "내지를 불러오지 못했어요"를 보인다.
    - 마이그레이션 번호(V34)는 병합 직전 develop · release 의 최신 번호 다음인지 다시 확인한다. 한 환경이라도 배포한 뒤에는 번호를 바꾸지 않는다.

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
| `EXPO_PUBLIC_ASSET_BASE_URL` | 에셋 저장소 주소. DIO는 CloudFront 원본 경로(Origin path)를 `/static-assets`로 설정했으므로 **배포 도메인만** 쓴다(dev `https://d1ztiesifzfjld.cloudfront.net`, prod `https://d2hvhno2v5g650.cloudfront.net`). 원본 경로를 비운 배포라면 끝에 `/static-assets`를 붙인다. 어느 쪽이든 `<주소>/catalog.json`이 첫 업로드 뒤 200으로 열려야 한다. 출시 빌드·웹 배포본은 HTTPS가 아니면 원격 에셋을 쓰지 않는다. `eas.json`의 preview·production `env`에 넣는다. |
| 개발 실행 | 값을 비우면 `http://<PC>:8090`(Android 에뮬레이터는 `10.0.2.2`)을 쓴다. `pnpm assets:remote` 후 `pnpm assets:serve`로 띄운다. 실제 기기는 PC의 LAN IP를 넣는다. |

## 인프라

1. **버킷**: 미디어 버킷의 `static-assets/` 접두사나 전용 버킷을 쓴다. dev·prod는 분리한다. 퍼블릭 접근 차단은 그대로 둔다.
2. **CloudFront**:
   - 오리진은 그 버킷으로 하고, OAC(Origin Access Control)로 연결한다.
   - 버킷 정책은 그 배포에 `static-assets/*`에 대한 `s3:GetObject`만 허용한다.
   - 캐시 정책은 오리진의 `Cache-Control`을 따른다.
3. **CORS**: 웹은 다른 출처에서 글꼴(@font-face)과 SVG(fetch)를 읽는다. CloudFront 응답 헤더 정책에서 허용 Origin(웹 배포 주소)과 `GET`·`HEAD`를 열고, 오리진 요청 정책이 `Origin` 헤더를 넘기게 한다. 네이티브 앱은 CORS가 필요 없다.
4. **업로드(GitLab CI)**: `.gitlab-ci.yml`의 원격 에셋 잡이 올린다.
   - `remote-assets-check`(MR·develop·master): `build-remote-assets.mjs --check`로 매니페스트 일치와 `remote-content/` 형식을 검사한다. 키·네트워크는 쓰지 않는다.
   - `publish-remote-assets-dev`(develop, 자동, `deploy-development` 성공 뒤)와 `publish-remote-assets-prod`(master, 수동, `deploy-production` 성공 뒤에만 실행 가능, 에셋 변경이 없어도 다시 올릴 수 있음, 실패하면 파이프라인도 실패)는 네 단계로 올린다. 원격 속지는 서버의 V34 행이 있어야 페이지를 만들 수 있으므로 백엔드 배포 뒤에 올린다.
     1. 업로드 폴더를 만든다(`--dist-only`). 커밋된 매니페스트와 다르면 멈춘다.
     2. 지금 올라간 `catalog.json`을 받는다.
     3. 이미 공개한 글꼴·스티커 팩·팩 안의 스티커(`stickerPacks[].stickers`)·속지·속지 탭이 빠졌는지 비교한다(`compare-remote-catalog.mjs`). 빠졌으면 멈추고, CI 변수 `ALLOW_CATALOG_REMOVAL=1`로만 허용한다. 지금 목록은 키를 정확히 나열해 있을 때만 받고(`fetch-remote-catalog.sh`), 있는데 못 받거나 깨졌으면 비교 없이 올리지 않는다. 정말 없을 때(처음 올림)만 비교를 건너뛴다.
     4. 파일을 먼저, `catalog.json`을 마지막에 올린다.
   - 잡은 `remote-content/`, `assets/fonts`, `assets/templates`, 원격 에셋 스크립트가 바뀐 파이프라인에서만 돈다.
   - 버킷과 키는 러너 서버의 env 파일에 둔다. 다른 배포 잡과 같은 방식이다. **이 파일 두 개는 서버에 직접 만들어야 한다.**
     ```
     /home/gitlab-runner/dio-env/assets-dev.env
     /home/gitlab-runner/dio-env/assets-prod.env
       ASSET_S3_BUCKET=<버킷>
       ASSET_S3_PREFIX=static-assets
       AWS_ACCESS_KEY_ID=…
       AWS_SECRET_ACCESS_KEY=…
       AWS_DEFAULT_REGION=ap-northeast-2
     ```
   - 키 권한: `static-assets/*`에 `s3:GetObject`·`s3:PutObject`, 버킷에 접두사를 제한한 `s3:ListBucket`. 백엔드 IAM과 따로 둔다.
   - 확장자별로 `Content-Type`(`font/ttf`, `image/svg+xml`, `application/json`)과 `Cache-Control: public, max-age=31536000, immutable`을 붙인다. `catalog.json`만 `max-age=60`이다. `--delete`는 쓰지 않는다.
   - 급할 때는 키가 있는 PC에서 `sh frontend/scripts/upload-remote-assets.sh <버킷> [static-assets]`로 직접 올릴 수 있다. 같은 비교를 거친다(node 필요).
5. **배포 순서**:
   - 번들에서 뺀 에셋: 에셋이 먼저 올라간 뒤(develop 병합 → CI) 매니페스트가 바뀐 앱을 배포한다.
   - `remote-content/`에 추가한 글꼴·스티커·속지: 병합(운영은 master 잡 실행)만 하면 된다. 앱은 다음 실행 때 반영한다. 운영에 처음 올릴 때는 운영 백엔드에 V34가 배포된 뒤(`deploy-production` 성공 뒤) 올린다. CI는 이 순서를 `needs`로 강제한다.

## 라이선스

`OFL.txt`도 같은 접두사 아래 글꼴 폴더 경로(예: `fonts/maruburi/OFL.txt`)에 함께 올린다. 앱 안의 라이선스 고지는 바뀌지 않는다.

## 검증 범위

- 단위 테스트: 매니페스트 일치, 주소 정책, 웹 주소, 원격 글꼴 실패 후 재시도, catalog.json·스티커 팩 해석, 목록 불러오기(저장본·오프라인·깨진 응답), remote-content 빌드와 형식 오류 안내, 숨긴 글꼴·팩 처리
- 웹 개발 서버 + 예시 원격 속지 1개: 새 다이어리 속지 고르기의 노트 탭에 나오고, 고르면 미리보기·편집기에서 에셋 저장소의 SVG로 그려지며, 기기 문서에 `remote-<id>-<방향>`으로 저장되는 것을 확인했다(게스트). 회원 생성·페이지 추가·서버 응답 해석은 단위 테스트로, 백엔드 검증은 H2 계약 테스트로 확인했다. 실제 PostgreSQL 17(CI 스크립트와 같은 임시 컨테이너)에서 `postgresMemberDiaryCreationTest`(V34 행·원격 속지 생성 계약 포함 53개)와 `postgresDiaryDetailTest`(16개)가 통과했다. MR 파이프라인의 `backend-postgres-diary-test`가 같은 검사를 한다. `page_templates.category`에는 값 제약이 없어 `REMOTE`를 그대로 받는다.
- 웹 개발 서버 + 예시 remote-content(글꼴 1개, 스티커 팩 1개): 앱이 catalog.json과 팩을 받아 기기에 저장하고, 글꼴 목록에 원격 글꼴을 넣어 불러오고, 보관함 칩에서 원격 스티커를 골라 페이지에 붙여 그리는 것을 확인했다.
- 웹 개발 서버 + `assets:serve`: 2026 월간 속지 SVG와 고운바탕 Regular·Bold를 원격에서 받아 적용하는 것을 확인했다.
- 아직 확인하지 않은 것:
  - 네이티브(Android·iOS) 다운로드와 sha256 검사
  - 실제 S3·CloudFront·CORS 설정
