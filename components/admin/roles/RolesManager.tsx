'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconUserPlus, IconUsers, IconTrash, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { setRoleByEmailAction, revokeRoleAction, type ActionResult } from '@/lib/admin/actions';
import type { AdminRole } from '@/lib/admin/roles';
import { RoleBadge } from '@/components/admin/ui';

export type AdminRow = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  isSelf: boolean;
};

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const fieldCls =
  'rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-xs text-ink ' + focusRing;

export function RolesManager({
  admins,
  roles,
  roleLabels,
}: {
  admins: AdminRow[];
  roles: AdminRole[];
  roleLabels: Record<AdminRole, string>;
}) {
  const t = useTranslations('admin.access');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>(roles[0]);

  const msgFor = (m?: string) =>
    m === 'user_not_found'
      ? t('add.errorNotFound')
      : m === 'invalid_role'
        ? t('add.errorInvalid')
        : m === 'cannot_revoke_self'
          ? t('list.cannotSelf')
          : m === 'forbidden'
            ? t('forbidden')
            : t('add.error');

  const run = (fn: () => Promise<ActionResult>, okText: string) =>
    start(async () => {
      setFeedback(null);
      const res = await fn();
      if (res.ok) {
        setFeedback({ type: 'ok', text: okText });
        router.refresh();
      } else {
        setFeedback({ type: 'err', text: msgFor(res.message) });
      }
    });

  return (
    <div className="space-y-4">
      {/* Add / promote */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconUserPlus size={13} /> {t('add.title')}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setRoleByEmailAction(email, newRole), t('add.done'));
            setEmail('');
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">
              {t('add.emailLabel')}
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('add.emailPlaceholder')}
              className={cn(fieldCls, 'w-64')}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">
              {t('add.roleLabel')}
            </span>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AdminRole)}
              className={cn(fieldCls, 'cursor-pointer')}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending || !email} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
            {t('add.submit')}
          </button>
          {pending && <IconLoader2 size={18} className="animate-spin self-center text-ink/40" />}
        </form>
        <p className="mt-2 font-mono text-[10px] text-ink/45">{t('add.hint')}</p>
        {feedback && (
          <p
            className={cn(
              'mt-2 font-mono text-[11px]',
              feedback.type === 'ok' ? 'text-teal' : 'text-stampred',
            )}
            role="status"
          >
            {feedback.text}
          </p>
        )}
      </section>

      {/* Current admins */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconUsers size={13} /> {t('list.title')} · {admins.length}
        </h2>
        {admins.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-graphite/55">{t('list.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {admins.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{a.name}</span>
                    <RoleBadge role={a.role} label={roleLabels[a.role]} />
                    {a.isSelf && (
                      <span className="font-mono text-[10px] uppercase text-teal">{t('list.you')}</span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-ink/45">{a.email}</span>
                </span>
                <span className="flex items-center gap-2">
                  <select
                    value={a.role}
                    disabled={pending}
                    onChange={(e) => run(() => setRoleByEmailAction(a.email, e.target.value), t('list.roleChanged'))}
                    className={cn(fieldCls, 'cursor-pointer')}
                    aria-label={t('add.roleLabel')}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabels[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending || a.isSelf}
                    onClick={() => run(() => revokeRoleAction(a.id), t('list.revoked'))}
                    className={cn(
                      'flex items-center gap-1 font-mono text-[11px] text-stampred hover:underline disabled:opacity-40 disabled:no-underline',
                      focusRing,
                    )}
                    title={a.isSelf ? t('list.cannotSelf') : t('list.revoke')}
                  >
                    <IconTrash size={13} /> {t('list.revoke')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
