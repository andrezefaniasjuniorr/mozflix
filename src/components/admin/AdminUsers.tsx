import { useMemo, useState } from 'react';
import {
  Clock,
  Eye,
  Lock,
  Search,
  Smartphone,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { UserProfile } from '../../types/mozflix';
import { adminBlockUser, logAdminAction } from '../../utils/adminActions';
import { formatDateMz, formatHoursRemaining, getMillis } from '../../utils/formatters';
import { reportBackgroundError } from '../../utils/errorSanitizer';

interface AdminUsersProps {
  users: UserProfile[];
}

export function AdminUsers({ users }: AdminUsersProps) {
  const { profile: adminProfile, serverNowMs } = useAuth();
  const [searchPhone, setSearchPhone] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchPhone.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.phone || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }, [users, searchPhone]);

  const handleExtend24h = async (u: UserProfile) => {
    setBusyUid(u.uid);
    try {
      const nowMs = serverNowMs;
      const curExp = getMillis(u.packageExpiresAt);
      const baseMs = curExp > nowMs ? curExp : nowMs;
      const newExp = Timestamp.fromMillis(baseMs + 24 * 60 * 60 * 1000);
      await updateDoc(doc(db, 'users', u.uid), {
        currentPackage: u.currentPackage || 'Diário 24h',
        packageExpiresAt: newExp,
      });
      await logAdminAction(
        adminProfile?.uid || 'admin',
        adminProfile?.email || 'admin',
        'PROLONGAR_PACOTE',
        `+24h para ${u.phone || u.email || u.uid}`
      );
      setFeedback(`+24h aplicados em ${u.phone || u.email}.`);
    } catch (err) {
      reportBackgroundError(err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleBlock = async (u: UserProfile) => {
    setBusyUid(u.uid);
    try {
      await adminBlockUser({
        targetUid: u.uid,
        targetLabel: u.phone || u.email || u.uid,
        blocked: !u.isBlocked,
        adminUid: adminProfile?.uid || 'admin',
        adminEmail: adminProfile?.email || 'admin',
      });
      setFeedback(u.isBlocked ? 'Desbloqueado.' : 'Bloqueado.');
    } catch (err) {
      reportBackgroundError(err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemoveDevice = async (u: UserProfile) => {
    setBusyUid(u.uid);
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        deviceId: null,
        activeSessionToken: null,
      });
      await logAdminAction(
        adminProfile?.uid || 'admin',
        adminProfile?.email || 'admin',
        'REMOVER_DEVICE',
        `Removeu deviceId e sessão de ${u.phone || u.email || u.uid}`
      );
      setFeedback('Dispositivo libertado.');
    } catch (err) {
      reportBackgroundError(err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (!window.confirm(`Apagar ${u.phone || u.email || u.uid}?`)) return;
    setBusyUid(u.uid);
    try {
      await deleteDoc(doc(db, 'users', u.uid));
      await logAdminAction(
        adminProfile?.uid || 'admin',
        adminProfile?.email || 'admin',
        'APAGAR_USUARIO',
        `Apagou ${u.phone || u.email || u.uid}`
      );
      setFeedback('Utilizador apagado.');
    } catch (err) {
      reportBackgroundError(err);
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white tracking-tight">Usuários</h1>

      <div className="relative max-w-xs">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchPhone}
          onChange={(e) => setSearchPhone(e.target.value)}
          placeholder="Pesquisar telefone ou email..."
          className="w-full pl-9 pr-3 py-2 bg-[#141418] border border-white/15 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
        />
      </div>

      {feedback && (
        <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200">
          {feedback}
        </div>
      )}

      <div className="bg-[#141418] border border-white/10 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A0A0C] text-zinc-400 border-b border-white/10">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Conta</th>
                <th className="px-3.5 py-2.5 font-medium">Pacote</th>
                <th className="px-3.5 py-2.5 font-medium">Expira</th>
                <th className="px-3.5 py-2.5 font-medium">Device</th>
                <th className="px-3.5 py-2.5 font-medium">Estado</th>
                <th className="px-3.5 py-2.5 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-6 text-center text-zinc-500">
                    Sem utilizadores.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const hasPkg = Boolean(
                    u.currentPackage && getMillis(u.packageExpiresAt) > serverNowMs
                  );
                  return (
                    <tr key={u.uid} className="hover:bg-white/[0.02]">
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-white tabular-nums">
                          {u.phone || '—'}
                        </div>
                        <div className="text-[11px] text-zinc-400">{u.email || '—'}</div>
                      </td>
                      <td className="px-3.5 py-2.5 text-zinc-200">
                        {u.currentPackage || '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-zinc-300 tabular-nums">
                        {hasPkg ? formatHoursRemaining(u.packageExpiresAt, serverNowMs) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono-tabular text-[11px] text-zinc-400">
                        {u.deviceId || 'Livre'}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {u.isBlocked ? (
                          <span className="text-[11px] font-semibold text-red-400">Bloqueado</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-400">Ativo</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedUser(u)}
                            title="Detalhes"
                            className="p-1.5 rounded bg-white/10 hover:bg-white/15 text-white cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={busyUid === u.uid}
                            onClick={() => handleExtend24h(u)}
                            title="+24h"
                            className="inline-flex items-center gap-0.5 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] text-white cursor-pointer"
                          >
                            <Clock className="w-3 h-3" />
                            +24h
                          </button>
                          <button
                            type="button"
                            disabled={busyUid === u.uid}
                            onClick={() => handleRemoveDevice(u)}
                            title="Remover Device"
                            className="p-1.5 rounded bg-white/10 hover:bg-white/15 text-zinc-200 cursor-pointer"
                          >
                            <Smartphone className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={busyUid === u.uid}
                            onClick={() => handleToggleBlock(u)}
                            title={u.isBlocked ? 'Desbloquear' : 'Bloquear'}
                            className={`p-1.5 rounded cursor-pointer ${
                              u.isBlocked
                                ? 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200'
                                : 'bg-amber-950/60 hover:bg-amber-900/70 text-amber-200'
                            }`}
                          >
                            {u.isBlocked ? (
                              <Unlock className="w-3 h-3" />
                            ) : (
                              <Lock className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={busyUid === u.uid}
                            onClick={() => handleDeleteUser(u)}
                            title="Apagar"
                            className="p-1.5 rounded bg-red-950/60 hover:bg-red-900/70 text-red-200 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Detalhes</h3>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 text-xs">
              <div className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-zinc-400">Telefone</span>
                <span className="text-white tabular-nums">{selectedUser.phone || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-zinc-400">Email</span>
                <span className="text-white">{selectedUser.email || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-zinc-400">Pacote</span>
                <span className="text-white">{selectedUser.currentPackage || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-zinc-400">Expira</span>
                <span className="text-white tabular-nums">
                  {formatDateMz(selectedUser.packageExpiresAt)}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-zinc-400">Device</span>
                <span className="font-mono-tabular text-[11px] text-white">
                  {selectedUser.deviceId || 'Livre'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Último Login</span>
                <span className="text-white tabular-nums">
                  {formatDateMz(selectedUser.lastLoginAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
