/**
 * Payment-provider keys — a tiny, dependency-free module shared by client
 * components (components/admin/platform/PlatformPanels.tsx) and the
 * DB-backed platform store (./store.ts). Split out in the durable-site-
 * content stage so 'use client' files never pull the store's DB imports
 * into the browser bundle. Server code can keep importing these from
 * './store', which re-exports them (frozen import contract).
 */
export type ProviderKey = 'moncash' | 'natcash' | 'card' | 'paypal' | 'crypto';
export const PROVIDER_KEYS: ProviderKey[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];
