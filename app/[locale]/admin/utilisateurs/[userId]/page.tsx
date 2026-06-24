import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  IconArrowLeft,
  IconMail,
  IconPhone,
  IconMapPin,
  IconLanguage,
  IconId,
  IconCalendar,
  IconWallet,
  IconAward,
  IconActivity,
  IconShieldCheck,
  IconDownload,
  IconCircleCheck,
  IconReceiptRefund,
  IconRoute,
} from '@tabler/icons-react';
import { courses } from '@/data/courses';
import { getUserById } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { IssueCertOnFiche } from '@/components/admin/certs/IssueCertOnFiche';
import { RequestReviewButton } from '@/components/admin/site/RequestReviewButton';
import { AddCreditButton } from '@/components/admin/marketing/AddCreditButton';
import { fmtUsdCents, fmtHtgFromCents, fmtDate, fmtDateTime } from '@/lib/admin/format';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { TypeBadge, StatusBadge, SubBadge, CountryBadge } from '@/components/admin/users/ui';
import {
  AccountActions,
  RefundButton,
  RevokeCourseButton,
} from '@/components/admin/users/UserActions';
import type { ActivityType, AuditAction, PaymentStatus } from '@/lib/admin/data';

export const dynamic = 'force-dynamic';

/* small server-side panel */
function Panel({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-ink/12 bg-paper-light p-4', className)}>
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-ink/40">{icon}</span>
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-wide text-ink/45">{label}</span>
        <span className="block break-words text-sm text-ink">{value}</span>
      </span>
    </div>
  );
}

const payStatusTone: Record<PaymentStatus, string> = {
  succeeded: 'text-teal',
  pending: 'text-ochre',
  failed: 'text-ink/45',
  refunded: 'text-stampred',
};

const activityIcon: Record<ActivityType, React.ReactNode> = {
  account_created: <IconId size={14} />,
  purchase: <IconWallet size={14} />,
  refund: <IconReceiptRefund size={14} />,
  enrollment: <IconCircleCheck size={14} />,
  lesson: <IconActivity size={14} />,
  certificate: <IconAward size={14} />,
  subscription: <IconShieldCheck size={14} />,
};

