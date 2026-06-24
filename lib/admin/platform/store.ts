/**
 * Platform settings store (Phase C Lot 3): payment-provider toggles, the
 * subscription price (single, canon — no local/diaspora split), and maintenance
 * mode. Business settings live here (mutable, DB later), NOT in env (env stays
 * for secret keys). The USD→HTG rate stays in lib/admin/settings (consolidated
 * here on the platform page). super-admin-gated via the actions.
 */
import { SUBSCRIPTION_USD } from '@/data/pricing';

export type ProviderKey = 'moncash' | 'natcash' | 'card' | 'paypal' | 'crypto';
export const PROVIDER_KEYS: ProviderKey[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];

type PlatformStore = {
  providers: Record<ProviderKey, boolean>;
  subscriptionUsd: number;
  maintenance: { enabled: boolean; message_ht: string; message_fr: string };
};

let cache: PlatformStore | null = null;

export function getPlatform(): PlatformStore {
  if (cache) return cache;
  cache = {
    providers: { moncash: true, natcash: true, card: true, paypal: true, crypto: true },
    subscriptionUsd: SUBSCRIPTION_USD,
    maintenance: { enabled: false, message_ht: '', message_fr: '' },
  };
  return cache;
}

export function activeProviders(): ProviderKey[] {
  const p = getPlatform().providers;
  return PROVIDER_KEYS.filter((k) => p[k]);
}

export function isMaintenance(): boolean {
  return getPlatform().maintenance.enabled;
}
