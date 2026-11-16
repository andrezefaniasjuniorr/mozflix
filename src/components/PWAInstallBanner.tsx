import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePWAInstall } from '../hooks/usePWAInstall';

const DISMISS_KEY = 'mozflix_install_banner_dismissed_at';

export function PWAInstallBanner() {
  const { settings } = useAuth();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    try {
      const ts = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
      // Mostrar de novo apenas se nunca foi fechado ou após 24h
      if (!ts || Date.now() - ts > 24 * 60 * 60 * 1000) {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, []);

  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Ignore
    }
  };

  const handleAction = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        setDismissed(true);
      }
      return;
    }
    setGuideOpen(true);
  };

  return (
    <>
      <aside
        aria-label="Baixar App MozFlix"
        className="fixed bottom-4 left-4 right-16 sm:right-auto sm:w-[300px] z-40 bg-[#141418]/95 backdrop-blur-md border border-white/15 rounded-lg p-2.5 shadow-2xl flex items-center gap-2.5"
      >
        <img
          src="/pwa-192x192.png"
          alt="MozFlix"
          className="w-9 h-9 rounded-md shrink-0 border border-white/10"
        />

        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white truncate">App {settings.appName}</div>
          <div className="text-[10px] text-zinc-400 truncate">Abre offline sem megas</div>
        </div>

        <button
          type="button"
          onClick={() => void handleAction()}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold text-white whitespace-nowrap shrink-0 hover:opacity-90 cursor-pointer"
          style={{ backgroundColor: settings.primaryColor }}
        >
          <Download className="w-3 h-3" />
          Baixar
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fechar aviso"
          className="p-1 text-zinc-400 hover:text-white shrink-0 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </aside>

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xs bg-[#141418] border border-white/15 rounded-lg p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Smartphone className="w-4 h-4" style={{ color: settings.primaryColor }} />
                <h3 className="font-display text-base font-bold">Instalar {settings.appName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside">
                <li>
                  Toca em <strong className="text-white">Partilhar</strong> na barra do Safari.
                </li>
                <li>
                  Escolhe <strong className="text-white">Adicionar ao ecrã inicial</strong>.
                </li>
              </ol>
            ) : (
              <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside">
                <li>
                  Toca no menu do navegador (<strong className="text-white">⋮</strong>).
                </li>
                <li>
                  Seleciona <strong className="text-white">Instalar app</strong> ou{' '}
                  <strong className="text-white">Adicionar ao ecrã inicial</strong>.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="w-full py-2 rounded text-xs font-semibold text-white cursor-pointer"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
