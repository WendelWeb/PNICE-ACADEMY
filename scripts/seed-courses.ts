/**
 * scripts/seed-courses.ts — Task C2-T2
 * (docs/superpowers/plans/2026-07-24-c2-courses-to-db.md)
 *
 * Moves the 9 static courses (data/courses.ts) + their sales-page content
 * (data/courseDetails.ts, keyed by course `code`) + lessons + the $79/mo
 * teacher plan (data/pricing.ts) into Postgres, owned by teacher #1 — the
 * synced Clerk owner. This is exactly what `lib/courses/source.ts` reads back
 * once seeded, so every column written here MUST match `db/schema.ts`'s
 * `courses`/`lessons`/`teacher_plans` tables exactly (see that module's header
 * for the read side of this contract).
 *
 * REQUIRES the C2-T1 tables live (`npm run db:push`) — this script does not
 * create them.
 *
 * Owner resolution (the "owner" = teacher #1, the founder account):
 *   1. If ADMIN_BOOTSTRAP_EMAILS is set (lib/admin/access.ts bootstrapEmails()),
 *      the `users` row whose email matches one of those (case-insensitive).
 *   2. Else, if `users` has exactly one row, that row.
 *   3. Else: throw — refuse to guess which user is teacher #1. Run
 *      `npm run db:sync-clerk` first if `users` is empty, or set
 *      ADMIN_BOOTSTRAP_EMAILS in .env.local to disambiguate.
 *
 * Idempotent — safe to run repeatedly:
 *   - courses:       onConflict(slug)               DO UPDATE (createdAt untouched)
 *   - lessons:       onConflict(course_slug, index)  DO UPDATE (createdAt untouched)
 *   - teacher_plans: no unique constraint on owner_user_id in the schema, so
 *     this is check-then-insert-or-update instead of onConflictDoUpdate.
 *
 * --dry-run: resolves the owner (1 SELECT) + builds every row in memory,
 * prints a preview, but issues NO writes — every insert/update is skipped.
 *
 * Usage:
 *   npm run db:seed-courses
 *   npm run db:seed-courses -- --dry-run
 *
 * dotenv is loaded FIRST; `db` is imported dynamically AFTER, because the
 * Neon client captures DATABASE_URL at import time (same pattern as
 * scripts/sync-clerk-users.ts / check-payments.ts / check-learner.ts).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { courses as staticCourses, isPreviewLesson } from '../data/courses';
import { courseDetails } from '../data/courseDetails';
import { bootstrapEmails } from '../lib/admin/access';
import { resolveProduct } from '../lib/payments/products';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL manquant dans .env.local');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');

  // Imported AFTER dotenv config so the Neon client sees DATABASE_URL.
  const { db, schema } = await import('../db/index');
  const { eq } = await import('drizzle-orm');
  const T = schema;

  /* ------------------------------------------------------------------ */
  /* 1. Resolve the owner (teacher #1)                                   */
  /* ------------------------------------------------------------------ */
  const allUsers = await db.select().from(T.users);
  const emails = bootstrapEmails();
  let owner: (typeof allUsers)[number] | undefined;

  if (emails.length > 0) {
    owner = allUsers.find((u) => emails.includes(u.email.toLowerCase()));
    if (!owner) {
      throw new Error(
        `Aucun utilisateur trouvé dans "users" pour ADMIN_BOOTSTRAP_EMAILS (${emails.join(', ')}). ` +
          `Lance d'abord "npm run db:sync-clerk", ou vérifie l'email dans .env.local.`,
      );
    }
  } else if (allUsers.length === 1) {
    owner = allUsers[0];
  } else {
    throw new Error(
      `Impossible de déterminer le propriétaire : ADMIN_BOOTSTRAP_EMAILS n'est pas défini dans ` +
        `.env.local et la table "users" contient ${allUsers.length} ligne(s) (au lieu d'exactement 1). ` +
        `Renseigne ADMIN_BOOTSTRAP_EMAILS pour lever l'ambiguïté.`,
    );
  }
  console.log(`Propriétaire résolu : ${owner.email} (users.id=${owner.id})`);

  /* ------------------------------------------------------------------ */
  /* 2. Build course + lesson rows from the static seed data             */
  /* ------------------------------------------------------------------ */
  const now = new Date();

  const courseRows = staticCourses.map((c) => {
    const detail = courseDetails[c.code];
    if (!detail) {
      throw new Error(`data/courseDetails.ts n'a pas d'entrée pour le code ${c.code} (slug=${c.slug}).`);
    }
    return {
      ownerUserId: owner!.id,
      slug: c.slug,
      code: c.code,
      icon: c.icon,
      category: c.category,
      titleHt: c.title_ht,
      titleFr: c.title_fr,
      taglineHt: c.tagline_ht,
      taglineFr: c.tagline_fr,
      audienceHt: c.audience_ht,
      audienceFr: c.audience_fr,
      learnHt: c.learn_ht,
      learnFr: c.learn_fr,
      levelHt: detail.level_ht,
      levelFr: detail.level_fr,
      promiseHt: detail.promise_ht,
      promiseFr: detail.promise_fr,
      problemHt: detail.problem_ht,
      problemFr: detail.problem_fr,
      deliverablesHt: detail.deliverables_ht,
      deliverablesFr: detail.deliverables_fr,
      prereqHt: detail.requirements_ht,
      prereqFr: detail.requirements_fr,
      faqHt: detail.faq.map((f) => ({ q: f.q_ht, a: f.a_ht })),
      faqFr: detail.faq.map((f) => ({ q: f.q_fr, a: f.a_fr })),
      priceCents: Math.round(c.priceUsd * 100),
      currency: 'USD',
      // No stored image data today — images resolve by filesystem convention
      // from the course `code` (lib/courseImage.ts), never from a DB row.
      images: null,
      status: 'published' as const,
      publishedAt: now,
      hasUnpublishedChanges: false,
      updatedAt: now,
    };
  });

  const lessonRows = staticCourses.flatMap((c) => {
    const detail = courseDetails[c.code];
    return c.lessons.map((lesson, i) => {
      const index = i + 1; // 1-based — matches lib/learner/access.ts + the lesson page route
      const lessonDetail = detail?.lessonDetails?.[i];
      return {
        courseSlug: c.slug,
        index,
        titleHt: lesson.title_ht,
        titleFr: lesson.title_fr,
        descHt: lessonDetail?.desc_ht ?? null,
        descFr: lessonDetail?.desc_fr ?? null,
        bunnyVideoId: lesson.bunnyVideoId ?? null,
        durationSeconds: lessonDetail ? lessonDetail.minutes * 60 : null,
        isPreview: isPreviewLesson(index),
        updatedAt: now,
      };
    });
  });

  /* ------------------------------------------------------------------ */
  /* 3. The $79/mo teacher plan — mirrors the checkout display name from */
  /* lib/payments/products.ts so the seeded plan matches what a buyer     */
  /* actually sees at checkout.                                          */
  /* ------------------------------------------------------------------ */
  const subscriptionProduct = resolveProduct({ productType: 'subscription' })!;
  const teacherPlanRow = {
    ownerUserId: owner.id,
    titleHt: subscriptionProduct.nameHt,
    titleFr: subscriptionProduct.nameFr,
    priceCentsMonthly: subscriptionProduct.amountCents,
    includesAll: true,
    status: 'active' as const,
    updatedAt: now,
  };

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}${courseRows.length} formation(s), ${lessonRows.length} leçon(s), 1 plan enseignant à écrire.`,
  );

  if (dryRun) {
    console.log('\n--dry-run : aucune écriture. Aperçu :');
    for (const c of courseRows) {
      console.log(
        `  courses:  ${c.slug} (${c.code}) — "${c.titleHt}" — $${(c.priceCents / 100).toFixed(2)} — status=${c.status}`,
      );
    }
    for (const l of lessonRows) {
      console.log(
        `  lessons:  ${l.courseSlug} #${l.index} — "${l.titleHt}" — preview=${l.isPreview} — ${l.durationSeconds ?? '—'}s`,
      );
    }
    console.log(
      `  teacher_plans: "${teacherPlanRow.titleHt}" / "${teacherPlanRow.titleFr}" — $${(teacherPlanRow.priceCentsMonthly / 100).toFixed(2)}/mo — owner=${teacherPlanRow.ownerUserId}`,
    );
    console.log('\nRelance sans --dry-run pour écrire réellement.');
    return;
  }

  /* ------------------------------------------------------------------ */
  /* 4. Write (idempotent upserts)                                       */
  /* ------------------------------------------------------------------ */
  let coursesUpserted = 0;
  for (const row of courseRows) {
    const { slug: _slug, ...set } = row;
    await db.insert(T.courses).values(row).onConflictDoUpdate({ target: T.courses.slug, set });
    coursesUpserted++;
  }

  let lessonsUpserted = 0;
  for (const row of lessonRows) {
    const { courseSlug: _courseSlug, index: _index, ...set } = row;
    await db
      .insert(T.lessons)
      .values(row)
      .onConflictDoUpdate({ target: [T.lessons.courseSlug, T.lessons.index], set });
    lessonsUpserted++;
  }

  const [existingPlan] = await db
    .select({ id: T.teacherPlans.id })
    .from(T.teacherPlans)
    .where(eq(T.teacherPlans.ownerUserId, owner.id))
    .limit(1);
  if (existingPlan) {
    await db.update(T.teacherPlans).set(teacherPlanRow).where(eq(T.teacherPlans.id, existingPlan.id));
  } else {
    await db.insert(T.teacherPlans).values(teacherPlanRow);
  }

  console.log(
    `\n✓ Seed terminé : ${coursesUpserted} formation(s), ${lessonsUpserted} leçon(s), 1 plan enseignant (${existingPlan ? 'mis à jour' : 'créé'}).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✗ Seed échoué :', e instanceof Error ? e.message : e);
    process.exit(1);
  });
