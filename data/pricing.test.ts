/**
 * Unit tests for data/pricing.ts's Stage-4 perks split: the platform pass
 * keeps the all-of-PNICE promise; a TEACHER's pass promises only that
 * teacher's own catalogue (« tout fòmasyon {name} yo ») — the perk-list lie
 * this stage removes from /prof pages.
 */
import { describe, it, expect } from 'vitest';
import {
  platformPassPerks_ht,
  platformPassPerks_fr,
  teacherPassPerks,
} from './pricing';

describe('platformPassPerks — the all-access list', () => {
  it('ht and fr stay in parity (same number of perks)', () => {
    expect(platformPassPerks_ht).toHaveLength(platformPassPerks_fr.length);
  });

  it('opens with the honest platform-wide scope', () => {
    expect(platformPassPerks_ht[0]).toContain('TOUT');
    expect(platformPassPerks_fr[0]).toContain('TOUTES');
  });
});

describe('teacherPassPerks — one teacher, honest scope', () => {
  it('scopes the first perk to the named teacher, in both locales', () => {
    expect(teacherPassPerks('Manno', 'ht')[0]).toBe('Aksè a tout fòmasyon Manno yo');
    expect(teacherPassPerks('Manno', 'fr')[0]).toContain('Manno');
  });

  it('never claims the whole platform', () => {
    for (const locale of ['ht', 'fr']) {
      for (const perk of teacherPassPerks('Manno', locale)) {
        expect(perk).not.toMatch(/PNICE Academy/);
      }
    }
  });

  it('both locales list the same number of perks as the platform list', () => {
    expect(teacherPassPerks('X', 'ht')).toHaveLength(platformPassPerks_ht.length);
    expect(teacherPassPerks('X', 'fr')).toHaveLength(platformPassPerks_fr.length);
  });
});
