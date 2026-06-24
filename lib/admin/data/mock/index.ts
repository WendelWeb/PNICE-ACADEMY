/**
 * Mock implementation of the AdminDataSource contract.
 * Reads + mutates the deterministic dataset singleton (./dataset).
 */
import { courses } from '@/data/courses';
import type {
  AdminActor,
  AdminDataSource,
  AdminSubscription,
  AdminUser,
  AnalyticsData,
  AnalyticsQuery,
  AuditAction,
  AuditEntry,
  ActiveLearnerRow,
  CertPage,
  CertQuery,
  CertRow,
  CertVerification,
  CohortRow,
  CourseCompletionRow,
  CourseTimeRow,
  DropoffPoint,
  DunningRow,
  EngagementQuery,
  LessonViewRow,
  StuckUserRow,
  RenewalDay,
  RenewalRow,
  SubDisplayStatus,
  SubEvent,
  SubEventType,
  SubKpis,
  SubPage,
  SubQuery,
  SubRow,
  CountBucket,
  CountryRow,
  CourseAccess,
  CourseRevenue,
  ActivityEvent,
  CourseBucket,
  CourseDetail,
  CourseSalesRow,
  EnrollBucket,
  FunnelStep,
  HeatCell,
  KpiOverview,
  LessonFunnel,
  MethodRevenue,
  MethodVolume,
  PaymentMethod,
  RevenueBucket,
  SubGrowthBucket,
  TxPage,
  TxQuery,
  TxRow,
  UserDetail,
  UserRow,
  UsersPage,
  UsersQuery,
  UserStatus,
  UserType,
  ProductType,
  CheckoutSession,
  PromoCode,
  PromoQuery,
  PromoRow,
  PromoStatus,
  PromoDetail,
  PromoValidation,
  UtmQuery,
  UtmRow,
  AbandonedCartRow,
  OpenCartRow,
  CartStats,
  CartReminderStatus,
  ReferralSortKey,
  ReferrerRow,
  ReferrerDetail,
  TicketQuery,
  TicketPage,
  TicketDetail,
  TicketStatus,
  TicketType,
  SupportTemplate,
  NotificationFeed,
  WebhookQuery,
  WebhookLog,
  ErrorLog,
  SupportSettings,
} from '../types';
import { getMockDataset, type MockDataset } from './dataset';

const DAY = 86_400_000;
const PAGE_SIZE = 25;

/* ----------------------------- date helpers ------------------------------ */
function sameDay(iso: string, now: number): boolean {
  const d = new Date(iso);
  const n = new Date(now);
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}
function withinDays(iso: string, days: number, now: number): boolean {
  const t = Date.parse(iso);
  return t <= now && t >= now - days * DAY;
}
function sameMonth(iso: string, now: number): boolean {
  const d = new Date(iso);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

/* ----------------------------- course lookup ----------------------------- */
const courseBySlug = new Map(courses.map((c) => [c.slug, c]));
function courseTitle(slug: string, locale: 'fr' | 'ht'): string {
  const c = courseBySlug.get(slug);
  return c ? (locale === 'ht' ? c.title_ht : c.title_fr) : slug;
}

/* ----------------------------- enrichment -------------------------------- */
function courseBucket(coursesAccess: number): CourseBucket {
  if (coursesAccess <= 0) return '0';
  if (coursesAccess >= 5) return '5plus';
  return String(coursesAccess) as CourseBucket;
}

function enrichUser(userId: string, ds: MockDataset): UserRow {
  const user = ds.users.find((u) => u.id === userId)!;
  const pays = ds.payments.filter((p) => p.userId === userId);
  const succeeded = pays.filter((p) => p.status === 'succeeded');
  const totalSpentCents = succeeded.reduce((s, p) => s + p.amountCents, 0);

  const sub = ds.subscriptions.find((s) => s.userId === userId);
  const subscriptionStatus = sub?.status ?? null;

  const coursesPurchased = new Set(
    ds.payments
      .filter((p) => p.userId === userId && p.productType === 'course' && p.status === 'succeeded')
      .map((p) => p.courseSlug),
  ).size;

  const enrolls = ds.enrollments.filter((e) => e.userId === userId);
  const coursesAccess = user.isSubscriber
    ? courses.length
    : new Set(enrolls.map((e) => e.courseSlug)).size;

  const type: UserType =
    subscriptionStatus === 'active'
      ? 'active_subscriber'
      : succeeded.length > 0
        ? 'one_off'
        : 'free';

  const lastPaymentAt =
    pays.length > 0
      ? pays.reduce((m, p) => (p.createdAt > m ? p.createdAt : m), pays[0].createdAt)
      : null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    country: user.country,
    city: user.city,
    language: user.language,
    createdAt: user.createdAt,
    type,
    status: user.status,
    subscriptionStatus,
    coursesPurchased,
    coursesAccess,
    totalSpentCents,
    lastActiveAt: user.lastActiveAt,
    lastPaymentAt,
  };
}

/* ----------------------------- filtering --------------------------------- */
function matchesBase(row: UserRow, q: UsersQuery): boolean {
  if (q.search) {
    const s = q.search.trim().toLowerCase();
    const phone = row.phone.replace(/\s/g, '').toLowerCase();
    const hit =
      row.name.toLowerCase().includes(s) ||
      row.email.toLowerCase().includes(s) ||
      phone.includes(s.replace(/\s/g, ''));
    if (!hit) return false;
  }
  if (q.country && row.country !== q.country) return false;
  if (q.language && row.language !== q.language) return false;
  if (q.from && row.createdAt < q.from) return false;
  if (q.to && row.createdAt > q.to + 'T23:59:59.999Z') return false;
  return true;
}

function matchesSegment(row: UserRow, q: UsersQuery, now: number): boolean {
  if (q.type && row.type !== q.type) return false;
  if (q.courses && courseBucket(row.coursesAccess) !== q.courses) return false;
  if (q.segment === 'inactive') {
    const old = Date.parse(row.createdAt) < now - 14 * DAY;
    if (!(old && row.lastActiveAt === null && row.totalSpentCents === 0)) return false;
  }
  return true;
}

function sortRows(rows: UserRow[], q: UsersQuery): UserRow[] {
  const dir = q.dir === 'asc' ? 1 : -1;
  const key = q.sort ?? 'createdAt';
  return [...rows].sort((a, b) => {
    if (key === 'totalSpent') return (a.totalSpentCents - b.totalSpentCents) * dir;
    if (key === 'lastActive') {
      const av = a.lastActiveAt ? Date.parse(a.lastActiveAt) : -Infinity;
      const bv = b.lastActiveAt ? Date.parse(b.lastActiveAt) : -Infinity;
      return (av - bv) * dir;
    }
    return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir;
  });
}

function selectUsers(q: UsersQuery): {
  base: UserRow[];
  filtered: UserRow[];
} {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const all = ds.users.map((u) => enrichUser(u.id, ds));
  const base = all.filter((r) => matchesBase(r, q));

  let filtered = base.filter((r) => matchesSegment(r, q, now));

  if (q.segment === 'top_spenders') {
    filtered = sortRows(filtered, { sort: 'totalSpent', dir: 'desc' }).slice(0, 20);
  } else {
    filtered = sortRows(filtered, q);
  }
  return { base, filtered };
}

/* ----------------------------- audit helper ------------------------------ */
function appendAudit(
  ds: MockDataset,
  e: Omit<AuditEntry, 'id' | 'createdAt'>,
): void {
  ds.auditLog.push({
    id: `aud_${(ds.auditLog.length + 1).toString().padStart(5, '0')}`,
    createdAt: new Date().toISOString(),
    ...e,
  });
}

/* ======================================================================== */
/* Contract implementation                                                   */
/* ======================================================================== */

async function getKpiOverview(): Promise<KpiOverview> {
  const { users, payments, subscriptions, enrollments, referenceNow } = getMockDataset();
  const now = Date.parse(referenceNow);

  const succeeded = payments.filter((p) => p.status === 'succeeded');
  const refunded = payments.filter((p) => p.status === 'refunded');

  const activeSubscribers = subscriptions.filter((s) => s.status === 'active').length;
  const canceledSubscribers = subscriptions.filter((s) => s.status === 'canceled').length;

  const totalRevenueCents = succeeded.reduce((s, p) => s + p.amountCents, 0);
  const revenueThisMonthCents = succeeded
    .filter((p) => sameMonth(p.createdAt, now))
    .reduce((s, p) => s + p.amountCents, 0);

  const payingUsers = new Set(succeeded.map((p) => p.userId)).size;

  const newUsers30d = users.filter((u) => withinDays(u.createdAt, 30, now)).length;
  const visitorsThisMonth = Math.round(newUsers30d / 0.08);
  const conversionVisitorToAccountPct = visitorsThisMonth
    ? (newUsers30d / visitorsThisMonth) * 100
    : 0;
  const conversionAccountToPayingPct = users.length
    ? (payingUsers / users.length) * 100
    : 0;

  const churnDenom = activeSubscribers + canceledSubscribers;
  const churnRatePct = churnDenom ? (canceledSubscribers / churnDenom) * 100 : 0;

  const arpuCents = users.length ? Math.round(totalRevenueCents / users.length) : 0;
  const revenuePerPayingCents = payingUsers ? totalRevenueCents / payingUsers : 0;
  const churnFraction = Math.min(Math.max(churnRatePct / 100, 0.05), 0.95);
  const ltvCents = Math.round(revenuePerPayingCents / churnFraction);

  const subAmount = subscriptions[0]?.amountCents ?? 0;

  return {
    currency: 'USD',
    totalUsers: users.length,
    activeSubscribers,
    mrrCents: activeSubscribers * subAmount,
    totalRevenueCents,
    revenueThisMonthCents,
    newUsersToday: users.filter((u) => sameDay(u.createdAt, now)).length,
    newUsers7d: users.filter((u) => withinDays(u.createdAt, 7, now)).length,
    newUsers30d,
    newEnrollmentsToday: enrollments.filter((e) => sameDay(e.enrolledAt, now)).length,
    newEnrollments7d: enrollments.filter((e) => withinDays(e.enrolledAt, 7, now)).length,
    newEnrollments30d: enrollments.filter((e) => withinDays(e.enrolledAt, 30, now)).length,
    visitorsThisMonth,
    conversionVisitorToAccountPct,
    conversionAccountToPayingPct,
    activeLearners7d: users.filter((u) => u.lastActiveAt && withinDays(u.lastActiveAt, 7, now))
      .length,
    activeLearners30d: users.filter((u) => u.lastActiveAt && withinDays(u.lastActiveAt, 30, now))
      .length,
    churnRatePct,
    arpuCents,
    ltvCents,
    refundsCount: refunded.length,
    refundsAmountCents: refunded.reduce((s, p) => s + p.amountCents, 0),
  };
}

