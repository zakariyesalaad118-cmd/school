import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { Button, Card } from '../components/ui/Primitives';
import type { SystemModule } from '../types/nexus';

export function ModulePlaceholderPage({ moduleKey }: { moduleKey: SystemModule }) {
  const { t } = useTranslation();

  return (
    <Card className="p-10 max-w-2xl space-y-4">
      <div className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center">
        <Layers className="w-5 h-5 text-slate-600 dark:text-slate-300" />
      </div>
      <div>
        <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {t('dashboard.phase2Scheduled')}
        </div>
        <h1 className="text-xl font-bold mt-1">{t(`nav.${moduleKey}`)}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
          {t('dashboard.moduleScheduledDesc')}
        </p>
      </div>
      <div>
        <Link to="/">
          <Button variant="secondary" size="sm">
            {t('common.back')}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
