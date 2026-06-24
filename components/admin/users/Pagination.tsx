import { getTranslations } from 'next-intl/server';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/admin/format';
import { paramsOf, mergeParams, type RawSearchParams } from '@/lib/admin/users-query';

export async function Pagination({
  total,
  page,
  pageSize,
  searchParams,
  base = '/admin/utilisateurs',
}: {
  total: number;
  page: number;
  pageSize: number;
  searchParams: RawSearchParams;
  base?: string;
}) {
  const BASE = base;
  const t = await getTranslations('admin.users');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) {
    return (
      <p className="font-mono text-[11px] text-ink/50">
        {t('resultCount', { count: fmtInt(total) })}
      </p>
    );
  }

  const params = paramsOf(searchParams);
  const href = (p: number) => `${BASE}${mergeParams(params, { page: p })}`;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Compact window of page numbers around the current page.
  const windowPages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  for (let p = start; p <= end; p++) windowPages.push(p);

  const btn =
    'grid h-8 min-w-8 place-items-center rounded-lg border px-2 font-mono text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-[11px] text-ink/50">
        {t('resultRange', { from: fmtInt(from), to: fmtInt(to), total: fmtInt(total) })}
      </p>
      <nav className="flex items-center gap-1" aria-label={t('pagination')}>
        {page > 1 && (
          <Link href={href(page - 1)} className={cn(btn, 'border-ink/15 text-ink/70 hover:bg-ink/[0.04]')}>
            <IconChevronLeft size={15} />
          </Link>
        )}
        {start > 1 && <span className="px-1 font-mono text-xs text-ink/40">…</span>}
        {windowPages.map((p) => (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              btn,
              p === page
                ? 'border-ochre bg-ochre/15 font-semibold text-ink'
                : 'border-ink/15 text-ink/70 hover:bg-ink/[0.04]',
            )}
          >
            {p}
          </Link>
        ))}
        {end < pages && <span className="px-1 font-mono text-xs text-ink/40">…</span>}
        {page < pages && (
          <Link href={href(page + 1)} className={cn(btn, 'border-ink/15 text-ink/70 hover:bg-ink/[0.04]')}>
            <IconChevronRight size={15} />
          </Link>
        )}
      </nav>
    </div>
  );
}
