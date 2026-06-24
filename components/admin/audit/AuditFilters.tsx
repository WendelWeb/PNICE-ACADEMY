'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconX, IconDownload } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const ACTIONS = [
  'grant_course', 'revoke_course', 'grant_subscription', 'suspend_user', 'ban_user', 'reactivate_user',
  'refund_payment', 'resend_verification', 'resend_receipt', 'set_fx_rate', 'dunning_reminder', 'engagement_reminder',
  'revoke_certificate', 'reissue_certificate', 'issue_certificate', 'review_request', 'announcement',
  'invite_admin', 'change_admin_role', 'suspend_admin', 'reactivate_admin', 'toggle_provider', 'set_sub_price', 'toggle_maintenance', 'impersonate',
];
const fieldCls = 'rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function AuditFilters({ admins, exportHref }: { admins: { id: string; name: string }[]; exportHref: string }) {
  const t = useTranslations('admin.audit');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | null>) => router.push(pathname + mergeParams(new URLSearchParams(sp.toString()), patch));
  const has = !!get('admin') || !!get('action') || !!get('from') || !!get('to');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={get('admin')} onChange={(e) => push({ admin: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('allAdmins')}</option>
        {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={get('action')} onChange={(e) => push({ action: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('allActions')}</option>
        {ACTIONS.map((a) => <option key={a} value={a}>{t(`action.${a}`)}</option>)}
      </select>
      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">{t('from')}<input type="date" value={get('from')} onChange={(e) => push({ from: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} /></label>
      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">{t('to')}<input type="date" value={get('to')} onChange={(e) => push({ to: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} /></label>
      {has && <button type="button" onClick={() => router.push(pathname)} className={cn('flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/5')}><IconX size={13} /> {t('clear')}</button>}
      <a href={exportHref} className="ml-auto flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-paper-light hover:bg-ink/90"><IconDownload size={14} /> {t('export')}</a>
    </div>
  );
}
