export function createSignupDocuments(values = {}) {
  const documents = {};
  for (const key of ['service', 'privacy', 'policy', 'marketingPrivacy', 'adEmail', 'adPush', 'adNightPush']) {
    try {
      const url = new URL(values[key]);
      if (url.protocol === 'https:' && !url.username && !url.password) documents[key] = url.href;
    } catch { /* An unset or unsafe URL cannot enable enrollment. */ }
  }
  return Object.freeze(documents);
}

export const signupDocuments = createSignupDocuments({
  service: process.env.EXPO_PUBLIC_SERVICE_TERMS_URL,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_CONSENT_URL,
  policy: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  marketingPrivacy: process.env.EXPO_PUBLIC_MARKETING_PRIVACY_CONSENT_URL,
  adEmail: process.env.EXPO_PUBLIC_AD_EMAIL_CONSENT_URL,
  adPush: process.env.EXPO_PUBLIC_AD_PUSH_CONSENT_URL,
  adNightPush: process.env.EXPO_PUBLIC_AD_NIGHT_PUSH_CONSENT_URL,
});

export const marketingDocuments = Object.freeze([
  { id: 'marketingPrivacy', termsType: 'MARKETING_PRIVACY', label: '마케팅 목적 개인정보 수집·이용 동의' },
  { id: 'adEmail', termsType: 'AD_EMAIL', label: '광고성 이메일 수신 동의' },
  { id: 'adPush', termsType: 'AD_PUSH', label: '광고성 앱 푸시 수신 동의' },
  { id: 'adNightPush', termsType: 'AD_NIGHT_PUSH', label: '야간 광고성 앱 푸시 수신 동의' },
]);

export function signupDocumentsReady(documents) {
  const safe = createSignupDocuments(documents);
  return ['service', 'privacy', 'policy'].every(key => !!safe[key]);
}
