import { IconPlayerPlayFilled } from '@tabler/icons-react';
import { bunnyConfigured, bunnyEmbedUrl } from '@/lib/bunny/embed';

/**
 * Lesson video player (Task L4) — env-gated Bunny Stream embed.
 *
 * With no `BUNNY_STREAM_LIBRARY_ID` configured, or no `videoId` on this
 * lesson, renders the same placeholder the lesson page always has (play
 * icon + "video coming soon" note) — no crash, no broken iframe. Once the
 * owner sets the env var and a lesson gets a `bunnyVideoId`, this same
 * component switches to a real Bunny Stream iframe embed automatically.
 *
 * Server component: reads env directly, no client JS needed either way.
 */
export function LessonPlayer({
  videoId,
  title,
  placeholderNote,
}: {
  /** The lesson's Bunny Stream video id, if recorded/uploaded yet. */
  videoId?: string | null;
  /** Accessible iframe title — the lesson's title. */
  title: string;
  /** i18n placeholder note shown while the video isn't available. */
  placeholderNote: string;
}) {
  const embedUrl = bunnyConfigured() ? bunnyEmbedUrl(videoId) : null;

  return (
    <div className="rounded-2xl border border-ochre/25 bg-paper p-2 md:p-3">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-ink/15 bg-ink">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={title}
            loading="lazy"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ochre text-[#1b1207]">
              <IconPlayerPlayFilled size={28} />
            </div>
            <span className="absolute bottom-3 left-4 max-w-[80%] font-mono text-[11px] leading-relaxed text-paper-light/55">
              {placeholderNote}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
