import { IconDownload, IconExternalLink } from '@tabler/icons-react';
import { isValidHttpUrl } from '@/lib/teacher/apply-validation';
import { cn } from '@/lib/cn';
import type { CourseResource } from '@/db/schema';

/**
 * A small list of links/downloads attached to a course or a lesson (Task K3
 * — plan de cours complet, rendering half of K1/K2's `resources` jsonb).
 * Shared by the sales page (course-level "lien en description") and the
 * lesson page (per-lesson resources) — same shape (`db/schema.ts`'s
 * `CourseResource`), same render.
 *
 * DEFENSIVE re-validation: `lib/courses/write.ts`'s `validateResource` already
 * rejects non-http(s) URLs at WRITE time, but this is untrusted teacher input
 * reaching a public render, so every `url` is re-checked with the same
 * `isValidHttpUrl` allowlist `lib/teacher/public.ts`'s `isSafePhotoUrl` uses
 * — a row that predates that check (or was edited directly) is silently
 * skipped rather than rendered as a broken/unsafe link. Every link opens in a
 * new tab with `rel="noopener noreferrer"`. No `dangerouslySetInnerHTML`
 * anywhere — labels are plain localized strings.
 */
export function ResourceLinks({
  resources,
  locale,
  className,
}: {
  resources: CourseResource[];
  locale: string;
  className?: string;
}) {
  const safe = resources.filter((r) => isValidHttpUrl(r.url));
  if (safe.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {safe.map((r, i) => {
        const label = locale === 'ht' ? r.label_ht : r.label_fr;
        const Icon = r.kind === 'file' ? IconDownload : IconExternalLink;
        return (
          <li key={i}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-sm text-ink transition-colors hover:border-teal hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light"
            >
              <Icon size={14} className="shrink-0 text-teal" />
              {label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
