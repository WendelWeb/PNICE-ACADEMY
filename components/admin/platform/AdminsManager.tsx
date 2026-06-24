'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconUserPlus, IconShieldCheck, IconShieldX, IconUserOff, IconUserCheck, IconLoader2, IconX, IconAlertTriangle,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { RoleBadge } from '@/components/admin/ui';
import { fmtDate } from '@/lib/admin/format';
import { inviteAdminAction, changeAdminRoleAction, setAdminSuspendedAction } from '@/lib/admin/platform-actions';
import type { AdminRole } from '@/lib/admin/roles';

export type AdminRow = {
  id: string; name: string; email: string; role: AdminRole;
  twoFA: boolean; lastSignInAt: string | null; suspended: boolean; isSelf: boolean;
};

const inputCls = 'rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

type Pending = { kind: 'role' | 'suspend' | 'reactivate'; row: AdminRow; role?: AdminRole };

export function AdminsManager({
  admins, roles, roleLabels, locale,
}: {
  admins: AdminRow[]; roles: AdminRole[]; roleLabels: Record<AdminRole, string>; locale: 'ht' | 'fr';
}) {
  const t = useTranslations('admin.admins');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>(roles.find((r) => r !== 'super-admin') ?? roles[0]);

  const msgFor = (m?: string) =>
    m === 'cannot_self' ? t('err.self') : m === 'last_super_admin' ? t('err.lastSuper') : m === 'user_not_found' ? t('err.notFound') : t('err.generic');
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) =>
    start(async () => {
      setFeedback(null);
      const res = await fn();
      if (res.ok) { setFeedback({ type: 'ok', text: okText }); setConfirm(null); router.refresh(); }
      else setFeedback({ type: 'err', text: msgFor(res.message) });
    });

  return (
    <div className="space-y-4">
      {/* Invite */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55"><IconUserPlus size={13} /> {t('invite.title')}</h2>
        <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('invite.help')}</p>
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => inviteAdminAction(email, inviteRole), t('invite.sent')); setEmail(''); }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('invite.email')} className={cn(inputCls, 'w-60')} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AdminRole)} className={cn(inputCls, 'cursor-pointer')}>
            {roles.map((r) => <option key={r} value={r}>{roleLabels[r]} — {t(`scope.${r}`)}</option>)}
          </select>
          <button type="submit" disabled={pending || !email} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>{t('invite.submit')}</button>
        </form>
        {feedback && <p className={cn('mt-2 font-mono text-[11px]', feedback.type === 'ok' ? 'text-teal' : 'text-stampred')}>{feedback.text}</p>}
      </section>

      {/* Admins list */}
      <div className="overflow-x-auto rounded-xl border border-ink/12">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-paper-light">
            <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
              <th className="px-3 py-2">{t('col.admin')}</th>
              <th className="px-3 py-2">{t('col.role')}</th>
              <th className="px-3 py-2 text-center">{t('col.twoFA')}</th>
              <th className="px-3 py-2 text-right">{t('col.lastSeen')}</th>
              <th className="px-3 py-2 text-right">{t('col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className={cn('border-b border-ink/8 last:border-0', a.suspended && 'bg-stampred/[0.03]', !a.twoFA && !a.suspended && 'bg-ochre/[0.04]')}>
                <td className="px-3 py-2.5">
                  <span className="block text-[13px] font-medium text-ink">{a.name} {a.isSelf && <span className="font-mono text-[10px] uppercase text-teal">· {t('you')}</span>}</span>
                  <span className="block font-mono text-[10px] text-ink/45">{a.email}</span>
                  {a.suspended && <span className="mt-0.5 inline-block rounded bg-stampred/12 px-1.5 font-mono text-[9px] uppercase text-stampred">{t('suspended')}</span>}
                </td>
                <td className="px-3 py-2.5">
                  {a.isSelf ? (
                    <RoleBadge role={a.role} label={roleLabels[a.role]} />
                  ) : (
                    <select value={a.role} disabled={pending} onChange={(e) => setConfirm({ kind: 'role', row: a, role: e.target.value as AdminRole })} className={cn(inputCls, 'cursor-pointer')}>
                      {roles.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {a.twoFA ? <IconShieldCheck size={16} className="mx-auto text-teal" /> : (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ochre"><IconShieldX size={14} /> {t('noTwoFA')}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[11px] text-ink/60 tabular-nums">{fmtDate(a.lastSignInAt, locale)}</td>
                <td className="px-3 py-2.5 text-right">
                  {!a.isSelf && (
                    a.suspended ? (
                      <button type="button" disabled={pending} onClick={() => setConfirm({ kind: 'reactivate', row: a })} className="inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline"><IconUserCheck size={12} /> {t('reactivate')}</button>
                    ) : (
                      <button type="button" disabled={pending} onClick={() => setConfirm({ kind: 'suspend', row: a })} className="inline-flex items-center gap-1 font-mono text-[11px] text-stampred hover:underline"><IconUserOff size={12} /> {t('suspend')}</button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{t('confirm.title')}</h3>
              <button type="button" onClick={() => setConfirm(null)} className="text-ink/50 hover:text-ink"><IconX size={18} /></button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-sm text-graphite/80">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-ochre" />
              {confirm.kind === 'role'
                ? t('confirm.role', { name: confirm.row.name, from: roleLabels[confirm.row.role], to: roleLabels[confirm.role!] })
                : confirm.kind === 'suspend'
                  ? t('confirm.suspend', { name: confirm.row.name })
                  : t('confirm.reactivate', { name: confirm.row.name })}
            </p>
            {feedback?.type === 'err' && <p className="mt-2 font-mono text-[11px] text-stampred">{feedback.text}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('confirm.cancel')}</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm.kind === 'role') run(() => changeAdminRoleAction(confirm.row.id, confirm.role!), t('confirm.done'));
                  else run(() => setAdminSuspendedAction(confirm.row.id, confirm.kind === 'suspend'), t('confirm.done'));
                }}
                className={cn(buttonClasses('primary', 'md'), 'text-xs')}
              >
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('confirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
