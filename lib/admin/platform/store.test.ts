/**
 * Behaviour tests for the DB-backed platform store (Stage: durable site
 * content). No DATABASE_URL in the test env ⇒ the gated fallback path: code
 * defaults (all provider toggles on, maintenance off) served from the
 * mutable in-memory fallback, exactly like the pre-DB store.
 */
import { describe, it, expect } from 'vitest';
import {
  getPlatform,
  activeProviders,
  isMaintenance,
  setProviderEnabled,
  setMaintenance,
  PROVIDER_KEYS,
} from './store';

describe('getPlatform — gated fallback defaults', () => {
  it('defaults to every provider toggled on and maintenance off', async () => {
    const p = await getPlatform();
    for (const k of PROVIDER_KEYS) expect(p.providers[k]).toBe(true);
    expect(p.maintenance.enabled).toBe(false);
    expect(await isMaintenance()).toBe(false);
    expect(await activeProviders()).toEqual(PROVIDER_KEYS);
  });
});

describe('writes — persisted in the fallback store without a DB', () => {
  it('toggling a provider is reflected by activeProviders', async () => {
    await setProviderEnabled('crypto', false);
    expect(await activeProviders()).toEqual(PROVIDER_KEYS.filter((k) => k !== 'crypto'));
    await setProviderEnabled('crypto', true);
    expect(await activeProviders()).toEqual(PROVIDER_KEYS);
  });

  it('maintenance flag + bilingual message round-trip', async () => {
    await setMaintenance(true, 'N ap fè yon ti reparasyon.', 'Petite maintenance en cours.');
    expect(await isMaintenance()).toBe(true);
    const m = (await getPlatform()).maintenance;
    expect(m.message_ht).toBe('N ap fè yon ti reparasyon.');
    expect(m.message_fr).toBe('Petite maintenance en cours.');
    await setMaintenance(false, '', '');
    expect(await isMaintenance()).toBe(false);
  });
});
