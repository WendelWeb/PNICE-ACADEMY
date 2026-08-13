/**
 * Real (Drizzle) Subscriptions domain (Task L2a) — same "load everything,
 * filter/sort/paginate in JS" style as ./users.ts (loadAll) and
 * ./engagement.ts (loadBase). The mock (`lib/admin/data/mock/index.ts`, the
 * `toSubRow` helper + getSubscriptions/getSubEvents/getDunning/getRenewals/
 * getRenewalSeries/getCohorts/getSubKpis/getCancellationReasons) is the
 * reference for every method's exact shape and semantics; this file
 * reproduces that behaviour from real rows.
 *
 * Vocabulary mapping DB → admin UI (consistent with ./users.ts and
 * ./transactions.ts):
 *  - subscriptions.status 'incomplete' → 'past_due' (rest pass through).
 *  - subscriptions.provider 'stripe' → 'card' (paypal/crypto pass through).
 *  - "auto" (auto-renew) = card/paypal, matching the mock's
 *    AUTO_SUB_PROVIDERS and the schema's own comment on `provider`:
 *    "recurring only on card/PayPal/Stripe; crypto = manual monthly renewal".
 *
 * SCHEMA-DRIVEN DEGENERACIES (documented once here; every method below that
 * needs one of these fields references this note instead of repeating it).
 * The Drizzle `subscriptions` table (db/schema.ts) has: id, userId, status,
 * provider, providerRef, currentPeriodEnd, cancelAtPeriodEnd, createdAt,
 * updatedAt. It does NOT have: amountCents, canceledAt, cancellationReason,
 * dunningAttempts, firstFailedAt — all present on the mock's
 * `AdminSubscription`. Each is handled as follows:
 *
 *  1. amountCents — no per-subscription amount column exists. Every
 *     subscription is priced at the canonical SUBSCRIPTION_USD ($79), same
 *     assumption real/users.ts's getKpiOverview already makes for MRR
 *     (`activeSubscribers * SUB_CENTS`). Every amountCents/mrrCents/
 *     expectedCents below is derived from SUB_CENTS, never a stored value.
 *
 *  2. canceledAt — no explicit cancellation-timestamp column. Approximated
 *     via `canceledAtOf()`: `updatedAt` when `status === 'canceled'`, else
 *     null. This is exact as long as nothing else touches `updatedAt` on an
 *     already-canceled row after the fact (true of every current write path:
 *     grantSubscription in ./users.ts only writes to active rows). Used by
 *     getSubEvents ('canceled' events), getCohorts (retention curve) and
 *     getSubKpis (mrrChurnThisMonthCents / mrrPrevMonthCents).
 *
 *  3. cancellationReason — no column at all, and unlike canceledAt there is
 *     no adjacent column to approximate it from. getCancellationReasons()
 *     always returns [] until a `cancellation_reason` text column is added
 *     (e.g. captured from a Stripe portal webhook or an in-app cancel-flow
 *     survey).
 *
 *  4. dunningAttempts / firstFailedAt — no columns. getDunning() always
 *     reports `attempts: 0, firstFailedAt: null`; getSubEvents() never
 *     synthesizes 'failed' or 'reminder' events (there is no failure
 *     timestamp to anchor them to — the mock derives both entirely from
 *     `firstFailedAt`/`dunningAttempts`). The past_due list itself (who is
 *     dunning) is still fully real, driven by `status`; only the
 *     attempt-count/first-failure detail is degenerate. Once Stripe webhook
 *     handling starts populating these, add the columns and this stops being
 *     degenerate.
 *
 * On a near-empty DB (0 subscriptions, the owner's own state at launch)
 * every method here returns the same empty/zeroed shape the mock would for
 * an empty dataset — never throws.
 */
import { db, schema } from '@/db';
import { paymentsSelectSafe, PAYMENTS_COLUMNS_PRE_0019 } from '@/db/payments-compat';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import type {
  CohortRow,
  DunningRow,
  PaymentMethod,
  ReasonCount,
  RenewalDay,
  RenewalRow,
  SubDisplayStatus,
  SubEvent,
  SubEventType,
  SubKpis,
  SubPage,
  SubQuery,
  SubRow,
  SubscriptionStatus,
} from '../types';

const T = schema;
const DAY = 86_400_000;
const PAGE_SIZE = 25;
const SUB_CENTS = SUBSCRIPTION_USD * 100;

type DbSub = typeof T.subscriptions.$inferSelect;
type DbUser = typeof T.users.$inferSelect;

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

