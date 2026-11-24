import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus, Search, Shield, Trash2, UserCheck, UserX } from 'lucide-react';
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
import type { DepartmentRecord, RoleRecord, UserRecord, UserStatus } from '../types/nexus';
import { cn } from '../utils/cn';

function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$%&*';
  const all = upper + lower + digits + special;
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 8; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  return chars.sort(() => Math.random() - 0.5).join('');
}

export function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser, can } = useAuth();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create / Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [roleId, setRoleId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [grantSuperAdmin, setGrantSuperAdmin] = useState(false);
  const [statusVal, setStatusVal] = useState<UserStatus>('active');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [newTempPassword, setNewTempPassword] = useState('');

  // Reauthentication flow
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<((pw: string) => Promise<void>) | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('roleId', roleFilter);
      if (deptFilter) params.set('departmentId', deptFilter);
      if (statusFilter) params.set('status', statusFilter);

      const [uRes, rRes, dRes] = await Promise.all([
        apiRequest<{ users: UserRecord[] }>(`/api/users?${params.toString()}`),
        apiRequest<{ roles: RoleRecord[] }>('/api/roles').catch(() => ({ roles: [] })),
        apiRequest<{ departments: DepartmentRecord[] }>('/api/departments').catch(() => ({
          departments: [],
        })),
      ]);
      setUsers(uRes.users);
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
  }, [roleFilter, deptFilter, statusFilter]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFullName('');
    setEmail('');
    setUsername('');
    setRoleId(roles.find((r) => !r.isSuperAdminRole)?.id || roles[0]?.id || '');
    setDepartmentId(departments[0]?.id || '');
    setTempPassword(generateStrongPassword());
    setGrantSuperAdmin(false);
    setStatusVal('active');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (u: UserRecord) => {
    setEditingUser(u);
    setFullName(u.fullName);
    setEmail(u.email);
    setUsername(u.username);
    setRoleId(u.roleId);
    setDepartmentId(u.departmentId || '');
    setGrantSuperAdmin(u.isSuperAdmin);
    setStatusVal(u.status);
    setFormError(null);
    setFormOpen(true);
  };

  const submitUserForm = async (reauthPassword?: string) => {
    setFormError(null);
    setSaving(true);
    try {
      const selectedRole = roles.find((r) => r.id === roleId);
      const needsSuperAdminReauth =
        grantSuperAdmin ||
        selectedRole?.isSuperAdminRole ||
        (editingUser &&
          (editingUser.isSuperAdmin !== grantSuperAdmin ||
            (editingUser.isSuperAdmin && statusVal !== editingUser.status)));

      if (needsSuperAdminReauth && !reauthPassword) {
        setSaving(false);
        setPendingAction(() => async (pw: string) => {
          await submitUserForm(pw);
        });
        setReauthError(null);
        setReauthOpen(true);
        return;
      }

      if (editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName,
            email,
            roleId,
            departmentId: departmentId || null,
            status: statusVal,
            isSuperAdmin: grantSuperAdmin,
            reauthPassword,
          }),
        });
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            fullName,
            email,
            username,
            temporaryPassword: tempPassword,
            roleId,
            departmentId: departmentId || null,
            status: statusVal,
            isSuperAdmin: grantSuperAdmin,
            reauthPassword,
          }),
        });
      }

      setReauthOpen(false);
      setFormOpen(false);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.errorGeneric');
      if (reauthOpen) setReauthError(msg);
      else setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (u: UserRecord) => {
    const nextStatus: UserStatus = u.status === 'active' ? 'inactive' : 'active';
    const exec = async (reauthPassword?: string) => {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, reauthPassword }),
      });
      setReauthOpen(false);
      await loadData();
    };

    if (u.isSuperAdmin) {
      setPendingAction(() => async (pw: string) => exec(pw));
      setReauthError(null);
      setReauthOpen(true);
      return;
    }

    try {
      await exec();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    }
  };

  const handleDeleteUser = async (u: UserRecord) => {
    const exec = async (reauthPassword?: string) => {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reauthPassword }),
      });
      setReauthOpen(false);
      await loadData();
    };

    if (u.isSuperAdmin) {
      setPendingAction(() => async (pw: string) => exec(pw));
      setReauthError(null);
      setReauthOpen(true);
      return;
    }

    try {
      await exec();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ temporaryPassword: newTempPassword }),
      });
      setResetTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('users.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('users.subtitle')}</p>
        </div>
        {can('users', 'create') && (
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4" />
            <span>{t('users.createUser')}</span>
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative flex gap-2">
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
            <Button variant="secondary" onClick={loadData}>
              {t('common.filter')}
            </Button>
          </div>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">{t('users.filterByRole')}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">{t('users.filterByDept')}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('users.filterByStatus')}</option>
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
            <option value="suspended">{t('common.suspended')}</option>
          </Select>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </Card>
      )}

      {/* Directory Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">{t('users.fullName')}</th>
                <th className="py-3 px-4">{t('users.role')}</th>
                <th className="py-3 px-4">{t('users.department')}</th>
                <th className="py-3 px-4">{t('common.status')}</th>
                <th className="py-3 px-4">{t('users.lastLogin')}</th>
                <th className="py-3 px-4 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{u.fullName}</span>
                        {u.isSuperAdmin && (
                          <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 inline-flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            {t('users.superAdminBadge')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {u.email} · @{u.username}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">{u.roleName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {u.departmentName}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={cn(
                          'font-medium',
                          u.status === 'active'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {t(`common.${u.status}`)}
                      </span>
                      {u.mustChangePassword && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400">
                          {t('users.tempBadge')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString()
                        : t('users.neverLoggedIn')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {can('users', 'edit') && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEditModal(u)}>
                              {t('common.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t('users.resetPassword')}
                              onClick={() => {
                                setResetTarget(u);
                                setNewTempPassword(generateStrongPassword());
                              }}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                            {u.id !== currentUser?.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title={u.status === 'active' ? t('users.deactivate') : t('users.activate')}
                                onClick={() => handleToggleStatus(u)}
                              >
                                {u.status === 'active' ? (
                                  <UserX className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </Button>
                            )}
                          </>
                        )}
                        {can('users', 'delete') && u.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(u)}
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create / Edit User Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingUser ? t('users.editUser') : t('users.createUser')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitUserForm();
          }}
          className="space-y-4"
        >
          <div>
            <Label>{t('users.fullName')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('users.email')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>{t('users.username')}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={Boolean(editingUser)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('users.role')}</Label>
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('users.department')}</Label>
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

          {!editingUser && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="mb-0">{t('users.temporaryPassword')}</Label>
                <button
                  type="button"
                  onClick={() => setTempPassword(generateStrongPassword())}
                  className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  {t('users.generatePassword')}
                </button>
              </div>
              <Input
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className="font-mono"
                required
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('users.mustChangeNote')}
              </p>
            </div>
          )}

          {editingUser && (
            <div>
              <Label>{t('common.status')}</Label>
              <Select
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value as UserStatus)}
              >
                <option value="active">{t('common.active')}</option>
                <option value="inactive">{t('common.inactive')}</option>
                <option value="suspended">{t('common.suspended')}</option>
              </Select>
            </div>
          )}

          {currentUser?.isSuperAdmin && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={grantSuperAdmin}
                onChange={(e) => setGrantSuperAdmin(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs">
                <strong className="block text-slate-900 dark:text-slate-100">
                  {t('users.grantSuperAdmin')}
                </strong>
                <span className="text-slate-500 dark:text-slate-400">
                  {t('users.superAdminWarning')}
                </span>
              </span>
            </label>
          )}

          {formError && <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Temp Password Modal */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={t('users.resetPasswordTitle')}
        subtitle={resetTarget ? `${resetTarget.fullName} (${resetTarget.email})` : undefined}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="mb-0">{t('users.temporaryPassword')}</Label>
              <button
                type="button"
                onClick={() => setNewTempPassword(generateStrongPassword())}
                className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
              >
                {t('users.generatePassword')}
              </button>
            </div>
            <Input
              value={newTempPassword}
              onChange={(e) => setNewTempPassword(e.target.value)}
              className="font-mono"
              required
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('users.mustChangeNote')}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {t('common.confirm')}
            </Button>
          </div>
        </form>
      </Modal>

      <ReauthModal
        open={reauthOpen}
        onClose={() => {
          setReauthOpen(false);
          setPendingAction(null);
        }}
        onConfirm={(pw) => pendingAction?.(pw)}
        loading={saving}
        error={reauthError}
      />
    </div>
  );
}
