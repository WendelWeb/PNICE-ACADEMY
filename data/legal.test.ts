/**
 * Completeness tests for the code-shipped legal defaults (data/legal.ts) —
 * Stage: durable site content. The point: a site that takes payments must
 * NEVER render an empty CGU / privacy / refund page, and the defaults must
 * state THIS platform's real practices concretely (7-day / <20% course
 * refund window, subscriptions effective end-of-period, Stripe card
 * payments in USD, HTG display-only, 70/30 marketplace split).
 */
import { describe, it, expect } from 'vitest';
import { LEGAL_DEFAULTS, LEGAL_DEFAULTS_UPDATED_AT, type LegalSlug } from './legal';

const SLUGS: LegalSlug[] = ['cgu', 'confidentialite', 'remboursement'];

describe('LEGAL_DEFAULTS completeness', () => {
  it('covers all three legal pages', () => {
    for (const slug of SLUGS) {
      expect(LEGAL_DEFAULTS[slug]).toBeDefined();
    }
  });

  it('ships substantial, non-empty content in BOTH languages for every page', () => {
    for (const slug of SLUGS) {
      const { content_ht, content_fr } = LEGAL_DEFAULTS[slug];
      // "Substantial" — a real policy, not a stub sentence.
      expect(content_ht.trim().length).toBeGreaterThan(800);
      expect(content_fr.trim().length).toBeGreaterThan(800);
    }
  });

  it('has a valid, fixed "last updated" date for default renders', () => {
    expect(Number.isFinite(Date.parse(LEGAL_DEFAULTS_UPDATED_AT))).toBe(true);
  });
});

describe('LEGAL_DEFAULTS states the platform’s real practices', () => {
  it('CGU names the three products, the 70/30 split, and USD card payment via Stripe', () => {
    for (const content of [LEGAL_DEFAULTS.cgu.content_ht, LEGAL_DEFAULTS.cgu.content_fr]) {
      expect(content).toContain('Pass Prof');
      expect(content).toContain('Pass PNICE');
      expect(content).toContain('70%');
      expect(content).toContain('30%');
      expect(content).toContain('Stripe');
      expect(content).toContain('USD');
      expect(content).toContain('HTG');
    }
  });

  it('refund policy states the concrete window: 7 days, under 20% consumed', () => {
    expect(LEGAL_DEFAULTS.remboursement.content_ht).toContain('7 jou');
    expect(LEGAL_DEFAULTS.remboursement.content_ht).toContain('20%');
    expect(LEGAL_DEFAULTS.remboursement.content_fr).toContain('7 jours');
    expect(LEGAL_DEFAULTS.remboursement.content_fr).toContain('20%');
  });

  it('privacy policy names the real processors and the card-data boundary', () => {
    for (const content of [
      LEGAL_DEFAULTS.confidentialite.content_ht,
      LEGAL_DEFAULTS.confidentialite.content_fr,
    ]) {
      expect(content).toContain('Clerk');
      expect(content).toContain('Stripe');
      expect(content).toContain('Bunny');
      expect(content).toContain('Resend');
    }
  });

  it('every page tells the reader how to reach us', () => {
    for (const slug of SLUGS) {
      expect(LEGAL_DEFAULTS[slug].content_ht).toContain('kontak@pnice.academy');
      expect(LEGAL_DEFAULTS[slug].content_fr).toContain('kontak@pnice.academy');
    }
  });
});
