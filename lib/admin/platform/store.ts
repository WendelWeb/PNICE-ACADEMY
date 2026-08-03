/**
 * Platform settings store: payment-provider toggles, the subscription-seed
 * price constant, and maintenance mode. Business settings live here
 * (mutable), NOT in env (env stays for secret keys). super-admin-gated via
 * the actions (lib/admin/platform-actions.ts).
 *
 * Stage: durable site content — this store now actually READS AND WRITES the
 * platform_settings columns that have existed since migration 0001
 * (providers_json, maintenance_enabled, maintenance_message_ht/fr) instead
 * of an in-memory module cache that evaporated per deploy and diverged per
 * serverless instance. Pattern follows lib/fx.ts's getFxRate/setFxRate
 * exactly:
 *   - reads are GATED + NEVER-THROW: no DATABASE_URL, no singleton row, a
 *     malformed providers_json, or a failed query ⇒ the code defaults (all
 *     provider toggles on, maintenance off) — via the in-memory fallback
 *     store, which stays mutable so no-DB dev behaves as before;
 *   - writes upsert the 'singleton' row (insert-or-onConflictDoUpdate) and
 *     MAY throw — the 'use server' actions already wrap every call and
 *     surface a failure message.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import { PROVIDER_KEYS, type ProviderKey } from './keys';

// Frozen import contract: server modules keep importing these from here.
export { PROVIDER_KEYS, type ProviderKey };

const T = schema;
const SUB_CENTS = SUBSCRIPTION_USD * 100;

type PlatformStore = {
  providers: Record<ProviderKey, boolean>;
  subscriptionUsd: number;
  maintenance: { enabled: boolean; message_ht: string; message_fr: string };
};

function defaults(): PlatformStore {
  return {
    providers: { moncash: true, natcash: true, card: true, paypal: true, crypto: true },
    subscriptionUsd: SUBSCRIPTION_USD,
    maintenance: { enabled: false, message_ht: '', message_fr: '' },
  };
}

/** In-memory fallback (no-DB dev/build) — mutable, as the old cache was. */
let memory: PlatformStore | null = null;
function getMemory(): PlatformStore {
  if (!memory) memory = defaults();
  return memory;
}

/** Validate a stored providers_json blob; anything malformed ⇒ defaults. */
function parseProviders(raw: unknown): Record<ProviderKey, boolean> {
  const out = defaults().providers;
  if (typeof raw !== 'object' || raw === null) return out;
  for (const k of PROVIDER_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * The live platform settings. GATED + NEVER-THROW (lib/fx.ts's getFxRate
 * pattern): no DB / no row / failed query ⇒ the in-memory fallback.
 */
export async function getPlatform(): Promise<PlatformStore> {
  if (!dbConfigured()) return getMemory();
  try {
    const [row] = await db
      .select()
      .from(T.platformSettings)
      .where(eq(T.platformSettings.id, 'singleton'))
      .limit(1);
    if (!row) return defaults();
    return {
      providers: parseProviders(row.providersJson),
      subscriptionUsd: SUBSCRIPTION_USD,
      maintenance: {
        enabled: row.maintenanceEnabled,
        message_ht: row.maintenanceMessageHt,
        message_fr: row.maintenanceMessageFr,
      },
    };
  } catch (err) {
    console.error('[platform] getPlatform DB read failed, falling back to defaults:', err);
    return getMemory();
  }
}

export async function activeProviders(): Promise<ProviderKey[]> {
  const p = (await getPlatform()).providers;
  return PROVIDER_KEYS.filter((k) => p[k]);
}

export async function isMaintenance(): Promise<boolean> {
  return (await getPlatform()).maintenance.enabled;
}

/**
 * Persist one provider toggle — upserts the singleton row's providers_json
 * (same insert-or-onConflictDoUpdate shape as lib/fx.ts's setFxRate). The
 * "don't disable the last provider" guard lives in the action, which reads
 * the current state first.
 */
export async function setProviderEnabled(key: ProviderKey, enabled: boolean): Promise<void> {
  if (!dbConfigured()) {
    getMemory().providers[key] = enabled;
    return;
  }
  const providers = { ...(await getPlatform()).providers, [key]: enabled };
  await db
    .insert(T.platformSettings)
    .values({ id: 'singleton', subscriptionUsdCents: SUB_CENTS, providersJson: providers })
    .onConflictDoUpdate({
      target: T.platformSettings.id,
      set: { providersJson: providers, updatedAt: new Date() },
    });
}

/** Persist the maintenance flag + bilingual message on the singleton row. */
export async function setMaintenance(enabled: boolean, messageHt: string, messageFr: string): Promise<void> {
  if (!dbConfigured()) {
    const m = getMemory().maintenance;
    m.enabled = enabled;
    m.message_ht = messageHt;
    m.message_fr = messageFr;
    return;
  }
  await db
    .insert(T.platformSettings)
    .values({
      id: 'singleton',
      subscriptionUsdCents: SUB_CENTS,
      maintenanceEnabled: enabled,
      maintenanceMessageHt: messageHt,
      maintenanceMessageFr: messageFr,
    })
    .onConflictDoUpdate({
      target: T.platformSettings.id,
      set: {
        maintenanceEnabled: enabled,
        maintenanceMessageHt: messageHt,
        maintenanceMessageFr: messageFr,
        updatedAt: new Date(),
      },
    });
}
