import { Timestamp } from 'firebase/firestore';

export function getMillis(ts: Timestamp | Date | number | null | undefined): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return 0;
}

export function formatHoursRemaining(
  expiresAt: Timestamp | null | undefined,
  serverNowMs: number = Date.now()
): string {
  const expMs = getMillis(expiresAt);
  const diffMs = expMs - serverNowMs;
  if (diffMs <= 0) return 'Expirado';
  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (totalHours >= 48) {
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    return remHours > 0 ? `${totalHours}h (${days}d ${remHours}h)` : `${totalHours}h`;
  }
  return `${totalHours} ${totalHours === 1 ? 'hora' : 'horas'}`;
}

export function formatCurrencyMt(value: number): string {
  return `${Number(value || 0).toLocaleString('pt-MZ')} MT`;
}

export function formatDateMz(ts: Timestamp | Date | number | null | undefined): string {
  const ms = getMillis(ts);
  if (!ms) return '—';
  return new Intl.DateTimeFormat('pt-MZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function buildWhatsAppUrl(rawPhone: string, message: string): string {
  const digits = rawPhone.replace(/\D/g, '') || '258840000000';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}
