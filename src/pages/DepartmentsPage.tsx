import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Plus, Power, Trash2 } from 'lucide-react';
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
import type { DepartmentRecord, UserRecord } from '../types/nexus';
import { cn } from '../utils/cn';

export function DepartmentsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRecord | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [managerId, setManagerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DepartmentRecord | null>(null);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, uRes] = await Promise.all([
        apiRequest<{ departments: DepartmentRecord[] }>('/api/departments'),
        apiRequest<{ users: UserRecord[] }>('/api/users').catch(() => ({ users: [] })),
      ]);
      setDepartments(dRes.departments);
      setUsers(uRes.users);
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
    setEditing(null);
    setName('');
    setCode('');
    setDescription('');
    setManagerId('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (d: DepartmentRecord) => {
    setEditing(d);
    setName(d.name);
    setCode(d.code);
    setDescription(d.description);
    setManagerId(d.managerId || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name,
        code: code.toUpperCase(),
        description,
        managerId: managerId || null,
      };
      if (editing) {
        await apiRequest(`/api/departments/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/departments', {
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

  const toggleActive = async (d: DepartmentRecord) => {
    try {
      await apiRequest(`/api/departments/${d.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !d.isActive }),
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
      await apiRequest(`/api/departments/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reauthPassword: pw }),
      });
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
          <h1 className="text-2xl font-bold tracking-tight">{t('departments.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('departments.subtitle')}
          </p>
        </div>
        {can('departments', 'create') && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />
            <span>{t('departments.createDepartment')}</span>
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
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5 h-44 animate-pulse space-y-3">
              <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded mt-4" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((d) => (
            <Card key={d.id} className="p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <h3 className="text-base font-semibold">{d.name}</h3>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      {d.code} · {d.managerName || t('departments.noManager')}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      d.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                    )}
                  >
                    {d.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                  {d.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {d.staffCount || 0} {t('departments.staffCount')} · {d.roleCount || 0}{' '}
                  {t('departments.roleCount')}
                </span>
                <div className="flex items-center gap-1">
                  {can('departments', 'edit') && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(d)}>
                        <Power className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  {can('departments', 'delete') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReauthError(null);
                        setDeleteTarget(d);
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('departments.editDepartment') : t('departments.createDepartment')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Label>{t('departments.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>{t('departments.code')}</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ACAD"
                className="font-mono uppercase"
                required
              />
            </div>
          </div>

          <div>
            <Label>{t('departments.manager')}</Label>
            <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">{t('departments.noManager')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.roleName})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>{t('roles.description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={saving}
        error={reauthError}
      />
    </div>
  );
}
