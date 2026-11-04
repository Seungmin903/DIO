// Keys are scoped to the complete API URL, so development and production never share credentials.
export function createSecureSessionStore(keychain) {
  const key = base => `dio.refresh.v1.${Array.from(base, c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`;
  const options = { keychainService: 'dio.auth.refresh.v1', keychainAccessible: keychain.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  return {
    async load(base) {
      const raw = await keychain.getItemAsync(key(base), options);
      if (!raw) return null;
      try {
        const value = JSON.parse(raw);
        if (typeof value.refreshToken !== 'string' || !value.refreshToken.trim() || value.refreshToken.length > 2048 ||
            !['email', 'google', 'apple'].includes(value.provider) || typeof value.userId !== 'string' || !value.userId) throw new Error();
        return { refreshToken: value.refreshToken, provider: value.provider, userId: value.userId };
      } catch {
        await keychain.deleteItemAsync(key(base), options);
        return null;
      }
    },
    save: (base, value) => keychain.setItemAsync(key(base), JSON.stringify(value), options),
    clear: base => keychain.deleteItemAsync(key(base), options),
  };
}
