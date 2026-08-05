import { SkeletonBlock, LoadingStatus } from '@/components/ui/Skeleton';

// Renders inside AdminShell's <main> (components/admin/AdminShell.tsx already
// supplies the page padding) — just the content-area skeleton, no chrome.
export default function AdminLoading() {
  return (
    <div>
      <LoadingStatus />
      <div className="space-y-3">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-8 w-full max-w-sm" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
