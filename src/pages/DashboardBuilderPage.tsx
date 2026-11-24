import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Check, LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Input, Label, Modal, Select } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';
import {
  SYSTEM_MODULES,
  type DashboardConfiguration,
  type DashboardWidgetConfig,
  type RoleRecord,
  type SystemModule,
  type WidgetCatalogEntry,
} from '../types/nexus';
import { cn } from '../utils/cn';

export function DashboardBuilderPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [dashboards, setDashboards] = useState<DashboardConfiguration[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [catalog, setCatalog] = useState<WidgetCatalogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Active editor draft
  const [draftName, setDraftName] = useState('');
  const [draftRoleId, setDraftRoleId] = useState('');
  const [draftModules, setDraftModules] = useState<SystemModule[]>([]);
  const [draftWidgets, setDraftWidgets] = useState<DashboardWidgetConfig[]>([]);
  const [draftActive, setDraftActive] = useState(true);

  // New dashboard modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRoleId, setNewRoleId] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dRes, rRes, cRes] = await Promise.all([
        apiRequest<{ dashboards: DashboardConfiguration[] }>('/api/dashboards'),
        apiRequest<{ roles: RoleRecord[] }>('/api/roles').catch(() => ({ roles: [] })),
        apiRequest<{ widgets: WidgetCatalogEntry[] }>('/api/dashboards/catalog'),
      ]);
      setDashboards(dRes.dashboards);
      setRoles(rRes.roles);
      setCatalog(cRes.widgets);

      const initial = dRes.dashboards.find((d) => d.id === selectedId) || dRes.dashboards[0];
      if (initial) {
        selectDashboard(initial, cRes.widgets);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectDashboard = (dash: DashboardConfiguration, widgetCat = catalog) => {
    setSelectedId(dash.id);
    setDraftName(dash.name);
    setDraftRoleId(dash.roleId || '');
    setDraftModules(dash.modules);
    setDraftActive(dash.isActive);

    // Merge configured widgets with any catalog items not yet listed so admin can enable them
    const existingTypes = new Set(dash.widgets.map((w) => w.type));
    const merged: DashboardWidgetConfig[] = [
      ...dash.widgets.slice().sort((a, b) => a.order - b.order),
      ...widgetCat
        .filter((cat) => !existingTypes.has(cat.type))
        .map((cat, idx) => ({
          id: `w_${cat.type}`,
          type: cat.type,
          titleKey: cat.titleKey,
          enabled: false,
          order: dash.widgets.length + idx + 1,
          span: cat.defaultSpan,
        })),
    ];
    setDraftWidgets(merged);
  };

  const toggleWidgetEnabled = (id: string) => {
    setDraftWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  };

  const changeWidgetSpan = (id: string, span: 1 | 2 | 3) => {
    setDraftWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, span } : w)));
  };

  const moveWidget = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftWidgets.length) return;
    const copy = [...draftWidgets];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    setDraftWidgets(copy.map((w, idx) => ({ ...w, order: idx + 1 })));
  };

  const toggleModule = (mod: SystemModule) => {
    setDraftModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const handleSaveLayout = async () => {
    if (!selectedId) return;
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/dashboards/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draftName,
          roleId: draftRoleId || null,
          modules: draftModules,
          widgets: draftWidgets.map((w, idx) => ({ ...w, order: idx + 1 })),
          isActive: draftActive,
        }),
      });
      setFeedback(t('common.savedSuccess'));
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDashboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const defaultWidgets: DashboardWidgetConfig[] = catalog.slice(0, 4).map((c, idx) => ({
        id: `w_${c.type}`,
        type: c.type,
        titleKey: c.titleKey,
        enabled: true,
        order: idx + 1,
        span: c.defaultSpan,
      }));
      const res = await apiRequest<{ dashboard: DashboardConfiguration }>('/api/dashboards', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          roleId: newRoleId || null,
          modules: ['overview'],
          widgets: defaultWidgets,
          isActive: true,
        }),
      });
      setCreateOpen(false);
      setNewName('');
      setSelectedId(res.dashboard.id);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDashboard = async (id: string) => {
    await apiRequest(`/api/dashboards/${id}`, { method: 'DELETE' });
    setSelectedId('');
    await loadAll();
  };

  const activeDash = dashboards.find((d) => d.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('builder.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('builder.subtitle')}</p>
        </div>
        {can('dashboards', 'create') && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>{t('builder.createDashboard')}</span>
          </Button>
        )}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Dashboard Selector */}
          <Card className="lg:col-span-4 p-4 space-y-2">
            {dashboards.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => selectDashboard(d)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2',
                  d.id === selectedId
                    ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{d.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {d.roleName} · {d.widgets.filter((w) => w.enabled).length} widgets
                  </div>
                </div>
                {!d.isDefault && can('dashboards', 'delete') && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDashboard(d.id);
                    }}
                    className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            ))}
          </Card>

          {/* Right Configuration Canvas */}
          {activeDash && (
            <Card className="lg:col-span-8 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-slate-500" />
                  <h2 className="text-base font-semibold">{draftName}</h2>
                </div>
                <div className="flex items-center gap-3">
                  {feedback && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {feedback}
                    </span>
                  )}
                  <Button onClick={handleSaveLayout} disabled={saving}>
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t('builder.dashboardName')}</Label>
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('builder.boundRole')}</Label>
                  <Select value={draftRoleId} onChange={(e) => setDraftRoleId(e.target.value)}>
                    <option value="">{t('common.all')}</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Modules */}
              <div>
                <Label>{t('builder.selectModules')}</Label>
                <div className="flex flex-wrap gap-2">
                  {SYSTEM_MODULES.map((mod) => {
                    const active = draftModules.includes(mod);
                    return (
                      <button
                        type="button"
                        key={mod}
                        onClick={() => toggleModule(mod)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors',
                          active
                            ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        )}
                      >
                        {active && <Check className="w-3 h-3" />}
                        <span>{t(`nav.${mod}`, { defaultValue: mod })}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Widgets */}
              <div>
                <Label>{t('builder.selectWidgets')}</Label>
                <div className="space-y-2">
                  {draftWidgets.map((w, idx) => (
                    <div
                      key={w.id}
                      className={cn(
                        'p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3',
                        w.enabled
                          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                          : 'border-slate-200/70 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/40 opacity-75'
                      )}
                    >
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={w.enabled}
                          onChange={() => toggleWidgetEnabled(w.id)}
                        />
                        <div>
                          <div className="text-xs font-semibold">{t(w.titleKey)}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{w.type}</div>
                        </div>
                      </label>

                      <div className="flex items-center gap-2">
                        <Select
                          value={w.span}
                          onChange={(e) =>
                            changeWidgetSpan(w.id, Number(e.target.value) as 1 | 2 | 3)
                          }
                          className="h-8 text-xs w-28"
                        >
                          <option value={1}>{t('builder.span1')}</option>
                          <option value={2}>{t('builder.span2')}</option>
                          <option value={3}>{t('builder.span3')}</option>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => moveWidget(idx, -1)}
                          disabled={idx === 0}
                          title={t('builder.moveUp')}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => moveWidget(idx, 1)}
                          disabled={idx === draftWidgets.length - 1}
                          title={t('builder.moveDown')}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('builder.createDashboard')}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateDashboard} className="space-y-4">
          <div>
            <Label>{t('builder.dashboardName')}</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div>
            <Label>{t('builder.boundRole')}</Label>
            <Select value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
