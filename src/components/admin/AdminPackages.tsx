import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Check, Copy, Edit2, KeyRound, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPackage, VideoItem } from '../../types/mozflix';
import { adminGeneratePins, logAdminAction } from '../../utils/adminActions';
import { formatCurrencyMt } from '../../utils/formatters';

interface AdminPackagesProps {
  packages: AdminPackage[];
  videos: VideoItem[];
}

interface PackageFormState {
  id?: string;
  name: string;
  description: string;
  durationHours: number;
  priceMt: number;
  includeAllContent: boolean;
  videoIds: string[];
  active: boolean;
}

const EMPTY_PKG: PackageFormState = {
  name: '',
  description: '',
  durationHours: 24,
  priceMt: 15,
  includeAllContent: false,
  videoIds: [],
  active: true,
};

const QUICK_DURATIONS = [
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '72h', hours: 72 },
  { label: '7 dias', hours: 168 },
  { label: '30 dias', hours: 720 },
];

export function AdminPackages({ packages, videos }: AdminPackagesProps) {
  const { profile, settings } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PackageFormState>(EMPTY_PKG);
  const [videoFilter, setVideoFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gerador rápido de PIN direto do pacote
  const [pinModalPkg, setPinModalPkg] = useState<AdminPackage | null>(null);
  const [pinQty, setPinQty] = useState(1);
  const [pinHours, setPinHours] = useState(24);
  const [pinPrice, setPinPrice] = useState(15);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const filteredVideos = useMemo(() => {
    const q = videoFilter.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter(
      (v) => v.title.toLowerCase().includes(q) || v.category.toLowerCase().includes(q)
    );
  }, [videos, videoFilter]);

  const openCreate = () => {
    setForm(EMPTY_PKG);
    setVideoFilter('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (pkg: AdminPackage) => {
    setForm({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      durationHours: pkg.durationHours,
      priceMt: pkg.priceMt,
      includeAllContent: pkg.includeAllContent,
      videoIds: pkg.videoIds || [],
      active: pkg.active,
    });
    setVideoFilter('');
    setError(null);
    setModalOpen(true);
  };

  const toggleVideoInPackage = (videoId: string) => {
    setForm((prev) => {
      const exists = prev.videoIds.includes(videoId);
      return {
        ...prev,
        videoIds: exists
          ? prev.videoIds.filter((id) => id !== videoId)
          : [...prev.videoIds, videoId],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Nome do pacote obrigatório.');
      return;
    }
    if (!form.includeAllContent && form.videoIds.length === 0) {
      setError('Seleciona pelo menos 1 filme/série/canal ou marca "Todo o Catálogo".');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        durationHours: Math.max(1, Number(form.durationHours || 24)),
        priceMt: Math.max(0, Number(form.priceMt ?? 0)),
        includeAllContent: form.includeAllContent,
        videoIds: form.includeAllContent ? [] : form.videoIds,
        active: form.active,
      };

      if (form.id) {
        await updateDoc(doc(db, 'packages', form.id), payload);
        await logAdminAction(
          profile?.uid || 'admin',
          profile?.email || 'admin',
          'EDITAR_PACOTE',
          `Editou pacote "${payload.name}" (${payload.durationHours}h · ${payload.priceMt} MT)`
        );
      } else {
        await addDoc(collection(db, 'packages'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminAction(
          profile?.uid || 'admin',
          profile?.email || 'admin',
          'CRIAR_PACOTE',
          `Criou pacote "${payload.name}" (${payload.durationHours}h · ${payload.priceMt} MT)`
        );
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar pacote.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (pkg: AdminPackage) => {
    await updateDoc(doc(db, 'packages', pkg.id), { active: !pkg.active });
  };

  const handleDelete = async (pkg: AdminPackage) => {
    if (!window.confirm(`Apagar pacote "${pkg.name}"?`)) return;
    await deleteDoc(doc(db, 'packages', pkg.id));
    await logAdminAction(
      profile?.uid || 'admin',
      profile?.email || 'admin',
      'APAGAR_PACOTE',
      `Apagou pacote "${pkg.name}"`
    );
  };

  const openQuickPin = (pkg: AdminPackage) => {
    setPinModalPkg(pkg);
    setPinQty(1);
    setPinHours(pkg.durationHours);
    setPinPrice(pkg.priceMt);
    setGeneratedCodes([]);
    setError(null);
  };

  const handleGeneratePackagePins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalPkg) return;
    setSaving(true);
    setError(null);
    try {
      const titles = pinModalPkg.includeAllContent
        ? ['Todo o Catálogo']
        : videos
            .filter((v) => pinModalPkg.videoIds.includes(v.id))
            .map((v) => v.title);

      const res = await adminGeneratePins({
        targetType: 'package',
        packageId: pinModalPkg.id,
        packageName: pinModalPkg.name,
        includeAllContent: pinModalPkg.includeAllContent,
        videoIds: pinModalPkg.videoIds || [],
        videoTitles: titles,
        duracaoHoras: pinHours,
        precoMt: pinPrice,
        quantidade: pinQty,
        prefixo: 'MOZ-',
        adminUid: profile?.uid || 'admin',
        adminEmail: profile?.email || 'admin',
      });
      setGeneratedCodes(res.codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar código.');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode(null), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-white tracking-tight">Pacotes</h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          style={{ backgroundColor: settings.primaryColor }}
        >
          <Plus className="w-3.5 h-3.5" />
          Criar Pacote
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="p-8 bg-[#141418] border border-white/10 rounded-md text-center space-y-1">
          <p className="text-sm font-medium text-white">Nenhum pacote criado</p>
          <p className="text-xs text-zinc-400">
            Cria pacotes personalizados (ex: 24h, Fim-de-Semana, Canais VIP) e escolhe os títulos incluídos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="bg-[#141418] border border-white/10 rounded-md p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-white">{pkg.name}</h2>
                    <div className="text-[11px] text-zinc-400 tabular-nums">
                      {pkg.durationHours}h · {formatCurrencyMt(pkg.priceMt)} ·{' '}
                      {pkg.includeAllContent
                        ? 'Todo o catálogo'
                        : `${pkg.videoIds?.length || 0} título(s)`}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-semibold ${
                      pkg.active ? 'text-emerald-400' : 'text-zinc-500'
                    }`}
                  >
                    {pkg.active ? 'Ativo' : 'Pausado'}
                  </span>
                </div>

                {pkg.description && (
                  <p className="text-xs text-zinc-300 line-clamp-2">{pkg.description}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => openQuickPin(pkg)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  <KeyRound className="w-3 h-3" />
                  Gerar PIN
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(pkg)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-white/10 hover:bg-white/15 text-[11px] text-white cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(pkg)}
                    className="px-2 py-1.5 rounded bg-white/10 hover:bg-white/15 text-[11px] text-zinc-200 cursor-pointer"
                  >
                    {pkg.active ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(pkg)}
                    className="p-1.5 rounded bg-red-950/60 hover:bg-red-900/70 text-red-200 cursor-pointer"
                    title="Apagar"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar / Editar Pacote */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl my-auto">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                {form.id ? 'Editar Pacote' : 'Novo Pacote'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 max-h-[82vh] overflow-y-auto">
              {error && (
                <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-400">Nome</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Pacote 24h Total, Canais + Séries..."
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-400">Descrição</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="O que está incluído neste pacote"
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-400">
                    Duração (horas)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.durationHours}
                    onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {QUICK_DURATIONS.map((d) => (
                      <button
                        key={d.hours}
                        type="button"
                        onClick={() => setForm({ ...form, durationHours: d.hours })}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-[10px] text-zinc-200 cursor-pointer"
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-400">Preço (MT)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.priceMt}
                    onChange={(e) => setForm({ ...form, priceMt: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                  <label className="flex items-center gap-2 text-xs text-zinc-200 pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="accent-[#E50914]"
                    />
                    Ativo para clientes
                  </label>
                </div>
              </div>

              {/* Conteúdos incluídos no pacote */}
              <div className="p-3 rounded bg-[#0A0A0C] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-white">
                    Conteúdos Incluídos
                  </span>
                  <label className="flex items-center gap-2 text-xs text-emerald-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.includeAllContent}
                      onChange={(e) =>
                        setForm({ ...form, includeAllContent: e.target.checked })
                      }
                      className="accent-[#E50914]"
                    />
                    Todo o Catálogo
                  </label>
                </div>

                {!form.includeAllContent && (
                  <>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={videoFilter}
                        onChange={(e) => setVideoFilter(e.target.value)}
                        placeholder="Filtrar filmes, séries ou canais..."
                        className="w-full pl-8 pr-2.5 py-1.5 bg-[#141418] border border-white/10 rounded text-xs text-white"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded">
                      {filteredVideos.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-zinc-500">
                          Nenhum título no catálogo.
                        </div>
                      ) : (
                        filteredVideos.map((v) => {
                          const checked = form.videoIds.includes(v.id);
                          return (
                            <label
                              key={v.id}
                              className="flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-white/[0.03] cursor-pointer text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleVideoInPackage(v.id)}
                                  className="accent-[#E50914] shrink-0"
                                />
                                <span className="text-white truncate">{v.title}</span>
                              </div>
                              <span className="text-[10px] text-zinc-400 shrink-0">
                                {v.category}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 tabular-nums">
                      Selecionados: {form.videoIds.length}
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-2 rounded bg-white/10 hover:bg-white/15 text-xs font-medium text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {saving ? 'A guardar...' : 'Guardar Pacote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gerar PIN Rápido do Pacote */}
      {pinModalPkg && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white truncate">
                PIN · {pinModalPkg.name}
              </h2>
              <button
                type="button"
                onClick={() => setPinModalPkg(null)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGeneratePackagePins} className="p-4 space-y-3">
              {error && (
                <div className="p-2 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] text-zinc-400">Horas</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={pinHours}
                    onChange={(e) => setPinHours(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-zinc-400">Preço (MT)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pinPrice}
                    onChange={(e) => setPinPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-zinc-400">Qtd</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={pinQty}
                    onChange={(e) => setPinQty(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                </div>
              </div>

              {generatedCodes.length > 0 && (
                <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-500/30 space-y-1.5 max-h-40 overflow-y-auto">
                  <div className="text-[11px] font-semibold text-emerald-300">
                    Código(s) Gerado(s):
                  </div>
                  {generatedCodes.map((c) => (
                    <div
                      key={c}
                      className="flex items-center justify-between gap-2 bg-[#0A0A0C] px-2.5 py-1.5 rounded"
                    >
                      <span className="font-mono-tabular text-xs font-bold text-white">{c}</span>
                      <button
                        type="button"
                        onClick={() => void copyCode(c)}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                      >
                        {copiedCode === c ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copiar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPinModalPkg(null)}
                  className="px-3 py-1.5 rounded bg-white/10 text-xs text-white cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded text-xs font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {saving ? 'A gerar...' : 'Gerar PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
