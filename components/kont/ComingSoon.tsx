'use client';

import { useTranslations } from 'next-intl';
import { IconClockHour4 } from '@tabler/icons-react';
import { SettingsCard } from './ui';

export function ComingSoon() {
  const t = useTranslations('kont.comingSoon');
  return (
    <SettingsCard>
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <IconClockHour4 size={28} className="text-ochre" />
        <p className="font-display text-xl font-bold text-ink">{t('title')}</p>
        <p className="max-w-xs text-sm text-graphite/70">{t('text')}</p>
      </div>
    </SettingsCard>
  );
}
