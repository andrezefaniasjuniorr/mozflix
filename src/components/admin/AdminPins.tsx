import React, { useMemo, useState } from 'react';
import { Ban, Check, Copy, Download, KeyRound } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPackage, PinCode, PinTargetType, VideoItem } from '../../types/mozflix';
import { adminGeneratePins, logAdminAction } from '../../utils/adminActions';
import { formatCurrencyMt, formatDateMz } from '../../utils/formatters';
import { sanitizeUserError } from '../../utils/errorSanitizer';

interface AdminPinsProps {
  pins: PinCode[];
  videos: VideoItem[];
  packages: AdminPackage[];
}

type PinFilter = 'all' | 'unused' | 'used';

export function AdminPins({ pins, videos, packages }: AdminPinsProps) {
  const { profile, settings } = useAuth();
  const [targetType, setTargetType] = useState<PinTargetType>('content');
  const [selectedVideoId, setSelectedVideoId] = useState<string>(videos[0]?.id || '');
  const [selectedPackageId, setSelectedPackageId] = useState<string>(packages[0]?.id || '');
  const [customTitle, setCustomTitle] = useState('Acesso Especial');
  const [duracaoHoras, setDuracaoHoras] = useState<number>(24);
  const [precoMt, setPrecoMt] = useState<number>(videos[0]?.individualPriceMt ?? 5);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [prefixo, setPrefixo] = useState('MOZ-');
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<PinFilter>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [lastCodes, setLastCodes] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeVideo = useMemo(
    () => videos.find((v) => v.id === selectedVideoId) || videos[0] || null,
    [videos, selectedVideoId]
  );

  const activePkg = useMemo(
    () => packages.find((p) => p.id === selectedPackageId) || packages[0] || null,
    [packages, selectedPackageId]
  );

  const filteredPins = useMemo(() => {
    if (filter === 'unused') return pins.filter((p) => !p.usado && !p.desativado);
    if (filter === 'used') return pins.filter((p) => p.usado);
    return pins;
  }, [pins, filter]);

  const unusedPins = useMemo(() => pins.filter((p) => !p.usado && !p.desativado), [pins]);

  const handleSelectTargetType = (next: PinTargetType) => {
    setTargetType(next);
    setError(null);
    if (next === 'content' && activeVideo) {
      setSelectedVideoId(activeVideo.id);
      setPrecoMt(activeVideo.individualPriceMt ?? 5);
      setDuracaoHoras(24);
    } else if (next === 'package' && activePkg) {
      setSelectedPackageId(activePkg.id);
      setPrecoMt(activePkg.priceMt);
      setDuracaoHoras(activePkg.durationHours);
    }
  };

  const handleVideoChange = (vid: string) => {
    setSelectedVideoId(vid);
    const v = videos.find((item) => item.id === vid);
    if (v) {
      setPrecoMt(v.individualPriceMt ?? 5);
    }
  };

  const handlePackageChange = (pid: string) => {
    setSelectedPackageId(pid);
    const p = packages.find((item) => item.id === pid);
    if (p) {
      setPrecoMt(p.priceMt);
      setDuracaoHoras(p.durationHours);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setFeedback(null);
    setLastCodes([]);

    try {
      let packageName = customTitle.trim();
      let packageId: string | null = null;
      let includeAllContent = false;
      let videoIds: string[] = [];
      let videoTitles: string[] = [];

      if (targetType === 'content') {
        if (!activeVideo) {
          throw new Error('Adiciona pelo menos um filme, série ou canal no Catálogo.');
        }
        packageName = activeVideo.title;
        videoIds = [activeVideo.id];
        videoTitles = [activeVideo.title];
      } else {
        if (activePkg) {
          packageId = activePkg.id;
          packageName = activePkg.name;
          includeAllContent = activePkg.includeAllContent;
          videoIds = activePkg.videoIds || [];
          videoTitles = includeAllContent
            ? ['Todo o Catálogo']
            : videos.filter((v) => videoIds.includes(v.id)).map((v) => v.title);
        } else {
          includeAllContent = true;
          if (!packageName) packageName = `Acesso ${duracaoHoras}h`;
        }
      }

      const res = await adminGeneratePins({
        targetType,
        packageId,
        packageName,
        includeAllContent,
        videoIds,
        videoTitles,
        duracaoHoras,
        precoMt,
        quantidade,
        prefixo,
        adminUid: profile?.uid || 'admin',
        adminEmail: profile?.email || 'admin',
      });

      setLastCodes(res.codes);
      setFeedback(`${res.count} código(s) gerados para "${packageName}".`);
    } catch (err) {
      setError(sanitizeUserError(err, 'Não foi possível gerar os códigos.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyOne = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode(null), 1600);
  };

  const handleCopyAllUnused = async () => {
    if (unusedPins.length === 0) return;
    const text = unusedPins
      .map((p) => `${p.codigo} · ${p.packageName || p.tipoPacote} (${p.duracaoHoras}h · ${p.precoMt} MT)`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1800);
  };

  const handleExportCsv = () => {
    const header = [
      'Código',
      'Tipo',
      'Alvo',
      'Horas',
      'Preço (MT)',
      'Estado',
      'Usado Por',
      'Device',
      'Criado',
    ];
    const rows = filteredPins.map((p) => [
      p.codigo,
      p.targetType === 'content' ? 'Conteúdo' : 'Pacote',
      p.packageName || p.tipoPacote,
      String(p.duracaoHoras),
      String(p.precoMt || 0),
      p.desativado ? 'Desativado' : p.usado ? 'Usado' : 'Disponível',
      p.usadoPorTelefone || p.usadoPor || '',
      p.usedDeviceId || '',
      formatDateMz(p.criadoEm),
    ]);

    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mozflix-pins-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeactivate = async (pin: PinCode) => {
    if (!window.confirm(`Desativar ${pin.codigo}?`)) return;
    await updateDoc(doc(db, 'pins', pin.id), { desativado: true });
    await logAdminAction(
      profile?.uid || 'admin',
      profile?.email || 'admin',
      'DESATIVAR_PIN',
      `Desativou PIN ${pin.codigo}`
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white tracking-tight">Códigos PIN</h1>

      <form
        onSubmit={handleGenerate}
        className="bg-[#141418] border border-white/10 rounded-md p-4 space-y-3.5"
      >
        {/* Tipo do PIN */}
        <div className="inline-flex p-1 bg-[#0A0A0C] border border-white/10 rounded">
          <button
            type="button"
            onClick={() => handleSelectTargetType('content')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              targetType === 'content' ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
            style={targetType === 'content' ? { backgroundColor: settings.primaryColor } : undefined}
          >
            Por Filme / Série / Canal
          </button>
          <button
            type="button"
            onClick={() => handleSelectTargetType('package')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              targetType === 'package' ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
            style={targetType === 'package' ? { backgroundColor: settings.primaryColor } : undefined}
          >
            Por Pacote
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {targetType === 'content' ? (
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[11px] font-medium text-zinc-400">
                Filme / Série / Canal Exclusivo
              </label>
              <select
                value={activeVideo?.id || ''}
                onChange={(e) => handleVideoChange(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
              >
                {videos.length === 0 ? (
                  <option value="">Sem títulos no catálogo</option>
                ) : (
                  videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} ({v.category} · {v.individualPriceMt} MT)
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : (
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[11px] font-medium text-zinc-400">
                Pacote Selecionado
              </label>
              {packages.length > 0 ? (
                <select
                  value={activePkg?.id || ''}
                  onChange={(e) => handlePackageChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.durationHours}h · {p.priceMt} MT)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Nome do pacote (ex: Pacote 24h)"
                  className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                />
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-zinc-400">Duração (horas)</label>
            <input
              type="number"
              min={1}
              required
              value={duracaoHoras}
              onChange={(e) => setDuracaoHoras(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-zinc-400">Preço (MT)</label>
            <input
              type="number"
              min={0}
              required
              value={precoMt}
              onChange={(e) => setPrecoMt(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-400">Qtd</label>
              <input
                type="number"
                min={1}
                max={200}
                required
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="w-full px-2.5 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-400">Prefixo</label>
              <input
                type="text"
                required
                maxLength={10}
                value={prefixo}
                onChange={(e) => setPrefixo(e.target.value.toUpperCase())}
                className="w-full px-2.5 py-2 bg-[#0A0A0C] border border-white/15 rounded font-mono-tabular text-xs text-white uppercase"
              />
            </div>
          </div>
        </div>

        {feedback && (
          <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 space-y-2">
            <div>{feedback}</div>
            {lastCodes.length > 0 && lastCodes.length <= 5 && (
              <div className="flex flex-wrap gap-1.5">
                {lastCodes.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => void handleCopyOne(c)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0A0A0C] border border-emerald-500/30 font-mono-tabular text-xs font-bold text-white cursor-pointer"
                  >
                    {c}
                    {copiedCode === c ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-zinc-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={generating}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: settings.primaryColor }}
        >
          <KeyRound className="w-3.5 h-3.5" />
          {generating ? 'A gerar...' : 'Gerar Código(s)'}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 p-1 bg-[#141418] border border-white/10 rounded">
          {[
            { id: 'all' as PinFilter, label: `Todos (${pins.length})` },
            { id: 'unused' as PinFilter, label: `Livres (${unusedPins.length})` },
            { id: 'used' as PinFilter, label: `Usados (${pins.filter((p) => p.usado).length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                filter === tab.id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={unusedPins.length === 0}
            onClick={() => void handleCopyAllUnused()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-semibold text-white disabled:opacity-40 cursor-pointer"
          >
            {copiedAll ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copiedAll ? 'Copiados' : 'Copiar Livres'}
          </button>

          <button
            type="button"
            disabled={filteredPins.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-semibold text-white disabled:opacity-40 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      <div className="bg-[#141418] border border-white/10 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A0A0C] text-zinc-400 border-b border-white/10">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Código</th>
                <th className="px-3.5 py-2.5 font-medium">Exclusivo Para</th>
                <th className="px-3.5 py-2.5 font-medium">Horas</th>
                <th className="px-3.5 py-2.5 font-medium">Preço</th>
                <th className="px-3.5 py-2.5 font-medium">Estado</th>
                <th className="px-3.5 py-2.5 font-medium">Usado Por</th>
                <th className="px-3.5 py-2.5 font-medium">Data</th>
                <th className="px-3.5 py-2.5 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredPins.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3.5 py-6 text-center text-zinc-500">
                    Sem códigos.
                  </td>
                </tr>
              ) : (
                filteredPins.map((pin) => (
                  <tr key={pin.id} className="hover:bg-white/[0.02]">
                    <td className="px-3.5 py-2 font-mono-tabular font-semibold text-white">
                      {pin.codigo}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-200">
                      <div>{pin.packageName || pin.tipoPacote}</div>
                      <div className="text-[10px] text-zinc-500">
                        {pin.targetType === 'content' ? 'Conteúdo único' : 'Pacote'}
                      </div>
                    </td>
                    <td className="px-3.5 py-2 text-zinc-300 tabular-nums">{pin.duracaoHoras}h</td>
                    <td className="px-3.5 py-2 text-zinc-300 tabular-nums">
                      {formatCurrencyMt(pin.precoMt)}
                    </td>
                    <td className="px-3.5 py-2">
                      {pin.desativado ? (
                        <span className="text-[11px] font-semibold text-zinc-500">Desativado</span>
                      ) : pin.usado ? (
                        <span className="text-[11px] font-semibold text-amber-400">Usado</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-400">Livre</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-400 tabular-nums">
                      {pin.usadoPorTelefone || pin.usadoPor || '—'}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-400 tabular-nums">
                      {formatDateMz(pin.criadoEm)}
                    </td>
                    <td className="px-3.5 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleCopyOne(pin.codigo)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] text-white cursor-pointer"
                        >
                          {copiedCode === pin.codigo ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          Copiar
                        </button>
                        {!pin.usado && !pin.desativado && (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate(pin)}
                            title="Desativar"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-950/60 hover:bg-red-900/70 text-[11px] text-red-200 cursor-pointer"
                          >
                            <Ban className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
