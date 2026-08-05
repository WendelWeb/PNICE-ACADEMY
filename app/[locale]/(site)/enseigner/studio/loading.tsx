import { Section, Container } from '@/components/ui/Section';
import { SkeletonBlock, LoadingStatus } from '@/components/ui/Skeleton';

export default function StudioLoading() {
  return (
    <Section>
      <Container>
        <LoadingStatus />
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-9 w-full max-w-sm" />
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="mt-8 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </Container>
    </Section>
  );
}
