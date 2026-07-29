# Plan de cours complet (chapitres, notes, ressources, complétude) — Plan

> Execute with subagent-driven-development. Owner ask (2026-07-28): the course
> authoring model must support a real curriculum — chapters/parts, per-lesson
> teacher notes, links & downloadable resources, an editable plan, and a
> "is this course complete?" check — "tout tout tout doit être bien pensé".

**Today's gap:** `lessons` is a FLAT list (title, desc, video, duration, isPreview).
No chapters/sections/parts, no rich notes, no resources/links, no completeness gate.

## Target model

**`course_chapters`** (new) — a course's parts/modules:
`id`, `course_slug` (FK courses.slug, cascade), `index` int, `title_ht/fr`,
`summary_ht/fr` (optional intro), `created_at`/`updated_at`, unique(course_slug,index).

**`lessons`** (extend, all nullable → backward compatible; existing flat lessons keep working):
- `chapter_id` uuid FK course_chapters(id) ON DELETE SET NULL — null = "hors chapitre"
  (a course with no chapters renders exactly as today).
- `notes_ht/fr` text — the teacher's written notes/recap for that lesson (long form,
  shown to the enrolled learner under the video). Distinct from the short `desc_*`.
- `resources` jsonb `Array<{ label_ht: string; label_fr: string; url: string; kind: 'link' | 'file' }>`
  — links + downloadable files attached to the lesson.

**`courses`** (extend): `resources` jsonb (same shape) — course-level links shown in
the description/sales page ("lien en description").

## Rules
- **Ordering**: chapters ordered by `index`; lessons ordered by `index` *within* their
  chapter (ungrouped lessons sort after/independently). Reordering must never
  violate unique(course_slug,index) — reuse the scratch-index swap trick from
  `reorderLessons` in lib/courses/write.ts.
- **Backward compatible**: every existing course (9 seeded, flat) must render and
  behave EXACTLY as today when it has zero chapters.
- **URL safety**: resource `url` must be http(s) only (allowlist like
  `isSafePhotoUrl` in lib/teacher/public.ts) — teachers are self-serve.
- **Money path frozen**; display/authoring only.

## Tasks

**K1 — Schema + write ops + reads.**
- db/schema.ts: `course_chapters` table; `lessons.chapter_id` + `notes_ht/fr` +
  `resources`; `courses.resources`. `npm run db:generate` (offline) + commit meta.
- lib/courses/write.ts: `createChapter/updateChapter/deleteChapter` (deleting a
  chapter sets its lessons' chapter_id to null, never deletes lessons),
  `reorderChapters(up/down)`, `moveLessonToChapter(lessonId, chapterId|null)`,
  and extend `LessonPatch` with notes/resources, `CoursePatch` with resources.
  All audited + `revalidateCoursePaths` like existing ops; published-course edits
  keep the C3 re-review behavior.
- lib/courses/source.ts: reads return the curriculum — extend the Course/CourseDetail
  mapping with `chapters: Array<{ id, title_ht/fr, summary_ht/fr, lessons: Lesson[] }>`
  plus `ungroupedLessons`. Keep the existing flat `lessons` array populated (all
  lessons, ordered) so no current consumer breaks. Static fallback: zero chapters.
- lib/teacher/studio-actions.ts: owner-scoped wrappers for every new op
  (requireOwnedCourse first), + admin equivalents in lib/admin/content-actions.ts
  (requireEditor / the moderation caps already in place).
- Unit tests: ordering/reorder logic + the resource-URL allowlist.
- Accept: tsc/build/tests/i18n green; a flat course still maps identically.

**K2 — Authoring UI (studio + admin CMS): the plan editor + completeness.**
- Rework `components/admin/content/LessonsManager.tsx` into a **plan editor**:
  chapters as collapsible groups (title ht/fr + summary + up/down + delete),
  lessons nested inside with up/down + "déplacer vers un chapitre" select,
  plus an "hors chapitre" bucket. "Ajouter un chapitre" / "Ajouter une leçon".
  Keep the existing per-lesson row (titles, desc, video upload, duration, preview).
- Per lesson: **notes ht/fr** (textarea) + a **ressources** editor (label ht/fr,
  URL, type lien/fichier; add/remove; http(s) validated).
- Course level: a **ressources/liens** editor (same component) in CourseEditor.
- **Completeness checklist** (new `components/content/CourseReadiness.tsx`), shown
  in the studio before "Soumettre pour validation" and in the admin CMS:
  computed from the course — every lesson has a video ✓, every lesson titled in
  both languages ✓, price > 0 ✓, description/promise filled ✓, ≥1 preview lesson ✓,
  ≥1 lesson ✓, chapters titled if any ✓, main image ✓. Shows ✓/✗ per item with the
  fix location; the submit button explains what's missing (but does NOT hard-block —
  admin review is the real gate; make it a clear warning list).
- i18n ht/fr for everything new. Accept: a teacher can build Chapitre 1/2/3 with
  lessons, notes, links; reorder; see readiness; submit.

**K3 — Public + learner rendering.**
- Sales page (`formations/[slug]`): render the curriculum grouped by chapter
  (« Pati 1 · Titre » then its lessons) using the existing ManifestList look;
  flat courses render exactly as today. Show total duration + lesson count.
  Course-level resources/links rendered in the description block.
- Lesson page (`tableau-de-bord/[course]/lecon/[id]`): show the lesson's **notes**
  under the player and its **resources** (links/downloads, safe target/rel), plus
  chapter context in the rail ("Pati 2 · Leson 3") and prev/next across chapters.
- Dashboard: progress can stay course-level, but the lesson rail groups by chapter.
- Accept: enrolled learner sees notes + resources; access gate unchanged; flat
  courses unchanged; tsc/build/tests/i18n green.

## Sequence
K1 → K2 → K3, each implement → gates → review → fix → commit. Ledger:
.superpowers/sdd/progress.md. db:push is owner-manual (sandbox-blocked) — the new
migration ships and the owner applies it with the same `npm run db:push`.
