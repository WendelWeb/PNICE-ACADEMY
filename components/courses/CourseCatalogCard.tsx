'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  IconCash,
  IconChalkboardTeacher,
  IconCheck,
  IconShoppingCart,
  IconShoppingCartFilled,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { Stars } from '@/components/reviews/Stars';
import { SmartImage } from '@/components/ui/SmartImage';
import { useCart } from '@/components/cart/cart-context';
import { useOwnedCourses } from '@/components/learner/useOwnedCourses';
import { courseTitle, courseTagline, courseLearn, courseIsBilingual, coursePrimaryLocale } from '@/lib/courseFields';
import { categoryTone } from '@/lib/courseCategory';
import { cn } from '@/lib/cn';
import { getCourseTeacher } from '@/data/teachers';
import type { Course } from '@/data/courses';
import type { RatingSummary } from '@/lib/reviews/reviews';

/**
 * The catalogue's discovery card — used both by the interactive toolbar-driven
 * grid (CatalogBrowser) and the server-rendered fallback shown before it
 * hydrates. Udemy anatomy by owner request: photo → title → author → rating →
 * tagline → 3 learn-bullets → price boldest and last. No internal codes
 * (PA-02 etc.) — catalogue numbers mean nothing to a buyer. Client component
 * (next-intl hooks), but composes fine inside a server-rendered subtree.
 *
 * Teacher attribution (M2): a subtle mono line at the card's foot, its own
 * real `<Link>` to /prof/[slug] — not nested inside the main course `<Link>`,
 * which would be invalid HTML and break keyboard/screen-reader navigation.
 *
 * ADDITIVE props (Stage: the living manifest — the home's featured grid
 * reuses THIS card so home and /formations stay one design):
 *   - `rating`: a real `RatingSummary` renders a star row (count > 0 only —
 *     no reviews, no claim). Omitted (every pre-existing call site) ⇒
 *     byte-identical card.
 *   - `teacher`: overrides the static-registry attribution (a DB-owned
 *     course by a 2nd+ real teacher). Omitted ⇒ the original
 *     `getCourseTeacher` fallback.
 */
