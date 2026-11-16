import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, MessageCircle, Phone, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { buildWhatsAppUrl } from '../utils/formatters';

interface AuthScreenProps {
  onNavigateAdmin: () => void;
}

function mapFirebaseAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('auth/configuration-not-found')) {
    return 'Ativa Email/Password no Firebase Console (Authentication -> Sign-in method) para mozflix-e39cc.';
  }
  if (msg.includes('auth/operation-not-allowed')) {
    return 'Método Email/Password desativado no Firebase Console.';
  }
  if (msg.includes('auth/unauthorized-domain')) {
    return 'Domínio não autorizado no Firebase Console (Authorized domains).';
  }
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
    return 'Dados incorretos.';
  }
  if (msg.includes('auth/user-not-found')) {
    return 'Conta não encontrada.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'Telefone ou email já registado.';
  }
  if (msg.includes('auth/weak-password')) {
    return 'Senha mínima: 6 caracteres.';
  }
  if (msg.includes('auth/invalid-email')) {
    return 'Email inválido.';
  }
  if (msg.includes('auth/too-many-requests')) {
    return 'Muitas tentativas. Aguarda.';
  }
  return msg;
}

export function AuthScreen({ onNavigateAdmin }: AuthScreenProps) {
  const {
    settings,
    authError,
    authErrorType,
    clearAuthError,
    loginWithPhone,
    loginWithEmail,
    registerUser,
  } = useAuth();

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayedError = localError || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      if (tab === 'login') {
        if (method === 'phone') {
          await loginWithPhone(phone, password);
        } else {
          await loginWithEmail(email, password, false);
        }
      } else {
        await registerUser({
          mode: method,
          phone,
          email,
          password,
        });
      }
    } catch (err) {
      setLocalError(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src="/src/assets/images/hero_maputo_twilight_1794863673135.jpg"
          alt="Maputo"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-25 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/85 to-[#0A0A0C]/70" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 h-14 max-w-7xl w-full mx-auto">
        <span
          className="font-display text-2xl font-extrabold tracking-tight uppercase"
          style={{ color: settings.primaryColor }}
        >
          {settings.appName}
        </span>
        <button
          type="button"
          onClick={onNavigateAdmin}
          className="text-xs font-medium text-zinc-400 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
        >
          Admin
        </button>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-sm bg-[#141418]/95 backdrop-blur-md border border-white/10 rounded-lg p-5 sm:p-6 shadow-2xl space-y-4">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            {tab === 'login' ? 'Entrar' : 'Criar Conta'}
          </h1>

          <div className="grid grid-cols-2 gap-1 p-1 bg-[#0A0A0C] border border-white/10 rounded">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setLocalError(null);
              }}
              className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                tab === 'login' ? 'text-white' : 'text-zinc-400 hover:text-white'
              }`}
              style={tab === 'login' ? { backgroundColor: settings.primaryColor } : undefined}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setLocalError(null);
              }}
              className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                tab === 'register' ? 'text-white' : 'text-zinc-400 hover:text-white'
              }`}
              style={tab === 'register' ? { backgroundColor: settings.primaryColor } : undefined}
            >
              Registar
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
            <button
              type="button"
              onClick={() => {
                setMethod('phone');
                setLocalError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                method === 'phone'
                  ? 'bg-white/12 text-white border border-white/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              Telefone
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('email');
                setLocalError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                method === 'email'
                  ? 'bg-white/12 text-white border border-white/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Email
            </button>
          </div>

          {displayedError && (
            <div className="p-3 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200 space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <span>{displayedError}</span>
              </div>
              {(authErrorType === 'device_lock' || authErrorType === 'blocked') && (
                <a
                  href={buildWhatsAppUrl(
                    settings.supportWhatsapp,
                    `Olá suporte ${settings.appName}, preciso de ajuda com a minha conta (${phone || email}).`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {(method === 'phone' || tab === 'register') && (
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-400">Telefone</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required={method === 'phone' || tab === 'register'}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="84 123 4567"
                    className="w-full pl-9 pr-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
                  />
                </div>
              </div>
            )}

            {(method === 'email' || tab === 'register') && (
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-400">
                  Email {method === 'phone' && tab === 'register' ? '(opcional)' : ''}
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required={method === 'email'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@email.com"
                    className="w-full pl-9 pr-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-400">Senha</label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full pl-9 pr-9 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label="Mostrar senha"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded font-semibold text-xs text-white transition-opacity disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: settings.primaryColor }}
            >
              {submitting ? 'Aguarde...' : tab === 'login' ? 'Entrar' : 'Registar'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
