import { useState } from 'react';
import { ScrollText, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminLog, SecurityAlert } from '../../types/mozflix';
import { formatDateMz } from '../../utils/formatters';

interface AdminLogsProps {
  logs: AdminLog[];
  securityAlerts: SecurityAlert[];
  initialSubTab?: 'admin' | 'security';
}

const ALERT_LABELS: Record<SecurityAlert['type'], string> = {
  DEVICE_LOCK: '2º Dispositivo',
  BLOCKED_ACCESS: 'Conta Bloqueada',
  PIN_BRUTE_FORCE: 'Força Bruta PIN',
};

export function AdminLogs({
  logs,
  securityAlerts,
  initialSubTab = 'admin',
}: AdminLogsProps) {
  const { settings } = useAuth();
  const [subTab, setSubTab] = useState<'admin' | 'security'>(initialSubTab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-white tracking-tight">
          Logs & Segurança
        </h1>

        <div className="inline-flex p-1 bg-[#141418] border border-white/10 rounded">
          <button
            type="button"
            onClick={() => setSubTab('admin')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              subTab === 'admin' ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
            style={subTab === 'admin' ? { backgroundColor: settings.primaryColor } : undefined}
          >
            <ScrollText className="w-3.5 h-3.5" />
            Admin ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('security')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              subTab === 'security' ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
            style={subTab === 'security' ? { backgroundColor: settings.primaryColor } : undefined}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Alertas ({securityAlerts.length})
          </button>
        </div>
      </div>

      {subTab === 'admin' ? (
        <div className="bg-[#141418] border border-white/10 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0A0A0C] text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Admin</th>
                  <th className="px-3.5 py-2.5 font-medium">Ação</th>
                  <th className="px-3.5 py-2.5 font-medium">Detalhes</th>
                  <th className="px-3.5 py-2.5 font-medium">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3.5 py-6 text-center text-zinc-500">
                      Sem registos.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="px-3.5 py-2 font-medium text-white">{log.adminEmail}</td>
                      <td className="px-3.5 py-2 font-mono-tabular text-[11px] text-zinc-300">
                        {log.action}
                      </td>
                      <td className="px-3.5 py-2 text-zinc-300">{log.details}</td>
                      <td className="px-3.5 py-2 text-zinc-400 tabular-nums">
                        {formatDateMz(log.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-[#141418] border border-white/10 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0A0A0C] text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Tipo</th>
                  <th className="px-3.5 py-2.5 font-medium">Conta</th>
                  <th className="px-3.5 py-2.5 font-medium">Detalhes</th>
                  <th className="px-3.5 py-2.5 font-medium">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {securityAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3.5 py-6 text-center text-zinc-500">
                      Sem alertas de fraude.
                    </td>
                  </tr>
                ) : (
                  securityAlerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-white/[0.02]">
                      <td className="px-3.5 py-2">
                        <span className="px-1.5 py-0.5 rounded bg-red-950/60 border border-red-500/30 text-[11px] font-semibold text-red-300 whitespace-nowrap">
                          {ALERT_LABELS[alert.type] || alert.type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 font-medium text-white tabular-nums">
                        {alert.userContact}
                      </td>
                      <td className="px-3.5 py-2 text-zinc-300">{alert.details}</td>
                      <td className="px-3.5 py-2 text-zinc-400 tabular-nums">
                        {formatDateMz(alert.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