export function CourseCatalogCard({
  course,
  rating,
  teacher: teacherProp,
  imageSrcs,
}: {
  course: Course;
  rating?: RatingSummary | null;
  teacher?: { name: string; slug: string } | null;
  /**
   * The course's photos, RESOLVED SERVER-SIDE (lib/courseImage.ts reads the
   * filesystem, so this client card can't call it). When present, the card
   * opens on the first photo — on mobile it's the thumbnail that stops the
   * thumb — with the course seal stamped across its bottom edge and the
   * category chip floated over the image. Two or more photos rotate as a
   * slow, staggered crossfade (see `CardPhoto`). Omitted ⇒ the pre-image
   * text-first card, byte-identical, so untouched call sites keep working.
   */
  imageSrcs?: string[] | null;
}) {
  const locale = useLocale();
  const t = useTranslations('catalog');
  const tCourse = useTranslations('course');
  const learn = courseLearn(course, locale).slice(0, 3);
  const staticTeacher = getCourseTeacher(course.slug);
  const teacher =
    teacherProp ??
    (staticTeacher ? { name: staticTeacher.displayName, slug: staticTeacher.slug } : null);
  const showStars = Boolean(rating && rating.count > 0 && rating.avg !== null);
  // Honesty in the UI (Task: course-language): a monolingual course must say
  // so before a learner clicks through expecting the ht/fr pair every other
  // course has.
  const bilingual = courseIsBilingual(course);
  const primary = coursePrimaryLocale(course);

  // NO h-full, NO reserved min-heights (owner: « carte si longue, toutes ces
  // espaces pour rien ») — the card takes its NATURAL height and stops. Grid
  // rows top-align; a shorter card leaves page background below its border,
  // which is invisible, instead of stretched whitespace inside it.
  return (
    <div className="card-hover group flex flex-col self-start rounded-xl border border-ink/12 bg-paper-light outline-none transition-colors hover:border-ink/35">
      <Link
        href={`/formations/${course.slug}`}
        className="flex flex-1 flex-col rounded-t-xl outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        {imageSrcs && imageSrcs.length > 0 ? (
          /* PHOTO HEADER — the image is the whole hook, Udemy-style: no
             internal codes stamped on it (owner: « enlève les infos genre
             PA-02 » — a catalogue number means something to us, nothing to
             a buyer). Only the category chip floats top-right on a blurred
             paper backdrop, readable over any photo. Subtle zoom on hover;
             tight `sizes` so the optimizer ships small files to data-priced
             connections. */
          <div className="relative aspect-[16/9] overflow-hidden rounded-t-xl bg-paper">
            <CardPhoto srcs={imageSrcs} alt={courseTitle(course, locale)} />
            <span
              className={cn(
                'absolute right-3 top-3 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide backdrop-blur-sm',
                categoryTone[course.category],
              )}
            >
              {t(`categories.${course.category}`)}
            </span>
            {/* Lesson count as a YouTube-style thumbnail badge — the pattern
                every phone on earth already knows how to read. Frees the
                price row below for the icon actions. */}
            <span className="absolute bottom-2 right-2 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[10px] text-paper-light">
              {tCourse('lessonsCount', { count: course.lessons.length })}
              {!bilingual && ` · ${t(`languageBadge.${primary}`)}`}
            </span>
          </div>
        ) : null}

        {/* pt tighter than the sides: the photo already provides the visual
            break, so the title sits close under it (owner: « trop d'espace
            entre image et nom du cours »). */}
        <div className="flex flex-1 flex-col px-4 pb-2.5 pt-2.5">
        {!(imageSrcs && imageSrcs.length > 0) && (
          <div className="mb-2 mt-1.5">
            <span
              className={cn(
                'inline-flex rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide',
                categoryTone[course.category],
              )}
            >
              {t(`categories.${course.category}`)}
            </span>
          </div>
        )}

        {/* UDEMY-ANATOMY CONTENT (owner ask): tight vertical rhythm, and the
            marketplace hierarchy every buyer already knows how to read —
            title → author → rating → promise → proof bullets → price last
            and boldest. Same information as before, re-ordered into the
            grammar of the biggest course marketplace on earth. */}
        <h3 className="line-clamp-2 font-display text-[17px] font-bold leading-snug text-ink">
          {courseTitle(course, locale)}
        </h3>

        {/* Author directly under the title, Udemy-style — plain text on
            purpose (a nested anchor inside the card link is invalid HTML);
            the clickable prof profile lives on the course page. */}
        {teacher && (
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-graphite/60">
            <IconChalkboardTeacher size={13} className="shrink-0 text-graphite/50" />
            <span className="truncate">{teacher.name}</span>
          </p>
        )}

        {/* The Udemy signature row: bold amber score, stars, muted count.
            Only when real reviews exist — no reviews, no claim. */}
        {showStars && (
          <span className="mt-1 flex items-center gap-1.5">
            <span className="font-mono text-[13px] font-bold text-ochre">
              {rating!.avg!.toFixed(1)}
            </span>
            <Stars value={rating!.avg!} size={13} />
            <span className="font-mono text-[11px] text-ink/45">({rating!.count})</span>
          </span>
        )}

        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-graphite/75">
          {courseTagline(course, locale)}
        </p>

        <ul className="mt-2 space-y-1">
          {learn.map((point, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-snug text-graphite/85">
              <IconCheck size={13} className="mt-0.5 shrink-0 text-teal" />
              <span className="line-clamp-1">{point}</span>
            </li>
          ))}
        </ul>

        </div>
      </Link>

      {/* FOOTER — one row does the work three used to (owner: « deux icônes,
          carte plus courte ») : price left, boldest thing on the card; the
          two actions as 44px icon circles right, buy-now in ochre at the
          thumb-reach end. A real sibling of the course Link (interactive
          controls nested in an anchor are invalid HTML and break keyboard
          navigation). In the rare no-photo card the lesson count rides
          along here, since it has no thumbnail badge to live on. */}
      <div className="flex items-center justify-between gap-3 border-t border-ink/10 px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <Price usd={course.priceUsd} className="font-display text-xl font-black text-ink" />
          <PriceSecondary usd={course.priceUsd} className="font-mono text-[11px] text-graphite/55" />
          {!(imageSrcs && imageSrcs.length > 0) && (
            <span className="w-full font-mono text-[10px] text-graphite/55">
              {tCourse('lessonsCount', { count: course.lessons.length })}
              {!bilingual && ` · ${t(`languageBadge.${primary}`)}`}
            </span>
          )}
        </div>
        <CardActions course={course} title={courseTitle(course, locale)} />
      </div>
    </div>
  );
}

/** Slow, staggered crossfade between a course's photos.
 *
 * Ambient motion with three deliberate restraints, because the audience
 *  pays for its data and its attention:
 *   1. Cards are DESYNCHRONISED — each starts at a random point in the
 *      cycle, so the grid never blinks in unison like a slot machine.
 *   2. The extra photos only MOUNT after the first cycle fires: a visitor
 *      who bounces in five seconds never downloads images they never saw.
 *   3. `prefers-reduced-motion` freezes the first photo, full stop.
 * The first photo always server-renders — the crossfade is enhancement,
 * never the delivery mechanism. */
