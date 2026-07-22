/**
 * Integration / go-live status (Phase D Lot 3). Reports which external services
 * are configured by checking for the PRESENCE of their env vars at runtime.
 *
 * SECURITY: this only ever returns booleans — it NEVER reads files, returns, or
 * logs a secret value. It answers "is X configured?", not "what is X's key?".
 */

export type DataSource = 'mock' | 'real';

export type IntegrationKey =
  | 'database'
  | 'clerk'
  | 'clerkWebhook'
  | 'stripe'
  | 'moncash'
  | 'natcash'
  | 'resend'
  | 'bunny';

export type IntegrationItem = {
  key: IntegrationKey;
  configured: boolean;
  /** True when this integration is required before the platform can sell. */
  required: boolean;
};

const present = (...names: string[]) => names.every((n) => !!process.env[n]);

export function getDataSource(): DataSource {
  return process.env.ADMIN_DATA_SOURCE === 'real' ? 'real' : 'mock';
}

export function getIntegrationStatus(): { dataSource: DataSource; items: IntegrationItem[] } {
  const items: IntegrationItem[] = [
    { key: 'database', configured: present('DATABASE_URL'), required: true },
    { key: 'clerk', configured: present('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'), required: true },
    { key: 'clerkWebhook', configured: present('CLERK_WEBHOOK_SECRET'), required: true },
    { key: 'stripe', configured: present('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'), required: false },
    { key: 'moncash', configured: present('MONCASH_CLIENT_ID', 'MONCASH_CLIENT_SECRET'), required: false },
    { key: 'natcash', configured: present('NATCASH_API_KEY'), required: false },
    { key: 'resend', configured: present('RESEND_API_KEY'), required: false },
    { key: 'bunny', configured: present('BUNNY_STREAM_API_KEY', 'BUNNY_STREAM_LIBRARY_ID'), required: false },
  ];
  return { dataSource: getDataSource(), items };
}

/** At least one payment rail must be live to take money. */
export function hasAnyPaymentProvider(items: IntegrationItem[]): boolean {
  return items.some((i) => (i.key === 'stripe' || i.key === 'moncash' || i.key === 'natcash') && i.configured);
}

/** Launch-ready = all required integrations + a real data source + a payment rail. */
export function isLaunchReady(status: { dataSource: DataSource; items: IntegrationItem[] }): boolean {
  const requiredOk = status.items.filter((i) => i.required).every((i) => i.configured);
  return requiredOk && status.dataSource === 'real' && hasAnyPaymentProvider(status.items);
}
