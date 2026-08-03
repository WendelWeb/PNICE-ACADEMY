/**
 * Behaviour tests for the DB-first site store (Stage: durable site content).
 * No DATABASE_URL in the test env, so every call below exercises the store's
 * (a) no-DB fallback path — which must behave exactly like the old
 * in-memory store, plus the new data/legal.ts default folding. The DB path
 * shares all business rules with this one via lib/admin/site/ops.ts, so the
 * rules asserted here (placeholder can never publish, tokens are single-use,
 * legal defaults fold per language) are the durable contract.
 */
import { describe, it, expect } from 'vitest';
import {
  listTestimonials,
  createTestimonial,
  updateTestimonial,
  publishTestimonial,
  unpublishTestimonial,
  getHomeTestimonials,
  getCourseTestimonial,
  getLegal,
  saveLegalVersion,
  createReviewToken,
  getReviewToken,
  isTokenValid,
  submitReview,
} from './ops';
import { LEGAL_DEFAULTS } from '@/data/legal';

describe('legal pages — DB-first with code-shipped defaults', () => {
  it('returns the complete data/legal.ts default when nothing was ever saved', async () => {
    const page = (await getLegal('cgu'))!;
    const cur = page.versions[0];
    expect(cur.content_ht).toBe(LEGAL_DEFAULTS.cgu.content_ht);
    expect(cur.content_fr).toBe(LEGAL_DEFAULTS.cgu.content_fr);
    expect(cur.content_ht.trim().length).toBeGreaterThan(0);
  });

  it('a saved version wins over the default', async () => {
    expect(await saveLegalVersion('remboursement', 'Nouvo règ HT', 'Nouvelle règle FR', 'Test Admin')).toBe(true);
    const page = (await getLegal('remboursement'))!;
    expect(page.versions[0].content_ht).toBe('Nouvo règ HT');
    expect(page.versions[0].content_fr).toBe('Nouvelle règle FR');
    expect(page.versions[0].adminName).toBe('Test Admin');
  });

  it('a blank language falls back to the default PER LANGUAGE', async () => {
    await saveLegalVersion('confidentialite', '', 'Version FR seulement', 'Test Admin');
    const page = (await getLegal('confidentialite'))!;
    expect(page.versions[0].content_fr).toBe('Version FR seulement');
    // ht was left blank ⇒ the complete code default renders instead.
    expect(page.versions[0].content_ht).toBe(LEGAL_DEFAULTS.confidentialite.content_ht);
  });
});

describe('testimonials — placeholders can NEVER be published', () => {
  it('starts with the code-side placeholders only', async () => {
    const all = await listTestimonials();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((t) => t.status === 'placeholder')).toBe(true);
  });

  it('refuses to publish a placeholder', async () => {
    const [placeholder] = await listTestimonials({ status: 'placeholder' });
    const r = await publishTestimonial(placeholder.id);
    expect(r).toEqual({ ok: false, reason: 'placeholder' });
  });

  it('home shows placeholders until a real testimonial is published, then only real ones', async () => {
    expect((await getHomeTestimonials()).every((t) => t.status === 'placeholder')).toBe(true);

    const { id } = await createTestimonial({
      name: 'Marie',
      location: 'Jakmèl',
      courseSlug: 'test-course',
      quote_ht: 'Bèl kou!',
      quote_fr: 'Super cours !',
      photo: null,
    });
    // Incomplete quotes are unpublishable; complete ones publish fine.
    expect((await publishTestimonial(id)).ok).toBe(true);

    const home = await getHomeTestimonials();
    expect(home).toHaveLength(1);
    expect(home[0].id).toBe(id);
    expect(home[0].status).toBe('published');

    // Course page: only a PUBLISHED match qualifies.
    expect((await getCourseTestimonial('test-course'))?.id).toBe(id);
    expect(await getCourseTestimonial('other-course')).toBeNull();

    // Unpublish drops it from home (placeholders return) and the course page.
    expect(await unpublishTestimonial(id)).toBe(true);
    expect((await getHomeTestimonials()).every((t) => t.status === 'placeholder')).toBe(true);
    expect(await getCourseTestimonial('test-course')).toBeNull();
  });

  it('update patches fields but never smuggles a status change', async () => {
    const { id } = await createTestimonial({
      name: 'Jan',
      location: '',
      courseSlug: null,
      quote_ht: 'Mèsi',
      quote_fr: 'Merci',
      photo: null,
    });
    expect(await updateTestimonial(id, { location: 'Okay', status: 'published' })).toBe(true);
    const t = (await listTestimonials()).find((x) => x.id === id)!;
    expect(t.location).toBe('Okay');
    expect(t.status).toBe('real'); // status untouched by update
  });
});

describe('review tokens — single-use', () => {
  it('creates, validates, consumes, and refuses reuse', async () => {
    const tok = await createReviewToken('user_1', 'Naïka');
    expect(isTokenValid(await getReviewToken(tok.token))).toBe(true);

    const first = await submitReview(tok.token, 'Fòmasyon an chanje vi m.', 'ht', null);
    expect(first.ok).toBe(true);

    // The token is spent — a second submission is refused.
    expect(isTokenValid(await getReviewToken(tok.token))).toBe(false);
    const second = await submitReview(tok.token, 'ankò', 'ht', null);
    expect(second).toEqual({ ok: false, reason: 'invalid' });
  });

  it('an unknown token is invalid', async () => {
    expect(isTokenValid(await getReviewToken('nope'))).toBe(false);
  });
});
