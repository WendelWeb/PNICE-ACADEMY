import { Section, Container } from '@/components/ui/Section';
import { SkeletonBlock, SkeletonCard, LoadingStatus } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <Section>
      <Container>
        <LoadingStatus />
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-9 w-full max-w-sm" />
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </Container>
    </Section>
  );
}
