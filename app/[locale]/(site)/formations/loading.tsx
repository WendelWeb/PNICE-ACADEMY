import { Section, Container } from '@/components/ui/Section';
import { SkeletonBlock, SkeletonCard, LoadingStatus } from '@/components/ui/Skeleton';

export default function FormationsLoading() {
  return (
    <Section>
      <Container>
        <LoadingStatus />
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full max-w-md space-y-3">
            <SkeletonBlock className="h-3 w-32" />
            <SkeletonBlock className="h-9 w-full max-w-sm" />
            <SkeletonBlock className="h-4 w-2/3" />
          </div>
          <SkeletonBlock className="h-20 w-20 shrink-0 rounded-full" />
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </Container>
    </Section>
  );
}
