import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignupDocuments, signupDocumentsReady, signupEligibility, signupTermsVersions } from '../src/auth/signupPolicy.js';

const documents = createSignupDocuments({
  service: 'https://dio.test/legal/v2/service.html',
  privacy: 'https://dio.test/legal/v2/consent.html',
  policy: 'https://dio.test/legal/v2/privacy.html',
});

test('연령 자기확인과 필수 동의는 각각 필요하고 생년월일로 대신하지 않는다', () => {
  const state = { ageConfirmed: true, terms: { service: true, privacy: true } };
  assert.equal(signupEligibility(state, documents), true);
  for (const ageConfirmed of [false, null, undefined, 'true', 1]) {
    assert.equal(signupEligibility({ ...state, ageConfirmed, birthDate: '2000-01-01' }, documents), false);
  }
  for (const key of ['service', 'privacy']) assert.equal(signupEligibility({ ...state, terms: { ...state.terms, [key]: false } }, documents), false);
  assert.deepEqual(signupTermsVersions, { SERVICE: 'v2', PRIVACY: 'v2' });
});

test('개인정보처리방침과 수집·이용 동의서는 별도 URL이며 미게시·비보안 주소는 가입을 열지 않는다', () => {
  assert.notEqual(documents.privacy, documents.policy);
  assert.equal(signupDocumentsReady(documents), true);
  for (const key of ['service', 'privacy', 'policy']) {
    for (const value of [undefined, '', '/legal/v2', 'http://dio.test/legal', 'javascript:alert(1)', 'https://user:secret@dio.test/legal']) {
      assert.equal(signupDocumentsReady(createSignupDocuments({ ...documents, [key]: value })), false);
    }
  }
});
