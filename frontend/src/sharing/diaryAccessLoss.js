// Only the API's diary-specific errors confirm access loss; proxy HTTP errors do not.
export const isDiaryAccessLost = error =>
  (error?.status === 403 && error.code === 'DIARY_ACCESS_DENIED')
  || (error?.status === 404 && error.code === 'DIARY_NOT_FOUND');
