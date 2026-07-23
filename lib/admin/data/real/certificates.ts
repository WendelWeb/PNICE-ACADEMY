/**
 * Real (Drizzle) Certificates domain (Task L2c). The mock
 * (`lib/admin/data/mock/index.ts` — toCertRow/getCertificates/
 * getCertificateByCode/revokeCertificate/reissueCertificate/issueCertificate)
 * is the reference for every method's exact shape and semantics; this file
 * reproduces that behaviour from real rows, same "load + filter in JS" style
 * as ../users.ts.
 *
 * `certificates.revoked` (db/schema.ts, migration 0004) is the real revocation
 * flag. `pdf_url` is unrelated and unused — nominally present for a future
 * generated-PDF-URL feature (the L3 certificate download route builds the
 * PDF on the fly and never persists a URL — see
 * app/api/certificate/[code]/route.ts).
 *
 * A schema-forced deviation from the mock: the mock's `issueCertificate` is a
 * simple "insert if no non-revoked cert exists yet" — it tolerates a revoked
 * + a fresh cert coexisting for the same (userId, courseSlug) because the
 * mock has no such uniqueness constraint. The real `certificates` table has
 * `unique(userId, courseSlug)` (migration 0003), so a second row for the same
 * pair is impossible once one exists (revoked or not). `issueCertificate`
 * therefore UPDATEs the existing revoked row in place instead of inserting a
 * second one — same end state (user has one valid, verifiable certificate for
 * the course) via the only path the schema allows.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { courses } from '@/data/courses';
import type { AdminActor, CertPage, CertQuery, CertRow, CertVerification } from '../types';
import { recordAudit } from './users';

const T = schema;
const courseBySlug = new Map(courses.map((c) => [c.slug, c]));

// Unambiguous base32 (no 0/O/1/I/L) — same alphabet/format as the L1
// auto-issuance path (lib/learner/progress-actions.ts) so codes generated
// here are indistinguishable from ones issued automatically on course
// completion. 8 chars ⇒ 32^8 ≈ 1.1e12 combinations.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateVerificationCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `PA-${code}`;
}

type DbCert = typeof T.certificates.$inferSelect;
type DbUser = typeof T.users.$inferSelect;

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

function toCertRow(c: DbCert, userById: Map<string, DbUser>): CertRow {
  const u = userById.get(c.userId);
  const co = courseBySlug.get(c.courseSlug);
  return {
    id: c.id,
    userId: c.userId,
    userName: u?.name ?? u?.email ?? '—',
    userEmail: u?.email ?? '—',
    courseSlug: c.courseSlug,
    courseTitle_fr: co?.title_fr ?? c.courseSlug,
    courseTitle_ht: co?.title_ht ?? c.courseSlug,
    issuedAt: iso(c.issuedAt)!,
    verificationCode: c.verificationCode,
    revoked: c.revoked,
  };
}

/* ------------------------------- reads ------------------------------------ */

