import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface AdminLoginScreenProps {
  onBackToUserApp: () => void;
}

export function AdminLoginScreen({ onBackToUserApp }: AdminLoginScreenProps) {
  const { firebaseUser, profile, settings, loginWithEmail, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoggedNonAdmin = Boolean(firebaseUser && profile && !profile.isAdmin);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithEmail(email, password, true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Erro ao entrar.';
      let msg = raw;
      if (raw.includes('auth/configuration-not-found')) {
        msg = 'Ativa Email/Password no Firebase Console (mozflix-e39cc).';
      } else if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password')) {
        msg = 'Email ou senha incorretos.';
      }
      setError(msg);
      if (msg.toLowerCase().includes('administrador')) {
        window.setTimeout(() => {
          onBackToUserApp();
        }, 1600);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-[#141418] border border-white/10 rounded-lg p-5 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" style={{ color: settings.primaryColor }} />
            <span className="font-display text-xl font-extrabold tracking-tight text-white">
              {settings.appName} Admin
            </span>
          </div>
          <button
            type="button"
            onClick={onBackToUserApp}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            App
          </button>
        </div>

        {isLoggedNonAdmin ? (
          <div className="space-y-3">
            <div className="p-3 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
              Sem permissão de administrador.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onBackToUserApp}
                className="flex-1 py-2 px-3 rounded text-xs font-semibold text-white cursor-pointer"
                style={{ backgroundColor: settings.primaryColor }}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => logout()}
                className="py-2 px-3 rounded bg-white/10 hover:bg-white/15 text-xs font-medium text-white cursor-pointer"
              >
                Trocar Conta
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-white">Entrar</h1>

            {error && (
              <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-400">Email</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mozflix@gmail.com"
                    className="w-full pl-9 pr-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-400">Senha</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full pl-9 pr-9 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
                style={{ backgroundColor: settings.primaryColor }}
              >
                {submitting ? 'A entrar...' : 'Entrar no Admin'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
