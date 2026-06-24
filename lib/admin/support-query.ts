/**
 * Parse the support-tickets and webhook-logs list queries from URL search params
 * (Phase D Lot 2). Reuses RawSearchParams from users-query.
 */
import type {
  TicketQuery,
  TicketStatus,
  TicketType,
  WebhookQuery,
  WebhookStatus,
  PaymentMethod,
} from '@/lib/admin/data';
import type { RawSearchParams } from '@/lib/admin/users-query';

const T_STATUS: TicketStatus[] = ['open', 'in_progress', 'resolved'];
const T_TYPE: TicketType[] = ['question', 'bug', 'refund'];
const W_STATUS: WebhookStatus[] = ['processed', 'failed', 'ignored'];
const W_PROVIDERS: PaymentMethod[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseTicketQuery(sp: RawSearchParams): TicketQuery {
  const q: TicketQuery = {};
  const search = one(sp.q)?.trim();
  if (search) q.search = search;
  const status = one(sp.status);
  if (status && T_STATUS.includes(status as TicketStatus)) q.status = status as TicketStatus;
  const type = one(sp.type);
  if (type && T_TYPE.includes(type as TicketType)) q.type = type as TicketType;
  const from = one(sp.from);
  if (from) q.from = from;
  const to = one(sp.to);
  if (to) q.to = to;
  const page = Number(one(sp.page));
  if (Number.isInteger(page) && page > 0) q.page = page;
  return q;
}

export function parseWebhookQuery(sp: RawSearchParams): WebhookQuery {
  const q: WebhookQuery = {};
  const provider = one(sp.provider);
  if (provider && W_PROVIDERS.includes(provider as PaymentMethod)) q.provider = provider as PaymentMethod;
  const status = one(sp.status);
  if (status && W_STATUS.includes(status as WebhookStatus)) q.status = status as WebhookStatus;
  const from = one(sp.from);
  if (from) q.from = from;
  const to = one(sp.to);
  if (to) q.to = to;
  return q;
}
