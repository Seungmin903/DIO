import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignupDocuments, signupDocumentsReady, signupEligibility, signupTermsVersions, signupAgreements } from '../src/auth/signupPolicy.js';

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

test('개인정보처리방침과 수집·이용 동의서는 별도 URL이며 미게시·비보안 주소는 문서 보기 주소로 사용하지 않는다', () => {
  assert.notEqual(documents.privacy, documents.policy);
  assert.equal(signupDocumentsReady(documents), true);
  for (const key of ['service', 'privacy', 'policy']) {
    for (const value of [undefined, '', '/legal/v2', 'http://dio.test/legal', 'javascript:alert(1)', 'https://user:secret@dio.test/legal']) {
      assert.equal(signupDocumentsReady(createSignupDocuments({ ...documents, [key]: value })), false);
    }
  }
});

test('선택 문서 네 개는 열람만 확장하고 미게시 상태로 가입을 막지 않는다', () => {
  assert.equal(signupDocumentsReady(documents), true);
  const extra = ['marketingPrivacy', 'adEmail', 'adPush', 'adNightPush'];
  const configured = createSignupDocuments({ ...documents,
    ...Object.fromEntries(extra.map(key => [key, `https://dio.test/legal/${key}.html`])),
  });
  for (const key of extra) {
    assert.ok(configured[key].startsWith('https://dio.test/'));
    assert.equal(createSignupDocuments({ [key]: 'javascript:alert(1)' })[key], undefined);
    assert.equal(createSignupDocuments({ [key]: 'https://user:secret@dio.test/legal' })[key], undefined);
  }
  assert.equal(signupEligibility({ ageConfirmed: true, terms: { service: true, privacy: true, marketing: false } }, configured), true);
});

test('선택 동의는 네 항목을 구분하고 기존 MARKETING을 자동 전환하지 않는다', () => {
 const result=signupAgreements({service:true,privacy:true,marketingPrivacy:true,adEmail:false,adPush:true,adNightPush:false});
 assert.deepEqual(result.slice(2).map(x=>[x.termsType,x.agreed]),[['MARKETING_PRIVACY',true],['AD_EMAIL',false],['AD_PUSH',true],['AD_NIGHT_PUSH',false]]);
 assert.equal(signupAgreements({service:true,privacy:true,marketing:true}).length,2);
});

test('문서 미게시 상태에서도 연령 확인과 필수 동의로 가입을 진행한다', () => {
 const state={ageConfirmed:true,terms:{service:true,privacy:true}};
 assert.equal(signupEligibility(state,{}),true);
 assert.equal(signupEligibility(state),true);
 assert.equal(signupEligibility({...state,ageConfirmed:false},{}),false);
 assert.equal(signupEligibility({...state,terms:{service:true,privacy:false}},{}),false);
});
