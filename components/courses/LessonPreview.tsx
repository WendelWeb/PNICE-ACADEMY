'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconPlayerPlayFilled, IconX } from '@tabler/icons-react';

/**
 * « Gade apèsi gratis » (Stage 4 — watchable previews). The sales page has
 * always BADGED preview lessons without any way to actually watch one; this
 * is the missing affordance: a small play button on the manifest row that
 * opens an accessible modal playing the lesson's Bunny embed.
 *
 * - Anonymous visitors CAN watch — that is the whole point of a preview.
 *   The full lesson routes stay auth-gated; only the embed URL of lessons
 *   the teacher explicitly flagged `is_preview` ever reaches this component.
 * - Env-gated upstream: the server computes `embedUrl` via
 *   lib/bunny/embed.ts (`null` without BUNNY_STREAM_LIBRARY_ID or a video id)
 *   and the row simply doesn't render this button then — no dead affordance.
 * - Accessible: role=dialog + aria-modal, focus moves into the dialog on
 *   open, Tab is trapped inside it, Esc and the backdrop close it, and focus
 *   returns to the triggering button on close (mirrors the
 *   components/kont/ConfirmDialog.tsx patterns, plus the focus trap a
 *   media modal needs).
 * - Reduced-motion-aware: the entrance transition is disabled under
 *   `prefers-reduced-motion` (motion-reduce:transition-none) — the dialog
 *   just appears.
 */
export function LessonPreviewButton({
  title,
  embedUrl,
  openLabel,
  closeLabel,
}: {
  /** The lesson's title — names both the dialog and the iframe. */
  title: string;
  /** A ready Bunny iframe embed URL (lib/bunny/embed.ts). */
  embedUrl: string;
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      // Minimal focus trap: keep Tab cycling inside the dialog (the close
      // button and the iframe are the only stops).
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button, iframe, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialog.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while the modal is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-teal transition-colors hover:border-teal hover:bg-teal/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre motion-reduce:transition-none"
      >
        <IconPlayerPlayFilled size={13} aria-hidden="true" />
        {openLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div
            className="absolute inset-0 bg-ink/70"
            onClick={close}
            aria-hidden="true"
          />
          <div
            ref={dialogRef}
            className="preview-modal-panel relative w-full max-w-3xl rounded-2xl border border-ink/15 bg-paper p-3 shadow-xl md:p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="min-w-0 truncate font-display text-base font-bold text-ink md:text-lg">
                {title}
              </p>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label={closeLabel}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 text-ink/70 transition-colors hover:border-stampred hover:text-stampred focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre motion-reduce:transition-none"
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-ink/15 bg-ink">
              <iframe
                src={embedUrl}
                title={title}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
