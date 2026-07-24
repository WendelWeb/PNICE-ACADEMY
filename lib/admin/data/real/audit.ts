/**
 * Real (Drizzle) Audit-log domain — closes the last gap flagged by review:
 * every real mutation across every domain already writes an `audit_log` row
 * via `recordAudit` (../users.ts), but until now the only reader of that data
 * (getAuditLog/exportAuditLog, feeding /admin/audit + its CSV export route)
 * still read the in-memory mock — real audit rows were being written but were
 * invisible in the UI.
 *
 * The mock (`lib/admin/data/mock/index.ts` — selectAudit/getAuditLog/
 * exportAuditLog) is the reference for shape/semantics; this file reproduces
 * it from the real `audit_log` table.
 *
 * `audit_log` is denormalised exactly like the mock's `AuditEntry`
 * (adminName is stored on every row at write time by `recordAudit`), so
 * "resolving admin names" is just reading the column — no join needed. The
 * `admins` filter-dropdown list is built from the FULL unfiltered table
 * (distinct adminId → its most recent adminName), mirroring the mock's
 * `adminsMap` loop over `ds.auditLog` (not the filtered `rows`) exactly.
 *
 * `targetUserId`/`detail`/`reason` are nullable columns while `AuditEntry`
 * has `targetUserId` as a required string (detail/reason optional) — falls
 * back to `''` / `undefined`, same as ../users.ts's own audit read in
 * getUserById.
 *
 * Table is admin-action-volume-sized (one row per manual mutation, not
 * transaction-volume-sized) — same "load once, filter/sort in JS" precedent
 * as ../support.ts / ../marketing.ts. On an empty table this returns the same
 * zeroed AuditPage (`rows: []`, `total: 0`, `admins: []`) the mock would for
 * an empty dataset — never throws, no NaN risk (no divisions in this domain).
 */
import { asc } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { AuditAction, AuditEntry, AuditLogQuery, AuditPage } from '../types';

const T = schema;

type DbAudit = typeof T.auditLog.$inferSelect;

function toEntry(a: DbAudit): AuditEntry {
  return {
    id: a.id,
    adminId: a.adminId,
    adminName: a.adminName,
    action: a.action as AuditAction,
    targetUserId: a.targetUserId ?? '',
    detail: a.detail ?? undefined,
    reason: a.reason ?? undefined,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Loads the whole table once (ascending, so the `admins` map's "last value
 * wins" reflects the most recent adminName per adminId — mirrors the mock's
 * chronological `ds.auditLog` array), then applies the mock's `selectAudit`
 * filters + desc sort on top.
 */
async function selectAudit(
  query: AuditLogQuery,
): Promise<{ filtered: AuditEntry[]; all: AuditEntry[] }> {
  const raw = await db.select().from(T.auditLog).orderBy(asc(T.auditLog.createdAt));
  const all = raw.map(toEntry);

  let rows = all;
  if (query.admin) rows = rows.filter((a) => a.adminId === query.admin);
  if (query.action) rows = rows.filter((a) => a.action === query.action);
  if (query.from) rows = rows.filter((a) => a.createdAt >= query.from!);
  if (query.to) rows = rows.filter((a) => a.createdAt <= query.to! + 'T23:59:59.999Z');
  const filtered = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { filtered, all };
}

export async function getAuditLog(query: AuditLogQuery): Promise<AuditPage> {
  const { filtered, all } = await selectAudit(query);
  const adminsMap = new Map<string, string>();
  for (const a of all) adminsMap.set(a.adminId, a.adminName);

  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? 100;
  const start = (page - 1) * pageSize;

  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    admins: [...adminsMap.entries()].map(([id, name]) => ({ id, name })),
  };
}

export async function exportAuditLog(query: AuditLogQuery): Promise<AuditEntry[]> {
  return (await selectAudit(query)).filtered;
}
