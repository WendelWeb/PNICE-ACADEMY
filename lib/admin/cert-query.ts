/** Parse the certificates-list query from URL params: q, course, state, page. */
import type { CertQuery } from '@/lib/admin/data';
import type { RawSearchParams } from '@/lib/admin/users-query';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseCertQuery(sp: RawSearchParams): CertQuery {
  const q: CertQuery = {};
  const search = one(sp.q)?.trim();
  if (search) q.search = search;
  const course = one(sp.course);
  if (course) q.course = course;
  const state = one(sp.state);
  if (state === 'valid' || state === 'revoked') q.state = state;
  const page = Number(one(sp.page));
  if (Number.isInteger(page) && page > 0) q.page = page;
  return q;
}
