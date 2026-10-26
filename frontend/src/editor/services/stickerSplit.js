// Web/Expo fallback: no native module import or initialization.
export const stickerSplit = {
  available: false,
  reason: '스티커 자동 분리는 처리 모듈이 포함된 DIO 개발 빌드에서 사용할 수 있어요.',
  async pick() { throw new Error(this.reason) },
  analyze() { throw new Error(this.reason) },
  merge() { throw new Error(this.reason) },
  cancel() {},
  async cleanup() {},
  disposeSource() {},
}
