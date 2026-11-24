import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Building2,
  Bus,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileBarChart2,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Palette,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { LanguageSwitcher, ThemeSwitcher } from '../components/LanguageThemeControls';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { resolveAssetUrl } from '../services/api';
import type { SystemModule } from '../types/nexus';
import { cn } from '../utils/cn';

interface NavItem {
  to: string;
  labelKey: string;
  module: SystemModule;
  icon: React.ComponentType<{ className?: string }>;
}

const CORE_NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.overview', module: 'overview', icon: LayoutDashboard },
  { to: '/users', labelKey: 'nav.users', module: 'users', icon: Users },
  { to: '/roles', labelKey: 'nav.roles', module: 'roles', icon: KeyRound },
  { to: '/departments', labelKey: 'nav.departments', module: 'departments', icon: Building2 },
  { to: '/dashboards', labelKey: 'nav.dashboards', module: 'dashboards', icon: LayoutGrid },
  { to: '/branding', labelKey: 'nav.branding', module: 'branding', icon: Palette },
  { to: '/security', labelKey: 'nav.security', module: 'security', icon: Shield },
];

const SCHOOL_MODULE_NAV: NavItem[] = [
  { to: '/modules/students', labelKey: 'nav.students', module: 'students', icon: GraduationCap },
  { to: '/modules/teachers', labelKey: 'nav.teachers', module: 'teachers', icon: Users },
  { to: '/modules/academics', labelKey: 'nav.academics', module: 'academics', icon: CalendarDays },
  { to: '/modules/attendance', labelKey: 'nav.attendance', module: 'attendance', icon: ClipboardCheck },
  { to: '/modules/exams', labelKey: 'nav.exams', module: 'exams', icon: Activity },
  { to: '/modules/finance', labelKey: 'nav.finance', module: 'finance', icon: CreditCard },
  { to: '/modules/library', labelKey: 'nav.library', module: 'library', icon: BookOpen },
  { to: '/modules/transport', labelKey: 'nav.transport', module: 'transport', icon: Bus },
  { to: '/modules/hr', labelKey: 'nav.hr', module: 'hr', icon: Users },
  { to: '/modules/reports', labelKey: 'nav.reports', module: 'reports', icon: FileBarChart2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { settings } = useBranding();
  const { user, role, department, can, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const location = useLocation();

  const visibleCoreNav = CORE_NAV_ITEMS.filter((item) => can(item.module, 'view'));
  const visibleModuleNav = SCHOOL_MODULE_NAV.filter(
    (item) =>
      can(item.module, 'view') ||
      (item.module === 'attendance' && (can('attendance', 'create') || can('attendance', 'edit'))) ||
      (item.module === 'exams' &&
        (can('exams', 'create') || can('exams', 'edit') || can('exams', 'approve')))
  );

  const currentNav =
    [...CORE_NAV_ITEMS, ...SCHOOL_MODULE_NAV].find((n) => n.to === location.pathname) ||
    (location.pathname === '/profile'
      ? { labelKey: 'nav.settings' }
      : { labelKey: 'nav.overview' });

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
          {settings?.logoUrl && !logoError ? (
            <img
              src={resolveAssetUrl(settings.logoUrl)}
              alt={settings.schoolName}
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="w-full h-full object-contain rounded"
            />
          ) : (
            <Shield className="w-5 h-5 text-sky-700" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
            {settings?.osName || 'NEXUS SCHOOL OS'}
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
            {settings?.schoolName || 'SOMALI PRIMERY AND SECONDARY SCHOOL'}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          {visibleCoreNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  )
                }
                style={({ isActive }) =>
                  isActive ? { backgroundColor: 'var(--brand-primary, #0F4C81)' } : undefined
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </div>

        {visibleModuleNav.length > 0 && (
          <div className="space-y-1 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="px-3 pb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
              {t('nav.phaseTwoModules')}
            </div>
            {visibleModuleNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
        <NavLink
          to="/profile"
          onClick={() => setMobileMenuOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            )
          }
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="truncate">{t('common.profileSettings')}</span>
        </NavLink>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>{t('common.logout')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[270px] lg:shrink-0 lg:flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800 z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-4 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 glass-surface border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
                <span className="truncate">{settings?.schoolName}</span>
                <span aria-hidden="true">/</span>
                <span className="text-slate-900 dark:text-slate-100 font-semibold truncate">
                  {t(currentNav.labelKey)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageSwitcher compact />
            <ThemeSwitcher />
            <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-700">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: 'var(--brand-primary, #0F4C81)' }}
              >
                {user?.fullName
                  ?.split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'U'}
              </div>
              <div className="text-left leading-tight">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {user?.fullName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {role?.name || 'User'}
                  {department ? ` · ${department.code}` : ''}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
