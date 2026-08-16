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
  /** The « Pass PNICE » ON/OFF master switch (owner, août 2026 : « bouton
   *  pour désactiver le pass — quand je désactive il n'est pas affiché »).
   *  OFF hides every pass sales surface and refuses new pass checkouts;
   *  EXISTING subscribers keep their access untouched (their subscription
   *  rows and the access checks never read this flag). Stored INSIDE the
   *  providers_json jsonb (reserved `platformPass` key) — deliberately NOT
   *  a new column: adding one would 42703 every platform_settings
   *  db.select() (fx rate included!) until the owner's next db:push. */
  passEnabled: boolean;
};

function defaults(): PlatformStore {
  return {
    providers: { moncash: true, natcash: true, card: true, paypal: true, crypto: true },
    subscriptionUsd: SUBSCRIPTION_USD,
    maintenance: { enabled: false, message_ht: '', message_fr: '' },
    passEnabled: true,
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

/** The reserved `platformPass` key of providers_json — absent/malformed ⇒
 *  enabled (every deployment before the switch existed sold the pass). */
function parsePassEnabled(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return true;
  return (raw as Record<string, unknown>).platformPass !== false;
}

/** The FULL providers_json blob to persist — providers + the reserved
 *  platformPass key. BOTH writers below must build from this: writing only
 *  the provider keys would silently wipe the pass switch (and vice versa). */
function blobFrom(store: PlatformStore): Record<string, boolean> {
  return { ...store.providers, platformPass: store.passEnabled };
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
      passEnabled: parsePassEnabled(row.providersJson),
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

/** Is the « Pass PNICE » currently ON SALE? (Existing subscribers' access
 *  never consults this — only sales surfaces and new-checkout guards do.) */
export async function isPlatformPassEnabled(): Promise<boolean> {
  return (await getPlatform()).passEnabled;
}

/** Persist the pass master switch — lives in providers_json (see the
 *  PlatformStore doc comment for why it is not a column). */
export async function setPlatformPassEnabled(enabled: boolean): Promise<void> {
  if (!dbConfigured()) {
    getMemory().passEnabled = enabled;
    return;
  }
  const current = await getPlatform();
  const blob = blobFrom({ ...current, passEnabled: enabled });
  await db
    .insert(T.platformSettings)
    .values({ id: 'singleton', subscriptionUsdCents: SUB_CENTS, providersJson: blob })
    .onConflictDoUpdate({
      target: T.platformSettings.id,
      set: { providersJson: blob, updatedAt: new Date() },
    });
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
  // Through blobFrom, NOT the bare providers object — a bare write would
  // silently wipe the platformPass switch stored in the same jsonb.
  const current = await getPlatform();
  const blob = blobFrom({ ...current, providers: { ...current.providers, [key]: enabled } });
  await db
    .insert(T.platformSettings)
    .values({ id: 'singleton', subscriptionUsdCents: SUB_CENTS, providersJson: blob })
    .onConflictDoUpdate({
      target: T.platformSettings.id,
      set: { providersJson: blob, updatedAt: new Date() },
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
