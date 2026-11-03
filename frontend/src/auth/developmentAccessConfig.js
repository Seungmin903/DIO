// `__DEV__` is false in an internally distributed EAS preview build. Allow that
// build to opt in explicitly, while leaving production disabled by default.
export const developmentAccessEnabled =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_DEVELOPMENT_ACCESS_ENABLED === 'true';
