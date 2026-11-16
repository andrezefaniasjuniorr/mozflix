import { useState } from 'react';
import { Bell, LogOut, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type UserRoute = 'home' | 'packages' | 'downloads';

interface NavbarProps {
  activeRoute: UserRoute;
  onNavigate: (route: UserRoute) => void;
  onNavigateAdmin: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function Navbar({
  activeRoute,
  onNavigate,
  onNavigateAdmin,
  searchQuery,
  onSearchChange,
}: NavbarProps) {
  const {
    profile,
    settings,
    notifications,
    hasActivePackage,
    hoursRemaining,
    logout,
    markNotificationRead,
  } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const formattedRemaining =
    hoursRemaining >= 48
      ? `${hoursRemaining}h (${Math.floor(hoursRemaining / 24)}d)`
      : `${hoursRemaining} ${hoursRemaining === 1 ? 'hora' : 'horas'}`;

  return (
    <header className="sticky top-0 z-30 bg-[#0A0A0C]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Zone 1: Brand */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="font-display text-2xl font-extrabold tracking-tight uppercase whitespace-nowrap shrink-0 cursor-pointer"
          style={{ color: settings.primaryColor }}
        >
          {settings.appName}
        </button>

        {/* Zone 2: Nav links */}
        <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-zinc-400">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
              activeRoute === 'home' ? 'text-white border-b border-white' : 'hover:text-white'
            }`}
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => onNavigate('packages')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
              activeRoute === 'packages' ? 'text-white border-b border-white' : 'hover:text-white'
            }`}
          >
            Pacotes
          </button>
          {settings.downloadsEnabled && (
            <button
              type="button"
              onClick={() => onNavigate('downloads')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeRoute === 'downloads' ? 'text-white border-b border-white' : 'hover:text-white'
              }`}
            >
              Downloads
            </button>
          )}
          {profile?.isAdmin && (
            <button
              type="button"
              onClick={onNavigateAdmin}
              className="whitespace-nowrap shrink-0 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {activeRoute === 'home' && (
            <button
              type="button"
              onClick={() => setSearchOpen((prev) => !prev)}
              aria-label="Pesquisar"
              className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {notifications.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notificações"
                className="relative p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span
                    className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: settings.primaryColor }}
                  />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-[#141418] border border-white/15 rounded-md shadow-2xl p-2.5 space-y-2 z-50">
                  <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                    <span className="text-xs font-semibold text-white">Notificações</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className={`w-full text-left p-2 rounded text-xs transition-colors cursor-pointer ${
                          n.read ? 'bg-white/5 text-zinc-400' : 'bg-white/10 text-white'
                        }`}
                      >
                        <div className="font-semibold">{n.title}</div>
                        <div className="mt-0.5 text-zinc-300">{n.message}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasActivePackage ? (
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="hidden sm:inline-flex items-center px-2.5 py-1 rounded bg-[#141418] border border-white/15 text-[11px] font-medium text-zinc-200 hover:border-white/30 whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
            >
              Expira em: {formattedRemaining}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="px-3 py-1.5 rounded text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Comprar Pacote
            </button>
          )}

          <button
            type="button"
            onClick={() => logout()}
            title="Sair"
            aria-label="Sair"
            className="hidden sm:inline-flex items-center gap-1 p-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Menu"
            className="md:hidden p-1.5 text-zinc-300 hover:text-white cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {searchOpen && activeRoute === 'home' && (
        <div className="border-t border-white/10 bg-[#141418] px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Pesquisar..."
              autoFocus
              className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="text-[11px] text-zinc-400 hover:text-white cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      )}

      {hasActivePackage && (
        <div className="sm:hidden border-t border-white/10 bg-[#141418] px-4 py-1 flex items-center justify-between text-[11px] text-zinc-300 tabular-nums">
          <span>{profile?.currentPackage || 'Pacote ativo'}</span>
          <span className="font-semibold text-white">Expira em: {formattedRemaining}</span>
        </div>
      )}

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#141418] px-4 py-2.5 space-y-1">
          <button
            type="button"
            onClick={() => {
              onNavigate('home');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left py-1.5 text-xs font-medium text-white"
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('packages');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left py-1.5 text-xs font-medium text-white"
          >
            Pacotes
          </button>
          {settings.downloadsEnabled && (
            <button
              type="button"
              onClick={() => {
                onNavigate('downloads');
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left py-1.5 text-xs font-medium text-white"
            >
              Downloads
            </button>
          )}
          {profile?.isAdmin && (
            <button
              type="button"
              onClick={() => {
                onNavigateAdmin();
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left py-1.5 text-xs font-medium text-amber-400"
            >
              Admin
            </button>
          )}
          <button
            type="button"
            onClick={() => logout()}
            className="block w-full text-left py-1.5 text-xs font-medium text-red-400 border-t border-white/10 pt-2"
          >
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
