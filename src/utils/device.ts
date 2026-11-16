const DEVICE_ID_STORAGE_KEY = 'mozflix_device_id';
const SESSION_TOKEN_KEY = 'mozflix_session_token';

function computeHardwareHint(): string {
  if (typeof window === 'undefined') return 'SRV';
  const parts = [
    navigator.platform || '',
    String(navigator.hardwareConcurrency || ''),
    `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ].join('|');
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    hash = (hash * 31 + parts.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).toUpperCase().slice(0, 6);
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server-device';
  let existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing && existing.length >= 8) {
    return existing;
  }

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const hw = computeHardwareHint();
  existing = `MOZ-${hw}-${randomPart.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, existing);
  return existing;
}

export function generateSessionToken(): string {
  const token =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  }
  return token;
}

export function getLocalSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

export function normalizeMozPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('258') && digits.length >= 12) {
    return `+${digits.slice(0, 12)}`;
  }
  if (digits.length === 9 && /^[8]/.test(digits)) {
    return `+258${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+258${digits.slice(1)}`;
  }
  return digits.startsWith('258') ? `+${digits}` : `+258${digits}`;
}

export function phoneToAuthEmail(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/\D/g, '');
  return `${digits}@tel.mozflix.mz`;
}