function CardPhoto({ srcs, alt }: { srcs: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (srcs.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Random initial delay (4–9s) desynchronises the grid; then a steady 6s.
    const kickoff = setTimeout(() => {
      setStarted(true);
      setIdx((i) => (i + 1) % srcs.length);
      timer.current = setInterval(() => setIdx((i) => (i + 1) % srcs.length), 6000);
    }, 4000 + Math.random() * 5000);
    return () => {
      clearTimeout(kickoff);
      if (timer.current) clearInterval(timer.current);
    };
  }, [srcs.length]);

  const visible = started ? srcs : srcs.slice(0, 1);
  return (
    <>
      {visible.map((src, i) => (
        <SmartImage
          key={src}
          src={src}
          alt={i === 0 ? alt : ''}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
          className={cn(
            'object-cover transition-opacity duration-1000 ease-in-out',
            i === idx % visible.length ? 'opacity-100' : 'opacity-0',
            // The hover zoom rides along on whichever photo is showing.
            'transition-[opacity,transform] duration-1000 group-hover:scale-[1.04]',
          )}
        />
      ))}
    </>
  );
}

/** The card's two actions as 44px icon circles (owner: « deux icônes, carte
 *  plus courte ») — cart first, then buy in ochre at the thumb-reach end.
 *
 *  The cart circle is a TOGGLE, one glyph two states (owner spec): empty
 *  outline cart = not in the basket, tap adds; FILLED teal cart = in the
 *  basket, tap simply removes it again. Same place, same shape — the fill
 *  is the state, exactly like a heart/favourite control. `aria-pressed`
 *  says so to screen readers; label and tooltip name the action the NEXT
 *  tap performs. The buy circle is a banknote — the money verb, not a
 *  speed metaphor — in the ochre primary.
 *
 *  Icon-only, so every control carries both `aria-label` and `title`. The
 *  cart circle renders from the SERVER paint (never gated on hydration — a
 *  button that waits for JavaScript is a button a slow phone never sees);
 *  hydration only flips its fill. */
function CardActions({ course, title }: { course: Course; title: string }) {
  const t = useTranslations('panye');
  const tc = useTranslations('common');
  const cart = useCart();
  const inCart = Boolean(cart?.hydrated && cart.has(course.slug));
  const ownedSet = useOwnedCourses();

  // ALREADY OWNED (owner: « j'ai déjà acheté, pourquoi Achte sur les
  // cartes ») — the cards live in a shared cache, so ownership arrives
  // client-side (useOwnedCourses, one fetch per page) and flips the whole
  // action row to the one honest CTA. Until known, the server-painted buy
  // state shows — enhancement, never a gate.
  if (ownedSet?.has(course.slug)) {
    return (
      <Link
        href="/tableau-de-bord"
        className="flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-teal/50 px-4 font-display text-[13px] font-bold text-teal transition-colors hover:bg-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
      >
        <IconCheck size={15} />
        {tc('ownedShort')}
      </Link>
    );
  }

  // Explicitly-free course (pricing-rules.ts): nothing to pay, nothing to
  // basket — one teal pill straight to the course page, where the enrol
  // button lives.
  if (course.priceUsd === 0) {
    return (
      <Link
        href={`/formations/${course.slug}`}
        className="flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-teal px-4 font-display text-[13px] font-bold text-paper-light transition-transform hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
      >
        {tc('free')}
      </Link>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {cart && (
        <button
          type="button"
          onClick={() =>
            inCart
              ? cart.remove(course.slug)
              : cart.add({ slug: course.slug, title, priceUsd: course.priceUsd })
          }
          aria-pressed={inCart}
          aria-label={inCart ? t('removeLabel', { title }) : t('addShort')}
          title={inCart ? t('removeLabel', { title }) : t('addShort')}
          className={cn(
            'grid h-11 w-11 place-items-center rounded-full border transition-colors',
            inCart
              ? 'border-teal bg-teal/10 text-teal hover:bg-teal/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal'
              : 'border-ink/25 text-ink/70 hover:border-ochre hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre',
          )}
        >
          {inCart ? <IconShoppingCartFilled size={20} /> : <IconShoppingCart size={20} />}
        </button>
      )}
      {/* The buy control carries its verb (owner: « ajoute le texte, genre
          acheter ») — icon + the short imperative, a pill instead of a bare
          circle. The banknote still says money; the word removes all doubt. */}
      <Link
        href={`/checkout?course=${course.slug}`}
        title={tc('buy')}
        className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-ochre px-4 font-display text-[13px] font-bold text-[#1b1207] transition-transform hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
      >
        <IconCash size={18} />
        {tc('buyShort')}
      </Link>
    </div>
  );
}
