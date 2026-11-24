import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher, ThemeSwitcher } from '../components/LanguageThemeControls';
import { Button, Card, Input, Label } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';

export function ProfileSettingsPage() {
  const { t } = useTranslation();
  const { user, role, department } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (newPassword !== confirmPassword) {
      setErr(t('auth.passwordsMismatch'));
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMsg(t('common.savedSuccess'));
    } catch (error) {
      setErr(error instanceof Error ? error.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('profile.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('profile.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-semibold">{t('profile.personalInfo')}</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">{t('users.fullName')}</span>
              <span className="font-medium">{user?.fullName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">{t('users.email')}</span>
              <span className="font-mono text-xs">{user?.email}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">{t('users.username')}</span>
              <span className="font-mono text-xs">@{user?.username}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">{t('users.role')}</span>
              <span className="font-medium">{role?.name}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('users.department')}</span>
              <span>{department?.name || t('common.none')}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <h2 className="text-base font-semibold">{t('profile.preferencesTitle')}</h2>
          <div className="space-y-4">
            <div>
              <Label>{t('common.language')}</Label>
              <LanguageSwitcher />
            </div>
            <div>
              <Label>{t('common.theme')}</Label>
              <ThemeSwitcher showSystem />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 max-w-xl">
        <h2 className="text-base font-semibold mb-4">{t('profile.securityTitle')}</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <Label>{t('common.currentPassword')}</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>{t('auth.newPassword')}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <p className="text-xs text-slate-500 mt-1">{t('auth.passwordPolicyHint')}</p>
          </div>
          <div>
            <Label>{t('auth.confirmNewPassword')}</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
          {msg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('auth.updatePasswordBtn')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
