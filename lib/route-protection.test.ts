import { describe, it, expect } from 'vitest';
import { createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import {
  PROTECTED_ROUTE_PATTERNS,
  ADMIN_ROUTE_PATTERNS,
  PUBLIC_CANARY_PATHS,
} from '@/lib/route-protection';

const req = (path: string) => new NextRequest(new URL(`https://pniceacademy.com${path}`));

describe('route protection patterns', () => {
  const isProtected = createRouteMatcher([...PROTECTED_ROUTE_PATTERNS]);
  const isAdmin = createRouteMatcher([...ADMIN_ROUTE_PATTERNS]);

  it('gates the routes that hold private data', () => {
    for (const p of [
      '/ht/tableau-de-bord',
      '/ht/tableau-de-bord/kou/biznis-shipping',
      '/fr/tableau-de-bord',
      '/ht/kont',
      '/ht/kont/quelque-chose',
      '/fr/kont',
      '/ht/checkout',
      '/ht/checkout/merci',
    ]) {
      expect(isProtected(req(p)), `${p} devrait être protégé`).toBe(true);
    }
  });

  it('gates the admin area', () => {
    for (const p of ['/ht/admin', '/ht/admin/prix', '/fr/admin/retraits']) {
      expect(isAdmin(req(p)), `${p} devrait être admin-only`).toBe(true);
    }
  });

  /**
   * The regression that motivated this file: `/(ht|fr)/kont(.*)` also matched
   * `/kontak`, so the public contact page 404'd in production for signed-out
   * visitors. Any new public route added to PUBLIC_CANARY_PATHS is checked here
   * against BOTH gates.
   */
  it('never gates a public route (kontak vs kont)', () => {
    for (const p of PUBLIC_CANARY_PATHS) {
      expect(isProtected(req(p)), `${p} doit rester public`).toBe(false);
      expect(isAdmin(req(p)), `${p} ne doit pas être admin-only`).toBe(false);
    }
  });
});
