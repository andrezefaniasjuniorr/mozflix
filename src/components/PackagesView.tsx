import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, MessageCircle, Package, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AdminPackage, VideoItem } from '../types/mozflix';
import { redeemPinCode } from '../utils/adminActions';
import { sanitizeUserError } from '../utils/errorSanitizer';
import {
  buildWhatsAppUrl,
  formatCurrencyMt,
  formatHoursRemaining,
  getMillis,
} from '../utils/formatters';

interface PackagesViewProps {
  videos?: VideoItem[];
}

export function PackagesView({ videos = [] }: PackagesViewProps) {
  const {
    firebaseUser,
    profile,
    settings,
    packages,
    entitlements,
    hasActivePackage,
    hoursRemaining,
    serverNowMs,
    deviceId,
  } = useAuth();

  const [pinInput, setPinInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [expandedPkgId, setExpandedPkgId] = useState<string | null>(null);
  const pinSectionRef = useRef<HTMLDivElement | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  const activePackages = useMemo(
    () => packages.filter((p) => p.active),
    [packages]
  );

  const activeEntitlements = useMemo(
    () => entitlements.filter((e) => getMillis(e.expiresAt) > serverNowMs),
    [entitlements, serverNowMs]
  );

  const videoTitleById = useMemo(() => {
    const map = new Map<string, VideoItem>();
    videos.forEach((v) => map.set(v.id, v));
    return map;
  }, [videos]);

  const focusPinBox = () => {
    pinSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => pinInputRef.current?.focus(), 250);
  };

  const handleRedeemPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const cleaned = pinInput.trim().toUpperCase();
    if (!cleaned) {
      setPinError('Introduz o código PIN.');
      return;
    }

    setRedeeming(true);
    setPinError(null);
    setPinSuccess(null);

    try {
      const response = await redeemPinCode({
        codigo: cleaned,
        uid: firebaseUser.uid,
        userContact: profile?.phone || profile?.email || firebaseUser.uid,
        deviceId,
        serverNowMs,
      });
      setPinSuccess(response.message || 'Código ativado com sucesso!');
      setPinInput('');
    } catch (err: unknown) {
      setPinError(sanitizeUserError(err, 'Código inválido ou expirado.'));
    } finally {
      setRedeeming(false);
    }
  };

  const formatDurationLabel = (hours: number) => {
    if (hours >= 24 && hours % 24 === 0) {
      const days = hours / 24;
      return days === 1 ? '24h (1 dia)' : `${days} dias (${hours}h)`;
    }
    return `${hours}h`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-7 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
            Pacotes &amp; PIN
          </h1>
          <p className="text-xs text-zinc-400">
            Compra no WhatsApp e ativa com o teu código exclusivo
          </p>
        </div>

        {hasActivePackage && (
          <div className="px-3 py-1.5 rounded bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-200 tabular-nums">
            {profile?.currentPackage || 'Pacote ativo'} · Expira em: {hoursRemaining}h
          </div>
        )}
      </div>

      {/* Acessos Ativos (Pacotes + Filmes Individuais) */}
      {activeEntitlements.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-display text-lg font-bold text-white">Meus Acessos Ativos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {activeEntitlements.map((ent) => (
              <div
                key={ent.id}
                className="bg-[#141418] border border-emerald-500/30 rounded-md px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {ent.packageName}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {ent.targetType === 'content' ? 'Título exclusivo' : 'Pacote'} ·{' '}
                    <span className="font-mono-tabular">{ent.pinCode}</span>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-emerald-400 whitespace-nowrap tabular-nums">
                  {formatHoursRemaining(ent.expiresAt, serverNowMs)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pacotes Criados pelo Admin */}
      {activePackages.length === 0 ? (
        <div className="p-6 bg-[#141418] border border-white/10 rounded-md text-center space-y-1.5">
          <Package className="w-5 h-5 text-zinc-500 mx-auto" />
          <p className="text-sm font-medium text-white">Sem pacotes publicados de momento</p>
          <p className="text-xs text-zinc-400">
            Podes comprar filmes, séries ou canais individuais diretamente no catálogo ou usar um código PIN abaixo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePackages.map((pkg: AdminPackage) => {
            const includedItems = (pkg.videoIds || [])
              .map((id) => videoTitleById.get(id))
              .filter((v): v is VideoItem => Boolean(v));
            const isExpanded = expandedPkgId === pkg.id;

            const waMessage = `Olá ${settings.appName}, quero o pacote "${pkg.name}" (${formatDurationLabel(
              pkg.durationHours
            )} · ${formatCurrencyMt(pkg.priceMt)}). Conta: ${profile?.phone || profile?.email || ''}`;

            return (
              <div
                key={pkg.id}
                className="flex flex-col justify-between bg-[#141418] border border-white/10 rounded-md p-4 space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-lg font-bold text-white">{pkg.name}</h2>
                    <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                      {formatDurationLabel(pkg.durationHours)}
                    </span>
                  </div>

                  <div className="font-display text-3xl font-extrabold text-white tabular-nums">
                    {formatCurrencyMt(pkg.priceMt)}
                  </div>

                  {pkg.description && (
                    <p className="text-xs text-zinc-300 leading-relaxed">{pkg.description}</p>
                  )}

                  <div className="pt-1 border-t border-white/10">
                    {pkg.includeAllContent ? (
                      <div className="text-[11px] font-medium text-emerald-400">
                        Inclui todo o catálogo de filmes, séries e canais
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedPkgId(isExpanded ? null : pkg.id)}
                          className="w-full flex items-center justify-between text-[11px] font-medium text-zinc-300 hover:text-white cursor-pointer"
                        >
                          <span>
                            {pkg.videoIds?.length || 0} conteúdo(s) incluído(s)
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="max-h-36 overflow-y-auto bg-[#0A0A0C] border border-white/10 rounded p-2 space-y-1">
                            {includedItems.length > 0 ? (
                              includedItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-2 text-[11px]"
                                >
                                  <span className="text-zinc-200 truncate">{item.title}</span>
                                  <span className="text-zinc-500 shrink-0">{item.category}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-[11px] text-zinc-500">
                                {pkg.videoIds?.length || 0} título(s) selecionados.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <a
                    href={buildWhatsAppUrl(settings.supportWhatsapp, waMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Comprar no WhatsApp
                  </a>

                  <button
                    type="button"
                    onClick={focusPinBox}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Usar Código PIN
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Caixa de Ativação de Código PIN */}
      <section
        ref={pinSectionRef}
        className="max-w-md bg-[#141418] border border-white/15 rounded-md p-5 space-y-3.5"
      >
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck className="w-4 h-4" style={{ color: settings.primaryColor }} />
          <h2 className="font-display text-lg font-bold">Ativar Código PIN</h2>
        </div>

        <p className="text-xs text-zinc-400">
          Válido para pacotes ou filmes/séries/canais individuais. Fica vinculado a este dispositivo.
        </p>

        {pinSuccess && (
          <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 font-medium">
            {pinSuccess}
          </div>
        )}
        {pinError && (
          <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
            {pinError}
          </div>
        )}

        <form onSubmit={handleRedeemPin} className="flex gap-2">
          <input
            ref={pinInputRef}
            type="text"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.toUpperCase())}
            placeholder="MOZ-XXXXXXXX"
            className="flex-1 px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded font-mono-tabular text-sm text-white placeholder-zinc-500 uppercase focus:outline-none focus:border-[#E50914]"
          />
          <button
            type="submit"
            disabled={redeeming}
            className="px-4 py-2 rounded text-xs font-semibold text-white whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
            style={{ backgroundColor: settings.primaryColor }}
          >
            {redeeming ? 'A ativar...' : 'Ativar'}
          </button>
        </form>
      </section>
    </div>
  );
}
