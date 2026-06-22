'use client';

import { useUser } from '@clerk/nextjs';
import type { PniceUnsafeMetadata } from '@/components/kont/ui';

export type Currency = 'USD' | 'HTG';
export type TextSize = 'normal' | 'large' | 'xlarge';
export type VideoQuality = 'auto' | 'data-saver' | 'high';
export type PlaybackSpeed = '0.75' | '1' | '1.25' | '1.5' | '2';
export type SubtitleLang = 'fr' | 'ht' | 'none';

// Display / playback preferences, stored in Clerk unsafeMetadata.prefs until a
// Neon `profiles` table exists (locale lives at unsafeMetadata.localePref).
export type PnicePrefs = {
  currency?: Currency;
  reduceMotion?: boolean;
  textSize?: TextSize;
  videoQuality?: VideoQuality;
  wifiOnlyDownload?: boolean;
  playbackSpeed?: PlaybackSpeed;
  subtitleLang?: SubtitleLang;
};

export function usePreferences() {
  const { user, isLoaded } = useUser();
  const meta = (user?.unsafeMetadata ?? {}) as PniceUnsafeMetadata;
  const prefs = (meta.prefs ?? {}) as PnicePrefs;
  const localePref = meta.localePref;

  async function update(
    changes: Partial<PnicePrefs> & { localePref?: 'ht' | 'fr' },
  ) {
    if (!user) return;
    const { localePref: lp, ...prefChanges } = changes;
    await user.update({
      unsafeMetadata: {
        ...meta,
        ...(lp !== undefined ? { localePref: lp } : {}),
        prefs: { ...prefs, ...prefChanges },
      },
    });
  }

  return { isLoaded, localePref, prefs, update };
}