async function getUsers(query: UsersQuery): Promise<UsersPage> {
  const { base, filtered } = selectUsers(query);

  const byType: Record<UserType, number> = {
    active_subscriber: 0,
    one_off: 0,
    free: 0,
  };
  const byCourses: Record<CourseBucket, number> = {
    '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5plus': 0,
  };
  for (const r of base) {
    byType[r.type]++;
    byCourses[courseBucket(r.coursesAccess)]++;
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  return {
    rows,
    total: filtered.length,
    page,
    pageSize,
    segmentCounts: { all: base.length, byType, byCourses },
  };
}

async function exportUsers(query: UsersQuery): Promise<UserRow[]> {
  const { filtered } = selectUsers(query);
  return filtered;
}

async function getUserById(id: string): Promise<UserDetail | null> {
  const ds = getMockDataset();
  const raw = ds.users.find((u) => u.id === id);
  if (!raw) return null;

  const row = enrichUser(id, ds);
  const sub = ds.subscriptions.find((s) => s.userId === id);

  const payments = ds.payments
    .filter((p) => p.userId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const progressFor = (slug: string) =>
    ds.progress.find((p) => p.userId === id && p.courseSlug === slug);

  const courses_: CourseAccess[] = ds.enrollments
    .filter((e) => e.userId === id)
    .map((e) => {
      const c = courseBySlug.get(e.courseSlug);
      const pr = progressFor(e.courseSlug);
      const status: 'active' | 'expired' =
        e.source === 'subscription' && sub?.status !== 'active' ? 'expired' : 'active';
      return {
        slug: e.courseSlug,
        code: c?.code ?? e.courseSlug,
        title_fr: c?.title_fr ?? e.courseSlug,
        title_ht: c?.title_ht ?? e.courseSlug,
        source: e.source,
        status,
        enrolledAt: e.enrolledAt,
        lessonsDone: pr?.lessonsDone ?? 0,
        lessonsTotal: pr?.lessonsTotal ?? c?.lessons.length ?? 0,
      };
    })
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));

  const certificates = ds.certificates
    .filter((c) => c.userId === id)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  const credits = ds.creditLedger
    .filter((c) => c.userId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const creditBalanceCents = credits.reduce((s, c) => s + c.amountCents, 0);

  // Activity log — synthesized from the domain records.
  const activity: ActivityEvent[] = [];
  let aSeq = 0;
  const ev = (type: ActivityEvent['type'], at: string, fr: string, ht: string) =>
    activity.push({ id: `act_${id}_${++aSeq}`, type, at, label_fr: fr, label_ht: ht });

  ev('account_created', raw.createdAt, 'Création du compte', 'Kreyasyon kont lan');
  if (sub) ev('subscription', sub.startedAt, 'Début d’abonnement', 'Kòmansman abonman');
  for (const p of ds.payments.filter((p) => p.userId === id)) {
    if (p.status === 'succeeded' && p.productType === 'course') {
      ev('purchase', p.createdAt, `Achat — ${courseTitle(p.courseSlug!, 'fr')}`, `Acha — ${courseTitle(p.courseSlug!, 'ht')}`);
    } else if (p.status === 'refunded') {
      ev('refund', p.createdAt, 'Remboursement', 'Ranbousman');
    }
  }
  for (const e of ds.enrollments.filter((e) => e.userId === id)) {
    ev('enrollment', e.enrolledAt, `Inscription — ${courseTitle(e.courseSlug, 'fr')}`, `Enskripsyon — ${courseTitle(e.courseSlug, 'ht')}`);
  }
  for (const pr of ds.progress.filter((p) => p.userId === id && p.lessonsDone > 0)) {
    ev('lesson', pr.lastActivityAt, `Leçon vue — ${courseTitle(pr.courseSlug, 'fr')}`, `Leson gade — ${courseTitle(pr.courseSlug, 'ht')}`);
  }
  for (const c of certificates) {
    ev('certificate', c.issuedAt, `Certificat — ${courseTitle(c.courseSlug, 'fr')}`, `Sètifika — ${courseTitle(c.courseSlug, 'ht')}`);
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  const audit = ds.auditLog
    .filter((a) => a.targetUserId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const acquisition = ds.acquisition.find((a) => a.userId === id) ?? null;

  return {
    user: { ...row, certificateName: raw.certificateName },
    payments,
    courses: courses_,
    certificates,
    credits,
    creditBalanceCents,
    activity: activity.slice(0, 60),
    audit,
    acquisition,
  };
}

/* ============================ transactions ============================== */
const ALL_METHODS: PaymentMethod[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];

function txMatchesBase(r: TxRow, q: TxQuery): boolean {
  if (q.search) {
    const s = q.search.trim().toLowerCase();
    if (
      !r.id.toLowerCase().includes(s) &&
      !r.userName.toLowerCase().includes(s) &&
      !r.userEmail.toLowerCase().includes(s)
    )
      return false;
  }
  if (q.method && r.method !== q.method) return false;
  if (q.productType && r.productType !== q.productType) return false;
  if (q.from && r.createdAt < q.from) return false;
  if (q.to && r.createdAt > q.to + 'T23:59:59.999Z') return false;
  return true;
}

function selectTx(query: TxQuery): { filtered: TxRow[]; counts: TxPage['counts'] } {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const userById = new Map(ds.users.map((u) => [u.id, u]));

  const rows: TxRow[] = ds.payments.map((p) => {
    const u = userById.get(p.userId);
    const c = p.courseSlug ? courseBySlug.get(p.courseSlug) : null;
    const isSub = p.productType === 'subscription';
    return {
      id: p.id,
      userId: p.userId,
      userName: u?.name ?? '—',
      userEmail: u?.email ?? '—',
      productType: p.productType,
      productCode: isSub ? null : c?.code ?? null,
      productTitle_fr: isSub ? 'Abonnement mensuel' : c?.title_fr ?? p.courseSlug ?? '—',
      productTitle_ht: isSub ? 'Abònman mansyèl' : c?.title_ht ?? p.courseSlug ?? '—',
      method: p.method,
      status: p.status,
      amountCents: p.amountCents,
      createdAt: p.createdAt,
      stalePending: p.status === 'pending' && now - Date.parse(p.createdAt) > DAY,
    };
  });

  const base = rows.filter((r) => txMatchesBase(r, query));
  const counts = {
    all: base.length,
    failed: base.filter((r) => r.status === 'failed').length,
    pending: base.filter((r) => r.status === 'pending').length,
  };

  let filtered = base;
  if (query.segment === 'failed_pending') {
    filtered = filtered.filter((r) => r.status === 'failed' || r.status === 'pending');
  }
  if (query.status) filtered = filtered.filter((r) => r.status === query.status);

  const dir = query.dir === 'asc' ? 1 : -1;
  filtered = [...filtered].sort((a, b) =>
    query.sort === 'amount'
      ? (a.amountCents - b.amountCents) * dir
      : (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir,
  );

  return { filtered, counts };
}

async function getTransactions(query: TxQuery): Promise<TxPage> {
  const { filtered, counts } = selectTx(query);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? 50;
  const start = (page - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    counts,
  };
}

async function exportTransactions(query: TxQuery): Promise<TxRow[]> {
  return selectTx(query).filtered;
}

async function getMethodVolumes(): Promise<MethodVolume[]> {
  const ds = getMockDataset();
  return ALL_METHODS.map((method) => {
    const ps = ds.payments.filter((p) => p.method === method && p.status === 'succeeded');
    return {
      method,
      grossCents: ps.reduce((s, p) => s + p.amountCents, 0),
      count: ps.length,
    };
  });
}

/* ============================ course stats ============================== */
async function getCourseSales(): Promise<CourseSalesRow[]> {
  const { courseStats } = getMockDataset();
  return courseStats.map((s) => ({
    ...s,
    completionRatePct: s.enrollments ? (s.completions / s.enrollments) * 100 : 0,
  }));
}

async function getCourseDetail(slug: string): Promise<CourseDetail | null> {
  const ds = getMockDataset();
  const stat = ds.courseStats.find((s) => s.slug === slug);
  const course = courseBySlug.get(slug);
  if (!stat || !course) return null;

  const enrolledUserIds = Array.from(
    new Set(ds.enrollments.filter((e) => e.courseSlug === slug).map((e) => e.userId)),
  );
  const doneByUser = new Map(
    ds.progress
      .filter((p) => p.courseSlug === slug)
      .map((p) => [p.userId, p.lessonsDone]),
  );
  const enrolled = enrolledUserIds.length;
  const lessonsDoneValues = enrolledUserIds.map((id) => doneByUser.get(id) ?? 0);

  const lessons: LessonFunnel[] = course.lessons.map((lesson, i) => {
    const opened = lessonsDoneValues.filter((d) => d >= i).length;
    const completed = lessonsDoneValues.filter((d) => d >= i + 1).length;
    const neverOpened = enrolled - opened;
    const hash = [...slug].reduce((a, ch) => a + ch.charCodeAt(0), 0) + i * 7;
    return {
      index: i,
      title_fr: lesson.title_fr,
      title_ht: lesson.title_ht,
      opened,
      completed,
      neverOpened,
      dropPct: opened ? ((opened - completed) / opened) * 100 : 0,
      avgWatchMinutes: 5 + (hash % 12),
    };
  });

  // Worst lesson = largest absolute opened→completed drop.
  let worstLessonIndex: number | null = null;
  let worstDrop = -1;
  for (const l of lessons) {
    const drop = l.opened - l.completed;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstLessonIndex = l.index;
    }
  }

  return {
    course: {
      ...stat,
      completionRatePct: stat.enrollments ? (stat.completions / stat.enrollments) * 100 : 0,
    },
    enrolled,
    lessons,
    worstLessonIndex,
  };
}

/* ============================== analytics =============================== */
const HT_COUNTRY = 'Haïti';
const CITY_COUNTRY: Record<string, string> = {
  Miami: 'États-Unis', Brooklyn: 'États-Unis', Boston: 'États-Unis', Orlando: 'États-Unis',
  Atlanta: 'États-Unis', Newark: 'États-Unis', Tampa: 'États-Unis',
  Montréal: 'Canada', Paris: 'France', Santiago: 'Rép. dominicaine',
};
function countryOf(u: { country: string; city: string }): string {
  return u.country === 'HT' ? HT_COUNTRY : CITY_COUNTRY[u.city] ?? 'Autre';
}

type Bucket = { start: number; end: number; label: string };
function buildBuckets(fromMs: number, toMs: number, gran: AnalyticsQuery['granularity']): Bucket[] {
  const out: Bucket[] = [];
  if (gran === 'month') {
    const d = new Date(fromMs);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() <= toMs) {
      const start = d.getTime();
      const next = new Date(d);
      next.setMonth(d.getMonth() + 1);
      out.push({
        start,
        end: next.getTime() - 1,
        label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`,
      });
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    const step = gran === 'week' ? 7 * DAY : DAY;
    const s = new Date(fromMs);
    s.setHours(0, 0, 0, 0);
    for (let t = s.getTime(); t <= toMs; t += step) {
      const dd = new Date(t);
      out.push({
        start: t,
        end: t + step - 1,
        label: `${String(dd.getDate()).padStart(2, '0')}/${String(dd.getMonth() + 1).padStart(2, '0')}`,
      });
    }
  }
  return out;
}
function bucketIndex(buckets: Bucket[], ms: number): number {
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i].start && ms <= buckets[i].end) return i;
  }
  return -1;
}

async function getAnalytics(q: AnalyticsQuery): Promise<AnalyticsData> {
  const ds = getMockDataset();
  const fromMs = Date.parse(q.from);
  const toMs = Date.parse(q.to);
  const inRange = (iso: string) => {
    const t = Date.parse(iso);
    return t >= fromMs && t <= toMs;
  };
  const buckets = buildBuckets(fromMs, toMs, q.granularity);
  const userById = new Map(ds.users.map((u) => [u.id, u]));

  // 1. Revenue over time (subscription vs course).
  const revenueSeries: RevenueBucket[] = buckets.map((b) => ({
    bucket: b.label, subscriptionCents: 0, courseCents: 0, totalCents: 0,
  }));
  let subscriptionRevenueCents = 0;
  let courseRevenueCents = 0;
  for (const p of ds.payments) {
    if (p.status !== 'succeeded' || !inRange(p.createdAt)) continue;
    const i = bucketIndex(buckets, Date.parse(p.createdAt));
    if (i < 0) continue;
    if (p.productType === 'subscription') {
      revenueSeries[i].subscriptionCents += p.amountCents;
      subscriptionRevenueCents += p.amountCents;
    } else {
      revenueSeries[i].courseCents += p.amountCents;
      courseRevenueCents += p.amountCents;
    }
    revenueSeries[i].totalCents += p.amountCents;
  }

  // 2. Signups.
  const signupsSeries: CountBucket[] = buckets.map((b) => ({ bucket: b.label, count: 0 }));
  for (const u of ds.users) {
    if (!inRange(u.createdAt)) continue;
    const i = bucketIndex(buckets, Date.parse(u.createdAt));
    if (i >= 0) signupsSeries[i].count++;
  }

  // 3. Enrollments + new subscriptions.
  const enrollmentsSeries: EnrollBucket[] = buckets.map((b) => ({
    bucket: b.label, enrollments: 0, subscriptions: 0,
  }));
  for (const e of ds.enrollments) {
    if (!inRange(e.enrolledAt)) continue;
    const i = bucketIndex(buckets, Date.parse(e.enrolledAt));
    if (i >= 0) enrollmentsSeries[i].enrollments++;
  }
  for (const s of ds.subscriptions) {
    if (!inRange(s.startedAt)) continue;
    const i = bucketIndex(buckets, Date.parse(s.startedAt));
    if (i >= 0) enrollmentsSeries[i].subscriptions++;
  }

  // 4. Revenue by method.
  const methodMap = new Map<PaymentMethod, number>();
  for (const p of ds.payments) {
    if (p.status !== 'succeeded' || !inRange(p.createdAt)) continue;
    methodMap.set(p.method, (methodMap.get(p.method) ?? 0) + p.amountCents);
  }
  const methodTotal = [...methodMap.values()].reduce((a, b) => a + b, 0);
  const revenueByMethod: MethodRevenue[] = ALL_METHODS.map((m) => {
    const cents = methodMap.get(m) ?? 0;
    return { method: m, cents, pct: methodTotal ? (cents / methodTotal) * 100 : 0 };
  })
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  // 5. Revenue by course.
  const revByCourse = new Map<string, { rev: number; enr: number }>();
  for (const p of ds.payments) {
    if (p.status !== 'succeeded' || p.productType !== 'course' || !p.courseSlug) continue;
    if (!inRange(p.createdAt)) continue;
    const e = revByCourse.get(p.courseSlug) ?? { rev: 0, enr: 0 };
    e.rev += p.amountCents;
    e.enr++;
    revByCourse.set(p.courseSlug, e);
  }
  const revenueByCourse: CourseRevenue[] = courses
    .map((c) => {
      const e = revByCourse.get(c.slug) ?? { rev: 0, enr: 0 };
      return {
        code: c.code, slug: c.slug, title_fr: c.title_fr, title_ht: c.title_ht,
        revenueCents: e.rev, enrollments: e.enr,
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);

  // 6. Subscription growth.
  const subscriptionGrowth: SubGrowthBucket[] = buckets.map((b) => {
    let created = 0;
    let canceled = 0;
    let activeCumulative = 0;
    for (const s of ds.subscriptions) {
      const st = Date.parse(s.startedAt);
      const ca = s.canceledAt ? Date.parse(s.canceledAt) : Infinity;
      if (st >= b.start && st <= b.end) created++;
      if (ca >= b.start && ca <= b.end) canceled++;
      if (st <= b.end && ca > b.end) activeCumulative++;
    }
    return { bucket: b.label, created, canceled, activeCumulative };
  });

  // 7. Geo (users + revenue in range, by country).
  const usersInRange = ds.users.filter((u) => inRange(u.createdAt));
  const countryMap = new Map<string, { users: number; rev: number }>();
  for (const u of usersInRange) {
    const c = countryOf(u);
    const e = countryMap.get(c) ?? { users: 0, rev: 0 };
    e.users++;
    countryMap.set(c, e);
  }
  for (const p of ds.payments) {
    if (p.status !== 'succeeded' || !inRange(p.createdAt)) continue;
    const u = userById.get(p.userId);
    if (!u) continue;
    const c = countryOf(u);
    const e = countryMap.get(c) ?? { users: 0, rev: 0 };
    e.rev += p.amountCents;
    countryMap.set(c, e);
  }
  const topCountries: CountryRow[] = [...countryMap.entries()]
    .map(([country, e]) => ({ country, users: e.users, revenueCents: e.rev }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 10);

  // 8. Language split.
  const language = { ht: { users: 0, revenueCents: 0 }, fr: { users: 0, revenueCents: 0 } };
  for (const u of usersInRange) language[u.language].users++;
  for (const p of ds.payments) {
    if (p.status !== 'succeeded' || !inRange(p.createdAt)) continue;
    const u = userById.get(p.userId);
    if (u) language[u.language].revenueCents += p.amountCents;
  }

  // 9. Conversion funnel (cohort = users created in range).
  const cohortIds = new Set(usersInRange.map((u) => u.id));
  // Each step is a strict subset of the previous → a true (monotonic) funnel.
  const paidIds = new Set(
    ds.payments.filter((p) => p.status === 'succeeded' && cohortIds.has(p.userId)).map((p) => p.userId),
  );
  const watched = new Set(usersInRange.filter((u) => u.lastActiveAt).map((u) => u.id));
  const lessonIds = new Set([...paidIds].filter((id) => watched.has(id)));
  const completedRaw = new Set(
    ds.progress
      .filter((pr) => pr.lessonsTotal > 0 && pr.lessonsDone >= pr.lessonsTotal)
      .map((pr) => pr.userId),
  );
  const completedIds = new Set([...lessonIds].filter((id) => completedRaw.has(id)));
  const certRaw = new Set(ds.certificates.map((c) => c.userId));
  const certIds = new Set([...completedIds].filter((id) => certRaw.has(id)));
  const accounts = usersInRange.length;
  // visitors is MOCK — needs a real traffic-analytics tool (no visit events in the DB).
  const visitors = Math.round(accounts / 0.08);
  const funnel: FunnelStep[] = [
    { step: 'visitors', count: visitors },
    { step: 'accounts', count: accounts },
    { step: 'firstPurchase', count: paidIds.size },
    { step: 'firstLesson', count: lessonIds.size },
    { step: 'completed', count: completedIds.size },
    { step: 'certificate', count: certIds.size },
  ];

  // 10. Watch heatmap (lesson activity in range, weekday × hour, Haiti UTC-5).
  const heat = new Map<string, number>();
  for (const pr of ds.progress) {
    if (pr.lessonsDone <= 0 || !inRange(pr.lastActivityAt)) continue;
    const local = new Date(Date.parse(pr.lastActivityAt) - 5 * 3600 * 1000); // UTC-5
    const key = `${local.getUTCDay()}-${local.getUTCHours()}`;
    heat.set(key, (heat.get(key) ?? 0) + 1);
  }
  const heatmap: HeatCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({ day, hour, count: heat.get(`${day}-${hour}`) ?? 0 });
    }
  }

  return {
    granularity: q.granularity,
    revenueSeries,
    revenueTotalCents: subscriptionRevenueCents + courseRevenueCents,
    subscriptionRevenueCents,
    courseRevenueCents,
    signupsSeries,
    enrollmentsSeries,
    revenueByMethod,
    revenueByCourse,
    subscriptionGrowth,
    geo: {
      htUsers: usersInRange.filter((u) => u.country === 'HT').length,
      diasporaUsers: usersInRange.filter((u) => u.country === 'diaspora').length,
      topCountries,
    },
    language,
    funnel,
    heatmap,
  };
}

/* ============================ subscriptions ============================== */
const AUTO_SUB_PROVIDERS: PaymentMethod[] = ['card', 'paypal'];
const isAuto = (p: PaymentMethod) => AUTO_SUB_PROVIDERS.includes(p);

function toSubRow(s: AdminSubscription, now: number, userById: Map<string, AdminUser>): SubRow {
  const u = userById.get(s.userId);
  const auto = isAuto(s.provider);
  let status: SubDisplayStatus = s.status;
  // Manual-provider active sub whose renewal is imminent → pending_renewal.
  if (s.status === 'active' && !auto && Date.parse(s.currentPeriodEnd) - now <= 3 * DAY) {
    status = 'pending_renewal';
  }
  return {
    id: s.id,
    userId: s.userId,
    userName: u?.name ?? '—',
    userEmail: u?.email ?? '—',
    provider: s.provider,
    auto,
    status,
    startedAt: s.startedAt,
    currentPeriodEnd: s.currentPeriodEnd,
    mrrCents: s.status === 'active' ? s.amountCents : 0,
    amountCents: s.amountCents,
  };
}

async function getSubscriptions(query: SubQuery): Promise<SubPage> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  const rows = ds.subscriptions.map((s) => toSubRow(s, now, userById));
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
  const pageSize = query.pageSize ?? 25;
  const start = (page - 1) * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, counts };
}

async function getSubEvents(): Promise<SubEvent[]> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const cutoff = now - 30 * DAY;
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  const evs: SubEvent[] = [];
  let seq = 0;
  const add = (type: SubEventType, userId: string, provider: PaymentMethod, amountCents: number, atMs: number) => {
    if (atMs < cutoff || atMs > now) return;
    evs.push({
      id: `ev_${++seq}`,
      type,
      userId,
      userName: userById.get(userId)?.name ?? '—',
      provider,
      amountCents,
      at: new Date(atMs).toISOString(),
    });
  };

  for (const s of ds.subscriptions) {
    add('new', s.userId, s.provider, s.amountCents, Date.parse(s.startedAt));
    if (s.canceledAt) add('canceled', s.userId, s.provider, s.amountCents, Date.parse(s.canceledAt));
    if (s.firstFailedAt) add('failed', s.userId, s.provider, s.amountCents, Date.parse(s.firstFailedAt));
    if (s.status === 'past_due' && s.dunningAttempts && s.firstFailedAt) {
      for (let k = 0; k < s.dunningAttempts; k++) {
        add('reminder', s.userId, s.provider, s.amountCents, Date.parse(s.firstFailedAt) + (k + 1) * 2 * DAY);
      }
    }
  }
  // Renewals = succeeded subscription charges after the first.
  const firstCharge = new Map<string, number>();
  for (const p of ds.payments) {
    if (p.productType !== 'subscription') continue;
    const t = Date.parse(p.createdAt);
    const cur = firstCharge.get(p.userId);
    if (cur === undefined || t < cur) firstCharge.set(p.userId, t);
  }
  for (const p of ds.payments) {
    if (p.productType !== 'subscription' || p.status !== 'succeeded') continue;
    const t = Date.parse(p.createdAt);
    if (t === firstCharge.get(p.userId)) continue;
    add('renewed', p.userId, p.method, p.amountCents, t);
  }

  return evs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
}

async function getDunning(): Promise<DunningRow[]> {
  const ds = getMockDataset();
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  return ds.subscriptions
    .filter((s) => s.status === 'past_due')
    .map((s) => {
      const u = userById.get(s.userId);
      return {
        id: s.id,
        userId: s.userId,
        userName: u?.name ?? '—',
        userEmail: u?.email ?? '—',
        provider: s.provider,
        auto: isAuto(s.provider),
        amountCents: s.amountCents,
        firstFailedAt: s.firstFailedAt ?? null,
        attempts: s.dunningAttempts ?? 0,
      };
    })
    .sort((a, b) => (a.firstFailedAt ?? '').localeCompare(b.firstFailedAt ?? ''));
}

async function getRenewals(days: number): Promise<RenewalRow[]> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  return ds.subscriptions
    .filter((s) => {
      if (s.status === 'canceled') return false;
      const cpe = Date.parse(s.currentPeriodEnd);
      return cpe >= now && cpe <= now + days * DAY;
    })
    .map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: userById.get(s.userId)?.name ?? '—',
      provider: s.provider,
      auto: isAuto(s.provider),
      amountCents: s.amountCents,
      currentPeriodEnd: s.currentPeriodEnd,
    }))
    .sort((a, b) => a.currentPeriodEnd.localeCompare(b.currentPeriodEnd));
}

async function getRenewalSeries(days: number): Promise<RenewalDay[]> {
  const renewals = await getRenewals(days);
  const ds = getMockDataset();
  const startDay = new Date(Date.parse(ds.referenceNow));
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

async function getCohorts(): Promise<CohortRow[]> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const MONTHS = 7; // M0..M6
  const byCohort = new Map<string, AdminSubscription[]>();
  for (const s of ds.subscriptions) {
    const d = new Date(s.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const arr = byCohort.get(key) ?? [];
    arr.push(s);
    byCohort.set(key, arr);
  }
  return [...byCohort.keys()]
    .sort()
    .slice(-9)
    .map((key) => {
      const subs = byCohort.get(key)!;
      const size = subs.length;
      const [yy, mm] = key.split('-').map(Number);
      const retention: (number | null)[] = [];
      for (let k = 0; k < MONTHS; k++) {
        const monthMark = new Date(yy, mm - 1 + k, 1).getTime();
        if (monthMark > now) {
          retention.push(null);
        } else if (k === 0) {
          retention.push(100);
        } else {
          const stillActive = subs.filter((s) => {
            const ca = s.canceledAt ? Date.parse(s.canceledAt) : Infinity;
            return ca >= monthMark;
          }).length;
          retention.push(size ? Math.round((stillActive / size) * 100) : 0);
        }
      }
      return { cohort: key, size, retention };
    });
}

async function getSubKpis(): Promise<SubKpis> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const nowD = new Date(now);
  const activeSubs = ds.subscriptions.filter((s) => s.status === 'active');
  const mrrCurrentCents = activeSubs.reduce((s, x) => s + x.amountCents, 0);

  const activeAt = (atMs: number) =>
    ds.subscriptions.filter((s) => {
      const st = Date.parse(s.startedAt);
      const ca = s.canceledAt ? Date.parse(s.canceledAt) : Infinity;
      return st <= atMs && ca > atMs;
    });
  const prevMonthEnd = new Date(nowD.getFullYear(), nowD.getMonth(), 0, 23, 59, 59).getTime();
  const mrrPrevMonthCents = activeAt(prevMonthEnd).reduce((s, x) => s + x.amountCents, 0);
  const mrrChangeCents = mrrCurrentCents - mrrPrevMonthCents;
  const mrrChangePct = mrrPrevMonthCents ? (mrrChangeCents / mrrPrevMonthCents) * 100 : 0;

  const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime();
  const mrrChurnThisMonthCents = ds.subscriptions
    .filter((s) => s.canceledAt && Date.parse(s.canceledAt) >= monthStart && Date.parse(s.canceledAt) <= now)
    .reduce((s, x) => s + x.amountCents, 0);

  const mrrAtRisk30dCents = ds.subscriptions
    .filter(
      (s) =>
        s.status === 'active' &&
        !isAuto(s.provider) &&
        Date.parse(s.currentPeriodEnd) >= now &&
        Date.parse(s.currentPeriodEnd) <= now + 30 * DAY,
    )
    .reduce((s, x) => s + x.amountCents, 0);

  return {
    mrrCurrentCents,
    mrrPrevMonthCents,
    mrrChangeCents,
    mrrChangePct,
    mrrProjectedCents: mrrCurrentCents, // optimistic: all renewals confirm
    mrrChurnThisMonthCents,
    mrrAtRisk30dCents,
    activeCount: activeSubs.length,
  };
}

async function getCancellationReasons(): Promise<{ reason: string; count: number }[]> {
  const ds = getMockDataset();
  const map = new Map<string, number>();
  for (const s of ds.subscriptions) {
    if (s.status === 'canceled' && s.cancellationReason) {
      map.set(s.cancellationReason, (map.get(s.cancellationReason) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/* ========================= engagement & certs =========================== */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Per-course enrolled user ids + their lessonsDone, computed once. */
function courseProgress(slug: string) {
  const ds = getMockDataset();
  const enrolledIds = [...new Set(ds.enrollments.filter((e) => e.courseSlug === slug).map((e) => e.userId))];
  const doneByUser = new Map(
    ds.progress.filter((p) => p.courseSlug === slug).map((p) => [p.userId, p.lessonsDone] as const),
  );
  return { enrolledIds, doneByUser };
}

async function getCourseCompletion(): Promise<CourseCompletionRow[]> {
  return courses.map((c) => {
    const { enrolledIds, doneByUser } = courseProgress(c.slug);
    const enrolled = enrolledIds.length;
    const startedCount = enrolledIds.filter((id) => (doneByUser.get(id) ?? 0) > 0).length;
    const completedCount = enrolledIds.filter((id) => (doneByUser.get(id) ?? 0) >= c.lessons.length).length;
    return {
      slug: c.slug,
      code: c.code,
      title_fr: c.title_fr,
      title_ht: c.title_ht,
      enrolled,
      startedCount,
      completedCount,
      completionRatePct: enrolled ? (completedCount / enrolled) * 100 : 0,
      lessonsCount: c.lessons.length,
    };
  });
}

async function getCourseTimes(): Promise<CourseTimeRow[]> {
  const ds = getMockDataset();
  return courses.map((c) => {
    const enrolledAtByUser = new Map(
      ds.enrollments.filter((e) => e.courseSlug === c.slug).map((e) => [e.userId, e.enrolledAt] as const),
    );
    const completers = ds.progress.filter(
      (p) =>
        p.courseSlug === c.slug &&
        p.lessonsTotal > 0 &&
        p.lessonsDone >= p.lessonsTotal &&
        enrolledAtByUser.has(p.userId),
    );
    const days = completers.map((p) =>
      Math.max(0, (Date.parse(p.lastActivityAt) - Date.parse(enrolledAtByUser.get(p.userId)!)) / DAY),
    );
    return {
      slug: c.slug,
      code: c.code,
      title_fr: c.title_fr,
      title_ht: c.title_ht,
      completers: completers.length,
      medianDays: Math.round(median(days)),
      meanDays: Math.round(days.reduce((a, b) => a + b, 0) / (days.length || 1)),
    };
  });
}

async function getLessonViews(): Promise<{ top: LessonViewRow[]; bottom: LessonViewRow[] }> {
  const all: LessonViewRow[] = [];
  for (const c of courses) {
    const { enrolledIds, doneByUser } = courseProgress(c.slug);
    const enrolled = enrolledIds.length;
    c.lessons.forEach((lesson, i) => {
      // Reached/opened lesson i = lessonsDone >= i (consistent with course-detail drop-off).
      const views = enrolledIds.filter((id) => (doneByUser.get(id) ?? 0) >= i).length;
      all.push({
        slug: c.slug,
        code: c.code,
        courseTitle_fr: c.title_fr,
        courseTitle_ht: c.title_ht,
        lessonIndex: i,
        lessonTitle_fr: lesson.title_fr,
        lessonTitle_ht: lesson.title_ht,
        views,
        enrolled,
        abandonPct: enrolled ? ((enrolled - views) / enrolled) * 100 : 0,
      });
    });
  }
  return {
    top: [...all].sort((a, b) => b.views - a.views).slice(0, 10),
    bottom: [...all].sort((a, b) => a.views - b.views).slice(0, 10),
  };
}

async function getAggregateDropoff(): Promise<DropoffPoint[]> {
  const maxLessons = Math.max(...courses.map((c) => c.lessons.length));
  const perCourse = courses.map((c) => ({ c, ...courseProgress(c.slug) }));
  const out: DropoffPoint[] = [];
  for (let p = 1; p <= maxLessons; p++) {
    let reached = 0;
    let totalEnrolled = 0;
    for (const { c, enrolledIds, doneByUser } of perCourse) {
      if (c.lessons.length < p) continue;
      totalEnrolled += enrolledIds.length;
      // Reached lesson at position p (0-indexed p-1).
      reached += enrolledIds.filter((id) => (doneByUser.get(id) ?? 0) >= p - 1).length;
    }
    out.push({ position: p, learners: reached, pct: totalEnrolled ? (reached / totalEnrolled) * 100 : 0 });
  }
  return out;
}

async function getActiveLearners(query: EngagementQuery): Promise<ActiveLearnerRow[]> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const days = query.days ?? 7;
  const out: ActiveLearnerRow[] = [];
  for (const u of ds.users) {
    if (!u.lastActiveAt || now - Date.parse(u.lastActiveAt) > days * DAY) continue;
    const userProg = ds.progress.filter((p) => p.userId === u.id);
    if (userProg.length === 0) continue;
    let chosen = userProg[0];
    if (query.course) {
      const cp = userProg.find((p) => p.courseSlug === query.course);
      if (!cp) continue;
      chosen = cp;
    } else {
      // Course in progress: prefer truly-started-but-unfinished, most recent activity.
      const byActivity = (a: typeof userProg[number], b: typeof userProg[number]) =>
        b.lastActivityAt.localeCompare(a.lastActivityAt);
      chosen =
        [...userProg].filter((p) => p.lessonsDone > 0 && p.lessonsDone < p.lessonsTotal).sort(byActivity)[0] ??
        [...userProg].filter((p) => p.lessonsDone > 0).sort(byActivity)[0] ??
        [...userProg].sort(byActivity)[0];
    }
    const c = courseBySlug.get(chosen.courseSlug);
    out.push({
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      courseSlug: chosen.courseSlug,
      courseTitle_fr: c?.title_fr ?? chosen.courseSlug,
      courseTitle_ht: c?.title_ht ?? chosen.courseSlug,
      lessonsDone: chosen.lessonsDone,
      lessonsTotal: chosen.lessonsTotal,
      lastActiveAt: u.lastActiveAt,
    });
  }
  return out.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

async function getStuckUsers(): Promise<StuckUserRow[]> {
  const ds = getMockDataset();
  const paidByUser = new Map<string, number>();
  for (const p of ds.payments) {
    if (p.status === 'succeeded') paidByUser.set(p.userId, (paidByUser.get(p.userId) ?? 0) + p.amountCents);
  }
  const activeSubUsers = new Set(ds.subscriptions.filter((s) => s.status === 'active').map((s) => s.userId));
  const out: StuckUserRow[] = [];
  for (const u of ds.users) {
    if (u.lastActiveAt) continue; // watched something → not stuck
    const hasPaid = (paidByUser.get(u.id) ?? 0) > 0 || activeSubUsers.has(u.id);
    if (!hasPaid) continue;
    const slugs = [...new Set(ds.enrollments.filter((e) => e.userId === u.id).map((e) => e.courseSlug))];
    out.push({
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      createdAt: u.createdAt,
      courses: slugs.map((slug) => {
        const c = courseBySlug.get(slug);
        return { code: c?.code ?? slug, title_fr: c?.title_fr ?? slug, title_ht: c?.title_ht ?? slug };
      }),
      amountPaidCents: paidByUser.get(u.id) ?? 0,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function toCertRow(c: { id: string; userId: string; courseSlug: string; issuedAt: string; verificationCode: string; revoked?: boolean }): CertRow {
  const ds = getMockDataset();
  const u = ds.users.find((x) => x.id === c.userId);
  const co = courseBySlug.get(c.courseSlug);
  return {
    id: c.id,
    userId: c.userId,
    userName: u?.name ?? '—',
    userEmail: u?.email ?? '—',
    courseSlug: c.courseSlug,
    courseTitle_fr: co?.title_fr ?? c.courseSlug,
    courseTitle_ht: co?.title_ht ?? c.courseSlug,
    issuedAt: c.issuedAt,
    verificationCode: c.verificationCode,
    revoked: !!c.revoked,
  };
}

async function getCertificates(query: CertQuery): Promise<CertPage> {
  const ds = getMockDataset();
  let rows = ds.certificates.map(toCertRow);
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

async function getCertificateByCode(code: string): Promise<CertVerification> {
  const ds = getMockDataset();
  const c = ds.certificates.find((x) => x.verificationCode.toLowerCase() === code.trim().toLowerCase());
  if (!c) return { found: false, revoked: false, code };
  const u = ds.users.find((x) => x.id === c.userId);
  const co = courseBySlug.get(c.courseSlug);
  return {
    found: true,
    revoked: !!c.revoked,
    userName: u?.name,
    courseTitle_fr: co?.title_fr,
    courseTitle_ht: co?.title_ht,
    issuedAt: c.issuedAt,
    code: c.verificationCode,
  };
}

function selectAudit(query: import('../types').AuditLogQuery) {
  const ds = getMockDataset();
  let rows = [...ds.auditLog];
  if (query.admin) rows = rows.filter((a) => a.adminId === query.admin);
  if (query.action) rows = rows.filter((a) => a.action === query.action);
  if (query.from) rows = rows.filter((a) => a.createdAt >= query.from!);
  if (query.to) rows = rows.filter((a) => a.createdAt <= query.to! + 'T23:59:59.999Z');
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

async function getAuditLog(query: import('../types').AuditLogQuery): Promise<import('../types').AuditPage> {
  const ds = getMockDataset();
  const rows = selectAudit(query);
  const adminsMap = new Map<string, string>();
  for (const a of ds.auditLog) adminsMap.set(a.adminId, a.adminName);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? 100;
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    admins: [...adminsMap.entries()].map(([id, name]) => ({ id, name })),
  };
}

async function exportAuditLog(query: import('../types').AuditLogQuery): Promise<AuditEntry[]> {
  return selectAudit(query);
}

let certSeq = 0;
function newVerifCode(): string {
  certSeq++;
  return `PNA-${String(2000 + certSeq).slice(-4)}-${String.fromCharCode(65 + (certSeq % 26))}${(certSeq * 7) % 90 + 10}`;
}

/* ------------------------------ mutations -------------------------------- */
async function grantCourseAccess(p: {
  userId: string;
  courseSlug: string;
  admin: AdminActor;
}): Promise<void> {
  const ds = getMockDataset();
  const already = ds.enrollments.some(
    (e) => e.userId === p.userId && e.courseSlug === p.courseSlug,
  );
  if (!already) {
    ds.enrollments.push({
      userId: p.userId,
      courseSlug: p.courseSlug,
      enrolledAt: new Date().toISOString(),
      source: 'granted',
    });
    const c = courseBySlug.get(p.courseSlug);
    ds.progress.push({
      userId: p.userId,
      courseSlug: p.courseSlug,
      lessonsDone: 0,
      lessonsTotal: c?.lessons.length ?? 0,
      lastActivityAt: new Date().toISOString(),
    });
  }
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'grant_course',
    targetUserId: p.userId,
    detail: p.courseSlug,
  });
}

async function revokeCourseAccess(p: {
  userId: string;
  courseSlug: string;
  admin: AdminActor;
}): Promise<void> {
  const ds = getMockDataset();
  ds.enrollments = ds.enrollments.filter(
    (e) => !(e.userId === p.userId && e.courseSlug === p.courseSlug),
  );
  ds.progress = ds.progress.filter(
    (pr) => !(pr.userId === p.userId && pr.courseSlug === p.courseSlug),
  );
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'revoke_course',
    targetUserId: p.userId,
    detail: p.courseSlug,
  });
}

async function grantSubscription(p: { userId: string; admin: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  const user = ds.users.find((u) => u.id === p.userId);
  if (user) user.isSubscriber = true;
  const existing = ds.subscriptions.find((s) => s.userId === p.userId);
  const nowIso = new Date().toISOString();
  if (existing) {
    existing.status = 'active';
    existing.canceledAt = null;
    existing.cancellationReason = null;
    existing.currentPeriodEnd = new Date(Date.now() + 30 * DAY).toISOString();
    existing.grantedByAdmin = true;
  } else {
    ds.subscriptions.push({
      id: `sub_${p.userId}`,
      userId: p.userId,
      status: 'active',
      startedAt: nowIso,
      canceledAt: null,
      amountCents: 0,
      provider: 'card',
      currentPeriodEnd: new Date(Date.now() + 30 * DAY).toISOString(),
      cancellationReason: null,
      grantedByAdmin: true,
    });
  }
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'grant_subscription',
    targetUserId: p.userId,
  });
}

async function setUserStatus(p: {
  userId: string;
  status: UserStatus;
  reason: string;
  admin: AdminActor;
}): Promise<void> {
  const ds = getMockDataset();
  const user = ds.users.find((u) => u.id === p.userId);
  if (user) user.status = p.status;
  const action: AuditAction =
    p.status === 'banned'
      ? 'ban_user'
      : p.status === 'suspended'
        ? 'suspend_user'
        : 'reactivate_user';
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action,
    targetUserId: p.userId,
    reason: p.reason,
  });
}

async function refundPayment(p: {
  userId: string;
  paymentId: string;
  admin: AdminActor;
}): Promise<void> {
  const ds = getMockDataset();
  const pay = ds.payments.find((x) => x.id === p.paymentId && x.userId === p.userId);
  if (pay && pay.status === 'succeeded') {
    pay.status = 'refunded';
    pay.isRefund = true;
    ds.creditLedger.push({
      id: `cred_${ds.creditLedger.length + 1}`,
      userId: p.userId,
      amountCents: pay.amountCents,
      reason: 'refund',
      createdAt: new Date().toISOString(),
    });
  }
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'refund_payment',
    targetUserId: p.userId,
    detail: p.paymentId,
  });
}

async function recordAudit(p: {
  action: AuditAction;
  userId: string;
  admin: AdminActor;
  detail?: string;
  reason?: string;
}): Promise<void> {
  const ds = getMockDataset();
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: p.action,
    targetUserId: p.userId,
    detail: p.detail,
    reason: p.reason,
  });
}

async function revokeCertificate(p: { certId: string; admin: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  const c = ds.certificates.find((x) => x.id === p.certId);
  if (c) c.revoked = true;
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'revoke_certificate',
    targetUserId: c?.userId ?? '',
    detail: c?.verificationCode,
  });
}

async function reissueCertificate(p: { certId: string; admin: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  const c = ds.certificates.find((x) => x.id === p.certId);
  if (c) {
    c.revoked = false;
    c.issuedAt = new Date().toISOString();
    c.verificationCode = newVerifCode();
  }
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'reissue_certificate',
    targetUserId: c?.userId ?? '',
    detail: c?.verificationCode,
  });
}

async function issueCertificate(p: {
  userId: string;
  courseSlug: string;
  admin: AdminActor;
}): Promise<void> {
  const ds = getMockDataset();
  const existing = ds.certificates.find(
    (x) => x.userId === p.userId && x.courseSlug === p.courseSlug && !x.revoked,
  );
  if (!existing) {
    ds.certificates.push({
      id: `cert_${p.userId}_${p.courseSlug}_${ds.certificates.length + 1}`,
      userId: p.userId,
      courseSlug: p.courseSlug,
      issuedAt: new Date().toISOString(),
      verificationCode: newVerifCode(),
      revoked: false,
    });
  }
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'issue_certificate',
    targetUserId: p.userId,
    detail: p.courseSlug,
  });
}

/* ============================== marketing =============================== */
function promoStatusOf(c: PromoCode, now: number): PromoStatus {
  if (!c.isActive) return 'disabled';
  if (c.startsAt && Date.parse(c.startsAt) > now) return 'scheduled';
  if (c.expiresAt && Date.parse(c.expiresAt) < now) return 'expired';
  if (c.maxUses != null && c.usedCount >= c.maxUses) return 'depleted';
  return 'active';
}
function promoDiscount(c: PromoCode, gross: number): number {
  return c.discountType === 'percent'
    ? Math.round((gross * c.discountValue) / 100)
    : Math.min(c.discountValue, gross);
}
function toPromoRow(c: PromoCode, now: number): PromoRow {
  return {
    ...c,
    status: promoStatusOf(c, now),
    usagePct: c.maxUses != null && c.maxUses > 0 ? Math.min(100, (c.usedCount / c.maxUses) * 100) : null,
  };
}

async function getPromoCodes(query: PromoQuery): Promise<PromoRow[]> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  let rows = ds.promoCodes.map((c) => toPromoRow(c, now));
  if (query.search) {
    const s = query.search.trim().toLowerCase();
    rows = rows.filter((r) => r.code.toLowerCase().includes(s));
  }
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.type) rows = rows.filter((r) => r.discountType === query.type);
  const dir = query.dir === 'asc' ? 1 : -1;
  const key = query.sort ?? 'expiry';
  rows.sort((a, b) => {
    if (key === 'usage') return ((a.usagePct ?? -1) - (b.usagePct ?? -1)) * dir;
    const av = a.expiresAt ? Date.parse(a.expiresAt) : Infinity; // no-expiry last
    const bv = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
    return (av - bv) * dir;
  });
  return rows;
}

async function getPromoDetail(codeOrId: string): Promise<PromoDetail | null> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const key = codeOrId.trim().toLowerCase();
  const c = ds.promoCodes.find((x) => x.code.toLowerCase() === key || x.id.toLowerCase() === key);
  if (!c) return null;
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  const redemptions = ds.redemptions
    .filter((r) => r.promoCodeId === c.id)
    .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
    .map((r) => {
      const u = userById.get(r.userId);
      return { ...r, userName: u?.name ?? '—', userEmail: u?.email ?? '—' };
    });
  return {
    promo: toPromoRow(c, now),
    redemptions,
    revenueGeneratedCents: redemptions.reduce((s, r) => s + r.netCents, 0),
    revenueUndiscountedCents: redemptions.reduce((s, r) => s + r.grossCents, 0),
    discountGivenCents: redemptions.reduce((s, r) => s + r.discountCents, 0),
  };
}

async function isPromoCodeFree(code: string): Promise<boolean> {
  const ds = getMockDataset();
  const k = code.trim().toLowerCase();
  return k.length > 0 && !ds.promoCodes.some((c) => c.code.toLowerCase() === k);
}

async function createPromoCode(p: {
  input: Omit<PromoCode, 'id' | 'usedCount' | 'createdAt'>;
  admin: AdminActor;
}): Promise<{ ok: boolean; message?: string; code?: string }> {
  const ds = getMockDataset();
  const code = p.input.code.trim().toUpperCase();
  if (!code) return { ok: false, message: 'code_required' };
  if (ds.promoCodes.some((c) => c.code.toUpperCase() === code)) return { ok: false, message: 'duplicate' };
  if (p.input.discountType === 'percent' && (p.input.discountValue < 1 || p.input.discountValue > 100))
    return { ok: false, message: 'bad_percent' };
  if (p.input.discountType === 'fixed' && p.input.discountValue <= 0) return { ok: false, message: 'bad_fixed' };
  ds.promoCodes.unshift({
    id: `promo_${code.toLowerCase()}_${ds.promoCodes.length + 1}`,
    code,
    discountType: p.input.discountType,
    discountValue: p.input.discountValue,
    appliesTo: p.input.appliesTo,
    courseSlug: p.input.appliesTo === 'course' ? p.input.courseSlug : null,
    maxUses: p.input.maxUses,
    usedCount: 0,
    expiresAt: p.input.expiresAt,
    startsAt: p.input.startsAt,
    isActive: p.input.isActive,
    createdAt: new Date().toISOString(),
  });
  appendAudit(ds, { adminId: p.admin.id, adminName: p.admin.name, action: 'create_promo', targetUserId: p.admin.id, detail: code });
  return { ok: true, code };
}

async function setPromoActive(p: { id: string; active: boolean; admin: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  const c = ds.promoCodes.find((x) => x.id === p.id);
  if (c) c.isActive = p.active;
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: p.active ? 'enable_promo' : 'disable_promo',
    targetUserId: p.admin.id,
    detail: c?.code,
  });
}

async function deletePromoCode(p: { id: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const ds = getMockDataset();
  const c = ds.promoCodes.find((x) => x.id === p.id);
  if (!c) return { ok: false, message: 'not_found' };
  if (c.usedCount > 0) return { ok: false, message: 'has_redemptions' };
  ds.promoCodes = ds.promoCodes.filter((x) => x.id !== p.id);
  appendAudit(ds, { adminId: p.admin.id, adminName: p.admin.name, action: 'delete_promo', targetUserId: p.admin.id, detail: c.code });
  return { ok: true };
}

async function validatePromo(p: {
  code: string;
  productType: ProductType;
  courseSlug: string | null;
  grossCents: number;
}): Promise<PromoValidation> {
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const code = p.code.trim();
  const c = ds.promoCodes.find((x) => x.code.toLowerCase() === code.toLowerCase());
  if (!c) return { valid: false, reason: 'not_found', code };
  const status = promoStatusOf(c, now);
  if (status === 'disabled') return { valid: false, reason: 'inactive', code: c.code };
  if (status === 'scheduled') return { valid: false, reason: 'scheduled', code: c.code };
  if (status === 'expired') return { valid: false, reason: 'expired', code: c.code };
  if (status === 'depleted') return { valid: false, reason: 'depleted', code: c.code };
  const scopeOk =
    c.appliesTo === 'all' ||
    (c.appliesTo === 'subscription' && p.productType === 'subscription') ||
    (c.appliesTo === 'course' && p.productType === 'course' && (!c.courseSlug || c.courseSlug === p.courseSlug));
  if (!scopeOk) return { valid: false, reason: 'wrong_product', code: c.code };
  const discountCents = promoDiscount(c, p.grossCents);
  return {
    valid: true,
    reason: 'ok',
    code: c.code,
    discountType: c.discountType,
    discountValue: c.discountValue,
    grossCents: p.grossCents,
    discountCents,
    netCents: p.grossCents - discountCents,
  };
}

async function redeemPromo(p: { code: string; userId: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  // MOCK stand-in for real checkout completion until payment providers are wired.
  const ds = getMockDataset();
  const now = Date.parse(ds.referenceNow);
  const c = ds.promoCodes.find((x) => x.code.toLowerCase() === p.code.trim().toLowerCase());
  if (!c) return { ok: false, message: 'not_found' };
  if (promoStatusOf(c, now) !== 'active') return { ok: false, message: 'not_active' };
  const user = ds.users.find((u) => u.id === p.userId);
  if (!user) return { ok: false, message: 'user_not_found' };
  const productType: ProductType = c.appliesTo === 'subscription' ? 'subscription' : 'course';
  let courseSlug: string | null = null;
  let gross: number;
  if (productType === 'subscription') {
    gross = ds.subscriptions.find((s) => s.amountCents > 0)?.amountCents ?? 7900;
  } else {
    const slug = c.courseSlug ?? courses[0]?.slug ?? null;
    courseSlug = slug;
    gross = (slug ? courseBySlug.get(slug)?.priceUsd ?? 40 : 40) * 100;
  }
  const discount = promoDiscount(c, gross);
  ds.redemptions.unshift({
    id: `redm_sim_${ds.redemptions.length + 1}`,
    promoCodeId: c.id,
    userId: p.userId,
    paymentId: null,
    productType,
    courseSlug,
    grossCents: gross,
    discountCents: discount,
    netCents: gross - discount,
    redeemedAt: new Date().toISOString(),
  });
  c.usedCount += 1;
  appendAudit(ds, { adminId: p.admin.id, adminName: p.admin.name, action: 'redeem_promo', targetUserId: p.userId, detail: c.code });
  return { ok: true };
}

async function getUtmAttribution(query: UtmQuery): Promise<UtmRow[]> {
  const ds = getMockDataset();
  const inRange = (iso: string) =>
    (!query.from || iso >= query.from) && (!query.to || iso <= query.to + 'T23:59:59.999Z');
  const payingIds = new Set(ds.payments.filter((p) => p.status === 'succeeded').map((p) => p.userId));
  for (const s of ds.subscriptions) if (s.status === 'active') payingIds.add(s.userId);
  const revByUser = new Map<string, number>();
  for (const p of ds.payments)
    if (p.status === 'succeeded') revByUser.set(p.userId, (revByUser.get(p.userId) ?? 0) + p.amountCents);

  const groups = new Map<string, UtmRow>();
  for (const a of ds.acquisition) {
    if (!inRange(a.capturedAt)) continue;
    const key = `${a.utmSource}|${a.utmMedium}|${a.utmCampaign}`;
    let g = groups.get(key);
    if (!g) {
      g = { source: a.utmSource, medium: a.utmMedium, campaign: a.utmCampaign, signups: 0, converted: 0, revenueCents: 0, conversionPct: 0 };
      groups.set(key, g);
    }
    g.signups++;
    if (payingIds.has(a.userId)) g.converted++;
    g.revenueCents += revByUser.get(a.userId) ?? 0;
  }
  const rows = [...groups.values()];
  for (const g of rows) g.conversionPct = g.signups ? (g.converted / g.signups) * 100 : 0;
  return rows.sort((a, b) => b.signups - a.signups);
}

function cartReminderStatus(s: CheckoutSession): CartReminderStatus {
  if (s.remindedAt && s.completedAt && Date.parse(s.completedAt) >= Date.parse(s.remindedAt)) return 'converted';
  if (s.remindedAt) return 'reminded';
  return 'never';
}
function toAbandonedRow(s: CheckoutSession): AbandonedCartRow {
  const ds = getMockDataset();
  const u = s.userId ? ds.users.find((x) => x.id === s.userId) : null;
  const c = s.courseSlug ? courseBySlug.get(s.courseSlug) : null;
  const isSub = s.productType === 'subscription';
  return {
    id: s.id,
    userId: s.userId,
    isGuest: !s.userId,
    userName: u?.name ?? '',
    userEmail: u?.email ?? null,
    productType: s.productType,
    productCode: isSub ? null : c?.code ?? null,
    productTitle_fr: isSub ? 'Abonnement mensuel' : c?.title_fr ?? s.courseSlug ?? '—',
    productTitle_ht: isSub ? 'Abònman mansyèl' : c?.title_ht ?? s.courseSlug ?? '—',
    amountCents: s.amountCents,
    startedAt: s.startedAt,
    abandonedAt: s.abandonedAt,
    reminderStatus: cartReminderStatus(s),
  };
}

async function getAbandonedCarts(): Promise<AbandonedCartRow[]> {
  const ds = getMockDataset();
  return ds.checkoutSessions
    .filter((s) => s.abandonedAt != null)
    .map(toAbandonedRow)
    .sort((a, b) => (b.abandonedAt ?? '').localeCompare(a.abandonedAt ?? ''));
}

async function getOpenCarts(): Promise<OpenCartRow[]> {
  const ds = getMockDataset();
  return ds.checkoutSessions
    .filter((s) => s.abandonedAt == null && s.completedAt == null)
    .map((s) => {
      const u = s.userId ? ds.users.find((x) => x.id === s.userId) : null;
      const c = s.courseSlug ? courseBySlug.get(s.courseSlug) : null;
      const isSub = s.productType === 'subscription';
      return {
        id: s.id,
        userName: u?.name ?? '',
        productTitle_fr: isSub ? 'Abonnement mensuel' : c?.title_fr ?? s.courseSlug ?? '—',
        productTitle_ht: isSub ? 'Abònman mansyèl' : c?.title_ht ?? s.courseSlug ?? '—',
        amountCents: s.amountCents,
        startedAt: s.startedAt,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function getCartStats(): Promise<CartStats> {
  const carts = await getAbandonedCarts();
  const reminded = carts.filter((c) => c.reminderStatus !== 'never').length;
  const convertedAfterReminder = carts.filter((c) => c.reminderStatus === 'converted').length;
  return {
    abandoned: carts.length,
    reminded,
    convertedAfterReminder,
    reminderConversionPct: reminded ? (convertedAfterReminder / reminded) * 100 : 0,
  };
}

async function markCartAbandoned(p: { id: string; admin: AdminActor }): Promise<void> {
  // Sim of the 2h cron — not an admin business decision, so not audited.
  const ds = getMockDataset();
  const s = ds.checkoutSessions.find((x) => x.id === p.id);
  if (s && !s.abandonedAt && !s.completedAt) s.abandonedAt = new Date().toISOString();
}

async function remindCart(p: { id: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const ds = getMockDataset();
  const s = ds.checkoutSessions.find((x) => x.id === p.id);
  if (!s) return { ok: false, message: 'not_found' };
  if (!s.userId) return { ok: false, message: 'guest_no_email' };
  if (!s.abandonedAt) return { ok: false, message: 'not_abandoned' };
  if (s.remindedAt) return { ok: false, message: 'already_reminded' };
  s.remindedAt = new Date().toISOString();
  // Production: enqueue a Resend "you left something behind" email with a
  // pre-filled checkout link. One reminder per cart (no auto sequence).
  appendAudit(ds, { adminId: p.admin.id, adminName: p.admin.name, action: 'cart_reminder', targetUserId: s.userId, detail: s.id });
  return { ok: true };
}

async function getReferrers(sort: ReferralSortKey): Promise<ReferrerRow[]> {
  const ds = getMockDataset();
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  const creditByUser = new Map<string, number>();
  for (const c of ds.creditLedger)
    if (c.reason === 'referral') creditByUser.set(c.userId, (creditByUser.get(c.userId) ?? 0) + c.amountCents);
  const byReferrer = new Map<string, { code: string; invited: number; converted: number }>();
  for (const r of ds.referrals) {
    let g = byReferrer.get(r.referrerUserId);
    if (!g) {
      g = { code: r.referralCode, invited: 0, converted: 0 };
      byReferrer.set(r.referrerUserId, g);
    }
    g.invited++;
    if (r.status === 'confirmed') g.converted++;
  }
  const rows: ReferrerRow[] = [...byReferrer.entries()].map(([userId, g]) => {
    const u = userById.get(userId);
    return {
      userId,
      userName: u?.name ?? '—',
      userEmail: u?.email ?? '—',
      referralCode: g.code,
      invited: g.invited,
      converted: g.converted,
      creditsCents: creditByUser.get(userId) ?? 0,
    };
  });
  rows.sort((a, b) => (sort === 'credits' ? b.creditsCents - a.creditsCents : b.converted - a.converted));
  return rows;
}

async function getReferrerDetail(userId: string): Promise<ReferrerDetail | null> {
  const ds = getMockDataset();
  const referrer = (await getReferrers('converted')).find((r) => r.userId === userId);
  if (!referrer) return null;
  const userById = new Map(ds.users.map((u) => [u.id, u]));
  const filleuls = ds.referrals
    .filter((r) => r.referrerUserId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      userId: r.referredUserId,
      userName: r.referredUserId ? userById.get(r.referredUserId)?.name ?? '—' : '',
      status: r.status,
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
    }));
  return { referrer, filleuls };
}

async function getReferralCreditCents(): Promise<number> {
  return getMockDataset().referralCreditCents;
}

async function setReferralCredit(p: { cents: number; admin: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  ds.referralCreditCents = Math.max(0, Math.round(p.cents));
  appendAudit(ds, { adminId: p.admin.id, adminName: p.admin.name, action: 'set_referral_credit', targetUserId: p.admin.id, detail: String(p.cents) });
}

async function addManualCredit(p: { userId: string; amountCents: number; note: string; admin: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  ds.creditLedger.push({
    id: `cred_man_${ds.creditLedger.length + 1}`,
    userId: p.userId,
    amountCents: Math.round(p.amountCents),
    reason: 'manual',
    createdAt: new Date().toISOString(),
  });
  appendAudit(ds, {
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: 'add_credit',
    targetUserId: p.userId,
    detail: String(p.amountCents),
    reason: p.note || undefined,
  });
}

/* ============================ support & système ========================= */
const mockUserIds = () => new Set(getMockDataset().users.map((u) => u.id));

async function getTickets(query: TicketQuery): Promise<TicketPage> {
  const ds = getMockDataset();
  let rows = [...ds.tickets];
  if (query.search) {
    const s = query.search.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.userName.toLowerCase().includes(s) || r.userEmail.toLowerCase().includes(s) || r.subject.toLowerCase().includes(s),
    );
  }
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.type) rows = rows.filter((r) => r.type === query.type);
  if (query.from) rows = rows.filter((r) => r.createdAt >= query.from!);
  if (query.to) rows = rows.filter((r) => r.createdAt <= query.to! + 'T23:59:59.999Z');
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const counts = {
    all: ds.tickets.length,
    open: ds.tickets.filter((t) => t.status === 'open').length,
    in_progress: ds.tickets.filter((t) => t.status === 'in_progress').length,
    resolved: ds.tickets.filter((t) => t.status === 'resolved').length,
    unassignedOpen: ds.tickets.filter((t) => t.status === 'open' && !t.assignedAdminId).length,
  };
  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? 25;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize, counts };
}

async function getTicketById(id: string): Promise<TicketDetail | null> {
  const ds = getMockDataset();
  const ticket = ds.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  const replies = ds.ticketReplies.filter((r) => r.ticketId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const payment = ticket.relatedPaymentId ? ds.payments.find((p) => p.id === ticket.relatedPaymentId) ?? null : null;
  return { ticket, replies, payment, userExists: mockUserIds().has(ticket.userId) };
}

async function getOpenUnassignedCount(): Promise<number> {
  return getMockDataset().tickets.filter((t) => t.status === 'open' && !t.assignedAdminId).length;
}

async function createTicket(p: {
  userId: string;
  userName: string;
  userEmail: string;
  type: TicketType;
  subject: string;
  message: string;
  relatedPaymentId?: string | null;
}): Promise<{ id: string }> {
  const ds = getMockDataset();
  const nowIso = new Date().toISOString();
  const id = `tic_${(ds.tickets.length + 1).toString().padStart(4, '0')}_u`;
  ds.tickets.unshift({
    id,
    userId: p.userId,
    userName: p.userName,
    userEmail: p.userEmail,
    type: p.type,
    subject: p.subject,
    message: p.message,
    status: 'open',
    assignedAdminId: null,
    assignedAdminName: null,
    relatedPaymentId: p.relatedPaymentId ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  // A new ticket raises an admin notification (refund tickets are critical).
  ds.notifications.unshift({
    id: `ntf_${(ds.notifications.length + 1).toString().padStart(4, '0')}_u`,
    kind: p.type === 'refund' ? 'refund_request' : 'sale',
    severity: p.type === 'refund' ? 'critical' : 'info',
    userId: p.userId,
    userName: p.userName,
    amountCents: null,
    detail: `Nouveau ticket: ${p.subject}`,
    createdAt: nowIso,
    read: false,
  });
  return { id };
}

async function assignTicket(p: { ticketId: string; adminId: string | null; adminName: string | null; actor: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  const t = ds.tickets.find((x) => x.id === p.ticketId);
  if (t) {
    t.assignedAdminId = p.adminId;
    t.assignedAdminName = p.adminName;
    t.updatedAt = new Date().toISOString();
    if (t.status === 'open' && p.adminId) t.status = 'in_progress';
  }
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'assign_ticket', targetUserId: t?.userId ?? '', detail: `${p.ticketId}:${p.adminName ?? 'unassigned'}` });
}

async function replyTicket(p: { ticketId: string; body: string; actor: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const ds = getMockDataset();
  const t = ds.tickets.find((x) => x.id === p.ticketId);
  if (!t) return { ok: false, message: 'not_found' };
  if (!p.body.trim()) return { ok: false, message: 'empty' };
  const nowIso = new Date().toISOString();
  ds.ticketReplies.push({
    id: `trep_${(ds.ticketReplies.length + 1).toString().padStart(4, '0')}_a`,
    ticketId: p.ticketId,
    authorType: 'admin',
    authorId: p.actor.id,
    authorName: p.actor.name,
    body: p.body.trim(),
    createdAt: nowIso,
  });
  t.updatedAt = nowIso;
  if (t.status === 'open') t.status = 'in_progress';
  // Production: email the reply to the learner via Resend.
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'reply_ticket', targetUserId: t.userId, detail: p.ticketId });
  return { ok: true };
}

async function setTicketStatus(p: { ticketId: string; status: TicketStatus; actor: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  const t = ds.tickets.find((x) => x.id === p.ticketId);
  if (t) {
    t.status = p.status;
    t.updatedAt = new Date().toISOString();
  }
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'set_ticket_status', targetUserId: t?.userId ?? '', detail: `${p.ticketId}:${p.status}` });
}

async function getTemplates(): Promise<SupportTemplate[]> {
  return [...getMockDataset().templates].sort((a, b) => a.category.localeCompare(b.category) || a.title_fr.localeCompare(b.title_fr));
}

async function createTemplate(p: { input: Omit<SupportTemplate, 'id' | 'createdAt'>; actor: AdminActor }): Promise<{ id: string }> {
  const ds = getMockDataset();
  const id = `tpl_${ds.templates.length + 1}_${Date.now().toString(36)}`;
  ds.templates.push({ id, createdAt: new Date().toISOString(), ...p.input });
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'create_template', targetUserId: p.actor.id, detail: p.input.title_fr });
  return { id };
}

async function updateTemplate(p: { id: string; patch: Partial<Omit<SupportTemplate, 'id' | 'createdAt'>>; actor: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  const tpl = ds.templates.find((x) => x.id === p.id);
  if (tpl) Object.assign(tpl, p.patch);
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'update_template', targetUserId: p.actor.id, detail: p.id });
}

async function deleteTemplate(p: { id: string; actor: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  ds.templates = ds.templates.filter((x) => x.id !== p.id);
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'delete_template', targetUserId: p.actor.id, detail: p.id });
}

async function getNotifications(p?: { limit?: number }): Promise<NotificationFeed> {
  const ds = getMockDataset();
  const sorted = [...ds.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = p?.limit ?? 30;
  return {
    items: sorted.slice(0, limit),
    unread: ds.notifications.filter((n) => !n.read).length,
    criticalUnread: ds.notifications.filter((n) => !n.read && n.severity === 'critical').length,
  };
}

async function markNotificationRead(p: { id: string }): Promise<void> {
  const ds = getMockDataset();
  const n = ds.notifications.find((x) => x.id === p.id);
  if (n) n.read = true;
}

async function markAllNotificationsRead(): Promise<void> {
  for (const n of getMockDataset().notifications) n.read = true;
}

async function getWebhookLogs(query: WebhookQuery): Promise<WebhookLog[]> {
  const ds = getMockDataset();
  let rows = [...ds.webhookLogs];
  if (query.provider) rows = rows.filter((r) => r.provider === query.provider);
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.from) rows = rows.filter((r) => r.receivedAt >= query.from!);
  if (query.to) rows = rows.filter((r) => r.receivedAt <= query.to! + 'T23:59:59.999Z');
  return rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

async function replayWebhook(p: { id: string; actor: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const ds = getMockDataset();
  const w = ds.webhookLogs.find((x) => x.id === p.id);
  if (!w) return { ok: false, message: 'not_found' };
  if (w.status !== 'failed') return { ok: false, message: 'not_failed' };
  // Mock: a replay succeeds. Production: re-dispatch the stored payload to the handler.
  w.status = 'processed';
  w.processedAt = new Date().toISOString();
  w.retryCount += 1;
  w.errorMessage = null;
  // Clear the matching critical notification, if any.
  for (const n of ds.notifications) if (n.kind === 'webhook_error' && !n.read) n.read = true;
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'replay_webhook', targetUserId: p.actor.id, detail: `${w.provider}:${w.eventType}` });
  return { ok: true };
}

async function getErrorLogs(): Promise<ErrorLog[]> {
  return [...getMockDataset().errorLogs].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

async function getSupportSettings(): Promise<SupportSettings> {
  return { ...getMockDataset().supportSettings };
}

async function setSupportSettings(p: { enabled: boolean; hour: number; actor: AdminActor }): Promise<void> {
  const ds = getMockDataset();
  ds.supportSettings.dailyDigestEnabled = p.enabled;
  ds.supportSettings.dailyDigestHour = Math.min(23, Math.max(0, Math.round(p.hour)));
  appendAudit(ds, { adminId: p.actor.id, adminName: p.actor.name, action: 'set_digest', targetUserId: p.actor.id, detail: `${p.enabled ? 'on' : 'off'}@${p.hour}h` });
}

export const mockDataSource: AdminDataSource = {
  getKpiOverview,
  getUsers,
  exportUsers,
  getUserById,
  getTransactions,
  exportTransactions,
  getMethodVolumes,
  getCourseSales,
  getCourseDetail,
  getAnalytics,
  getSubscriptions,
  getSubEvents,
  getDunning,
  getRenewals,
  getRenewalSeries,
  getCohorts,
  getSubKpis,
  getCancellationReasons,
  getCourseCompletion,
  getCourseTimes,
  getLessonViews,
  getAggregateDropoff,
  getActiveLearners,
  getStuckUsers,
  getCertificates,
  getCertificateByCode,
  getAuditLog,
  exportAuditLog,
  revokeCertificate,
  reissueCertificate,
  issueCertificate,
  grantCourseAccess,
  revokeCourseAccess,
  grantSubscription,
  setUserStatus,
  refundPayment,
  recordAudit,
  getPromoCodes,
  getPromoDetail,
  isPromoCodeFree,
  createPromoCode,
  setPromoActive,
  deletePromoCode,
  validatePromo,
  redeemPromo,
  getUtmAttribution,
  getAbandonedCarts,
  getOpenCarts,
  getCartStats,
  markCartAbandoned,
  remindCart,
  getReferrers,
  getReferrerDetail,
  getReferralCreditCents,
  setReferralCredit,
  addManualCredit,
  getTickets,
  getTicketById,
  getOpenUnassignedCount,
  createTicket,
  assignTicket,
  replyTicket,
  setTicketStatus,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getWebhookLogs,
  replayWebhook,
  getErrorLogs,
  getSupportSettings,
  setSupportSettings,
};