const subStatus = (s: string): SubscriptionStatus => (s === 'incomplete' ? 'past_due' : (s as SubscriptionStatus));
const methodOf = (p: string): PaymentMethod => (p === 'stripe' ? 'card' : (p as PaymentMethod));
const AUTO_METHODS: PaymentMethod[] = ['card', 'paypal'];
const isAuto = (m: PaymentMethod) => AUTO_METHODS.includes(m);

/** See file-header degeneracy note (2): canceledAt has no column — approximate
 *  with updatedAt for rows currently in 'canceled' status. */
function canceledAtOf(s: DbSub): string | null {
  return s.status === 'canceled' ? iso(s.updatedAt) : null;
}

async function loadAll() {
  const [subs, users, payments] = await Promise.all([
    db.select().from(T.subscriptions),
    db.select().from(T.users),
    paymentsSelectSafe(
      () => db.select().from(T.payments),
      () => db.select(PAYMENTS_COLUMNS_PRE_0019).from(T.payments),
    ),
  ]);
  return { subs, users, payments };
}

function userLabel(u: DbUser | undefined): { name: string; email: string } {
  return { name: u?.name ?? u?.email ?? '—', email: u?.email ?? '—' };
}

/** Mirrors the mock's `toSubRow` exactly, modulo the amountCents/currentPeriodEnd
 *  degeneracies documented at the top of this file. */
function toSubRow(s: DbSub, now: number, userById: Map<string, DbUser>): SubRow {
  const { name, email } = userLabel(userById.get(s.userId));
  const provider = methodOf(s.provider);
  const auto = isAuto(provider);
  const rawStatus = subStatus(s.status);
  // currentPeriodEnd is nullable in the schema (no NOT NULL constraint) even
  // though every checkout-created row sets it — fall back to createdAt so the
  // UI always gets a string, for any legacy/manual row that never got one.
  const currentPeriodEnd = iso(s.currentPeriodEnd) ?? iso(s.createdAt)!;
  let status: SubDisplayStatus = rawStatus;
  // Derive "imminent renewal" from the RAW nullable column, never the createdAt
  // display-fallback (which is always in the past and would flag every manual
  // sub with a null period end as pending_renewal forever).
  if (
    rawStatus === 'active' &&
    !auto &&
    s.currentPeriodEnd &&
    s.currentPeriodEnd.getTime() - now <= 3 * DAY
  ) {
    status = 'pending_renewal';
  }
  return {
    id: s.id,
    userId: s.userId,
    userName: name,
    userEmail: email,
    provider,
    auto,
    status,
    startedAt: iso(s.createdAt)!,
    currentPeriodEnd,
    mrrCents: rawStatus === 'active' ? SUB_CENTS : 0,
    amountCents: SUB_CENTS,
  };
}

/* ============================ subscriptions ============================== */

export async function getSubscriptions(query: SubQuery): Promise<SubPage> {
  const { subs, users } = await loadAll();
  const now = Date.now();
  const userById = new Map(users.map((u) => [u.id, u]));
  const rows = subs.map((s) => toSubRow(s, now, userById));

  const renewsWithin = (r: SubRow, days: number) => {
    const cpe = Date.parse(r.currentPeriodEnd);
    return r.status !== 'canceled' && cpe >= now && cpe <= now + days * DAY;
  };

  const base = rows.filter((r) => {
    if (query.search) {
      const s = query.search.trim().toLowerCase();
      if (!r.userName.toLowerCase().includes(s) && !r.userEmail.toLowerCase().includes(s)) return false;
    }
    if (query.provider && r.provider !== query.provider) return false;
    if (query.from && r.startedAt < query.from) return false;
    if (query.to && r.startedAt > query.to + 'T23:59:59.999Z') return false;
    return true;
  });

  const counts = {
    all: base.length,
    active: base.filter((r) => r.status === 'active' || r.status === 'pending_renewal').length,
    past_due: base.filter((r) => r.status === 'past_due').length,
    canceled: base.filter((r) => r.status === 'canceled').length,
    renew7: base.filter((r) => renewsWithin(r, 7)).length,
  };

  let filtered = base;
  if (query.status) {
    filtered = filtered.filter((r) =>
      query.status === 'active'
        ? r.status === 'active' || r.status === 'pending_renewal'
        : r.status === query.status,
    );
  }
  if (query.segment === 'renew7') filtered = filtered.filter((r) => renewsWithin(r, 7));
  if (query.segment === 'dunning') filtered = filtered.filter((r) => r.status === 'past_due');

  const sortKey = query.sort ?? 'renewal';
  const dir = query.dir ? (query.dir === 'asc' ? 1 : -1) : sortKey === 'renewal' ? 1 : -1;
  filtered = [...filtered].sort((a, b) =>
    sortKey === 'mrr'
      ? (a.mrrCents - b.mrrCents) * dir
      : (Date.parse(a.currentPeriodEnd) - Date.parse(b.currentPeriodEnd)) * dir,
  );

  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const start = (page - 1) * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, counts };
}

