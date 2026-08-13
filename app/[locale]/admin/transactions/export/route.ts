import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { clerkEnabled } from '@/lib/clerk';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { exportTransactions } from '@/lib/admin/data';
import { parseTxQuery } from '@/lib/admin/tx-query';

export const dynamic = 'force-dynamic';

/**
 * Stage 3 finance surface, item 5 — the CSV export the admin data layer has
 * had ready (and unit-tested) since Lot 3 (`exportTransactions`) but that no
 * route ever reached. Mirrors app/[locale]/admin/utilisateurs/export/route.ts
 * and app/[locale]/admin/audit/export/route.ts exactly: same auth/capability
 * check, same BOM+CRLF CSV shape, honours whatever filters were active on
 * /admin/transactions when the admin clicked the link.
 */
const COLUMNS = ['date', 'reference', 'user_name', 'user_email', 'product_type', 'product', 'method', 'status', 'amount_usd'] as const;

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  // Defense in depth: the middleware already requires sign-in for /admin; this
  // also enforces the capability on the export endpoint itself.
  if (!clerkEnabled) return new NextResponse('Forbidden', { status: 403 });
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'transactions.read')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const query = parseTxQuery(Object.fromEntries(url.searchParams.entries()));
  const rows = await exportTransactions(query);

  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt,
        r.id,
        r.userName,
        r.userEmail,
        r.productType,
        r.productCode ?? r.productTitle_fr,
        r.method,
        r.status,
        (r.amountCents / 100).toFixed(2),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  // BOM so Excel reads accented product titles correctly.
  const csv = '﻿' + lines.join('\r\n');

  const date = new Date().toISOString().slice(0, 10);
  const tags: string[] = [];
  for (const k of ['method', 'status', 'product', 'q', 'from', 'to'] as const) {
    const v = url.searchParams.get(k);
    if (v) tags.push(`${k}-${v.replace(/[^a-zA-Z0-9]/g, '')}`);
  }
  const suffix = tags.length ? `_${tags.join('_')}` : '_tous';
  const filename = `pnice-transactions_${date}${suffix}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
