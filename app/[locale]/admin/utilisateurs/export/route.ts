import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { clerkEnabled } from '@/lib/clerk';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { exportUsers } from '@/lib/admin/data';
import { parseUsersQuery } from '@/lib/admin/users-query';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'id', 'name', 'email', 'phone', 'country', 'city', 'language',
  'created_at', 'type', 'status', 'subscription_status',
  'courses_purchased', 'courses_access', 'total_spent_usd',
  'last_active_at', 'last_payment_at',
] as const;

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  // Defense in depth: the middleware already requires sign-in for /admin; this
  // also enforces an admin role on the export endpoint.
  if (!clerkEnabled) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'users.read')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const query = parseUsersQuery(Object.fromEntries(url.searchParams.entries()));
  const rows = await exportUsers(query);

  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id, r.name, r.email, r.phone, r.country, r.city, r.language,
        r.createdAt, r.type, r.status, r.subscriptionStatus,
        r.coursesPurchased, r.coursesAccess, (r.totalSpentCents / 100).toFixed(2),
        r.lastActiveAt, r.lastPaymentAt,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  // BOM so Excel reads accented names correctly.
  const csv = '﻿' + lines.join('\r\n');

  // Filename encodes the date + active filters so an export is self-describing.
  const date = new Date().toISOString().slice(0, 10);
  const tags: string[] = [];
  for (const k of ['type', 'country', 'lang', 'courses', 'segment', 'q', 'from', 'to'] as const) {
    const v = url.searchParams.get(k);
    if (v) tags.push(`${k}-${v.replace(/[^a-zA-Z0-9]/g, '')}`);
  }
  const suffix = tags.length ? `_${tags.join('_')}` : '_tous';
  const filename = `pnice-utilisateurs_${date}${suffix}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
