import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { LanguageSwitcher, ThemeSwitcher } from '../components/LanguageThemeControls';
import { Button, Input, Label, Modal } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { apiRequest, resolveAssetUrl } from '../services/api';

const CAMPUS_BACKDROP = '/src/assets/images/campus_courtyard_view_1795505872041.jpg';

export function LoginPage() {
  const { t } = useTranslation();
  const { settings } = useBranding();
  const { setupRequired, user, login, bootstrapSuperAdmin, refreshSession, logout } = useAuth();

  // Sign in state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // First-run Super Admin setup state
  const [setupFullName, setSetupFullName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupUsername, setSetupUsername] = useState('superadmin');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Temporary password rotation gate
  const [currentTempPassword, setCurrentTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [logoFailed, setLogoFailed] = useState(false);
  const [campusFailed, setCampusFailed] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (setupPassword !== setupConfirm) {
      setErrorMsg(t('auth.passwordsMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await bootstrapSuperAdmin({
        fullName: setupFullName,
        email: setupEmail,
        username: setupUsername,
        password: setupPassword,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTempPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (newPassword !== confirmNewPassword) {
      setErrorMsg(t('auth.passwordsMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: currentTempPassword,
          newPassword,
        }),
      });
      await refreshSession();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier: forgotIdentifier }),
      });
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    }
  };

  const schoolName = settings?.schoolName || 'SOMALI PRIMERY AND SECONDARY SCHOOL';
  const osName = settings?.osName || 'NEXUS SCHOOL OS';
  const slogan = settings?.slogan || t('common.tagline');

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Left Institutional Architectural Panel */}
      <div className="relative lg:col-span-7 flex flex-col justify-between p-8 lg:p-14 overflow-hidden bg-slate-900 text-white min-h-[320px] lg:min-h-screen">
        {!campusFailed && (
          <img
            src={CAMPUS_BACKDROP}
            alt={schoolName}
            referrerPolicy="no-referrer"
            onError={() => setCampusFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(15, 23, 42, 0.72) 0%, rgba(15, 23, 42, 0.52) 45%, rgba(15, 23, 42, 0.92) 100%)',
          }}
        />

        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/95 p-1.5 shadow-lg flex items-center justify-center shrink-0 overflow-hidden">
            {settings?.logoUrl && !logoFailed ? (
              <img
                src={resolveAssetUrl(settings.logoUrl)}
                alt={schoolName}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <ShieldCheck className="w-8 h-8 text-sky-900" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-slate-200">{osName}</p>
            <h2 className="text-lg font-bold tracking-tight text-white truncate">{schoolName}</h2>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-4 my-10 lg:my-0">
          <h1
            className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight"
            style={{ textWrap: 'balance' }}
          >
            {settings?.loginHeadline || schoolName}
          </h1>
          <p className="text-base text-slate-200 leading-relaxed max-w-lg">
            {settings?.loginSubheadline || slogan}
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span>{settings?.address}</span>
            {settings?.phone && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{settings.phone}</span>
              </>
            )}
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-300 flex items-center justify-between gap-4 border-t border-white/15 pt-4">
          <span>{t('auth.noPublicSignupNotice')}</span>
        </div>
      </div>

      {/* Right Authentication / First-Run Setup Panel */}
      <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-end gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher showSystem />
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          {setupRequired ? (
            <form onSubmit={handleBootstrap} className="space-y-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{osName}</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">{t('auth.setupTitle')}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('auth.setupSubtitle')}
                </p>
              </div>

              <div>
                <Label>{t('auth.setupFullName')}</Label>
                <Input
                  value={setupFullName}
                  onChange={(e) => setSetupFullName(e.target.value)}
                  placeholder="Ahmed Hassan Ali"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t('auth.setupEmail')}</Label>
                  <Input
                    type="email"
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    placeholder="admin@somalischool.edu.so"
                    required
                  />
                </div>
                <div>
                  <Label>{t('auth.setupUsername')}</Label>
                  <Input
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    placeholder="superadmin"
                    required
                  />
                </div>
              </div>

              <div>
                <Label>{t('auth.setupPassword')}</Label>
                <Input
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('auth.passwordPolicyHint')}
                </p>
              </div>

              <div>
                <Label>{t('auth.setupConfirmPassword')}</Label>
                <Input
                  type="password"
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  required
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? t('common.saving') : t('auth.setupSubmit')}
              </Button>
            </form>
          ) : user && user.mustChangePassword ? (
            <form onSubmit={handleTempPasswordUpdate} className="space-y-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <KeyRound className="w-4 h-4" />
                  <span>{user.fullName}</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">{t('auth.tempPasswordTitle')}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('auth.tempPasswordDesc')}
                </p>
              </div>

              <div>
                <Label>{t('common.currentPassword')}</Label>
                <Input
                  type="password"
                  value={currentTempPassword}
                  onChange={(e) => setCurrentTempPassword(e.target.value)}
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('auth.passwordPolicyHint')}
                </p>
              </div>

              <div>
                <Label>{t('auth.confirmNewPassword')}</Label>
                <Input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary" onClick={logout}>
                  {t('common.logout')}
                </Button>
                <Button type="submit" className="flex-1 h-11" disabled={submitting}>
                  {submitting ? t('common.saving') : t('auth.updatePasswordBtn')}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{osName}</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">{t('auth.signInTitle')}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('auth.signInSubtitle')}
                </p>
              </div>

              <div>
                <Label htmlFor="login-identifier">{t('auth.identifierLabel')}</Label>
                <Input
                  id="login-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t('auth.identifierPlaceholder')}
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="login-password" className="mb-0">
                    {t('auth.passwordLabel')}
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotSent(false);
                      setForgotOpen(true);
                    }}
                    className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    {t('auth.forgotPasswordLink')}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    autoComplete="current-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? t('auth.signingIn') : t('auth.signInButton')}
              </Button>
            </form>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
          <span>{schoolName}</span>
          <span>{settings?.email}</span>
        </div>
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title={t('auth.forgotTitle')}
        subtitle={t('auth.forgotDesc')}
        maxWidth="max-w-md"
      >
        {forgotSent ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {t('auth.forgotSuccess')}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setForgotOpen(false)}>{t('common.close')}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <Label>{t('auth.identifierLabel')}</Label>
              <Input
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                placeholder={t('auth.identifierPlaceholder')}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForgotOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('auth.forgotSubmit')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
