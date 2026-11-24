import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
import type { SchoolSettings } from '../types/nexus';

interface BrandingContextValue {
  settings: SchoolSettings | null;
  loading: boolean;
  refreshBranding: () => Promise<void>;
  applyBrandingSettings: (next: SchoolSettings) => void;
}

const DEFAULT_BRANDING: SchoolSettings = {
  id: 'school_primary',
  osName: 'NEXUS SCHOOL OS',
  schoolName: 'SOMALI PRIMERY AND SECONDARY SCHOOL',
  slogan: 'One School. One Intelligence. One Connected Future.',
  address: 'KM4 Boulevard, Hodan District, Mogadishu',
  phone: '+252 61 500 0000',
  email: 'info@somalischool.edu.so',
  website: 'https://somalischool.edu.so',
  logoUrl: '/src/assets/images/school_crest_emblem_1795505841452.jpg',
  primaryColor: '#0F4C81',
  secondaryColor: '#1E3A5F',
  accentColor: '#059669',
  defaultLanguage: 'en',
  defaultTheme: 'light',
  loginHeadline: 'SOMALI PRIMERY AND SECONDARY SCHOOL',
  loginSubheadline: 'One School. One Intelligence. One Connected Future.',
  setupCompleted: false,
  updatedAt: new Date().toISOString(),
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SchoolSettings | null>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const applyCssVariables = useCallback((s: SchoolSettings) => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', s.primaryColor || '#0F4C81');
    root.style.setProperty('--brand-secondary', s.secondaryColor || '#1E3A5F');
    root.style.setProperty('--brand-accent', s.accentColor || '#059669');
    document.title = `${s.osName} — ${s.schoolName}`;
  }, []);

  const refreshBranding = useCallback(async () => {
    try {
      const data = await apiRequest<{ settings: SchoolSettings | null }>('/api/branding');
      if (data.settings) {
        setSettings(data.settings);
        applyCssVariables(data.settings);
      }
    } catch {
      applyCssVariables(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }, [applyCssVariables]);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  const applyBrandingSettings = useCallback(
    (next: SchoolSettings) => {
      setSettings(next);
      applyCssVariables(next);
    },
    [applyCssVariables]
  );

  return (
    <BrandingContext.Provider value={{ settings, loading, refreshBranding, applyBrandingSettings }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
}
