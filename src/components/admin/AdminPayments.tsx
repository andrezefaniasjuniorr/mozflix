import React, { useMemo, useState } from 'react';
import { CheckCircle2, CreditCard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPackage, ManualPayment, UserProfile, VideoItem } from '../../types/mozflix';
import { adminActivatePackageManually } from '../../utils/adminActions';
import { normalizeMozPhone } from '../../utils/device';
import { formatCurrencyMt, formatDateMz } from '../../utils/formatters';
import { sanitizeUserError } from '../../utils/errorSanitizer';

interface AdminPaymentsProps {
  users: UserProfile[];
  payments: ManualPayment[];
  packages: AdminPackage[];
  videos: VideoItem[];
}

export function AdminPayments({ users, payments, packages, videos }: AdminPaymentsProps) {
  const { profile, settings } = useAuth();
  const [phoneQuery, setPhoneQuery] = useState('');
  const [selectedUid, setSelectedUid] = useState('');
  const [targetMode, setTargetMode] = useState<'package' | 'content'>('package');
  const [selectedPkgId, setSelectedPkgId] = useState(packages[0]?.id || '');
  const [selectedVideoId, setSelectedVideoId] = useState(videos[0]?.id || '');
  const [customHours, setCustomHours] = useState<number>(24);
  const [customPrice, setCustomPrice] = useState<number>(packages[0]?.priceMt ?? 15);
  const [transacaoId, setTransacaoId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matchedUsers = useMemo(() => {
    const q = phoneQuery.trim().toLowerCase();
    if (!q) return [];
    const norm = normalizeMozPhone(phoneQuery);
    return users
      .filter(
        (u) =>
          (u.phone || '').toLowerCase().includes(q) ||
          (u.phone || '') === norm ||
          (u.email || '').toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [users, phoneQuery]);

  const activePkg = packages.find((p) => p.id === selectedPkgId) || packages[0] || null;
  const activeVideo = videos.find((v) => v.id === selectedVideoId) || videos[0] || null;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(null);
    setError(null);
    try {
      let label = `Acesso ${customHours}h`;
      let packageId: string | null = null;
      let includeAllContent = true;
      let videoIds: string[] = [];

      if (targetMode === 'package' && activePkg) {
        label = activePkg.name;
        packageId = activePkg.id;
        includeAllContent = activePkg.includeAllContent;
        videoIds = activePkg.videoIds || [];
      } else if (targetMode === 'content' && activeVideo) {
        label = activeVideo.title;
        includeAllContent = false;
        videoIds = [activeVideo.id];
      }

      const res = await adminActivatePackageManually({
        phone: phoneQuery,
        targetUid: selectedUid || undefined,
        tipoPacote: label,
        packageId,
        includeAllContent,
        videoIds,
        duracaoHoras: customHours,
        valorMt: customPrice,
        transacaoId,
        adminUid: profile?.uid || 'admin',
        adminEmail: profile?.email || 'admin',
      });
      setSuccess(`${label} (${formatCurrencyMt(res.valorMt)}) ativado para ${res.telefone}.`);
      setTransacaoId('');
      setSelectedUid('');
      setPhoneQuery('');
    } catch (err) {
      setError(sanitizeUserError(err, 'Não foi possível confirmar o pagamento.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white tracking-tight">
        Pagamentos Manuais
      </h1>

      <form
        onSubmit={handleActivate}
        className="bg-[#141418] border border-white/10 rounded-md p-4 space-y-3 max-w-xl"
      >
        <div className="flex items-center gap-2 text-white">
          <CreditCard className="w-4 h-4" style={{ color: settings.primaryColor }} />
          <h2 className="font-display text-lg font-bold">Confirmar Pagamento</h2>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-zinc-400">Telefone</label>
          <input
            type="text"
            required
            value={phoneQuery}
            onChange={(e) => {
              setPhoneQuery(e.target.value);
              setSelectedUid('');
            }}
            placeholder="84 123 4567"
            className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
          />
          {matchedUsers.length > 0 && !selectedUid && (
            <div className="mt-1 bg-[#0A0A0C] border border-white/15 rounded divide-y divide-white/10">
              {matchedUsers.map((u) => (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => {
                    setPhoneQuery(u.phone || u.email);
                    setSelectedUid(u.uid);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 flex justify-between cursor-pointer"
                >
                  <span>{u.phone || u.email}</span>
                  <span className="text-zinc-400">{u.currentPackage || '—'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="inline-flex p-1 bg-[#0A0A0C] border border-white/10 rounded">
          <button
            type="button"
            onClick={() => {
              setTargetMode('package');
              if (activePkg) {
                setCustomHours(activePkg.durationHours);
                setCustomPrice(activePkg.priceMt);
              }
            }}
            className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
              targetMode === 'package' ? 'text-white' : 'text-zinc-400'
            }`}
            style={targetMode === 'package' ? { backgroundColor: settings.primaryColor } : undefined}
          >
            Pacote
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetMode('content');
              setCustomHours(24);
              if (activeVideo) setCustomPrice(activeVideo.individualPriceMt ?? 5);
            }}
            className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
              targetMode === 'content' ? 'text-white' : 'text-zinc-400'
            }`}
            style={targetMode === 'content' ? { backgroundColor: settings.primaryColor } : undefined}
          >
            Filme / Série / Canal
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {targetMode === 'package' ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-400">Pacote</label>
              <select
                value={activePkg?.id || ''}
                onChange={(e) => {
                  const pid = e.target.value;
                  setSelectedPkgId(pid);
                  const found = packages.find((p) => p.id === pid);
                  if (found) {
                    setCustomHours(found.durationHours);
                    setCustomPrice(found.priceMt);
                  }
                }}
                className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
              >
                {packages.length === 0 ? (
                  <option value="">Acesso Geral</option>
                ) : (
                  packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.durationHours}h · {p.priceMt} MT)
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-400">Conteúdo</label>
              <select
                value={activeVideo?.id || ''}
                onChange={(e) => {
                  const vid = e.target.value;
                  setSelectedVideoId(vid);
                  const found = videos.find((v) => v.id === vid);
                  if (found) setCustomPrice(found.individualPriceMt ?? 5);
                }}
                className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
              >
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} ({v.individualPriceMt ?? 5} MT)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-400">Horas</label>
              <input
                type="number"
                min={1}
                required
                value={customHours}
                onChange={(e) => setCustomHours(Number(e.target.value))}
                className="w-full px-2.5 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-400">Valor (MT)</label>
              <input
                type="number"
                min={0}
                required
                value={customPrice}
                onChange={(e) => setCustomPrice(Number(e.target.value))}
                className="w-full px-2.5 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="block text-[11px] font-medium text-zinc-400">
              ID M-Pesa / e-Mola
            </label>
            <input
              type="text"
              required
              value={transacaoId}
              onChange={(e) => setTransacaoId(e.target.value)}
              placeholder="MP261116.1422.A8912"
              className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded font-mono-tabular text-xs text-white"
            />
          </div>
        </div>

        {success && (
          <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: settings.primaryColor }}
        >
          {submitting ? 'A ativar...' : 'Ativar'}
        </button>
      </form>

      <section className="bg-[#141418] border border-white/10 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="font-display text-lg font-bold text-white">Histórico</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A0A0C] text-zinc-400 border-b border-white/10">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Telefone</th>
                <th className="px-3.5 py-2.5 font-medium">Acesso</th>
                <th className="px-3.5 py-2.5 font-medium">Valor</th>
                <th className="px-3.5 py-2.5 font-medium">Ref</th>
                <th className="px-3.5 py-2.5 font-medium">Data</th>
                <th className="px-3.5 py-2.5 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-6 text-center text-zinc-500">
                    Sem registos.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-3.5 py-2 font-medium text-white tabular-nums">
                      {p.telefone}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-300">{p.pacote}</td>
                    <td className="px-3.5 py-2 text-white font-semibold tabular-nums">
                      {formatCurrencyMt(p.valorMt)}
                    </td>
                    <td className="px-3.5 py-2 font-mono-tabular text-[11px] text-zinc-300">
                      {p.transacaoId}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-400 tabular-nums">
                      {formatDateMz(p.createdAt)}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-400">{p.ativadoPorEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
