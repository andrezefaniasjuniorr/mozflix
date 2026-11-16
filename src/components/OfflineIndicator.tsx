import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/90 border border-amber-500/40 text-[11px] font-medium text-amber-200 shadow-lg backdrop-blur-sm whitespace-nowrap"
    >
      <WifiOff className="w-3 h-3 text-amber-400" />
      <span>Modo Offline — Sem gastar megas</span>
    </div>
  );
}
