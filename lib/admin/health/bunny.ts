/**
 * Bunny Stream health check (Phase D Lot 2, Task 8). This is a REAL integration,
 * not mock: it calls the Bunny Stream API to confirm the connection works. It is
 * env-gated — with no `BUNNY_STREAM_*` keys it reports `configured:false` rather
 * than erroring, so the rest of the admin keeps working on mock.
 *
 * SECURITY: the API key is read from the runtime env only and is NEVER returned,
 * logged, or rendered. We surface connection status + counts, never the secret.
 */

export type BunnyStatus = {
  configured: boolean;
  ok: boolean;
  /** Total videos in the library (Bunny `totalItems`). */
  videoCount: number | null;
  /** Sum of `storageSize` over the first page of videos (approx). */
  storageBytes: number | null;
  /** Raw API error message when the call fails (no secret). */
  error: string | null;
  checkedAt: string;
};

const ENDPOINT = (libraryId: string) =>
  `https://video.bunnycdn.com/library/${libraryId}/videos?page=1&itemsPerPage=100&orderBy=date`;

export async function checkBunnyStream(): Promise<BunnyStatus> {
  const checkedAt = new Date().toISOString();
  const key = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;

  if (!key || !libraryId) {
    return { configured: false, ok: false, videoCount: null, storageBytes: null, error: null, checkedAt };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(ENDPOINT(libraryId), {
      headers: { AccessKey: key, accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        configured: true,
        ok: false,
        videoCount: null,
        storageBytes: null,
        error: `HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`,
        checkedAt,
      };
    }
    const data = (await res.json()) as { totalItems?: number; items?: { storageSize?: number }[] };
    const storageBytes = (data.items ?? []).reduce((s, v) => s + (v.storageSize ?? 0), 0);
    return {
      configured: true,
      ok: true,
      videoCount: data.totalItems ?? data.items?.length ?? 0,
      storageBytes,
      error: null,
      checkedAt,
    };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? 'Timeout (10s)' : e.message) : 'Erreur inconnue';
    return { configured: true, ok: false, videoCount: null, storageBytes: null, error: msg, checkedAt };
  } finally {
    clearTimeout(timer);
  }
}
