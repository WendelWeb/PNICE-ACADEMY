import type { CourseCategory } from '@/data/courses';

/**
 * Tailwind tone classes per discovery category — shared between the catalogue
 * card (client component) and the course sales page (server component).
 * Kept in a plain module (no 'use client') so server components can read it
 * directly: a value re-exported from a client module becomes an opaque
 * reference across the RSC boundary and can't be indexed into from server code.
 *
 * (The old `categoryIcon` map left with MarketplaceBar when the homepage was
 * rebuilt — Stage: the living manifest.)
 */
export const categoryTone: Record<CourseCategory, string> = {
  biznis: 'bg-ink/8 text-ink/70',
  dijital: 'bg-teal/10 text-teal',
  lajan: 'bg-ochre/15 text-ochre',
  'lavi-pratik': 'bg-graphite/10 text-graphite/80',
};
