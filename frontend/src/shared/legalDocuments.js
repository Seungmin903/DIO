export function createSignupDocuments(values = {}) {
  const documents = {};
  for (const key of ['service', 'privacy', 'policy']) {
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
});

export function signupDocumentsReady(documents) {
  const safe = createSignupDocuments(documents);
  return ['service', 'privacy', 'policy'].every(key => !!safe[key]);
}