export async function getSubEvents(): Promise<SubEvent[]> {
  const { subs, users, payments } = await loadAll();
  const now = Date.now();
  const cutoff = now - 30 * DAY;
  const userById = new Map(users.map((u) => [u.id, u]));
  const evs: SubEvent[] = [];
  let seq = 0;
  const add = (type: SubEventType, userId: string, provider: PaymentMethod, amountCents: number, atMs: number) => {
    if (atMs < cutoff || atMs > now) return;
    evs.push({
      id: `ev_${++seq}`,
      type,
      userId,
      userName: userLabel(userById.get(userId)).name,
      provider,
      amountCents,
      at: new Date(atMs).toISOString(),
    });
  };

  for (const s of subs) {
    const provider = methodOf(s.provider);
    add('new', s.userId, provider, SUB_CENTS, s.createdAt.getTime());
    const ca = canceledAtOf(s);
    if (ca) add('canceled', s.userId, provider, SUB_CENTS, Date.parse(ca));
    // No 'failed' / 'reminder' events — see file-header degeneracy note (4):
    // there is no firstFailedAt/dunningAttempts column to anchor them to.
  }

  // Renewals = succeeded subscription charges after the user's first one —
  // driven entirely by real `payments` rows, no degeneracy here.
  const firstCharge = new Map<string, number>();
  for (const p of payments) {
    if (p.productType !== 'subscription') continue;
    const t = p.createdAt.getTime();
    const cur = firstCharge.get(p.userId);
    if (cur === undefined || t < cur) firstCharge.set(p.userId, t);
  }
  for (const p of payments) {
    if (p.productType !== 'subscription' || p.status !== 'completed') continue;
    const t = p.createdAt.getTime();
    if (t === firstCharge.get(p.userId)) continue;
    add('renewed', p.userId, methodOf(p.provider), p.amountCents, t);
  }

  return evs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
}

export async function getDunning(): Promise<DunningRow[]> {
  const { subs, users } = await loadAll();
  const userById = new Map(users.map((u) => [u.id, u]));
  return subs
    .filter((s) => subStatus(s.status) === 'past_due')
    .map((s) => {
      const { name, email } = userLabel(userById.get(s.userId));
      const provider = methodOf(s.provider);
      return {
        id: s.id,
        userId: s.userId,
        userName: name,
        userEmail: email,
        provider,
        auto: isAuto(provider),
        amountCents: SUB_CENTS,
        firstFailedAt: null, // degeneracy note (4) — no column
        attempts: 0, // degeneracy note (4) — no column
      };
    })
    .sort((a, b) => (a.firstFailedAt ?? '').localeCompare(b.firstFailedAt ?? ''));
}

export async function getRenewals(days: number): Promise<RenewalRow[]> {
  const { subs, users } = await loadAll();
  const now = Date.now();
  const userById = new Map(users.map((u) => [u.id, u]));
  return subs
    .filter((s) => {
      if (subStatus(s.status) === 'canceled') return false;
      // No currentPeriodEnd (nullable column) → cannot project a renewal date;
      // excluded rather than guessed. See toSubRow's fallback-to-createdAt
      // note for the display-row case, which is a different (display) need.
      if (!s.currentPeriodEnd) return false;
      const cpe = s.currentPeriodEnd.getTime();
      return cpe >= now && cpe <= now + days * DAY;
    })
    .map((s) => {
      const provider = methodOf(s.provider);
      return {
        id: s.id,
        userId: s.userId,
        userName: userLabel(userById.get(s.userId)).name,
        provider,
        auto: isAuto(provider),
        amountCents: SUB_CENTS,
        currentPeriodEnd: iso(s.currentPeriodEnd)!,
      };
    })
    .sort((a, b) => a.currentPeriodEnd.localeCompare(b.currentPeriodEnd));
}

