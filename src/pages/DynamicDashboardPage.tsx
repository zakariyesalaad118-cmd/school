import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from 'recharts';
import {
  Activity,
  Award,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Palette,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { Button, Card } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { apiRequest } from '../services/api';
import type {
  DashboardConfiguration,
  DashboardTelemetry,
  DashboardWidgetConfig,
} from '../types/nexus';
import { cn } from '../utils/cn';

export function DynamicDashboardPage() {
  const { t } = useTranslation();
  const { user, role, department, can } = useAuth();
  const { settings } = useBranding();

  const [dashboard, setDashboard] = useState<DashboardConfiguration | null>(null);
  const [telemetry, setTelemetry] = useState<DashboardTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        dashboard: DashboardConfiguration | null;
        telemetry: DashboardTelemetry;
      }>('/api/dashboards/my');
      setDashboard(data.dashboard);
      setTelemetry(data.telemetry);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const renderWidget = (widget: DashboardWidgetConfig) => {
    if (!telemetry) return null;
    const spanClass =
      widget.span === 3
        ? 'lg:col-span-3'
        : widget.span === 2
          ? 'lg:col-span-2'
          : 'lg:col-span-1';

    switch (widget.type) {
      case 'kpi_users_summary':
        return (
          <Card key={widget.id} className={cn('p-5 flex flex-col justify-between', spanClass)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('widgets.kpiUsersSummary')}
              </span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums tracking-tight">
                {telemetry.counts.totalUsers}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {telemetry.counts.activeUsers} {t('common.active')} · {telemetry.counts.superAdmins}{' '}
                {t('dashboard.superAdmins')}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              {t('widgets.kpiUsersSummaryDesc')}
            </div>
          </Card>
        );

      case 'kpi_roles_departments':
        return (
          <Card key={widget.id} className={cn('p-5 flex flex-col justify-between', spanClass)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('widgets.kpiRolesDepartments')}
              </span>
              <Building2 className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums tracking-tight">
                {telemetry.counts.activeRoles}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t('dashboard.activeRoles')} · {telemetry.counts.activeDepartments}{' '}
                {t('dashboard.departmentsCount')}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              {t('widgets.kpiRolesDepartmentsDesc')}
            </div>
          </Card>
        );

      case 'kpi_security_posture':
        return (
          <Card key={widget.id} className={cn('p-5 flex flex-col justify-between', spanClass)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('widgets.kpiSecurityPosture')}
              </span>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums tracking-tight">
                {telemetry.counts.failedLogins24h}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t('dashboard.failedLogins24h')}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>{t('dashboard.databaseEngine')}</span>
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                {telemetry.systemHealth?.databaseEngine || 'mongodb'}
              </span>
            </div>
          </Card>
        );

      case 'kpi_exams_summary': {
        const examStats = telemetry.examTelemetry?.summary;
        return (
          <Card key={widget.id} className={cn('p-5 flex flex-col justify-between', spanClass)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('widgets.kpiExamsSummary')}
              </span>
              <Award className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums tracking-tight">
                {examStats ? `${examStats.passRate}%` : '0%'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t('exams.kpiPassRate')} · {examStats?.upcomingExams ?? 0} {t('exams.kpiUpcoming')}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span className="tabular-nums">
                {t('exams.kpiAverageScore')}: <strong>{examStats?.averageScore ?? 0}%</strong>
              </span>
              <Link
                to="/modules/exams"
                className="font-medium text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0"
              >
                {t('nav.exams')} →
              </Link>
            </div>
          </Card>
        );
      }

      case 'chart_user_distribution':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold">{t('widgets.chartUserDistribution')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('widgets.chartUserDistributionDesc')}
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={telemetry.roleDistribution.filter((r) => r.count > 0 || r.name === 'Super Admin')}
                  margin={{ top: 8, right: 12, left: -16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid rgba(148,163,184,0.3)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill={settings?.primaryColor || '#0F4C81'}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );

      case 'chart_department_capacity':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold">{t('widgets.chartDepartmentCapacity')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('widgets.chartDepartmentCapacityDesc')}
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={telemetry.departmentCapacity} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="staffCount"
                    name={t('departments.staffCount')}
                    fill={settings?.primaryColor || '#0F4C81'}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="roleCount"
                    name={t('departments.roleCount')}
                    fill={settings?.accentColor || '#059669'}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );

      case 'chart_auth_activity':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold">{t('widgets.chartAuthActivity')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('widgets.chartAuthActivityDesc')}
              </p>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetry.authActivitySeries} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="success"
                    stroke={settings?.accentColor || '#059669'}
                    fill={settings?.accentColor || '#059669'}
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="#DC2626"
                    fill="#DC2626"
                    fillOpacity={0.14}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );

      case 'chart_exam_performance': {
        const perfData = telemetry.examTelemetry?.subjectPerformance || [];
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h3 className="text-sm font-semibold">{t('widgets.chartExamPerformance')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('widgets.chartExamPerformanceDesc')}
                </p>
              </div>
              <Link
                to="/modules/exams"
                className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0"
              >
                {t('nav.exams')}
              </Link>
            </div>
            {perfData.length === 0 ? (
              <div className="h-60 flex flex-col items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400 gap-2">
                <span>{t('exams.noResultsDesc')}</span>
                <Link
                  to="/modules/exams"
                  className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
                >
                  {t('exams.enterMarksBtn')} →
                </Link>
              </div>
            ) : (
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perfData} margin={{ top: 8, right: 12, left: -16, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="averagePercentage"
                      name={t('exams.kpiAverageScore')}
                      fill={settings?.primaryColor || '#0F4C81'}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="passRate"
                      name={t('exams.kpiPassRate')}
                      fill={settings?.accentColor || '#059669'}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        );
      }

      case 'panel_school_identity':
        return (
          <Card key={widget.id} className={cn('p-5 flex flex-col justify-between', spanClass)}>
            <div>
              <h3 className="text-sm font-semibold">{t('widgets.panelSchoolIdentity')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('widgets.panelSchoolIdentityDesc')}
              </p>
              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500 dark:text-slate-400">{t('branding.schoolName')}</span>
                  <span className="font-semibold text-right">{settings?.schoolName}</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500 dark:text-slate-400">{t('branding.address')}</span>
                  <span className="text-right">{settings?.address}</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500 dark:text-slate-400">{t('branding.phone')}</span>
                  <span className="font-mono tabular-nums">{settings?.phone}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">{t('branding.email')}</span>
                  <span className="font-mono">{settings?.email}</span>
                </div>
              </div>
            </div>
            {can('branding', 'manage') && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/branding"
                  className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1.5"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>{t('nav.branding')}</span>
                </Link>
              </div>
            )}
          </Card>
        );

      case 'panel_system_health':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{t('widgets.panelSystemHealth')}</h3>
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            {telemetry.systemHealth ? (
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500 dark:text-slate-400">{t('dashboard.databaseEngine')}</span>
                  <span className="font-mono font-medium">{telemetry.systemHealth.databaseEngine}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500 dark:text-slate-400">{t('dashboard.uptime')}</span>
                  <span className="font-mono tabular-nums">{telemetry.systemHealth.uptimeSeconds}s</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500 dark:text-slate-400">{t('dashboard.memory')}</span>
                  <span className="font-mono tabular-nums">{telemetry.systemHealth.memoryMb} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Node.js</span>
                  <span className="font-mono">{telemetry.systemHealth.nodeVersion}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('common.noData')}</p>
            )}
          </Card>
        );

      case 'panel_quick_actions':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <h3 className="text-sm font-semibold">{t('widgets.panelQuickActions')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
              {t('widgets.panelQuickActionsDesc')}
            </p>
            <div className="space-y-2">
              {can('students', 'view') && (
                <Link
                  to="/modules/students"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <GraduationCap className="w-3.5 h-3.5" />
                    {t('nav.students')}
                  </span>
                  <span>→</span>
                </Link>
              )}
              {(can('attendance', 'view') || can('attendance', 'create')) && (
                <Link
                  to="/modules/attendance"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    {t('nav.attendance')}
                  </span>
                  <span>→</span>
                </Link>
              )}
              {(can('exams', 'view') || can('exams', 'create') || can('exams', 'edit')) && (
                <Link
                  to="/modules/exams"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <CalendarClock className="w-3.5 h-3.5" />
                    {t('nav.exams')}
                  </span>
                  <span>→</span>
                </Link>
              )}
              {can('users', 'view') && (
                <Link
                  to="/users"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    {t('nav.users')}
                  </span>
                  <span>→</span>
                </Link>
              )}
              {can('roles', 'view') && (
                <Link
                  to="/roles"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5" />
                    {t('nav.roles')}
                  </span>
                  <span>→</span>
                </Link>
              )}
              {can('dashboards', 'view') && (
                <Link
                  to="/dashboards"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {t('nav.dashboards')}
                  </span>
                  <span>→</span>
                </Link>
              )}
              <Link
                to="/profile"
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium transition-colors"
              >
                <span>{t('common.profileSettings')}</span>
                <span>→</span>
              </Link>
            </div>
          </Card>
        );

      case 'panel_module_directory':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <h3 className="text-sm font-semibold">{t('widgets.panelModuleDirectory')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
              {t('widgets.panelModuleDirectoryDesc')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(dashboard?.modules || role?.modules || []).map((mod) => {
                const isReady = [
                  'overview',
                  'users',
                  'roles',
                  'departments',
                  'dashboards',
                  'branding',
                  'security',
                  'audit',
                  'settings',
                  'students',
                  'attendance',
                  'exams',
                ].includes(mod);
                const routeMap: Record<string, string> = {
                  overview: '/',
                  users: '/users',
                  roles: '/roles',
                  departments: '/departments',
                  dashboards: '/dashboards',
                  branding: '/branding',
                  security: '/security',
                  settings: '/profile',
                  students: '/modules/students',
                  attendance: '/modules/attendance',
                  exams: '/modules/exams',
                };
                const target = routeMap[mod];
                const inner = (
                  <>
                    <span className="font-medium">{t(`nav.${mod}`, { defaultValue: mod })}</span>
                    <span className={isReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                      {isReady ? t('dashboard.phase1Ready') : t('dashboard.phase2Scheduled')}
                    </span>
                  </>
                );
                return target ? (
                  <Link
                    key={mod}
                    to={target}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between gap-2 text-xs transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={mod}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </Card>
        );

      case 'table_recent_audit':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">{t('widgets.tableRecentAudit')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('widgets.tableRecentAuditDesc')}
                </p>
              </div>
              {can('security', 'view') && (
                <Link to="/security" className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline">
                  {t('common.all')}
                </Link>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-left">
                    <th className="py-2 pr-3 font-medium">{t('security.actor')}</th>
                    <th className="py-2 pr-3 font-medium">{t('security.action')}</th>
                    <th className="py-2 pr-3 font-medium">{t('security.severity')}</th>
                    <th className="py-2 font-medium text-right">{t('security.timestamp')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {telemetry.recentAudit.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    telemetry.recentAudit.map((log) => (
                      <tr key={log.id} className="h-10">
                        <td className="py-2 pr-3 font-medium">{log.actorName}</td>
                        <td className="py-2 pr-3 font-mono text-[11px]">{log.action}</td>
                        <td className="py-2 pr-3 capitalize">{log.severity}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        );

      case 'table_recent_logins':
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold">{t('widgets.tableRecentLogins')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('widgets.tableRecentLoginsDesc')}
              </p>
            </div>
            <div className="space-y-2.5 text-xs">
              {telemetry.recentLogins.length === 0 ? (
                <p className="text-slate-500 py-4 text-center">{t('common.noData')}</p>
              ) : (
                telemetry.recentLogins.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.identifier}</div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {item.ipAddress} · {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'font-medium capitalize',
                        item.status === 'success'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        );

      case 'panel_exam_schedule': {
        const upcoming = telemetry.examTelemetry?.upcomingSchedules || [];
        return (
          <Card key={widget.id} className={cn('p-5 flex flex-col justify-between', spanClass)}>
            <div>
              <div className="flex items-center justify-between mb-3 gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t('widgets.panelExamSchedule')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('widgets.panelExamScheduleDesc')}
                  </p>
                </div>
                <CalendarClock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              {upcoming.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  {t('exams.noSchedulesTitle')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {upcoming.slice(0, 5).map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{item.subjectName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.gradeLevel} · {item.room}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div>{item.examDate}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.startTime}–{item.endTime}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Link
                to="/modules/exams"
                className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                <span>{t('exams.viewFullTimetable')}</span>
                <span>→</span>
              </Link>
            </div>
          </Card>
        );
      }

      case 'table_recent_exam_results': {
        const recent = telemetry.examTelemetry?.recentResults || [];
        return (
          <Card key={widget.id} className={cn('p-5', spanClass)}>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h3 className="text-sm font-semibold">{t('widgets.tableRecentExamResults')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('widgets.tableRecentExamResultsDesc')}
                </p>
              </div>
              <Link
                to="/modules/exams"
                className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0"
              >
                {t('common.all')}
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-left">
                    <th className="py-2 pr-3 font-medium">{t('exams.colStudent')}</th>
                    <th className="py-2 pr-3 font-medium">{t('exams.colSubject')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t('exams.colScore')}</th>
                    <th className="py-2 pr-3 font-medium">{t('exams.colGrade')}</th>
                    <th className="py-2 font-medium">{t('exams.colOutcome')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    recent.map((r) => (
                      <tr key={r.id} className="h-10">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{r.studentName}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {r.gradeLevel} · {r.term}
                          </div>
                        </td>
                        <td className="py-2 pr-3">{r.subjectName}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums">
                          {r.score}/{r.maxMarks} ({r.percentage}%)
                        </td>
                        <td className="py-2 pr-3 font-bold">{r.gradeLetter}</td>
                        <td className="py-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 font-medium',
                              r.passed && r.attendanceStatus === 'sat'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {r.passed && r.attendanceStatus === 'sat' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {r.passed && r.attendanceStatus === 'sat'
                                ? t('exams.passedLabel')
                                : t('exams.failedLabel')}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('dashboard.welcomeBack')}, {user?.fullName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t('dashboard.activeRole')}: <strong className="text-slate-800 dark:text-slate-200">{role?.name}</strong>
            </span>
            {department && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t('dashboard.department')}: <strong className="text-slate-800 dark:text-slate-200">{department.name}</strong>
                </span>
              </>
            )}
            {dashboard && (
              <>
                <span aria-hidden="true">·</span>
                <span>{dashboard.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadDashboard} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>{t('common.refresh')}</span>
          </Button>
          {can('dashboards', 'manage') && (
            <Link to="/dashboards">
              <Button size="sm">
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t('dashboard.configureInBuilder')}</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <Card className="p-4 border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className={cn('p-6 h-40 animate-pulse', i === 4 && 'lg:col-span-2')}>
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-8 w-20 bg-slate-200 dark:bg-slate-800 rounded mt-4" />
            </Card>
          ))}
        </div>
      ) : !dashboard || dashboard.widgets.length === 0 ? (
        <Card className="p-10 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('dashboard.emptyWidgets')}</p>
          {can('dashboards', 'view') && (
            <Link to="/dashboards">
              <Button size="sm">{t('dashboard.configureInBuilder')}</Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {dashboard.widgets.map((widget) => renderWidget(widget))}
        </div>
      )}
    </div>
  );
}
