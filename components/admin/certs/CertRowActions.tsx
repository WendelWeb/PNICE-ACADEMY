'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconBan, IconRefresh, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { revokeCertificateAction, reissueCertificateAction } from '@/lib/admin/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper';

export function CertRowActions({ certId, revoked }: { certId: string; revoked: boolean }) {
  const t = useTranslations('admin.certs');
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
    });

  return (
    <span className="inline-flex items-center gap-2">
      {pending && <IconLoader2 size={12} className="animate-spin text-ink/40" />}
      {revoked ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => reissueCertificateAction(certId))}
          className={cn('inline-flex items-center gap-1 font-mono text-[10px] text-teal hover:underline', focusRing)}
        >
          <IconRefresh size={12} /> {t('reissue')}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => revokeCertificateAction(certId))}
          className={cn('inline-flex items-center gap-1 font-mono text-[10px] text-stampred hover:underline', focusRing)}
        >
          <IconBan size={12} /> {t('revoke')}
        </button>
      )}
    </span>
  );
}
