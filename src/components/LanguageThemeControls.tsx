import { Globe, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { LanguagePreference, ThemePreference } from '../types/nexus';
import { cn } from '../utils/cn';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const { updatePreferences } = useAuth();
  const current: LanguagePreference = i18n.language === 'so' ? 'so' : 'en';

  const setLang = (lang: LanguagePreference) => {
    updatePreferences({ languagePreference: lang });
  };

  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80"
      role="group"
      aria-label={t('common.language')}
    >
      <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ml-1.5 mr-0.5 shrink-0" />
      <button
        type="button"
        onClick={() => setLang('en')}
        className={cn(
          'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
          current === 'en'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        )}
      >
        {compact ? 'EN' : t('common.english')}
      </button>
      <button
        type="button"
        onClick={() => setLang('so')}
        className={cn(
          'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
          current === 'so'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        )}
      >
        {compact ? 'SO' : t('common.somali')}
      </button>
    </div>
  );
}

export function ThemeSwitcher({ showSystem = false }: { showSystem?: boolean }) {
  const { t } = useTranslation();
  const { preference } = useTheme();
  const { updatePreferences } = useAuth();

  const setTheme = (pref: ThemePreference) => {
    updatePreferences({ themePreference: pref });
  };

  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80"
      role="group"
      aria-label={t('common.theme')}
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        title={t('common.lightMode')}
        aria-label={t('common.lightMode')}
        className={cn(
          'p-1.5 rounded-md transition-colors cursor-pointer',
          preference === 'light'
            ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-xs'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        )}
      >
        <Sun className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        title={t('common.darkMode')}
        aria-label={t('common.darkMode')}
        className={cn(
          'p-1.5 rounded-md transition-colors cursor-pointer',
          preference === 'dark'
            ? 'bg-white dark:bg-slate-900 text-sky-400 shadow-xs'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        )}
      >
        <Moon className="w-3.5 h-3.5" />
      </button>
      {showSystem && (
        <button
          type="button"
          onClick={() => setTheme('system')}
          title={t('common.systemTheme')}
          aria-label={t('common.systemTheme')}
          className={cn(
            'p-1.5 rounded-md transition-colors cursor-pointer',
            preference === 'system'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          )}
        >
          <Monitor className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
