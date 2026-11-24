import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest, setAccessToken } from '../services/api';
import type {
  DepartmentRecord,
  LanguagePreference,
  PermissionAction,
  RoleRecord,
  SystemModule,
  ThemePreference,
  UserRecord,
} from '../types/nexus';
import { useTheme } from './ThemeContext';

interface AuthState {
  loading: boolean;
  setupRequired: boolean;
  user: UserRecord | null;
  role: RoleRecord | null;
  department: DepartmentRecord | null;
  effectivePermissions: string[];
}

interface AuthContextValue extends AuthState {
  can: (module: SystemModule, action: PermissionAction) => boolean;
  login: (identifier: string, password: string) => Promise<void>;
  bootstrapSuperAdmin: (payload: {
    fullName: string;
    email: string;
    username: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updatePreferences: (prefs: {
    languagePreference?: LanguagePreference;
    themePreference?: ThemePreference;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const { setThemePreference } = useTheme();
  const [state, setState] = useState<AuthState>({
    loading: true,
    setupRequired: false,
    user: null,
    role: null,
    department: null,
    effectivePermissions: [],
  });

  const applyUserPreferences = useCallback(
    (user: UserRecord | null) => {
      if (!user) return;
      if (user.languagePreference) {
        i18n.changeLanguage(user.languagePreference);
        window.localStorage.setItem('nexus_lang_pref', user.languagePreference);
      }
      if (user.themePreference) {
        setThemePreference(user.themePreference);
      }
    },
    [i18n, setThemePreference]
  );

  const refreshSession = useCallback(async () => {
    try {
      const setupStatus = await apiRequest<{ setupRequired: boolean }>('/api/auth/setup-status');
      if (setupStatus.setupRequired) {
        setAccessToken(null);
        setState({
          loading: false,
          setupRequired: true,
          user: null,
          role: null,
          department: null,
          effectivePermissions: [],
        });
        return;
      }

      try {
        const session = await apiRequest<{
          authenticated: boolean;
          accessToken: string;
          user: UserRecord;
          role: RoleRecord | null;
          department: DepartmentRecord | null;
          effectivePermissions: string[];
        }>('/api/auth/session');

        setAccessToken(session.accessToken);
        applyUserPreferences(session.user);
        setState({
          loading: false,
          setupRequired: false,
          user: session.user,
          role: session.role,
          department: session.department,
          effectivePermissions: session.effectivePermissions || [],
        });
      } catch {
        setAccessToken(null);
        setState({
          loading: false,
          setupRequired: false,
          user: null,
          role: null,
          department: null,
          effectivePermissions: [],
        });
      }
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [applyUserPreferences]);

  useEffect(() => {
    const savedLang = window.localStorage.getItem('nexus_lang_pref');
    if (savedLang === 'en' || savedLang === 'so') {
      i18n.changeLanguage(savedLang);
    }
    refreshSession();
  }, [i18n, refreshSession]);

  const login = async (identifier: string, password: string) => {
    const res = await apiRequest<{
      accessToken: string;
      user: UserRecord;
      role: RoleRecord | null;
      department: DepartmentRecord | null;
      effectivePermissions: string[];
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setAccessToken(res.accessToken);
    applyUserPreferences(res.user);
    setState({
      loading: false,
      setupRequired: false,
      user: res.user,
      role: res.role,
      department: res.department,
      effectivePermissions: res.effectivePermissions,
    });
  };

  const bootstrapSuperAdmin = async (payload: {
    fullName: string;
    email: string;
    username: string;
    password: string;
  }) => {
    const res = await apiRequest<{
      accessToken: string;
      user: UserRecord;
      role: RoleRecord | null;
      effectivePermissions: string[];
    }>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAccessToken(res.accessToken);
    setState({
      loading: false,
      setupRequired: false,
      user: res.user,
      role: res.role,
      department: null,
      effectivePermissions: res.effectivePermissions,
    });
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setState({
        loading: false,
        setupRequired: false,
        user: null,
        role: null,
        department: null,
        effectivePermissions: [],
      });
    }
  };

  const updatePreferences = async (prefs: {
    languagePreference?: LanguagePreference;
    themePreference?: ThemePreference;
  }) => {
    if (prefs.languagePreference) {
      i18n.changeLanguage(prefs.languagePreference);
      window.localStorage.setItem('nexus_lang_pref', prefs.languagePreference);
    }
    if (prefs.themePreference) {
      setThemePreference(prefs.themePreference);
    }
    if (state.user) {
      const res = await apiRequest<{ user: UserRecord | null }>('/api/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      });
      if (res.user) {
        setState((prev) => ({ ...prev, user: res.user }));
      }
    }
  };

  const can = useCallback(
    (module: SystemModule, action: PermissionAction) => {
      if (state.user?.isSuperAdmin) return true;
      const perms = state.effectivePermissions;
      return (
        perms.includes('*:*') ||
        perms.includes(`${module}:manage`) ||
        perms.includes(`${module}:${action}`)
      );
    },
    [state.effectivePermissions, state.user?.isSuperAdmin]
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        can,
        login,
        bootstrapSuperAdmin,
        logout,
        refreshSession,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
