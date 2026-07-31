import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export type EditorTabKey = 'infos' | 'plan' | 'medias' | 'ressources';

/**
 * The course editor's tab nav (Task A2 — replaces the old "one giant scroll"
 * stacking CourseEditor + LessonsManager + ImagesManager on a single page).
 * A plain server component: tabs are real links (`?tab=…`), so the active
 * tab is a URL — shareable, survives refresh, no client state to lose. Used
 * by BOTH call sites (admin CMS + teacher studio editor pages), same as
 * `CourseEditor`/`LessonsManager`/`ImagesManager` already are.
 *
 * `basePath` is the tab-less editor URL (e.g. `/admin/cours/PA-01/editer`);
 * the default tab ('infos') omits `?tab=` entirely for a cleaner URL, every
 * other tab appends it — mirrors the existing `/admin/cours` list page's own
 * `?tab=review` convention.
 */
export function EditorTabs({
  basePath,
  active,
  tabs,
}: {
  basePath: string;
  active: EditorTabKey;
  tabs: { key: EditorTabKey; label: string }[];
}) {
  return (
    <div role="tablist" className="overflow-x-auto border-b border-ink/12">
      <nav className="flex gap-1 whitespace-nowrap">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          const href = tab.key === 'infos' ? basePath : `${basePath}?tab=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                'relative shrink-0 px-3 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wide transition-colors motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper',
                isActive ? 'text-ink' : 'text-ink/45 hover:text-ink/70',
              )}
            >
              {tab.label}
              {isActive && <span aria-hidden className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ochre" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