export async function getRenewalSeries(days: number): Promise<RenewalDay[]> {
  const renewals = await getRenewals(days);
  const startDay = new Date();
  startDay.setHours(0, 0, 0, 0);
  const out: RenewalDay[] = [];
  let cum = 0;
  for (let d = 0; d < days; d++) {
    const dayStart = startDay.getTime() + d * DAY;
    const dayEnd = dayStart + DAY - 1;
    const inDay = renewals.filter((r) => {
      const t = Date.parse(r.currentPeriodEnd);
      return t >= dayStart && t <= dayEnd;
    });
    const cents = inDay.reduce((s, r) => s + r.amountCents, 0);
    cum += cents;
    const dd = new Date(dayStart);
    out.push({
      date: `${String(dd.getDate()).padStart(2, '0')}/${String(dd.getMonth() + 1).padStart(2, '0')}`,
      count: inDay.length,
      expectedCents: cents,
      cumulativeCents: cum,
    });
  }
  return out;
}

export async function getCohorts(): Promise<CohortRow[]> {
  const { subs } = await loadAll();
  const now = Date.now();
  const MONTHS = 7; // M0..M6
  const byCohort = new Map<string, DbSub[]>();
  for (const s of subs) {
    const d = s.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const arr = byCohort.get(key) ?? [];
    arr.push(s);
    byCohort.set(key, arr);
  }
  return [...byCohort.keys()]
    .sort()
    .slice(-9)
    .map((key) => {
      const cohortSubs = byCohort.get(key)!;
      const size = cohortSubs.length;
      const [yy, mm] = key.split('-').map(Number);
      const retention: (number | null)[] = [];
      for (let k = 0; k < MONTHS; k++) {
        const monthMark = new Date(yy, mm - 1 + k, 1).getTime();
        if (monthMark > now) {
          retention.push(null);
        } else if (k === 0) {
          retention.push(100);
        } else {
          // See degeneracy note (2): canceledAtOf approximates canceledAt.
          const stillActive = cohortSubs.filter((s) => {
            const ca = canceledAtOf(s);
            const caMs = ca ? Date.parse(ca) : Infinity;
            return caMs >= monthMark;
          }).length;
          retention.push(size ? Math.round((stillActive / size) * 100) : 0);
        }
      }
      return { cohort: key, size, retention };
    });
}

export async function getSubKpis(): Promise<SubKpis> {
  const { subs } = await loadAll();
  const now = Date.now();
  const nowD = new Date(now);
  const activeSubs = subs.filter((s) => subStatus(s.status) === 'active');
  const mrrCurrentCents = activeSubs.length * SUB_CENTS;

  // See degeneracy note (2): canceledAtOf approximates canceledAt.
  const activeAt = (atMs: number) =>
    subs.filter((s) => {
      const st = s.createdAt.getTime();
      const ca = canceledAtOf(s);
      const caMs = ca ? Date.parse(ca) : Infinity;
      return st <= atMs && caMs > atMs;
    });
  const prevMonthEnd = new Date(nowD.getFullYear(), nowD.getMonth(), 0, 23, 59, 59).getTime();
  const mrrPrevMonthCents = activeAt(prevMonthEnd).length * SUB_CENTS;
  const mrrChangeCents = mrrCurrentCents - mrrPrevMonthCents;
  const mrrChangePct = mrrPrevMonthCents ? (mrrChangeCents / mrrPrevMonthCents) * 100 : 0;

  const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime();
  const mrrChurnThisMonthCents =
    subs.filter((s) => {
      const ca = canceledAtOf(s);
      if (!ca) return false;
      const caMs = Date.parse(ca);
      return caMs >= monthStart && caMs <= now;
    }).length * SUB_CENTS;

  const mrrAtRisk30dCents =
    subs.filter((s) => {
      if (subStatus(s.status) !== 'active') return false;
      if (isAuto(methodOf(s.provider))) return false;
      if (!s.currentPeriodEnd) return false;
      const cpe = s.currentPeriodEnd.getTime();
      return cpe >= now && cpe <= now + 30 * DAY;
    }).length * SUB_CENTS;

  return {
    mrrCurrentCents,
    mrrPrevMonthCents,
    mrrChangeCents,
    mrrChangePct,
    mrrProjectedCents: mrrCurrentCents, // optimistic: all renewals confirm (matches mock)
    mrrChurnThisMonthCents,
    mrrAtRisk30dCents,
    activeCount: activeSubs.length,
  };
}

/** Degeneracy note (3): no cancellation_reason column at all — always empty
 *  until that column exists (e.g. from a cancel-flow survey or Stripe portal
 *  webhook payload). */
export async function getCancellationReasons(): Promise<ReasonCount[]> {
  return [];
}
