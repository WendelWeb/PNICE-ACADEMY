'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import {
  usePreferences,
  type PnicePrefs,
  type Currency,
  type TextSize,
  type VideoQuality,
  type PlaybackSpeed,
  type SubtitleLang,
} from '@/lib/usePreferences';
import { SettingsCard, SelectInput, FormStatus, type FormStatusValue } from './ui';

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre',
        checked ? 'bg-ochre' : 'bg-ink/20',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

function Row({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <SettingsCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-ink">{title}</p>
          {help && (
            <p className="mt-0.5 max-w-md text-xs text-graphite/60">{help}</p>
          )}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </SettingsCard>
  );
}

export function PreferencesTab() {
  const t = useTranslations('kont.preferences');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { prefs, localePref, update } = usePreferences();
  const [status, setStatus] = useState<FormStatusValue>(null);

  async function save(
    changes: Partial<PnicePrefs> & { localePref?: 'ht' | 'fr' },
  ) {
    await update(changes);
    setStatus({ type: 'success', message: t('saved') });
  }

  return (
    <div className="space-y-4">
      <Row title={t('language.title')} help={t('language.help')}>
        <SelectInput
          value={localePref ?? locale}
          onChange={async (e) => {
            const v = e.target.value as 'ht' | 'fr';
            await save({ localePref: v });
            router.replace(pathname, { locale: v });
          }}
          className="max-w-[200px]"
        >
          <option value="ht">{t('language.ht')}</option>
          <option value="fr">{t('language.fr')}</option>
        </SelectInput>
      </Row>

      <Row title={t('currency.title')} help={t('currency.help')}>
        <SelectInput
          value={prefs.currency ?? 'USD'}
          onChange={(e) => save({ currency: e.target.value as Currency })}
          className="max-w-[200px]"
        >
          <option value="USD">{t('currency.USD')}</option>
          <option value="HTG">{t('currency.HTG')}</option>
        </SelectInput>
      </Row>

      <Row title={t('motion.title')} help={t('motion.help')}>
        <Toggle
          label={t('motion.title')}
          checked={!!prefs.reduceMotion}
          onChange={(v) => save({ reduceMotion: v })}
        />
      </Row>

      <Row title={t('textSize.title')}>
        <SelectInput
          value={prefs.textSize ?? 'normal'}
          onChange={(e) => save({ textSize: e.target.value as TextSize })}
          className="max-w-[200px]"
        >
          <option value="normal">{t('textSize.normal')}</option>
          <option value="large">{t('textSize.large')}</option>
          <option value="xlarge">{t('textSize.xlarge')}</option>
        </SelectInput>
      </Row>

      <Row title={t('video.title')} help={t('video.note')}>
        <SelectInput
          value={prefs.videoQuality ?? 'auto'}
          onChange={(e) => save({ videoQuality: e.target.value as VideoQuality })}
          className="max-w-[220px]"
        >
          <option value="auto">{t('video.auto')}</option>
          <option value="data-saver">{t('video.data-saver')}</option>
          <option value="high">{t('video.high')}</option>
        </SelectInput>
      </Row>

      <Row title={t('wifi.title')} help={t('wifi.help')}>
        <Toggle
          label={t('wifi.title')}
          checked={!!prefs.wifiOnlyDownload}
          onChange={(v) => save({ wifiOnlyDownload: v })}
        />
      </Row>

      <Row title={t('speed.title')} help={t('speed.note')}>
        <SelectInput
          value={prefs.playbackSpeed ?? '1'}
          onChange={(e) =>
            save({ playbackSpeed: e.target.value as PlaybackSpeed })
          }
          className="max-w-[140px]"
        >
          {(['0.75', '1', '1.25', '1.5', '2'] as const).map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </SelectInput>
      </Row>

      <Row title={t('subtitles.title')} help={t('subtitles.note')}>
        <SelectInput
          value={prefs.subtitleLang ?? 'none'}
          onChange={(e) =>
            save({ subtitleLang: e.target.value as SubtitleLang })
          }
          className="max-w-[200px]"
        >
          <option value="fr">{t('subtitles.fr')}</option>
          <option value="ht">{t('subtitles.ht')}</option>
          <option value="none">{t('subtitles.none')}</option>
        </SelectInput>
      </Row>

      <FormStatus status={status} />
    </div>
  );
}
