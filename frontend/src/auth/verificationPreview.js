// 308 화면 검증 전용. 서버 signupToken을 만들지 않으며 실제 메일을 발송하지 않는다.
export function createVerificationPreview({ now = Date.now } = {}) {
  let email = null, expiresAt = 0;
  return {
    preview: true,
    notice: '개발용 인증번호 123456 · 실제 메일은 발송되지 않아요.',
    async send(value) {
      email = value;
      expiresAt = now() + 180000;
      return { expiresIn: 180, retryAfter: 30 };
    },
    async verify(value, code) {
      if (value !== email || now() >= expiresAt) throw new Error('인증번호가 만료됐어요. 다시 받아 주세요.');
      if (code !== '123456') throw new Error('인증번호가 맞지 않아요. 다시 확인해 주세요.');
      return { preview: true };
    },
  };
}
