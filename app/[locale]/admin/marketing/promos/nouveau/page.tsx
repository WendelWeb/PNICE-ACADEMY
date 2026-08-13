import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { CreatePromoForm } from '@/components/admin/marketing/CreatePromoForm';
import { Link } from '@/i18n/routing';
import { getPublishedCourses } from '@/lib/courses/source';
import { getAdminCourses } from '@/lib/courses/write';
import { getOwnerDisplayNames } from '@/lib/teacher/admin';

export const dynamic = 'force-dynamic';

export default async function NewPromoPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing.promos');

  // Stage 1 fix — this used to be the static, single-teacher `data/courses`
  // catalog: a 2nd+ teacher's DB-authored course was never even offered as
  // an option here (see /formations, FeaturedCourses, sitemap.ts, which
  // already read the real published catalog). `getPublishedCourses()` is
  // fallback-safe (static 9 courses pre-migration), same as those surfaces.
  // Each option is labelled with its OWNER — a course-scoped promo discounts
  // THAT teacher's own earnings (see lib/admin/data/real/marketing.ts's
  // `validatePromo` doc comment), so the admin must see whose course they're
  // about to pick before creating one.
  const [published, adminRows] = await Promise.all([getPublishedCourses(), getAdminCourses()]);
  const ownerBySlug = new Map(adminRows.map((r) => [r.slug, r.ownerUserId]));
  const ownerNames = await getOwnerDisplayNames(adminRows.map((r) => r.ownerUserId));
  const catalog = published.map((c) => {
    const ownerUserId = ownerBySlug.get(c.slug) ?? null;
    const ownerLabel = ownerUserId && ownerNames.get(ownerUserId);
    const title = locale === 'ht' ? c.title_ht : c.title_fr;
    return { slug: c.slug, title: ownerLabel ? `${title} — ${ownerLabel}` : title };
  });

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />
      <Link
        href="/admin/marketing/promos"
        className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink"
      >
        <IconArrowLeft size={14} /> {t('backToList')}
      </Link>
      <div className="max-w-2xl">
        <CreatePromoForm courses={catalog} />
      </div>
    </div>
  );
}
