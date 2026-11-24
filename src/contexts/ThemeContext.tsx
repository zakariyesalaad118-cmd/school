import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ThemePreference } from '../types/nexus';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialPreference = 'light',
  children,
}: {
  initialPreference?: ThemePreference;
  children: React.ReactNode;
}) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const saved = window.localStorage.getItem('nexus_theme_pref');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return initialPreference;
  });

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const setThemePreference = (pref: ThemePreference) => {
    setPreference(pref);
    window.localStorage.setItem('nexus_theme_pref', pref);
  };

  const value = useMemo(
    () => ({ preference, resolvedTheme, setThemePreference }),
    [preference, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