export default async function UserDetailPage({
  params: { locale, userId },
}: {
  params: { locale: 'ht' | 'fr'; userId: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('users.read'))) return <Forbidden />;
  const canIssueCert = await hasCap('courses.edit');
  const canAct = await hasCap('users.act');

  const t = await getTranslations('admin.users');
  const tm = await getTranslations('admin.marketing.credit');
  const detail = await getUserById(userId);
  if (!detail) notFound();

  const { user, payments, courses: access, certificates, credits, creditBalanceCents, activity, audit, acquisition } =
    detail;

  const catalog = courses.map((c) => ({
    slug: c.slug,
    title: locale === 'ht' ? c.title_ht : c.title_fr,
  }));
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <Link
        href="/admin/utilisateurs"
        className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink"
      >
        <IconArrowLeft size={14} /> {t('detail.back')}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink/12 bg-paper-light p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink/8 font-display text-lg font-bold text-ink/60">
          {initials}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-ink">{user.name}</h1>
          <p className="font-mono text-xs text-ink/50">
            {user.email} · {user.id}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <TypeBadge type={user.type} label={t(`types.${user.type}`)} />
          <StatusBadge status={user.status} label={t(`status.${user.status}`)} />
          {user.subscriptionStatus && (
            <SubBadge
              status={user.subscriptionStatus}
              label={t(`sub.${user.subscriptionStatus}`)}
            />
          )}
          {canIssueCert && <RequestReviewButton userId={user.id} userName={user.name} />}
        </div>
      </div>

      {/* Manual actions (Tasks 8–9) */}
      <AccountActions
        userId={user.id}
        status={user.status}
        isSubscriber={user.type === 'active_subscriber'}
        catalog={catalog}
      />

      {/* Profile + access (Task 5) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('detail.profile')} icon={<IconId size={13} />} className="lg:col-span-1">
          <div className="space-y-3">
            <Field icon={<IconMail size={15} />} label={t('col.contact')} value={user.email} />
            <Field icon={<IconPhone size={15} />} label="Tel" value={user.phone} />
            <Field
              icon={<IconMapPin size={15} />}
              label={t('col.location')}
              value={`${user.city} · ${t(`country.${user.country}`)}`}
            />
            <Field icon={<IconLanguage size={15} />} label={t('filters.language')} value={user.language === 'ht' ? 'Kreyòl' : 'Français'} />
            <Field icon={<IconAward size={15} />} label={t('detail.certName')} value={user.certificateName} />
            <Field icon={<IconCalendar size={15} />} label={t('col.joined')} value={fmtDate(user.createdAt, locale)} />
            <Field
              icon={<IconRoute size={15} />}
              label={tm('acquisition')}
              value={
                acquisition
                  ? `${acquisition.utmSource} · ${acquisition.utmMedium} · ${acquisition.utmCampaign}`
                  : tm('acquisitionDirect')
              }
            />
          </div>
          <div className="mt-4 rounded-lg bg-paper p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
                <IconWallet size={14} /> {t('detail.credits')}
              </span>
              <span className="text-right">
                <span className="block font-mono text-base font-semibold text-ink tabular-nums">
                  {fmtUsdCents(creditBalanceCents)}
                </span>
                <span className="block font-mono text-[10px] text-ink/45">
                  {fmtHtgFromCents(creditBalanceCents)}
                </span>
              </span>
            </div>
            {canAct && (
              <div className="mt-2 flex justify-end">
                <AddCreditButton userId={user.id} />
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <Stat label={t('detail.totalSpent')} value={fmtUsdCents(user.totalSpentCents)} />
            <Stat label={t('coursesShort')} value={String(user.coursesAccess)} />
          </div>
        </Panel>

        {/* Courses access + progress (Tasks 5–6) */}
        <Panel title={t('detail.courses')} icon={<IconShieldCheck size={13} />} className="lg:col-span-2">
          {access.length === 0 ? (
            <p className="font-mono text-xs text-graphite/55">{t('detail.noCourses')}</p>
          ) : (
            <ul className="space-y-2">
              {access.map((c) => {
                const pct = c.lessonsTotal ? Math.round((c.lessonsDone / c.lessonsTotal) * 100) : 0;
                return (
                  <li key={c.slug} className="rounded-lg border border-ink/10 bg-paper p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {locale === 'ht' ? c.title_ht : c.title_fr}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">
                            {t(`detail.source.${c.source}`)}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[10px] uppercase tracking-wide',
                              c.status === 'active' ? 'text-teal' : 'text-stampred',
                            )}
                          >
                            {t(`detail.access.${c.status}`)}
                          </span>
                        </span>
                      </div>
                      <RevokeCourseButton userId={user.id} courseSlug={c.slug} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full bg-teal"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-ink/55 tabular-nums">
                        {c.lessonsDone}/{c.lessonsTotal}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Payments + certificates (Tasks 6–7) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('detail.payments')} icon={<IconWallet size={13} />}>
          {payments.length === 0 ? (
            <p className="font-mono text-xs text-graphite/55">{t('detail.noPayments')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
                    <th className="py-1.5 pr-2">{t('detail.date')}</th>
                    <th className="py-1.5 pr-2">{t('detail.product')}</th>
                    <th className="py-1.5 pr-2">{t('detail.method')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('detail.amount')}</th>
                    <th className="py-1.5 text-right">{t('detail.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-ink/8 last:border-0">
                      <td className="whitespace-nowrap py-2 pr-2 font-mono text-[11px] text-ink/65 tabular-nums">
                        {fmtDate(p.createdAt, locale)}
                      </td>
                      <td className="py-2 pr-2 text-[13px] text-ink/85">
                        {p.productType === 'subscription'
                          ? t('detail.subscription')
                          : locale === 'ht'
                            ? courses.find((c) => c.slug === p.courseSlug)?.title_ht ?? p.courseSlug
                            : courses.find((c) => c.slug === p.courseSlug)?.title_fr ?? p.courseSlug}
                      </td>
                      <td className="py-2 pr-2 font-mono text-[11px] uppercase text-ink/55">{p.method}</td>
                      <td className="whitespace-nowrap py-2 pr-2 text-right font-mono text-[13px] text-ink tabular-nums">
                        {fmtUsdCents(p.amountCents)}
                      </td>
                      <td className="py-2 text-right">
                        <span className="flex flex-col items-end gap-1">
                          <span className={cn('font-mono text-[10px] uppercase', payStatusTone[p.status])}>
                            {t(`detail.pay.${p.status}`)}
                          </span>
                          {p.status === 'succeeded' && <RefundButton userId={user.id} paymentId={p.id} />}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t('detail.certificates')} icon={<IconAward size={13} />}>
          {certificates.length === 0 ? (
            <p className="font-mono text-xs text-graphite/55">{t('detail.noCertificates')}</p>
          ) : (
            <ul className="space-y-2">
              {certificates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {locale === 'ht'
                        ? courses.find((x) => x.slug === c.courseSlug)?.title_ht ?? c.courseSlug
                        : courses.find((x) => x.slug === c.courseSlug)?.title_fr ?? c.courseSlug}
                    </span>
                    <span className="block font-mono text-[10px] text-ink/45">
                      {t('detail.verifCode')}: {c.verificationCode} · {fmtDate(c.issuedAt, locale)}
                    </span>
                  </span>
                  {/* Mock: real PDF lands in Phase 2 Part D (certificate generation). */}
                  <span
                    className="flex shrink-0 items-center gap-1 rounded bg-ink/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/45"
                    title={t('detail.pdfSoon')}
                  >
                    <IconDownload size={12} /> PDF
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canIssueCert && <IssueCertOnFiche userId={user.id} courses={catalog} />}
        </Panel>
      </div>

      {/* Activity + audit (Task 7 + audit trail) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('detail.activity')} icon={<IconActivity size={13} />}>
          <ol className="space-y-2.5">
            {activity.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-ink/40">{activityIcon[e.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink/85">
                    {locale === 'ht' ? e.label_ht : e.label_fr}
                  </span>
                  <span className="font-mono text-[10px] text-ink/40 tabular-nums">
                    {fmtDateTime(e.at, locale)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title={t('detail.audit')} icon={<IconShieldCheck size={13} />}>
          {audit.length === 0 ? (
            <p className="font-mono text-xs text-graphite/55">{t('detail.noAudit')}</p>
          ) : (
            <ol className="space-y-2.5">
              {audit.map((a) => (
                <li key={a.id} className="rounded-lg border border-ink/10 bg-paper p-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-ochre">
                      {t(`audit.${a.action as AuditAction}`)}
                    </span>
                    <span className="font-mono text-[10px] text-ink/40 tabular-nums">
                      {fmtDateTime(a.createdAt, locale)}
                    </span>
                  </span>
                  <span className="mt-1 block font-mono text-[11px] text-ink/55">
                    {t('detail.by')} {a.adminName}
                    {a.detail ? ` · ${a.detail}` : ''}
                  </span>
                  {a.reason && (
                    <span className="mt-1 block text-[12px] italic text-graphite/70">“{a.reason}”</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper p-2">
      <span className="block font-mono text-[10px] uppercase tracking-wide text-ink/45">{label}</span>
      <span className="block font-mono text-sm font-semibold text-ink tabular-nums">{value}</span>
    </div>
  );
}
