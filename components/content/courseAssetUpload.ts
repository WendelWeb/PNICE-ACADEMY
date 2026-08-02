/**
 * Shared client-side POST to /api/upload/course-asset (Stage 3 extracted to
 * here in Stage 4, so the photo gallery — components/admin/content/
 * ImagesManager.tsx — and the document dropzone — components/content/
 * ResourcesEditor.tsx — speak to the upload route through ONE definition
 * instead of two drifting copies).
 *
 * XHR (not fetch) purely for upload progress events — same reasoning as
 * VideoUpload. The route ALWAYS answers HTTP 200 with `{ ok, … }` (see
 * app/api/upload/course-asset/route.ts's response contract), so this helper
 * never throws either: any non-JSON/transport surprise resolves to
 * `{ ok: false, message: 'error' | 'network' | 'aborted' }` for the caller
 * to translate into calm teacher-facing copy.
 */
export type CourseAssetUploadResponse = { ok: true; url: string } | { ok: false; message: string };

export function postCourseAsset(
  form: FormData,
  onPct: (pct: number) => void,
  xhrRef: React.MutableRefObject<XMLHttpRequest | null>,
): Promise<CourseAssetUploadResponse> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/upload/course-asset', true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as CourseAssetUploadResponse;
        if (body && typeof body === 'object' && 'ok' in body) {
          resolve(body);
          return;
        }
      } catch {
        /* non-JSON response — treated as a generic failure below */
      }
      resolve({ ok: false, message: 'error' });
    };
    xhr.onerror = () => resolve({ ok: false, message: 'network' });
    xhr.onabort = () => resolve({ ok: false, message: 'aborted' });
    xhr.send(form);
  });
}
