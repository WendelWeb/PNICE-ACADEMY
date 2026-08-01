'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
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

/** Deep-link support: `/kont?tab=support` opens straight to that tab (used by the footer's "Èd" links). */
function initialTabFrom(requested: string | null): TabId {
  return (TABS as readonly string[]).includes(requested ?? '') ? (requested as TabId) : 'profile';
}

export function AccountSettings({ isApprovedTeacher = false }: { isApprovedTeacher?: boolean }) {
  const t = useTranslations('kont');
  const { isLoaded, user } = useUser();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<TabId>(() => initialTabFrom(searchParams.get('tab')));

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

      {/* user header — styled like a document identity strip */}
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-ink/10 bg-paper-light p-4 sm:p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-full border border-ink/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold leading-tight text-ink">
            {user.fullName || user.username}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-graphite/55">
            {user.primaryEmailAddress?.emailAddress}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 border-t border-ink/10 pt-8 lg:grid-cols-[220px_1fr] lg:gap-10">
        {/* tab nav, styled as document tabs: a horizontal tab strip on
            mobile, a numbered manifest index on desktop — same metaphor,
            two layouts. Numbers are purely decorative (array position). */}
        <nav
          aria-label={t('title')}
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink/10 px-1 pb-0 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0 lg:border-l lg:border-ink/10 lg:px-0 lg:pb-0"
        >
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActive(tab)}
              aria-current={active === tab ? 'page' : undefined}
              className={cn(
                'group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre lg:-ml-px lg:rounded-l-none lg:rounded-r-md lg:border-b-0 lg:border-l-2 lg:py-2',
                active === tab
                  ? 'border-ochre bg-ink font-semibold text-paper-light lg:border-l-ochre'
                  : 'border-transparent text-ink/65 hover:bg-ink/[0.05] hover:text-ink',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'font-mono text-[10px] tabular-nums',
                  active === tab ? 'text-paper-light/50' : 'text-ink/30',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {t(`tabs.${tab}`)}
            </button>
          ))}

          {/* Not a tab (no content pane here) — a real navigation link,
              visually distinguished with a divider and an ochre arrow so it
              reads as "leaves this panel" (Task C3-T2). An APPROVED teacher
              (Task: studio access everywhere) gets a link straight to their
              studio instead of the "become a teacher" pitch, which no longer
              applies to them. */}
          <Link
            href={isApprovedTeacher ? '/enseigner/studio' : '/enseigner'}
            className="group ml-1 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 border-transparent px-3.5 py-2.5 text-left text-sm text-ink/65 transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre lg:mt-2 lg:-ml-px lg:rounded-l-none lg:rounded-r-md lg:border-b-0 lg:border-l-2 lg:border-l-ink/10 lg:py-2"
          >
            <IconArrowRight
              size={13}
              className="shrink-0 text-ochre transition-transform group-hover:translate-x-0.5"
            />
            {isApprovedTeacher ? t('myStudio') : t('teachEntry')}
          </Link>
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
