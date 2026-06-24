'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { Sceau } from '@/components/ui/Sceau';
import { cn } from '@/lib/cn';
import { ProfileTab } from './ProfileTab';
import { SecurityTab } from './SecurityTab';
import { PreferencesTab } from './PreferencesTab';
import { PrivacyTab } from './PrivacyTab';
import { SupportTab } from './SupportTab';
import { ComingSoon } from './ComingSoon';

const TABS = [
  'profile',
  'security',
  'subscription',
  'courses',
  'certificates',
  'notifications',
  'preferences',
  'privacy',
  'support',
] as const;
type TabId = (typeof TABS)[number];

export function AccountSettings() {
  const t = useTranslations('kont');
  const { isLoaded, user } = useUser();
  const [active, setActive] = useState<TabId>('profile');

  if (!isLoaded) {
    return (
      <p className="py-20 text-center font-mono text-sm text-graphite/60">
        {t('loading')}
      </p>
    );
  }
  if (!user) return null;

  return (
    <div>
      {/* page title + signature stamp (once, discreet) */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-4xl font-black text-ink md:text-5xl">
          {t('title')}
        </h1>
        <Sceau size="xs" tone="ochre" rotate={-6}>
          PA
        </Sceau>
      </div>

      {/* user header */}
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-ink/10 bg-paper-light p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-full border border-ink/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-ink">
            {user.fullName || user.username}
          </p>
          <p className="truncate font-mono text-xs text-graphite/60">
            {user.primaryEmailAddress?.emailAddress}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[210px_1fr] lg:gap-8">
        {/* tab nav: horizontal scroll on mobile, sidebar on desktop */}
        <nav
          aria-label={t('title')}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActive(tab)}
              aria-current={active === tab ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre',
                active === tab
                  ? 'bg-ink font-semibold text-paper-light'
                  : 'text-ink/70 hover:bg-ink/[0.05]',
              )}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {active === 'profile' ? (
            <ProfileTab />
          ) : active === 'security' ? (
            <SecurityTab />
          ) : active === 'preferences' ? (
            <PreferencesTab />
          ) : active === 'privacy' ? (
            <PrivacyTab />
          ) : active === 'support' ? (
            <SupportTab />
          ) : (
            <ComingSoon />
          )}
        </div>
      </div>
    </div>
  );
}
