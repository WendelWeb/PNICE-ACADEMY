import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconCircleCheck, IconBan } from '@tabler/icons-react';
import { courses } from '@/data/courses';
import { getCertificates } from '@/lib/admin/data';
import { parseCertQuery } from '@/lib/admin/cert-query';
import { hasCap } from '@/lib/admin/guard';
import { fmtDate } from '@/lib/admin/format';
import { type RawSearchParams } from '@/lib/admin/users-query';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { Forbidden } from '@/components/admin/Forbidden';
import { Pagination } from '@/components/admin/users/Pagination';
import { CertFilters } from '@/components/admin/certs/CertFilters';
import { IssueCertForm } from '@/components/admin/certs/IssueCertForm';
import { CertRowActions } from '@/components/admin/certs/CertRowActions';
import { RequestReviewButton } from '@/components/admin/site/RequestReviewButton';

export const dynamic = 'force-dynamic';

export default async function CertificatesPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.read'))) return <Forbidden />;

  const t = await getTranslations('admin.certs');
  const canManage = await hasCap('courses.edit');
  const data = await getCertificates(parseCertQuery(searchParams));
  const title = (x: { title_fr: string; title_ht: string }) => (locale === 'ht' ? x.title_ht : x.title_fr);
  const catalog = courses.map((c) => ({ slug: c.slug, title: title(c) }));

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      {canManage && <IssueCertForm courses={catalog} />}
      <CertFilters courses={catalog} />

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left">
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.user')}</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.course')}</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.code')}</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.issued')}</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.state')}</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id} className={cn('border-b border-ink/8 last:border-0', c.revoked && 'bg-stampred/[0.03]')}>
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/utilisateurs/${c.userId}`} className="group block min-w-0">
                      <span className="block truncate text-[13px] text-ink group-hover:text-ochre">{c.userName}</span>
                      <span className="block truncate font-mono text-[10px] text-ink/45">{c.userEmail}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-ink/80">
                    {locale === 'ht' ? c.courseTitle_ht : c.courseTitle_fr}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/certificats/verifier/${c.verificationCode}`} className="font-mono text-[11px] text-teal hover:underline">
                      {c.verificationCode}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink/65 tabular-nums">{fmtDate(c.issuedAt, locale)}</td>
                  <td className="px-3 py-2.5">
                    {c.revoked ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-stampred"><IconBan size={12} /> {t('revoked')}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-teal"><IconCircleCheck size={12} /> {t('valid')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {canManage ? (
                      <span className="inline-flex flex-col items-end gap-1">
                        <CertRowActions certId={c.id} revoked={c.revoked} />
                        <RequestReviewButton userId={c.userId} userName={c.userName} />
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-ink/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination total={data.total} page={data.page} pageSize={data.pageSize} searchParams={searchParams} base="/admin/certificats" />
    </div>
  );
}
