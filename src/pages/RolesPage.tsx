import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, KeyRound, Plus, Power, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Label,
  Modal,
  ReauthModal,
  Select,
} from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';
import {
  PERMISSION_ACTIONS,
  SYSTEM_MODULES,
  type DepartmentRecord,
  type RoleRecord,
  type SystemModule,
} from '../types/nexus';
import { cn } from '../utils/cn';

export function RolesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [modules, setModules] = useState<SystemModule[]>(['overview']);
  const [permissions, setPermissions] = useState<string[]>(['overview:view']);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleRecord | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, dRes] = await Promise.all([
        apiRequest<{ roles: RoleRecord[] }>('/api/roles'),
        apiRequest<{ departments: DepartmentRecord[] }>('/api/departments').catch(() => ({
          departments: [],
        })),
      ]);
      setRoles(rRes.roles);
      setDepartments(dRes.departments);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setName('');
    setDescription('');
    setDepartmentId('');
    setModules(['overview']);
    setPermissions(['overview:view']);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (r: RoleRecord) => {
    setEditingRole(r);
    setName(r.name);
    setDescription(r.description);
    setDepartmentId(r.departmentId || '');
    setModules(r.modules);
    setPermissions(r.permissions);
    setFormError(null);
    setModalOpen(true);
  };

  const toggleModule = (mod: SystemModule) => {
    setModules((prev) => (prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]));
  };

  const togglePerm = (perm: string) => {
    setPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name,
        description,
        departmentId: departmentId || null,
        modules,
        permissions,
      };
      if (editingRole) {
        await apiRequest(`/api/roles/${editingRole.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/roles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const toggleRoleActive = async (r: RoleRecord) => {
    try {
      await apiRequest(`/api/roles/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    }
  };

  const confirmDelete = async (pw: string) => {
    if (!deleteTarget) return;
    setSaving(true);
    setReauthError(null);
    try {
      await apiRequest(`/api/roles/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reauthPassword: pw }),
      });
      setReauthOpen(false);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setReauthError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('roles.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('roles.subtitle')}</p>
        </div>
        {can('roles', 'create') && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />
            <span>{t('roles.createRole')}</span>
          </Button>
        )}
      </div>

      {error && (
        <Card className="p-4 border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-5 h-44 animate-pulse space-y-3">
              <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded mt-4" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((r) => (
            <Card key={r.id} className="p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{r.name}</span>
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {r.isSystemRole ? t('roles.systemRole') : t('roles.customRole')} ·{' '}
                      <span className="tabular-nums">{r.userCount || 0}</span> {t('roles.assignedUsers')}
                      {r.departmentName ? ` · ${r.departmentName}` : ''}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      r.isActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    )}
                  >
                    {r.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                  {r.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {r.isSuperAdminRole ? '*:*' : `${r.permissions.length} perms · ${r.modules.length} modules`}
                </span>
                <div className="flex items-center gap-1">
                  {can('roles', 'edit') && !r.isSuperAdminRole && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRoleActive(r)}
                        title={r.isActive ? t('users.deactivate') : t('users.activate')}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  {can('roles', 'delete') && !r.isSystemRole && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget(r);
                        setReauthError(null);
                        setReauthOpen(true);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Role & Granular Permission Matrix Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRole ? t('roles.editRole') : t('roles.createRole')}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('roles.roleName')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>{t('roles.linkedDepartment')}</Label>
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">{t('common.none')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('roles.description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <Label>{t('roles.enabledModules')}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SYSTEM_MODULES.map((mod) => {
                const active = modules.includes(mod);
                return (
                  <button
                    type="button"
                    key={mod}
                    onClick={() => toggleModule(mod)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer',
                      active
                        ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    )}
                  >
                    <span className="truncate">{t(`nav.${mod}`, { defaultValue: mod })}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>{t('roles.permissionMatrix')}</Label>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3 text-left font-medium">Module</th>
                    {PERMISSION_ACTIONS.map((act) => (
                      <th key={act} className="py-2 px-2 text-center font-medium capitalize">
                        {act}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {SYSTEM_MODULES.map((mod) => (
                    <tr key={mod}>
                      <td className="py-2 px-3 font-medium whitespace-nowrap">
                        {t(`nav.${mod}`, { defaultValue: mod })}
                      </td>
                      {PERMISSION_ACTIONS.map((act) => {
                        const key = `${mod}:${act}`;
                        const checked = permissions.includes(key);
                        return (
                          <td key={act} className="py-2 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePerm(key)}
                              aria-label={key}
                              className="cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {formError && <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <ReauthModal
        open={reauthOpen}
        onClose={() => {
          setReauthOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
        loading={saving}
        error={reauthError}
      />
    </div>
  );
}
