import { useEffect, useMemo, useState } from 'react';
import { Radio, ShieldAlert, X } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  ManualPayment,
  PinCode,
  SecurityAlert,
  UserProfile,
  WatchSession,
} from '../../types/mozflix';
import {
  formatCurrencyMt,
  formatDateMz,
  formatHoursRemaining,
  getMillis,
} from '../../utils/formatters';

interface AdminDashboardProps {
  users: UserProfile[];
  pins: PinCode[];
  payments: ManualPayment[];
  securityAlerts: SecurityAlert[];
  onOpenSecurityLogs: () => void;
}

export function AdminDashboard({
  users,
  pins,
  payments,
  securityAlerts,
  onOpenSecurityLogs,
}: AdminDashboardProps) {
  const { settings, serverNowMs } = useAuth();
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [liveSessions, setLiveSessions] = useState<WatchSession[]>([]);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'watchSessions'),
      (snap) => {
        const cutoff = Date.now() - 2 * 60 * 1000;
        const rows = snap.docs
          .map((d) => d.data() as WatchSession)
          .filter((s) => s.isActive && getMillis(s.updatedAt) > cutoff);
        setLiveSessions(rows);
      },
      () => {
        setLiveSessions([]);
      }
    );
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const now = new Date(serverNowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const totalUsers = users.length;
    const activeToday = users.filter((u) => getMillis(u.lastLoginAt) >= startOfToday).length;

    const usedPins = pins.filter((p) => p.usado);
    const pinsToday = usedPins.filter((p) => getMillis(p.usadoEm) >= startOfToday);
    const paymentsToday = payments.filter((p) => getMillis(p.createdAt) >= startOfToday);

    const packagesSoldToday = pinsToday.length + paymentsToday.length;

    const revenueToday =
      pinsToday.reduce((sum, p) => sum + Number(p.precoMt || 0), 0) +
      paymentsToday.reduce((sum, p) => sum + Number(p.valorMt || 0), 0);

    const pinsMonth = usedPins.filter((p) => getMillis(p.usadoEm) >= startOfMonth);
    const paymentsMonth = payments.filter((p) => getMillis(p.createdAt) >= startOfMonth);
    const revenueMonth =
      pinsMonth.reduce((sum, p) => sum + Number(p.precoMt || 0), 0) +
      paymentsMonth.reduce((sum, p) => sum + Number(p.valorMt || 0), 0);

    const days: { label: string; amount: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;

      const dayPins = usedPins.filter((p) => {
        const ms = getMillis(p.usadoEm);
        return ms >= dayStart && ms < dayEnd;
      });
      const dayPay = payments.filter((p) => {
        const ms = getMillis(p.createdAt);
        return ms >= dayStart && ms < dayEnd;
      });

      const amount =
        dayPins.reduce((s, p) => s + Number(p.precoMt || 0), 0) +
        dayPay.reduce((s, p) => s + Number(p.valorMt || 0), 0);

      days.push({
        label: new Intl.DateTimeFormat('pt-MZ', { day: '2-digit', month: '2-digit' }).format(d),
        amount,
        count: dayPins.length + dayPay.length,
      });
    }

    const last10Logins = [...users]
      .sort((a, b) => getMillis(b.lastLoginAt) - getMillis(a.lastLoginAt))
      .slice(0, 10);

    return {
      totalUsers,
      activeToday,
      packagesSoldToday,
      revenueToday,
      revenueMonth,
      days,
      last10Logins,
    };
  }, [users, pins, payments, serverNowMs]);

  const chartW = 700;
  const chartH = 190;
  const padX = 38;
  const padY = 20;
  const maxVal = Math.max(100, ...stats.days.map((d) => d.amount));

  const points = stats.days.map((d, idx) => {
    const x = padX + (idx * (chartW - padX * 2)) / 6;
    const y = chartH - padY - (d.amount / maxVal) * (chartH - padY * 2);
    return { x, y, ...d };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${padX},${chartH - padY} ${polylinePoints} ${chartW - padX},${chartH - padY}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-white tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          {securityAlerts.length > 0 && (
            <button
              type="button"
              onClick={onOpenSecurityLogs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-950/60 border border-amber-500/40 text-xs font-semibold text-amber-200 hover:bg-amber-950 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Alertas ({securityAlerts.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setLiveModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
            style={{ backgroundColor: settings.primaryColor }}
          >
            <Radio className="w-3.5 h-3.5" />
            Ao Vivo ({liveSessions.length})
          </button>
        </div>
      </div>

      {/* KPIs Compactos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Usuários', value: stats.totalUsers.toString() },
          { label: 'Ativos Hoje', value: stats.activeToday.toString() },
          { label: 'Pacotes Hoje', value: stats.packagesSoldToday.toString() },
          { label: 'Receita Hoje', value: formatCurrencyMt(stats.revenueToday) },
          { label: 'Receita Mês', value: formatCurrencyMt(stats.revenueMonth) },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#141418] border border-white/10 rounded-md p-3.5 space-y-1"
          >
            <div className="text-[11px] font-medium text-zinc-400">{kpi.label}</div>
            <div className="font-display text-2xl font-bold text-white tabular-nums">
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico 7 Dias */}
      <section className="bg-[#141418] border border-white/10 rounded-md p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-white">Vendas (7 dias)</h2>
          {hoveredDay !== null && points[hoveredDay] && (
            <div className="text-[11px] font-medium text-white bg-[#0A0A0C] border border-white/15 px-2.5 py-1 rounded tabular-nums">
              {points[hoveredDay].label}: {formatCurrencyMt(points[hoveredDay].amount)}
            </div>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[420px] h-44 select-none">
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={settings.primaryColor} stopOpacity="0.35" />
                <stop offset="100%" stopColor={settings.primaryColor} stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((ratio) => {
              const y = chartH - padY - ratio * (chartH - padY * 2);
              const val = Math.round(ratio * maxVal);
              return (
                <g key={ratio}>
                  <line
                    x1={padX}
                    y1={y}
                    x2={chartW - padX}
                    y2={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padX - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#71717A"
                    fontSize="10"
                    className="tabular-nums"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            <polygon points={areaPoints} fill="url(#salesFill)" />
            <polyline
              fill="none"
              stroke={settings.primaryColor}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylinePoints}
            />

            {points.map((pt, i) => (
              <g
                key={pt.label}
                onMouseEnter={() => setHoveredDay(i)}
                onMouseLeave={() => setHoveredDay(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredDay === i ? 5 : 3.5}
                  fill={settings.primaryColor}
                  stroke="#0A0A0C"
                  strokeWidth="1.5"
                />
                <text
                  x={pt.x}
                  y={chartH - 4}
                  textAnchor="middle"
                  fill="#A1A1AA"
                  fontSize="10"
                  className="tabular-nums"
                >
                  {pt.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </section>

      {/* Últimos 10 Logins */}
      <section className="bg-[#141418] border border-white/10 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="font-display text-lg font-bold text-white">Últimos 10 Logins</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A0A0C] text-zinc-400 border-b border-white/10">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Conta</th>
                <th className="px-3.5 py-2.5 font-medium">Pacote</th>
                <th className="px-3.5 py-2.5 font-medium">Expira</th>
                <th className="px-3.5 py-2.5 font-medium">Device</th>
                <th className="px-3.5 py-2.5 font-medium">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {stats.last10Logins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3.5 py-6 text-center text-zinc-500">
                    Sem registos.
                  </td>
                </tr>
              ) : (
                stats.last10Logins.map((u) => (
                  <tr key={u.uid} className="hover:bg-white/[0.02]">
                    <td className="px-3.5 py-2 text-white font-medium tabular-nums">
                      {u.phone || u.email || u.uid}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-300">{u.currentPackage || '—'}</td>
                    <td className="px-3.5 py-2 text-zinc-300 tabular-nums">
                      {u.packageExpiresAt ? formatHoursRemaining(u.packageExpiresAt, serverNowMs) : '—'}
                    </td>
                    <td className="px-3.5 py-2 font-mono-tabular text-[11px] text-zinc-400">
                      {u.deviceId || 'Livre'}
                    </td>
                    <td className="px-3.5 py-2 text-zinc-400 tabular-nums">
                      {formatDateMz(u.lastLoginAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {liveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h3 className="font-display text-lg font-bold text-white">
                  A Assistir Agora ({liveSessions.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLiveModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
              {liveSessions.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-4">Ninguém a assistir.</p>
              ) : (
                liveSessions.map((s) => (
                  <div
                    key={s.userId}
                    className="p-2.5 rounded bg-[#0A0A0C] border border-white/10 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{s.videoTitle}</div>
                      <div className="text-[11px] text-zinc-400 tabular-nums">{s.userPhone}</div>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-medium">Ativo</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
