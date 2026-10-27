export const remainingSeconds = (deadline, now = Date.now()) => Math.max(0, Math.ceil((deadline - now) / 1000));
export const verificationClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
