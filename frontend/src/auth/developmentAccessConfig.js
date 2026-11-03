// `__DEV__` is false in an internally distributed EAS preview build. Allow that
// build to opt in explicitly, while leaving production disabled by default.
export const developmentAccessEnabled =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_DEVELOPMENT_ACCESS_ENABLED === 'true';

// Preview permits Basic authentication, but must not create a credential store.
// Its entered header stays in the auth API instance and is discarded on app exit.
export const developmentAccessStoreEnabled = typeof __DEV__ !== 'undefined' && __DEV__;
