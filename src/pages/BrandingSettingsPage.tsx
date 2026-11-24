import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Upload } from 'lucide-react';
import { Button, Card, Input, Label, Select } from '../components/ui/Primitives';
import { useBranding } from '../contexts/BrandingContext';
import { apiRequest, resolveAssetUrl } from '../services/api';
import type { LanguagePreference, SchoolSettings, ThemePreference } from '../types/nexus';

export function BrandingSettingsPage() {
  const { t } = useTranslation();
  const { settings, applyBrandingSettings } = useBranding();

  const [form, setForm] = useState<Partial<SchoolSettings>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest<{ settings: SchoolSettings }>('/api/branding', {
        method: 'PATCH',
        body: JSON.stringify({
          osName: form.osName,
          schoolName: form.schoolName,
          slogan: form.slogan,
          address: form.address,
          phone: form.phone,
          email: form.email,
          website: form.website,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          accentColor: form.accentColor,
          defaultLanguage: form.defaultLanguage,
          defaultTheme: form.defaultTheme,
          loginHeadline: form.loginHeadline,
          loginSubheadline: form.loginSubheadline,
        }),
      });
      applyBrandingSettings(res.settings);
      setMessage(t('common.savedSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);
    if (file.size > 1024 * 1024) {
      setError('Logo file must be under 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      setUploading(true);
      try {
        const res = await apiRequest<{ settings: SchoolSettings }>('/api/branding/logo', {
          method: 'POST',
          body: JSON.stringify({ dataUrl: reader.result }),
        });
        applyBrandingSettings(res.settings);
        setForm(res.settings);
        setMessage(t('common.savedSuccess'));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.errorGeneric'));
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('branding.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('branding.subtitle')}</p>
      </div>

      {/* Live Preview Header */}
      <Card className="p-5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
          {t('branding.livePreview')}
        </div>
        <div
          className="rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{
            background: `linear-gradient(120deg, ${form.primaryColor || '#0F4C81'}, ${form.secondaryColor || '#1E3A5F'})`,
          }}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
              {form.logoUrl ? (
                <img
                  src={resolveAssetUrl(form.logoUrl)}
                  alt={form.schoolName || 'School Logo'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded"
                />
              ) : (
                <Shield className="w-7 h-7 text-sky-900" />
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-white/80">{form.osName}</div>
              <div className="text-lg font-bold tracking-tight">{form.schoolName}</div>
              <div className="text-xs text-white/85 mt-0.5">{form.slogan}</div>
            </div>
          </div>
          <span
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
            style={{ backgroundColor: form.accentColor || '#059669' }}
          >
            {form.primaryColor} · {form.accentColor}
          </span>
        </div>
      </Card>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('branding.schoolName')}</Label>
              <Input
                value={form.schoolName || ''}
                onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>{t('branding.osName')}</Label>
              <Input
                value={form.osName || ''}
                onChange={(e) => setForm((f) => ({ ...f, osName: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <Label>{t('branding.slogan')}</Label>
            <Input
              value={form.slogan || ''}
              onChange={(e) => setForm((f) => ({ ...f, slogan: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('branding.address')}</Label>
              <Input
                value={form.address || ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('branding.phone')}</Label>
              <Input
                value={form.phone || ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('branding.email')}</Label>
              <Input
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('branding.website')}</Label>
              <Input
                value={form.website || ''}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <Label>{t('branding.loginHeadline')}</Label>
              <Input
                value={form.loginHeadline || ''}
                onChange={(e) => setForm((f) => ({ ...f, loginHeadline: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('branding.loginSubheadline')}</Label>
              <Input
                value={form.loginSubheadline || ''}
                onChange={(e) => setForm((f) => ({ ...f, loginSubheadline: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-4 p-6 space-y-5">
          <div>
            <Label>{t('branding.logoUpload')}</Label>
            <label className="mt-2 flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-center">
              <Upload className="w-5 h-5 text-slate-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {uploading ? t('common.saving') : t('branding.uploadNewLogo')}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div>
              <Label>{t('branding.primaryColor')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor || '#0F4C81'}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="h-10 w-12 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
                />
                <Input
                  value={form.primaryColor || ''}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>

            <div>
              <Label>{t('branding.secondaryColor')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.secondaryColor || '#1E3A5F'}
                  onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
                  className="h-10 w-12 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
                />
                <Input
                  value={form.secondaryColor || ''}
                  onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>

            <div>
              <Label>{t('branding.accentColor')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accentColor || '#059669'}
                  onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                  className="h-10 w-12 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
                />
                <Input
                  value={form.accentColor || ''}
                  onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div>
              <Label>{t('branding.defaultLanguage')}</Label>
              <Select
                value={form.defaultLanguage || 'en'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, defaultLanguage: e.target.value as LanguagePreference }))
                }
              >
                <option value="en">{t('common.english')}</option>
                <option value="so">{t('common.somali')}</option>
              </Select>
            </div>
            <div>
              <Label>{t('branding.defaultTheme')}</Label>
              <Select
                value={form.defaultTheme || 'light'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, defaultTheme: e.target.value as ThemePreference }))
                }
              >
                <option value="light">{t('common.lightMode')}</option>
                <option value="dark">{t('common.darkMode')}</option>
                <option value="system">{t('common.systemTheme')}</option>
              </Select>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
