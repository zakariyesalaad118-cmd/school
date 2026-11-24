import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, RefreshCw, Search, Shield } from 'lucide-react';
import { Button, Card, Input, Select } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';
import type { AuditLogEntry, LoginHistoryEntry } from '../types/nexus';
import { cn } from '../utils/cn';

interface SystemHealth {
  status: string;
  databaseEngine: 'mongodb' | 'local-store';
  uptimeSeconds: number;
  memoryUsageMb: number;
  nodeVersion: string;
  collections: Record<string, number>;
  securityChecks: {
    publicSignupDisabled: boolean;
    passwordHashingAlgorithm: string;
    rateLimitingActive: boolean;
    backendRbacEnforced: boolean;
  };
}

export function SecurityAuditPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [tab, setTab] = useState<'audit' | 'logins' | 'health'>(
    can('audit', 'view') ? 'audit' : 'logins'
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const requests: Promise<void>[] = [];
      if (can('audit', 'view')) {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (severity) params.set('severity', severity);
        requests.push(
          apiRequest<{ auditLogs: AuditLogEntry[] }>(
            `/api/security/audit-logs?${params.toString()}`
          ).then((res) => setAuditLogs(res.auditLogs))
        );
      }
      if (can('security', 'view')) {
        const params = new URLSearchParams();
        if (loginStatus) params.set('status', loginStatus);
        requests.push(
          apiRequest<{ loginHistory: LoginHistoryEntry[] }>(
            `/api/security/login-history?${params.toString()}`
          ).then((res) => setLoginHistory(res.loginHistory))
        );
        requests.push(
          apiRequest<{ health: SystemHealth }>('/api/security/system-health').then((res) =>
            setHealth(res.health)
          )
        );
      }
      await Promise.all(requests);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [severity, loginStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('security.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('security.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
            {can('audit', 'view') && (
              <button
                type="button"
                onClick={() => setTab('audit')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
                  tab === 'audit'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500'
                )}
              >
                {t('security.tabAudit')}
              </button>
            )}
            {can('security', 'view') && (
              <>
                <button
                  type="button"
                  onClick={() => setTab('logins')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
                    tab === 'logins'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500'
                  )}
                >
                  {t('security.tabLogins')}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('health')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
                    tab === 'health'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500'
                  )}
                >
                  {t('security.tabHealth')}
                </button>
              </>
            )}
          </div>

          <Button variant="secondary" size="sm" onClick={loadData}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {tab === 'audit' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadData()}
                placeholder={t('common.search')}
                className="pl-9"
              />
            </div>
            <Select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="sm:w-44"
            >
              <option value="">{t('common.all')}</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </Select>
            <Button variant="secondary" onClick={loadData}>
              {t('common.filter')}
            </Button>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-left text-slate-500">
                    <th className="py-3 px-4 font-medium">{t('security.actor')}</th>
                    <th className="py-3 px-4 font-medium">{t('security.action')}</th>
                    <th className="py-3 px-4 font-medium">{t('security.resource')}</th>
                    <th className="py-3 px-4 font-medium">{t('security.severity')}</th>
                    <th className="py-3 px-4 font-medium">{t('security.ipAddress')}</th>
                    <th className="py-3 px-4 font-medium text-right">{t('security.timestamp')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="h-11">
                        <td className="py-2.5 px-4">
                          <div className="font-medium">{log.actorName}</div>
                          <div className="text-[11px] text-slate-500">{log.actorRole}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono">{log.action}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {log.resourceType}
                          {log.resourceId ? `:${log.resourceId}` : ''}
                        </td>
                        <td className="py-2.5 px-4 capitalize">
                          <span
                            className={cn(
                              'font-semibold',
                              log.severity === 'critical'
                                ? 'text-red-600 dark:text-red-400'
                                : log.severity === 'warning'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-600 dark:text-slate-300'
                            )}
                          >
                            {log.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono">{log.ipAddress}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'logins' && (
        <div className="space-y-4">
          <Card className="p-4 flex justify-end">
            <Select
              value={loginStatus}
              onChange={(e) => setLoginStatus(e.target.value)}
              className="sm:w-48"
            >
              <option value="">{t('common.all')}</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="locked">Locked</option>
            </Select>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-left text-slate-500">
                    <th className="py-3 px-4 font-medium">{t('security.identifier')}</th>
                    <th className="py-3 px-4 font-medium">{t('security.outcome')}</th>
                    <th className="py-3 px-4 font-medium">{t('security.reason')}</th>
                    <th className="py-3 px-4 font-medium">{t('security.ipAddress')}</th>
                    <th className="py-3 px-4 font-medium text-right">{t('security.timestamp')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loginHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    loginHistory.map((item) => (
                      <tr key={item.id} className="h-11">
                        <td className="py-2.5 px-4 font-medium">{item.identifier}</td>
                        <td className="py-2.5 px-4 capitalize">
                          <span
                            className={cn(
                              'font-semibold',
                              item.status === 'success'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">{item.failureReason || '—'}</td>
                        <td className="py-2.5 px-4 font-mono">{item.ipAddress}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'health' && health && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-semibold">{t('security.securityControlsTitle')}</h2>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span>{t('security.publicSignupDisabled')}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span>{t('security.scryptHashing')}</span>
                <span className="font-mono text-emerald-600">
                  {health.securityChecks.passwordHashingAlgorithm}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span>{t('security.rateLimiting')}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between py-2">
                <span>{t('security.backendRbac')}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold">{t('widgets.panelSystemHealth')}</h2>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{t('dashboard.databaseEngine')}</span>
                <span className="font-mono font-semibold">{health.databaseEngine}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{t('dashboard.uptime')}</span>
                <span className="font-mono tabular-nums">{health.uptimeSeconds}s</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{t('dashboard.memory')}</span>
                <span className="font-mono tabular-nums">{health.memoryUsageMb} MB</span>
              </div>
              {Object.entries(health.collections).map(([key, val]) => (
                <div
                  key={key}
                  className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <span className="text-slate-500 capitalize">{key}</span>
                  <span className="font-mono tabular-nums font-medium">{val}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