export async function getCertificates(query: CertQuery): Promise<CertPage> {
  const [certs, users] = await Promise.all([
    db.select().from(T.certificates),
    db.select().from(T.users),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  let rows = certs.map((c) => toCertRow(c, userById));

  if (query.search) {
    const s = query.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.userName.toLowerCase().includes(s) ||
        r.userEmail.toLowerCase().includes(s) ||
        r.verificationCode.toLowerCase().includes(s),
    );
  }
  if (query.course) rows = rows.filter((r) => r.courseSlug === query.course);
  if (query.state === 'valid') rows = rows.filter((r) => !r.revoked);
  if (query.state === 'revoked') rows = rows.filter((r) => r.revoked);
  rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? 25;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}

/**
 * The PUBLIC verify + PDF-download path (app/[locale]/(site)/certificats/
 * verifier/[code]/page.tsx, app/api/certificate/[code]/route.ts) depends on
 * this. `userName` is taken from the certificate's own `certificate_name`
 * snapshot (what was actually printed at issuance — see
 * lib/learner/progress-actions.ts) falling back to the live user record;
 * the mock has no such per-issuance snapshot so it just reads `user.name`,
 * but preferring the snapshot here is a strictly more faithful "what does
 * this certificate say" answer, not a behavioural change in shape.
 */
export async function getCertificateByCode(code: string): Promise<CertVerification> {
  const trimmed = code.trim();
  const [row] = await db
    .select()
    .from(T.certificates)
    .where(sql`lower(${T.certificates.verificationCode}) = lower(${trimmed})`)
    .limit(1);
  if (!row) return { found: false, revoked: false, code: trimmed };

  const [user] = await db.select().from(T.users).where(eq(T.users.id, row.userId)).limit(1);
  const co = courseBySlug.get(row.courseSlug);
  return {
    found: true,
    revoked: row.revoked,
    userName: row.certificateName || user?.name || user?.email,
    courseTitle_fr: co?.title_fr,
    courseTitle_ht: co?.title_ht,
    issuedAt: iso(row.issuedAt)!,
    code: row.verificationCode,
  };
}

/* ------------------------------ mutations ---------------------------------- */

export async function revokeCertificate(p: { certId: string; admin: AdminActor }): Promise<void> {
  const [cert] = await db.select().from(T.certificates).where(eq(T.certificates.id, p.certId)).limit(1);
  if (cert) {
    await db
      .update(T.certificates)
      .set({ revoked: true })
      .where(eq(T.certificates.id, p.certId));
  }
  await recordAudit({
    action: 'revoke_certificate',
    userId: cert?.userId ?? '',
    admin: p.admin,
    detail: cert?.verificationCode,
  });
}

export async function reissueCertificate(p: { certId: string; admin: AdminActor }): Promise<void> {
  const [cert] = await db.select().from(T.certificates).where(eq(T.certificates.id, p.certId)).limit(1);
  let newCode: string | undefined;
  if (cert) {
    // Retry a handful of times in the astronomically unlikely event of a
    // verification_code collision (unique constraint on that column, live
    // since migration 0000).
    for (let attempt = 0; attempt < 5 && !newCode; attempt++) {
      const code = generateVerificationCode();
      try {
        await db
          .update(T.certificates)
          .set({ revoked: false, issuedAt: new Date(), verificationCode: code })
          .where(eq(T.certificates.id, cert.id));
        newCode = code;
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
  }
  await recordAudit({
    action: 'reissue_certificate',
    userId: cert?.userId ?? '',
    admin: p.admin,
    detail: newCode ?? cert?.verificationCode,
  });
}

export async function issueCertificate(p: {
  userId: string;
  courseSlug: string;
  admin: AdminActor;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(T.certificates)
    .where(and(eq(T.certificates.userId, p.userId), eq(T.certificates.courseSlug, p.courseSlug)))
    .limit(1);

  if (!existing) {
    const [user] = await db.select().from(T.users).where(eq(T.users.id, p.userId)).limit(1);
    const certificateName = user?.certificateName || user?.name || user?.email || '—';
    for (let attempt = 0, done = false; attempt < 5 && !done; attempt++) {
      const code = generateVerificationCode();
      try {
        await db.insert(T.certificates).values({
          userId: p.userId,
          courseSlug: p.courseSlug,
          certificateName,
          verificationCode: code,
          revoked: false,
        });
        done = true;
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
  } else if (existing.revoked) {
    // unique(userId, courseSlug) forbids a second row for this pair — reinstate
    // the existing (revoked) row instead of inserting a fresh one. Same end
    // state as the mock's "no valid cert yet → issue one".
    for (let attempt = 0, done = false; attempt < 5 && !done; attempt++) {
      const code = generateVerificationCode();
      try {
        await db
          .update(T.certificates)
          .set({ revoked: false, issuedAt: new Date(), verificationCode: code })
          .where(eq(T.certificates.id, existing.id));
        done = true;
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
  }
  // else: a valid (non-revoked) certificate already exists for this pair —
  // idempotent no-op, matches the mock exactly.

  await recordAudit({
    action: 'issue_certificate',
    userId: p.userId,
    admin: p.admin,
    detail: p.courseSlug,
  });
}
