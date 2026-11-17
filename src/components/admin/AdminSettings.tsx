import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { AppSettings } from '../../types/mozflix';
import { logAdminAction } from '../../utils/adminActions';
import { reportBackgroundError } from '../../utils/errorSanitizer';

export function AdminSettings() {
  const { profile, settings } = useAuth();
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      await setDoc(doc(db, 'appSettings', 'config'), form, { merge: true });
      await logAdminAction(
        profile?.uid || 'admin',
        profile?.email || 'admin',
        'ATUALIZAR_CONFIGURACOES',
        `Definições atualizadas (${form.appName})`
      );
      setSavedMsg('Guardado.');
    } catch (err) {
      reportBackgroundError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="font-display text-2xl font-bold text-white tracking-tight">Definições</h1>

      <form
        onSubmit={handleSave}
        className="bg-[#141418] border border-white/10 rounded-md p-4 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-zinc-400">Nome do App</label>
            <input
              type="text"
              required
              value={form.appName}
              onChange={(e) => setForm({ ...form, appName: e.target.value })}
              className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-zinc-400">Cor Principal</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="w-9 h-8 bg-transparent border border-white/15 rounded cursor-pointer"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="flex-1 px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded font-mono-tabular text-xs text-white"
              />
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="block text-[11px] font-medium text-zinc-400">
              WhatsApp Suporte (258...)
            </label>
            <input
              type="text"
              required
              value={form.supportWhatsapp}
              onChange={(e) => setForm({ ...form, supportWhatsapp: e.target.value })}
              className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded font-mono-tabular text-xs text-white"
            />
          </div>
        </div>

        <div className="border-t border-white/10 pt-3 space-y-2">
          <h2 className="text-xs font-semibold text-white">Preços (MT)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">Diário</label>
              <input
                type="number"
                min={1}
                value={form.priceDailyMt}
                onChange={(e) => setForm({ ...form, priceDailyMt: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">Fim-Semana</label>
              <input
                type="number"
                min={1}
                value={form.priceWeekendMt}
                onChange={(e) => setForm({ ...form, priceWeekendMt: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">Mensal</label>
              <input
                type="number"
                min={1}
                value={form.priceMonthlyMt}
                onChange={(e) => setForm({ ...form, priceMonthlyMt: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">Por Filme</label>
              <input
                type="number"
                min={1}
                value={form.priceSingleFilmMt}
                onChange={(e) => setForm({ ...form, priceSingleFilmMt: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-medium text-white">Downloads Offline</span>
            <input
              type="checkbox"
              checked={form.downloadsEnabled}
              onChange={(e) => setForm({ ...form, downloadsEnabled: e.target.checked })}
              className="w-4 h-4 accent-[#E50914]"
            />
          </label>
        </div>

        {savedMsg && (
          <div className="p-2 rounded bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200">
            {savedMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: form.primaryColor }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'A guardar...' : 'Guardar'}
        </button>
      </form>
    </div>
  );
}
