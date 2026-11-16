import React, { useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  Film,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export type AdminTab =
  | 'dashboard'
  | 'videos'
  | 'packages'
  | 'pins'
  | 'users'
  | 'payments'
  | 'settings'
  | 'logs';

interface AdminLayoutProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onBackToUserApp: () => void;
  children: React.ReactNode;
}

const MENU_ITEMS: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'videos', label: 'Catálogo', icon: Film },
  { id: 'packages', label: 'Pacotes', icon: Package },
  { id: 'pins', label: 'Códigos PIN', icon: KeyRound },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'payments', label: 'Pagamentos', icon: CreditCard },
  { id: 'settings', label: 'Definições', icon: Settings },
  { id: 'logs', label: 'Logs', icon: ScrollText },
];

export function AdminLayout({
  activeTab,
  onSelectTab,
  onBackToUserApp,
  children,
}: AdminLayoutProps) {
  const { profile, settings, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeLabel = MENU_ITEMS.find((m) => m.id === activeTab)?.label || 'Dashboard';

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#141418] border-r border-white/10">
      <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
        <span
          className="font-display text-xl font-extrabold tracking-tight uppercase"
          style={{ color: settings.primaryColor }}
        >
          {settings.appName} Admin
        </span>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1 text-zinc-400 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors cursor-pointer ${
                isActive ? 'text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              style={isActive ? { backgroundColor: settings.primaryColor } : undefined}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-white/10 space-y-1">
        <div className="px-2.5 py-1 text-[11px] text-zinc-400 truncate">
          {profile?.email || 'mozflix@gmail.com'}
        </div>
        <button
          type="button"
          onClick={onBackToUserApp}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-zinc-300 hover:bg-white/5 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          App
        </button>
        <button
          type="button"
          onClick={() => logout()}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-red-400 hover:bg-red-950/40 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex">
      <aside className="hidden lg:block w-52 shrink-0 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/75" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-56 max-w-[78vw] h-full">{SidebarContent}</aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-[#0A0A0C]/95 backdrop-blur border-b border-white/10 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Menu"
              className="lg:hidden p-1.5 -ml-1 rounded text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs text-zinc-400">
              <span>Admin</span>
              <span className="mx-1.5">/</span>
              <span className="text-white font-semibold">{activeLabel}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToUserApp}
            className="px-2.5 py-1 rounded bg-[#141418] border border-white/15 text-[11px] font-medium text-zinc-200 hover:border-white/30 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver App
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-5 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
