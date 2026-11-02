// Preserve the shared transport's member token when adding development Basic access.
export function createCanvasHttpFetch({ auth, ...options }) {
  // New HTTP APIs use the common transport's origin-checked authentication.
  // All HTTP paths use the common member transport's session/account checks.
  // The hook keeps its separate WebSocket authentication unchanged.
  return auth.getConnectionOptions?.().getAuthHeaders ? options.fetchImpl : createCanvasFetch(options);
}

export function createCanvasFetch({ headersFor, accessTokenHeader, fetchImpl }) {
  return (url, options) => {
    const extra = headersFor(url), headers = { ...options.headers };
    if (extra.Authorization) {
      const bearer = headers[accessTokenHeader];
      const token = headers['X-DIO-Access-Token'] ?? (accessTokenHeader === 'Authorization'
        ? (/^Bearer /i.test(bearer ?? '') ? bearer.replace(/^Bearer /i, '') : undefined)
        : bearer);
      if (token) headers['X-DIO-Access-Token'] = token;
      headers.Authorization = extra.Authorization;
    }
    return fetchImpl(url, { ...options, headers });
  };
}
