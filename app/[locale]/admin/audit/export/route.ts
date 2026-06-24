import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { clerkEnabled } from '@/lib/clerk';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { exportAuditLog } from '@/lib/admin/data';
import type { AuditAction, AuditLogQuery } from '@/lib/admin/data';

export const dynamic = 'force-dynamic';

const COLS = ['when', 'admin_id', 'admin_name', 'action', 'target_user_id', 'detail', 'reason'] as const;
const cell = (v: string | undefined | null) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  if (!clerkEnabled) return new NextResponse('Forbidden', { status: 403 });
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'roles.manage')) return new NextResponse('Forbidden', { status: 403 });

  const url = new URL(req.url);
  const q: AuditLogQuery = {};
  const admin = url.searchParams.get('admin'); if (admin) q.admin = admin;
  const action = url.searchParams.get('action'); if (action) q.action = action as AuditAction;
  const from = url.searchParams.get('from'); if (from) q.from = from;
  const to = url.searchParams.get('to'); if (to) q.to = to;

  const rows = await exportAuditLog(q);
  const lines = [COLS.join(',')];
  for (const a of rows) {
    lines.push([a.createdAt, a.adminId, a.adminName, a.action, a.targetUserId, a.detail, a.reason].map(cell).join(','));
  }
  const csv = '﻿' + lines.join('\r\n');
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pnice-audit_${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
