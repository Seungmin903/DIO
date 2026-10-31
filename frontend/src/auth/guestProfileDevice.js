import { loadJSON, saveJSON, STORAGE_KEYS } from '../editor/services/storage';
import { createGuestProfile } from './guestProfile';
import { keepGuestPhoto } from './guestPhoto';

export const guestProfile = createGuestProfile({
  load: () => loadJSON(STORAGE_KEYS.guestProfile, null),
  save: (profile) => saveJSON(STORAGE_KEYS.guestProfile, profile),
  keepPhoto: keepGuestPhoto,
});
