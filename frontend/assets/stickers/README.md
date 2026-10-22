# 기본 스티커 출처

| 폴더 | 출처 | 라이선스 | 비고 |
|---|---|---|---|
| `*.png` (64종) | [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) — 3D 스타일 | MIT ([LICENSE-fluentui-emoji.txt](./LICENSE-fluentui-emoji.txt)) | 원본 256px PNG 그대로 사용 |
| `noto/*.gif` (36종) | [Google Noto Emoji Animation](https://googlefonts.github.io/noto-emoji-animation/) | CC BY 4.0 ([LICENSE-CC-BY-4.0.txt](./noto/LICENSE-CC-BY-4.0.txt)) | 원본 512px GIF를 128px·프레임 절반으로 줄임 |
| `twemoji/*.png` (64종) | [Twemoji 14.0.2](https://github.com/twitter/twemoji/tree/v14.0.2) — Twitter, Inc and other contributors | CC BY 4.0 ([LICENSE-GRAPHICS.txt](./twemoji/LICENSE-GRAPHICS.txt)) | 공식 SVG를 512px PNG로 변환(디자인 변경 없음). SVG 원본은 twemoji/svg에 보관. 파일별 출처와 SHA-256은 twemoji/manifest.json |

- 위 라이선스 모두 상업적 이용이 가능합니다.
- CC BY 4.0은 저작자 표시가 필요합니다. 앱의 오픈소스·라이선스 화면에 아래 문구를 넣어 주세요.
  > Animated emoji: Noto Emoji Animation by Google, licensed under CC BY 4.0. Resized and frame-reduced.
- MIT는 저작권 고지와 라이선스 전문을 함께 배포해야 합니다. (LICENSE-fluentui-emoji.txt)
- 파일 이름 ↔ 스티커 이름 표는 `src/editor/stickerAssets.js`에 있습니다.

- Twemoji는 이미지 파일만 사용한다. JS 라이브러리는 추가하지 않았으며 이미지에 적용되는 CC BY 4.0으로 고지한다. 원본 저작권·고지는 twemoji/UPSTREAM-README.md에 보존한다.
