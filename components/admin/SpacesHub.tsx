import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { currentAdminRole } from '@/lib/admin/guard';
import { ADMIN_NAV_ICONS, firstReachableHref, visibleSections } from './nav';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * Task A2 (admin spaces hub) — owner ask: "bouton pour accéder à chacun de
 * ces admins". The 6 sidebar sections (AdminShell / nav.ts) had no obvious
 * entry point beyond the sidebar itself; this renders one access card per
 * section at the top of the dashboard.
 *
 * `pilotage` (overview + analytics) is intentionally EXCLUDED here: this hub
 * lives ON the pilotage/overview page, so a card that links back to the page
 * you're already reading would be redundant. Analytics — pilotage's other
 * item — stays one click away in the sidebar's Pilotage group, and in the
 * header's "Espaces" switcher (AdminShell), which DOES include Pilotage since
 * it's reachable from every admin page, not just this one.
 *
 * Capability filtering is NOT reimplemented here — `visibleSections(role)`
 * (nav.ts) is the exact function AdminShell's sidebar calls, so a role sees
 * identical spaces in both places by construction, not by convention.
 *
 * Card anatomy mirrors CourseCatalogCard's proven structure: the outer
 * element carries `card-hover` (quiet lift + border tint on hover/focus-within,
 * respects reduced-motion) and is NOT itself a link — a big inner <Link>
 * covers the icon/title/description down to the section's first accessible
 * page, and each item below is its OWN real <Link> pill. Nesting an <a>
 * inside an <a> is invalid HTML (and breaks keyboard/SR nav), so the item
 * quick-links sit next to, not inside, the main link — same reasoning as the
 * teacher-attribution link in CourseCatalogCard.
 */
export async function SpacesHub() {
  const t = await getTranslations('admin');
  const role = await currentAdminRole();
  if (!role) return null;

  const sections = visibleSections(role).filter((s) => s.key !== 'pilotage');
  if (sections.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="font-display text-lg font-bold leading-none text-ink">
        {t('hub.title')}
      </h2>
      <p className="mt-1.5 text-sm text-graphite/70">{t('hub.intro')}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => {
          const href = firstReachableHref(section);
          if (!href) return null;
          const SectionIcon = ADMIN_NAV_ICONS[section.icon] ?? ADMIN_NAV_ICONS.overview;

          return (
            <div
              key={section.key}
              className="card-hover flex h-full flex-col rounded-xl border border-ink/12 bg-paper-light outline-none transition-colors hover:border-ochre/40"
            >
              <Link
                href={href}
                className={cn(
                  'flex flex-1 flex-col gap-2.5 rounded-t-xl p-4 outline-none',
                  focusRing,
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ochre/12 text-ochre">
                    <SectionIcon size={18} />
                  </span>
                  <span className="font-display text-base font-bold leading-tight text-ink">
                    {t(`nav.sections.${section.key}`)}
                  </span>
                </div>
                <p className="text-xs leading-snug text-graphite/65">
                  {t(`hub.${section.key}.desc`)}
                </p>
              </Link>

              <ul className="flex flex-wrap gap-1.5 border-t border-ink/10 px-4 py-3">
                {section.items.map((item) =>
                  item.enabled && item.href ? (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={cn(
                          'inline-flex items-center rounded-full border border-ink/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/55 transition-colors motion-reduce:transition-none hover:border-ochre/40 hover:text-ink',
                          focusRing,
                        )}
                      >
                        {t(`nav.${item.key}`)}
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
