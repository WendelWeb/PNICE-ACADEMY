import { getTranslations } from 'next-intl/server';
import { IconLock } from '@tabler/icons-react';

/** Shown when an admin lacks the capability for a section. */
export async function Forbidden() {
  const t = await getTranslations('admin.access');
  return (
    <div className="mx-auto max-w-md rounded-xl border border-ink/12 bg-paper-light p-8 text-center">
      <IconLock size={26} className="mx-auto text-stampred" />
      <p className="mt-3 font-mono text-sm text-graphite/70">{t('forbiddenSection')}</p>
    </div>
  );
}
