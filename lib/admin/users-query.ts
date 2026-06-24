/**
 * Parse/serialize the users-list query from URL search params, so every filter,
 * sort and page is shareable + survives refresh (Task 2). Param names are short
 * and stable: q, country, lang, type, courses, from, to, segment, sort, dir, page.
 */
import type {
  UsersQuery,
  Country,
  Locale,
  UserType,
  CourseBucket,
  SpecialSegment,
  UserSortKey,
  SortDir,
} from '@/lib/admin/data';

export type RawSearchParams = Record<string, string | string[] | undefined>;

const TYPES: UserType[] = ['active_subscriber', 'one_off', 'free'];
const BUCKETS: CourseBucket[] = ['0', '1', '2', '3', '4', '5plus'];
const SEGMENTS: SpecialSegment[] = ['inactive', 'top_spenders'];
const SORTS: UserSortKey[] = ['createdAt', 'totalSpent', 'lastActive'];

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export function parseUsersQuery(sp: RawSearchParams): UsersQuery {
  const q: UsersQuery = {};
  const search = one(sp.q)?.trim();
  if (search) q.search = search;

  const country = one(sp.country);
  if (country === 'HT' || country === 'diaspora') q.country = country as Country;

  const lang = one(sp.lang);
  if (lang === 'ht' || lang === 'fr') q.language = lang as Locale;

  const type = one(sp.type);
  if (type && TYPES.includes(type as UserType)) q.type = type as UserType;

  const courses = one(sp.courses);
  if (courses && BUCKETS.includes(courses as CourseBucket)) q.courses = courses as CourseBucket;

  const from = one(sp.from);
  if (from) q.from = from;
  const to = one(sp.to);
  if (to) q.to = to;

  const segment = one(sp.segment);
  if (segment && SEGMENTS.includes(segment as SpecialSegment)) {
    q.segment = segment as SpecialSegment;
  }

  const sort = one(sp.sort);
  if (sort && SORTS.includes(sort as UserSortKey)) q.sort = sort as UserSortKey;
  const dir = one(sp.dir);
  if (dir === 'asc' || dir === 'desc') q.dir = dir as SortDir;

  const page = Number(one(sp.page));
  if (Number.isInteger(page) && page > 0) q.page = page;

  return q;
}

const KEYS = ['q', 'country', 'lang', 'type', 'courses', 'from', 'to', 'segment', 'sort', 'dir', 'page'] as const;

export function spToParams(sp: RawSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of KEYS) {
    const v = one(sp[k]);
    if (v) p.set(k, v);
  }
  return p;
}

/** Generic: copy every string param (used by sections beyond the users list). */
export function paramsOf(sp: RawSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = one(v);
    if (val) p.set(k, val);
  }
  return p;
}

/**
 * Merge a patch into the current params and return a `?…` query string.
 * - value `null`/`''` deletes the key.
 * - changing any filter resets `page` (unless the patch sets `page` itself).
 */
export function mergeParams(
  current: URLSearchParams,
  patch: Record<string, string | number | null>,
): string {
  const params = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') params.delete(k);
    else params.set(k, String(v));
  }
  if (!('page' in patch)) params.delete('page');
  const s = params.toString();
  return s ? `?${s}` : '';
}
