import { marketingDocuments } from '../shared/legalDocuments.js';
export { createSignupDocuments, signupDocuments, signupDocumentsReady } from '../shared/legalDocuments.js';

// Published documents are immutable per version. Change these together with backend terms settings.
export const signupTermsVersions = Object.freeze({ SERVICE: 'v2', PRIVACY: 'v2' });

export function signupEligibility({ ageConfirmed, terms }, documents) {
  return ageConfirmed === true && terms?.service === true && terms?.privacy === true;
}

export function signupAgreements(terms) {
  return [
    ...['service', 'privacy'].map(key => ({termsType:key.toUpperCase(), termsVersion:signupTermsVersions[key.toUpperCase()], agreed:terms?.[key] === true})),
    ...marketingDocuments.filter(item => typeof terms?.[item.id] === 'boolean').map(item => ({termsType:item.termsType, termsVersion:'v1', agreed:terms[item.id]})),
  ];
}
