import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { clerkClient } from '@clerk/nextjs/server';
import { IconArrowLeft, IconUser, IconReceipt2, IconMessage } from '@tabler/icons-react';
import { getTicketById, getTemplates } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { TicketStatusBadge, TicketTypeBadge } from '@/components/admin/support/ui';
import { TicketControls } from '@/components/admin/support/TicketControls';
import { TicketReply } from '@/components/admin/support/TicketReply';
import { RefundFromTicket } from '@/components/admin/support/RefundFromTicket';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDateTime } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

async function adminOptions(): Promise<{ id: string; name: string }[]> {
  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ limit: 100 });
    const list = Array.isArray(res) ? res : res.data;
    return list
      .filter((u) => {
        const r = u.publicMetadata?.role;
        return r === 'admin' || r === 'support' || r === 'super-admin';
      })
      .map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.emailAddresses[0]?.emailAddress || u.id,
      }));
  } catch {
    return [];
  }
}

export default async function TicketDetailPage({
  params: { locale, ticketId },
}: {
  params: { locale: 'ht' | 'fr'; ticketId: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('support.read'))) return <Forbidden />;
  const canAct = await hasCap('support.act');
  const canRefund = await hasCap('transactions.refund');
  const t = await getTranslations('admin.support');

  const [detail, templates, admins] = await Promise.all([getTicketById(ticketId), getTemplates(), adminOptions()]);
  if (!detail) notFound();
  const { ticket, replies, payment, userExists } = detail;

  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <Link href="/admin/support" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {t('detail.back')}
      </Link>

      {/* header */}
      <div className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TicketTypeBadge type={ticket.type} label={t(`type.${ticket.type}`)} />
              <TicketStatusBadge status={ticket.status} label={t(`status.${ticket.status}`)} />
              <span className="font-mono text-[10px] text-ink/40">{ticket.id}</span>
            </div>
            <h1 className="mt-2 font-display text-xl font-bold text-ink">{ticket.subject}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink/55">
              <IconUser size={13} />
              {userExists ? (
                <Link href={`/admin/utilisateurs/${ticket.userId}`} className="hover:text-ochre">{ticket.userName}</Link>
              ) : (
                <span>{ticket.userName}</span>
              )}
              <span className="text-ink/30">·</span>
              <span>{ticket.userEmail}</span>
              <span className="text-ink/30">·</span>
              <span>{fmtDateTime(ticket.createdAt, locale)}</span>
            </p>
          </div>
          {ticket.type === 'refund' && payment && canRefund && (
            <RefundFromTicket
              ticketId={ticket.id}
              summary={{ userName: ticket.userName, amount: fmtUsdCents(payment.amountCents), method: payment.method }}
            />
          )}
        </div>

        {/* related payment */}
        {payment && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-paper p-3 font-mono text-[11px] text-ink/70">
            <IconReceipt2 size={14} className="text-ink/45" />
            <span className="uppercase tracking-wide text-ink/45">{t('detail.relatedPayment')}</span>
            <Link href={`/admin/utilisateurs/${payment.userId}`} className="text-ink hover:text-ochre">{payment.id}</Link>
            <span className="text-ink/30">·</span>
            <span className="font-semibold text-ink tabular-nums">{fmtUsdCents(payment.amountCents)}</span>
            <span className="text-ink/30">·</span>
            <span className="uppercase">{payment.method}</span>
            <span className="text-ink/30">·</span>
            <span className={cn(payment.status === 'succeeded' ? 'text-teal' : payment.status === 'refunded' ? 'text-stampred' : 'text-ochre')}>
              {t(`payStatus.${payment.status}`)}
            </span>
          </div>
        )}
      </div>

      {/* controls */}
      <TicketControls ticketId={ticket.id} status={ticket.status} assignedAdminId={ticket.assignedAdminId} admins={admins} canAct={canAct} />

      {/* conversation */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconMessage size={13} /> {t('detail.conversation')}
        </h2>
        <ol className="mt-3 space-y-3">
          {/* original message */}
          <li className="flex flex-col items-start">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-ink/10 bg-paper px-3.5 py-2.5">
              <p className="whitespace-pre-wrap text-sm text-ink/85">{ticket.message}</p>
            </div>
            <span className="mt-1 font-mono text-[10px] text-ink/40">{ticket.userName} · {fmtDateTime(ticket.createdAt, locale)}</span>
          </li>
          {replies.map((r) => {
            const isAdmin = r.authorType === 'admin';
            return (
              <li key={r.id} className={cn('flex flex-col', isAdmin ? 'items-end' : 'items-start')}>
                <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5', isAdmin ? 'rounded-tr-sm bg-ink text-paper-light' : 'rounded-tl-sm border border-ink/10 bg-paper text-ink/85')}>
                  <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                </div>
                <span className="mt-1 font-mono text-[10px] text-ink/40">
                  {isAdmin ? `${r.authorName} · ${t('detail.staff')}` : r.authorName} · {fmtDateTime(r.createdAt, locale)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* reply */}
      <TicketReply ticketId={ticket.id} templates={templates} canAct={canAct} />
    </div>
  );
}
